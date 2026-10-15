"""
Serveur MCP Taskwarrior : lire, proposer, appliquer et annuler des lots d'operations.

Spec : openspec/changes/serveur-mcp-taskwarrior/proposal.md.
Les fonctions publiques (lire, proposer_lot, appliquer_lot, annuler_lot, lister_lots)
sont pures : elles prennent le taskrc et le dossier d'etat en parametres, et levent
`wtm.WtmErreur` pour un refus. `creer_serveur` les enveloppe en outils MCP.

Tout passe par tools/wtm.py (executer_task, _exporter, _importer, copier, _split...).
Ecriture par `task import` d'un objet COMPLET : un import sur un uuid existant remplace
toute la tache, et ne normalise pas `estTime` (le serveur le convertit en ISO lui-meme).
"""

import difflib
import functools
import hashlib
import json
import os
import re
import shlex
import shutil
import sys
import tempfile
import textwrap
import unicodedata
import uuid as _uuid
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import decoupage  # noqa: E402  (wtm met la racine du depot dans sys.path)
import wtm  # noqa: E402
from wtm import WtmErreur  # noqa: E402

FORMAT_UTC = '%Y%m%dT%H%M%SZ'
VALIDITE = timedelta(hours=24)
ID_LOT_RE = re.compile(r'^L-[0-9a-z]+$')
TAGS_DOC = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                        'docs', 'tags.md')

OPS_PERMISES = ('creer', 'modifier', 'decouper', 'annoter')
CHAMPS_SCALAIRES = ('description', 'project', 'estTime', 'due', 'scheduled', 'wait',
                    'priority')
CHAMPS_DATES = ('due', 'scheduled', 'wait')
CHAMPS_OP = {
    'creer': {'op', 'description', 'project', 'tags', 'estTime', 'due', 'scheduled',
              'wait', 'depends', 'priority', 'annotations'},
    'modifier': {'op', 'uuid', 'tags', 'depends', 'tags_ajout', 'tags_retrait',
                 'depends_ajout', 'depends_retrait', *CHAMPS_SCALAIRES},
    'decouper': {'op', 'uuid', 'sous_projet', 'sous_taches'},
    'annoter': {'op', 'uuid', 'texte'},
}
LIBELLE_OP = {'creer': 'créer', 'modifier': 'modif', 'decouper': 'split',
              'annoter': 'note'}
ETATS = {'propose': 'proposé', 'applique': 'appliqué', 'annule': 'annulé',
         'echec': 'échec partiel', 'perime': 'périmé'}

# Largeurs du resume (colonnes fixes).
L_PROJET, L_TACHE, L_TAGS, L_DUREE = 15, 44, 18, 5
INDENT = 2 + 2 + 5 + 2 + L_PROJET + 2


# ---------------------------------------------------------------- configuration

def configuration(environ):
    """Lit l'environnement : {'taskrc', 'etat'}. Refuse tout ce qui manque ou est dangereux."""
    taskrc = environ.get('WTM_MCP_TASKRC')
    if not taskrc:
        raise WtmErreur('WTM_MCP_TASKRC obligatoire (taskrc de la base cible)')
    if not os.path.isfile(taskrc):
        raise WtmErreur('taskrc introuvable : ' + taskrc)
    etat = environ.get('WTM_MCP_ETAT')
    if not etat:
        if not environ.get('LOCALAPPDATA'):
            raise WtmErreur('WTM_MCP_ETAT ou LOCALAPPDATA obligatoire (dossier d\'état)')
        etat = os.path.join(environ['LOCALAPPDATA'], 'wtm-mcp')
    n_base = wtm._normaliser(wtm.base_effective(taskrc))
    n_etat = wtm._normaliser(os.path.abspath(etat))
    if n_etat == n_base or n_etat.startswith(n_base + '/'):
        raise WtmErreur('le dossier d\'état ne doit pas être dans la base Taskwarrior '
                        '(Syncthing le répliquerait) : ' + etat)
    return {'taskrc': taskrc, 'etat': etat}


# ---------------------------------------------------------------- petits outils

def _maintenant_utc():
    return datetime.now(timezone.utc).strftime(FORMAT_UTC)


def _date_utc(texte):
    """Date lisible -> `YYYYMMDDTHHMMSSZ` ; une date seule vaut minuit local. ValueError sinon."""
    t = str(texte).strip()
    if re.fullmatch(r'\d{8}T\d{6}Z', t):
        datetime.strptime(t, FORMAT_UTC)
        return t
    for fmt in ('%Y-%m-%d', '%Y-%m-%dT%H:%M', '%d/%m/%Y'):
        try:
            local = datetime.strptime(t, fmt)
        except ValueError:
            continue
        return local.astimezone(timezone.utc).strftime(FORMAT_UTC)
    raise ValueError('date illisible : {}'.format(texte))


def _date_locale(utc):
    """`YYYYMMDDTHHMMSSZ` -> JJ/MM/AAAA local."""
    try:
        d = datetime.strptime(utc, FORMAT_UTC).replace(tzinfo=timezone.utc)
    except (TypeError, ValueError):
        return str(utc)
    return d.astimezone().strftime('%d/%m/%Y')


def _esttime_iso(valeur):
    """`30min`, `1h`, `1.5h`, `1h30`, `1h+30min`, `PT1H30M` -> `PT1H30M`. ValueError sinon."""
    texte = str(valeur).strip()
    m = re.fullmatch(r'PT(?:(\d+)H)?(?:(\d+)M)?', texte.upper())
    if m and (m.group(1) or m.group(2)):
        minutes = int(m.group(1) or 0) * 60 + int(m.group(2) or 0)
    else:
        minutes = 0
        for terme in decoupage.normaliser_esttime(texte).split('+'):
            t = re.fullmatch(r'\s*(\d+(?:\.\d+)?)\s*(h|min|m)\s*', terme.lower())
            if not t:
                raise ValueError('estTime invalide : {}'.format(valeur))
            minutes += float(t.group(1)) * (60 if t.group(2) == 'h' else 1)
        if minutes != int(minutes):
            raise ValueError('estTime invalide : {}'.format(valeur))
        minutes = int(minutes)
    if minutes <= 0:
        raise ValueError('estTime invalide : {}'.format(valeur))
    h, mn = divmod(minutes, 60)
    return 'PT' + ('{}H'.format(h) if h else '') + ('{}M'.format(mn) if mn else '')


def _duree_compacte(iso):
    """`PT1H30M` -> `1h30`, `PT30M` -> `30min`, `PT2H` -> `2h`."""
    m = re.fullmatch(r'PT(?:(\d+)H)?(?:(\d+)M)?', str(iso or ''))
    if not m or not (m.group(1) or m.group(2)):
        return str(iso) if iso else ''
    h, mn = int(m.group(1) or 0), int(m.group(2) or 0)
    if not h:
        return '{}min'.format(mn)
    return '{}h'.format(h) + ('{:02d}'.format(mn) if mn else '')


def _liste(valeur, nom):
    if not isinstance(valeur, list) or not all(isinstance(x, str) for x in valeur):
        raise ValueError('{} : liste de textes attendue'.format(nom))
    return valeur


def _tags(valeur, nom):
    """Liste de tags sans `+`, dedoublonnee. ValueError si un tag est mal forme."""
    rendus = []
    for t in _liste(valeur, nom):
        t = t.strip().lstrip('+')
        if not re.fullmatch(r'[\w-]+', t):
            raise ValueError('tag invalide : {!r}'.format(t))
        if t not in rendus:
            rendus.append(t)
    return rendus


def _tags_connus():
    """Tags de docs/tags.md (les `+mot`) plus les deux contextes."""
    try:
        with open(TAGS_DOC, encoding='utf-8') as f:
            doc = f.read()
    except OSError as exc:
        raise WtmErreur('docs/tags.md illisible : {}'.format(exc))
    return set(re.findall(r'`\+([\w-]+)`', doc)) | {'pro', 'perso'}


def _normaliser_texte(texte):
    """Minuscules, sans accents, espaces et ponctuation compactes (detection de doublons)."""
    sans = unicodedata.normalize('NFKD', texte or '')
    sans = ''.join(c for c in sans if not unicodedata.combining(c)).lower()
    return ' '.join(re.sub(r'[^\w]+', ' ', sans).split())


def _deps(tache):
    return decoupage.parse_depends(tache.get('depends'))


def _nettoyer(tache):
    """Copie de la tache sans les champs calcules (`id`, `urgency`), prete pour un import."""
    return {k: v for k, v in json.loads(json.dumps(tache)).items()
            if k not in ('id', 'urgency')}


def _court(uuid):
    return uuid[:8]


def _trouver(taches, uuid):
    return next((t for t in taches if t.get('uuid') == uuid), None)


def _resoudre(ref, taches, crees=None):
    """uuid complet, prefixe unique de 8 caracteres ou `$n` -> uuid complet. ValueError sinon."""
    brut = str(ref).strip()
    vivantes = [t for t in taches if t.get('status') != 'deleted']
    if brut.startswith('$'):
        if crees is not None and brut[1:].isdigit() and 1 <= int(brut[1:]) <= len(crees):
            return crees[int(brut[1:]) - 1]
        raise ValueError('référence inconnue : {} (pas de tâche créée de ce rang)'.format(brut))
    bas = brut.lower()
    if decoupage.UUID_CANONIQUE_RE.fullmatch(bas):
        if any(t['uuid'] == bas for t in vivantes):
            return bas
    elif re.fullmatch(r'[0-9a-f]{8}', bas):
        trouvees = [t['uuid'] for t in vivantes if t['uuid'].startswith(bas)]
        if len(trouvees) == 1:
            return trouvees[0]
        if len(trouvees) > 1:
            raise ValueError('uuid ambigu : {}'.format(brut))
    raise ValueError('uuid inconnu : {}'.format(brut))


# ---------------------------------------------------------------- lire

_FILTRE_OK = [
    re.compile(r'[+-][\w.-]+'),                       # tag
    re.compile(r'[A-Za-z_][\w.]*[:=].*'),             # attribut[.modificateur]:valeur
    re.compile(r'[()!]|and|or|xor|not', re.IGNORECASE),
    re.compile(r'\d+(-\d+)?'),                        # ids
    re.compile(r'[0-9a-f-]{8,36}'),                   # uuid
]


def _verifier_filtre(filtre):
    """Termes d'un filtre Taskwarrior ; refuse tout mot qui pourrait etre une commande."""
    try:
        termes = shlex.split(filtre or '')
    except ValueError as exc:
        raise WtmErreur('filtre illisible : {}'.format(exc))
    for t in termes:
        if t.lower().startswith('rc'):
            raise WtmErreur('filtre refusé (surcharge de configuration) : ' + t)
        if not any(r.fullmatch(t) for r in _FILTRE_OK):
            raise WtmErreur('filtre refusé : « {} » n\'est pas un terme de filtre '
                            '(tag +x, attribut:valeur, parenthèses, and/or/not)'.format(t))
    return termes


def lire(taskrc, projet=None, statut='pending', filtre=None, limite=50):
    """Lecture seule : une ligne par tache, precedee d'un en-tete (nombre, empreinte)."""
    termes = _verifier_filtre(filtre)
    code, sortie, err = wtm.executer_task(taskrc, [*termes, 'export'])
    if code != 0:
        raise WtmErreur('lecture impossible : ' + err.strip())
    try:
        taches = json.loads(sortie) if sortie.strip() else []
    except ValueError as exc:
        raise WtmErreur('export illisible : {}'.format(exc))
    toutes = wtm._exporter(taskrc) if termes else taches

    retenues = [t for t in taches
                if (statut == 'all' or t.get('status') == statut)
                and (not projet or t.get('project') == projet
                     or (t.get('project') or '').startswith(projet + '.'))]
    retenues.sort(key=lambda t: -(t.get('urgency') or 0))
    lignes = ['{} tâche(s) correspondante(s), base : empreinte {}'.format(
        len(retenues), wtm.empreinte(toutes)[:8])]
    for t in retenues[:max(limite, 0)]:
        champs = [_court(t['uuid']), t.get('project') or '-', t.get('description', '')]
        if t.get('tags'):
            champs.append('tags: ' + ','.join(t['tags']))
        if t.get('estTime'):
            champs.append('durée: ' + _duree_compacte(t['estTime']))
        if t.get('due'):
            champs.append('éch: ' + _date_locale(t['due']))
        if t.get('scheduled'):
            champs.append('prévu: ' + _date_locale(t['scheduled']))
        if _deps(t):
            champs.append('dép: ' + ','.join(_court(d) for d in _deps(t)))
        lignes.append(' | '.join(champs))
    if len(retenues) > limite:
        lignes.append('… {} autres non affichées'.format(len(retenues) - max(limite, 0)))
    return '\n'.join(lignes)


# ---------------------------------------------------------------- construction des taches

def _statut_selon_wait(tache):
    """Une tache dont `wait` est futur est `waiting` ; sinon `pending`."""
    if tache.get('status') in ('pending', 'waiting'):
        futur = tache.get('wait') and tache['wait'] > _maintenant_utc()
        tache['status'] = 'waiting' if futur else 'pending'


def _construire(taches, op, maintenant):
    """Objet COMPLET a importer pour une op creer / modifier / annoter (op normalisee)."""
    if op['op'] == 'creer':
        t = {'uuid': op['uuid'], 'status': 'pending', 'entry': maintenant,
             'modified': maintenant, 'description': op['description']}
        for cle in ('project', 'estTime', 'due', 'scheduled', 'wait', 'priority'):
            if op.get(cle):
                t[cle] = op[cle]
        if op.get('tags'):
            t['tags'] = list(op['tags'])
        if op.get('depends'):
            t['depends'] = list(op['depends'])
        if op.get('annotations'):
            t['annotations'] = [{'entry': maintenant, 'description': a}
                                for a in op['annotations']]
        _statut_selon_wait(t)
        return t

    t = _nettoyer(_trouver(taches, op['uuid']))
    t['modified'] = maintenant
    if op['op'] == 'annoter':
        t.setdefault('annotations', []).append({'entry': maintenant,
                                                'description': op['texte']})
        return t
    for cle in CHAMPS_SCALAIRES:
        if cle in op:
            if op[cle] in (None, ''):
                t.pop(cle, None)
            else:
                t[cle] = op[cle]
    tags = list(op['tags']) if 'tags' in op else list(t.get('tags') or [])
    tags = [x for x in tags + op.get('tags_ajout', []) if x not in op.get('tags_retrait', [])]
    deps = list(op['depends']) if 'depends' in op else _deps(t)
    deps = [x for x in deps + op.get('depends_ajout', []) if x not in op.get('depends_retrait', [])]
    for cle, valeur in (('tags', tags), ('depends', deps)):
        if valeur:
            t[cle] = list(dict.fromkeys(valeur))
        else:
            t.pop(cle, None)
    _statut_selon_wait(t)
    return t


def _ecarts(exporte, voulu):
    """Champs que Taskwarrior n'a pas stockes comme voulu (liste de noms)."""
    ecarts = [c for c in CHAMPS_SCALAIRES if (exporte.get(c) or None) != (voulu.get(c) or None)]
    if sorted(exporte.get('tags') or []) != sorted(voulu.get('tags') or []):
        ecarts.append('tags')
    if sorted(_deps(exporte)) != sorted(_deps(voulu)):
        ecarts.append('depends')
    if ([a.get('description') for a in exporte.get('annotations') or []]
            != [a.get('description') for a in voulu.get('annotations') or []]):
        ecarts.append('annotations')
    return ecarts


# ---------------------------------------------------------------- validation d'un lot

def _normaliser_operation(op, taches, crees, bloquants, avertissements, ctx):
    """Valide une operation ; rend (op normalisee, ligne de resume) ou None. Ajoute les
    bloquants / avertissements (prefixes par le rang de l'op) aux listes."""
    rang = ctx['rang']

    def bloque(msg):
        bloquants.append('op {} : {}'.format(rang, msg))

    def avertit(msg):
        avertissements.append('op {} : {}'.format(rang, msg))

    if not isinstance(op, dict):
        bloque('opération illisible (objet attendu)')
        return None
    nom = op.get('op')
    if nom not in OPS_PERMISES:
        bloque('opération interdite ou inconnue : {!r} (permises : {})'.format(
            nom, ', '.join(OPS_PERMISES)))
        return None
    if nom == 'modifier' and 'status' in op:
        bloque('champ status interdit (le serveur ne termine ni ne supprime de tâche)')
        return None
    inconnus = sorted(set(op) - CHAMPS_OP[nom])
    if inconnus:
        bloque('champ(s) inconnu(s) pour {} : {}'.format(nom, ', '.join(inconnus)))
        return None

    norm = {'op': nom}
    erreurs = len(bloquants)
    avant = ctx['projetees']

    def valeur(cle, convertir):
        try:
            return convertir(op[cle])
        except ValueError as exc:
            bloque(str(exc))

    def refs(cle):
        rendues = []
        for r in _liste(op[cle], cle):
            try:
                rendues.append(_resoudre(r, avant, crees))
            except ValueError as exc:
                bloque('dépendance : {}'.format(exc))
        return rendues

    try:
        if nom in ('modifier', 'decouper', 'annoter'):
            try:
                norm['uuid'] = _resoudre(op.get('uuid', ''), avant)
            except ValueError as exc:
                bloque(str(exc))
                return None
            cible = _trouver(avant, norm['uuid'])
            if cible.get('status') not in ('pending', 'waiting'):
                bloque('tâche {} non modifiable (statut {})'.format(
                    _court(norm['uuid']), cible.get('status')))
                return None

        if nom == 'annoter':
            if not isinstance(op.get('texte'), str) or not op['texte'].strip():
                bloque('annoter : texte vide')
                return None
            norm['texte'] = op['texte'].strip()

        elif nom == 'decouper':
            norm['sous_projet'] = op.get('sous_projet')
            sous = []
            for s in op.get('sous_taches') or []:
                s = dict(s)
                if s.get('estTime'):
                    try:
                        s['estTime'] = _esttime_iso(s['estTime'])
                    except ValueError as exc:
                        bloque(str(exc))
                sous.append(s)
            norm['sous_taches'] = sous
            if len(bloquants) == erreurs:
                try:
                    wtm._preparer_split(avant, norm)
                except WtmErreur as exc:
                    bloque(str(exc))

        else:  # creer / modifier
            if nom == 'creer':
                if not isinstance(op.get('description'), str) or not op['description'].strip():
                    bloque('creer : description vide')
                    return None
                norm['uuid'] = crees[ctx['n_creer']]
            for cle in CHAMPS_SCALAIRES:
                if cle not in op or (nom == 'creer' and op[cle] in (None, '')):
                    continue
                if op[cle] in (None, '') and nom == 'modifier' and cle != 'description':
                    norm[cle] = None
                elif cle == 'estTime':
                    norm[cle] = valeur(cle, _esttime_iso)
                elif cle in CHAMPS_DATES:
                    norm[cle] = valeur(cle, _date_utc)
                elif cle == 'priority':
                    norm[cle] = str(op[cle]).strip().upper()
                    if norm[cle] not in ('H', 'M', 'L'):
                        bloque('priority invalide : {!r} (H, M ou L)'.format(op[cle]))
                else:
                    norm[cle] = str(op[cle]).strip()
                    if cle == 'description' and not norm[cle]:
                        bloque('description vide')
            for cle in ('tags', 'tags_ajout', 'tags_retrait'):
                if cle in op:
                    norm[cle] = valeur(cle, lambda v, c=cle: _tags(v, c))
            for cle in ('depends', 'depends_ajout', 'depends_retrait'):
                if cle in op:
                    norm[cle] = refs(cle)
            if nom == 'creer' and 'annotations' in op:
                norm['annotations'] = valeur('annotations', lambda v: _liste(v, 'annotations'))
    except ValueError as exc:
        bloque(str(exc))
        return None
    if len(bloquants) > erreurs:
        return None

    # Projection : la tache telle qu'elle sera apres l'operation.
    if nom == 'decouper':
        ligne = {'op': nom, 'project': _trouver(avant, norm['uuid']).get('project'),
                 'description': _trouver(avant, norm['uuid']).get('description'),
                 'tags': _trouver(avant, norm['uuid']).get('tags') or [],
                 'estTime': _trouver(avant, norm['uuid']).get('estTime'),
                 'due': _trouver(avant, norm['uuid']).get('due'),
                 'changements': [('découpage', '', '{} sous-tâches : {}'.format(
                     len(norm['sous_taches']),
                     ', '.join(s.get('description', '') for s in norm['sous_taches'])))]}
        return norm, ligne
    projetee = _construire(avant, norm, _maintenant_utc())
    ctx['projetees'] = [t for t in avant if t['uuid'] != projetee['uuid']] + [projetee]
    if not set(projetee.get('tags') or []) & {'pro', 'perso'}:
        bloque('tâche sans contexte : ni pro ni perso après l\'opération')
        return None

    # Avertissements.
    connus = ctx['tags_connus']
    nouveaux = norm.get('tags', []) + norm.get('tags_ajout', [])
    inconnus = [t for t in nouveaux if t not in connus]
    if inconnus:
        ctx['tags_ok'] = False
        avertit('tag hors docs/tags.md : ' + ', '.join(inconnus))
    if projetee.get('project') and ('project' in norm) and not ctx['projet_existe'](
            projetee['project']):
        ctx['projet_ok'] = False
        avertit('projet inexistant : {}'.format(projetee['project']))
    if nom == 'creer':
        cherche = _normaliser_texte(norm['description'])
        for t in taches:
            if (t.get('status') in ('pending', 'waiting')
                    and (t.get('project') or None) == (projetee.get('project') or None)):
                existant = _normaliser_texte(t.get('description'))
                if existant == cherche or difflib.SequenceMatcher(
                        None, existant, cherche).ratio() >= 0.9:
                    avertit('doublon possible : « {} » existe déjà ({}, {})'.format(
                        t.get('description'), t.get('project') or 'sans projet',
                        _court(t['uuid'])))
                    break
        if not projetee.get('estTime'):
            avertit('estTime absent')
    if norm.get('due') and norm['due'] < _maintenant_utc():
        avertit('échéance déjà passée : {}'.format(_date_locale(norm['due'])))
    if projetee.get('scheduled') and projetee.get('due') and (
            'scheduled' in norm or 'due' in norm) and projetee['scheduled'] > projetee['due']:
        avertit('scheduled après due ({} > {})'.format(
            _date_locale(projetee['scheduled']), _date_locale(projetee['due'])))

    ligne = {'op': nom, 'project': projetee.get('project'),
             'description': projetee['description'], 'tags': projetee.get('tags') or [],
             'estTime': projetee.get('estTime'), 'due': projetee.get('due')}
    if nom == 'modifier':
        original = _trouver(avant, norm['uuid'])
        ligne['changements'] = [
            (c, original.get(c), projetee.get(c))
            for c in (*CHAMPS_SCALAIRES, 'tags', 'depends')
            if (original.get(c) or None) != (projetee.get(c) or None)
            and (c in CHAMPS_SCALAIRES or c in ('tags', 'depends'))]
    elif nom == 'annoter':
        ligne['changements'] = [('annotation', '', norm['texte'])]
    return norm, ligne


def _valider(taches, operations):
    """Valide le lot ; rend (operations normalisees, lignes, bloquants, avertissements,
    controles partiels)."""
    bloquants, avertissements, normalisees, lignes = [], [], [], []
    if not isinstance(operations, list) or not operations:
        return [], [], ['lot vide : au moins une opération attendue'], [], {}
    crees = [str(_uuid.uuid4()) for op in operations
             if isinstance(op, dict) and op.get('op') == 'creer']
    projets = {t['project'] for t in taches if t.get('project')}

    def projet_existe(p):
        return any(x == p or x.startswith(p + '.') for x in projets)

    ctx = {'projetees': [dict(t) for t in taches], 'n_creer': 0, 'tags_connus': _tags_connus(),
           'projet_existe': projet_existe, 'tags_ok': True, 'projet_ok': True}
    for i, op in enumerate(operations, 1):
        ctx['rang'] = i
        rendu = _normaliser_operation(op, taches, crees, bloquants, avertissements, ctx)
        if isinstance(op, dict) and op.get('op') == 'creer':
            ctx['n_creer'] += 1
        if rendu:
            normalisees.append(rendu[0])
            lignes.append(rendu[1])

    if not bloquants:
        avant = {a['uuid'] for a in wtm.anomalies(taches) if a['code'] == 'cycle'}
        for a in wtm.anomalies(ctx['projetees']):
            if a['code'] == 'cycle' and a['uuid'] not in avant:
                bloquants.append('cycle de dépendances créé par le lot : {} ({})'.format(
                    a['description'], _court(a['uuid'])))
    return normalisees, lignes, bloquants, avertissements, {
        'tags': ctx['tags_ok'], 'projet': ctx['projet_ok']}


# ---------------------------------------------------------------- execution (copie ou vraie base)

def _journal_vide():
    return {'crees': [], 'crees_modified': {}, 'modifiees': {}, 'faites': 0}


def _executer(taskrc, operations, journal):
    """Applique les operations dans l'ordre sur `taskrc`, en verifiant chaque effet.
    Remplit `journal` au fur et a mesure ; s'arrete a la premiere erreur."""
    taches = wtm._exporter(taskrc)
    for i, op in enumerate(operations, 1):
        try:
            maintenant = _maintenant_utc()
            if op['op'] == 'decouper':
                parent = _nettoyer(_trouver(taches, op['uuid']))
                nouveaux = wtm._split(taskrc, op)
                journal['modifiees'].setdefault(op['uuid'], {'avant': parent})
                journal['crees'].extend(nouveaux)
                taches = wtm._exporter(taskrc)
            else:
                objet = _construire(taches, op, maintenant)
                wtm._importer(taskrc, [objet])
                if op['op'] == 'creer':
                    journal['crees'].append(objet['uuid'])
                else:
                    journal['modifiees'].setdefault(
                        objet['uuid'], {'avant': _nettoyer(_trouver(taches, objet['uuid']))})
                taches = wtm._exporter(taskrc)
                exporte = _trouver(taches, objet['uuid'])
                ecarts = _ecarts(exporte, objet) if exporte else ['absente']
                if ecarts:
                    raise WtmErreur('effet inattendu sur {} : {}'.format(
                        _court(objet['uuid']), ', '.join(ecarts)))
        except WtmErreur as exc:
            raise WtmErreur('échec à l\'opération {} ({} passée(s) avant) : {}'.format(
                i, journal['faites'], exc))
        journal['faites'] = i


def _fixer_modified(taskrc, journal):
    """Releve le `modified` de chaque tache touchee, apres application."""
    taches = {t['uuid']: t for t in wtm._exporter(taskrc)}
    for u, m in journal['modifiees'].items():
        m['modified'] = taches.get(u, {}).get('modified')
    for u in journal['crees']:
        journal['crees_modified'][u] = taches.get(u, {}).get('modified')


def _essai(taskrc, operations):
    """Applique le lot sur une copie jetable (supprimee ensuite) ; rend les comptes."""
    dossier = tempfile.mkdtemp(prefix='wtm-mcp-')
    try:
        copie = wtm.copier(taskrc, dossier)
        journal = _journal_vide()
        _executer(copie, operations, journal)
    finally:
        shutil.rmtree(dossier)
    return {'creees': len(journal['crees']), 'modifiees': len(journal['modifiees'])}


# ---------------------------------------------------------------- etat sur disque

def _chemin(etat, sous_dossier, nom):
    return os.path.join(etat, sous_dossier, nom)


def _ecrire_json(chemin, objet):
    os.makedirs(os.path.dirname(chemin), exist_ok=True)
    with open(chemin, 'w', encoding='utf-8') as f:
        json.dump(objet, f, ensure_ascii=False, indent=2)


def _hash(contenu):
    return hashlib.sha256(json.dumps(contenu, ensure_ascii=False, sort_keys=True)
                          .encode('utf-8')).hexdigest()


def _lire_lot(etat, id):
    """Lot enregistre ({'contenu', 'hash', 'etat', ...}) ; refuse un lot inconnu ou altere."""
    if not ID_LOT_RE.match(str(id)):
        raise WtmErreur('identifiant de lot invalide : {}'.format(id))
    chemin = _chemin(etat, 'lots', id + '.json')
    if not os.path.isfile(chemin):
        raise WtmErreur('lot inconnu : {}'.format(id))
    try:
        with open(chemin, encoding='utf-8') as f:
            lot = json.load(f)
    except (OSError, ValueError) as exc:
        raise WtmErreur('lot illisible : {}'.format(exc))
    if lot.get('hash') != _hash(lot.get('contenu')):
        raise WtmErreur('lot {} altéré depuis sa proposition (hash différent) : '
                        'reproposez-le'.format(id))
    return lot


def _changer_etat(etat, lot, nouvel_etat):
    lot['etat'] = nouvel_etat
    lot['etat_le'] = datetime.now().isoformat()
    _ecrire_json(_chemin(etat, 'lots', lot['contenu']['id'] + '.json'), lot)


def _etat_affiche(lot, maintenant):
    """Etat du lot ; `perime` est calcule : un lot propose depuis plus de 24 h."""
    if lot['etat'] == 'propose' and (
            maintenant - datetime.fromisoformat(lot['contenu']['propose_le'])) > VALIDITE:
        return 'perime'
    return lot['etat']


# ---------------------------------------------------------------- resume

def _cellule(valeur):
    return str(valeur).replace('\n', ' ')


def _plier(texte, largeur):
    return textwrap.wrap(texte or '', largeur) or ['']


def _valeur_changement(champ, v):
    if champ == 'estTime':
        return _duree_compacte(v) or '—'
    if champ in CHAMPS_DATES:
        return _date_locale(v) if v else '—'
    if isinstance(v, (list, tuple)):
        return ', '.join(_court(x) if champ == 'depends' else x for x in v) or '—'
    return str(v) if v not in (None, '') else '—'


def _ligne_table(num, op, projet, tache, tags, duree, echeance):
    return '{:>2}  {:<5}  {:<{lp}}  {:<{lt}}  {:<{lg}}  {:<{ld}}  {}'.format(
        num, op, projet, tache, tags, duree, echeance,
        lp=L_PROJET, lt=L_TACHE, lg=L_TAGS, ld=L_DUREE).rstrip()


def rendre_resume(proposition):
    """Texte a largeur fixe d'une proposition (format de la spec)."""
    p = proposition
    identifiant = p['id'] if p.get('id') else 'non figé'
    sortie = ['Lot {} — {} — {} à créer, {} à modifier      (proposé le {})'.format(
        identifiant, p['titre'], p['creer'], p['modifier'],
        p['propose_le'].strftime('%d/%m à %H:%M')),
        'Base : {} tâches en attente, empreinte {}'.format(
            p['base']['en_attente'], p['base']['empreinte'][:8])]
    if p['lignes']:
        sortie += ['', _ligne_table('#', 'Op', 'Projet', 'Tâche', 'Tags', 'Durée', 'Échéance')]
    for n, l in enumerate(p['lignes'], 1):
        projet = _plier(l.get('project') or '—', L_PROJET)
        tache = _plier(l['description'], L_TACHE)
        tags = _plier(' '.join(t for t in l.get('tags') or [] if t not in ('pro', 'perso')),
                      L_TAGS)
        hauteur = max(len(projet), len(tache), len(tags))
        for i in range(hauteur):
            def cell(liste):
                return liste[i] if i < len(liste) else ''
            premiere = i == 0
            sortie.append(_ligne_table(
                n if premiere else '', LIBELLE_OP.get(l['op'], l['op']) if premiere else '',
                cell(projet), cell(tache), cell(tags),
                (_duree_compacte(l.get('estTime')) or '—') if premiere else '',
                (_date_locale(l['due']) if l.get('due') else '—') if premiere else ''))
        for champ, avant, apres in l.get('changements') or []:
            sortie.append(' ' * INDENT + '{} : {} → {}'.format(
                champ, _valeur_changement(champ, avant), _valeur_changement(champ, apres)))

    c = p['controles']

    def coche(ok, texte, faux='✘'):
        return '{} {}'.format('✔' if ok else faux, texte)
    essai = c.get('essai')
    if essai is None:
        texte_essai = '– essai sur copie non fait'
    else:
        parties = []
        if essai['creees']:
            parties.append('{} créée{}'.format(essai['creees'], 's' if essai['creees'] > 1 else ''))
        if essai['modifiees'] or not parties:
            parties.append('{} modifiée{}'.format(essai['modifiees'],
                                                  's' if essai['modifiees'] > 1 else ''))
        texte_essai = '✔ essai sur copie ({})'.format(', '.join(parties))
    sortie += ['', 'Contrôles : ' + '  '.join([
        coche(c['formats'], 'formats'), coche(c['tags'], 'tags connus', '⚠'),
        coche(c['projet'], 'projet existant', '⚠'), texte_essai])]
    if p['bloquants']:
        sortie.append('Bloquants ({}) : le lot n\'est pas figé' .format(len(p['bloquants'])))
        sortie += ['  - ' + b for b in p['bloquants']]
    if p['avertissements']:
        sortie.append('Avertissements ({}) :'.format(len(p['avertissements'])))
        sortie += ['  - ' + a for a in p['avertissements']]
    elif not p['bloquants']:
        sortie.append('Avertissements : aucun')
    if not p['bloquants'] and p.get('id'):
        sortie.append('→ « applique le lot » pour écrire. '
                      'Le lot expire si la base change ou dans 24 h.')
    return '\n'.join(sortie)


# ---------------------------------------------------------------- proposer / appliquer / annuler

def proposer_lot(taskrc, etat, titre, operations, maintenant=None):
    """Valide, essaie sur copie, fige un lot et rend le resume. Ne touche pas la base."""
    maintenant = maintenant or datetime.now()
    taches = wtm._exporter(taskrc)
    base = {'en_attente': sum(1 for t in taches if t.get('status') == 'pending'),
            'empreinte': wtm.empreinte(taches)}
    normalisees, lignes, bloquants, avertissements, partiels = _valider(taches, operations)
    essai = None
    if not bloquants:
        try:
            essai = _essai(taskrc, normalisees)
        except WtmErreur as exc:
            bloquants.append('essai sur copie échoué : {}'.format(exc))
    identifiant = None
    if not bloquants:
        os.makedirs(os.path.join(etat, 'lots'), exist_ok=True)
        identifiant = 'L-' + _uuid.uuid4().hex[:4]
        while os.path.exists(_chemin(etat, 'lots', identifiant + '.json')):
            identifiant = 'L-' + _uuid.uuid4().hex[:4]
        contenu = {'id': identifiant, 'titre': titre or 'Sans titre',
                   'propose_le': maintenant.isoformat(), 'base': base,
                   'operations': normalisees}
        _ecrire_json(_chemin(etat, 'lots', identifiant + '.json'), {
            'contenu': contenu, 'hash': _hash(contenu), 'etat': 'propose',
            'etat_le': maintenant.isoformat()})
    return rendre_resume({
        'id': identifiant, 'titre': titre or 'Sans titre', 'propose_le': maintenant,
        'base': base, 'creer': sum(1 for o in normalisees if o['op'] == 'creer'),
        'modifier': sum(1 for o in normalisees if o['op'] != 'creer'),
        'lignes': lignes,
        'controles': {'formats': not bloquants, 'tags': partiels.get('tags', True),
                      'projet': partiels.get('projet', True), 'essai': essai},
        'bloquants': bloquants, 'avertissements': avertissements})


def _liste_taches(taches, uuids):
    par_uuid = {t['uuid']: t for t in taches}
    return ['  {}  {}'.format(_court(u), par_uuid.get(u, {}).get('description', '?'))
            for u in uuids]


def appliquer_lot(taskrc, etat, id, maintenant=None):
    """Applique un lot fige : base inchangee, sauvegarde, execution, verification, journal."""
    maintenant = maintenant or datetime.now()
    lot = _lire_lot(etat, id)
    if lot['etat'] != 'propose':
        raise WtmErreur('lot {} déjà {} : il ne peut plus être appliqué'.format(
            id, ETATS.get(lot['etat'], lot['etat'])))
    if _etat_affiche(lot, maintenant) == 'perime':
        raise WtmErreur('lot {} périmé (plus de 24 h) : reproposez-le'.format(id))
    contenu = lot['contenu']
    avant = wtm._exporter(taskrc)
    if wtm.empreinte(avant) != contenu['base']['empreinte']:
        raise WtmErreur('la base a changé depuis la proposition : reproposez le lot')

    sauvegarde = _chemin(etat, 'sauvegardes',
                         '{}-{}.json'.format(id, maintenant.strftime('%Y%m%dT%H%M%S')))
    _ecrire_json(sauvegarde, avant)

    journal = _journal_vide()
    journal['applique_le'] = maintenant.isoformat()
    try:
        _executer(taskrc, contenu['operations'], journal)
    except WtmErreur as exc:
        _fixer_modified(taskrc, journal)
        _ecrire_json(_chemin(etat, 'journaux', id + '.json'), journal)
        _changer_etat(etat, lot, 'echec')
        raise WtmErreur('{}. Lot {} : {} opération(s) sur {} passée(s) ; annuler_lot peut '
                        'défaire la partie appliquée.'.format(
                            exc, id, journal['faites'], len(contenu['operations'])))
    _fixer_modified(taskrc, journal)
    _ecrire_json(_chemin(etat, 'journaux', id + '.json'), journal)
    _changer_etat(etat, lot, 'applique')

    apres = wtm._exporter(taskrc)
    n, m = len(journal['crees']), len(journal['modifiees'])
    lignes = ['Lot {} appliqué : {} créée{}, {} modifiée{}'.format(
        id, n, 's' if n > 1 else '', m, 's' if m > 1 else '')]
    lignes += ['créées :'] * bool(n) + _liste_taches(apres, journal['crees'])
    lignes += ['modifiées :'] * bool(m) + _liste_taches(apres, list(journal['modifiees']))
    lignes.append('Sauvegarde : ' + sauvegarde)
    return '\n'.join(lignes)


def annuler_lot(taskrc, etat, id):
    """Defait un lot applique, uniquement sur les taches qu'il a touchees ; refuse en bloc
    si l'une d'elles a ete retouchee depuis."""
    lot = _lire_lot(etat, id)
    if lot['etat'] not in ('applique', 'echec'):
        raise WtmErreur('lot {} {} : seul un lot appliqué peut être annulé'.format(
            id, ETATS.get(lot['etat'], lot['etat'])))
    chemin = _chemin(etat, 'journaux', id + '.json')
    try:
        with open(chemin, encoding='utf-8') as f:
            journal = json.load(f)
    except (OSError, ValueError) as exc:
        raise WtmErreur('journal du lot {} illisible : {}'.format(id, exc))

    actuelles = {t['uuid']: t for t in wtm._exporter(taskrc)}
    retouchees = []
    for u, m in journal['modifiees'].items():
        if actuelles.get(u, {}).get('modified') != m.get('modified'):
            retouchees.append('{} ({})'.format(m['avant'].get('description'), _court(u)))
    for u in journal['crees']:
        t = actuelles.get(u)
        if t and t.get('status') != 'deleted' and t.get('modified') != journal[
                'crees_modified'].get(u):
            retouchees.append('{} ({})'.format(t.get('description'), _court(u)))
    if retouchees:
        raise WtmErreur('annulation refusée, rien n\'a été fait : tâches modifiées depuis '
                        'l\'application du lot : ' + ', '.join(retouchees))

    # Les valeurs d'avant d'abord (retire les dependances vers les creees), puis les suppressions.
    wtm._importer(taskrc, [m['avant'] for m in journal['modifiees'].values()])
    supprimees = 0
    for u in journal['crees']:
        if actuelles.get(u, {}).get('status') == 'deleted':
            continue
        code, _, err = wtm.executer_task(taskrc, ['rc.confirmation=off', u, 'delete'])
        if code != 0:
            raise WtmErreur('suppression de {} échouée : {}'.format(_court(u), err.strip()))
        supprimees += 1
    apres = {t['uuid']: t for t in wtm._exporter(taskrc)}
    for u, m in journal['modifiees'].items():
        ecarts = _ecarts(apres.get(u, {}), m['avant'])
        if ecarts:
            raise WtmErreur('annulation incomplète sur {} : {}'.format(_court(u), ', '.join(ecarts)))
    _changer_etat(etat, lot, 'annule')
    return 'Lot {} annulé : {} créée(s) supprimée(s), {} modifiée(s) restaurée(s)'.format(
        id, supprimees, len(journal['modifiees']))


def lister_lots(etat, n=10, maintenant=None):
    """Les n derniers lots : id, date, etat, nombre d'operations, titre."""
    maintenant = maintenant or datetime.now()
    dossier = os.path.join(etat, 'lots')
    lots = []
    if os.path.isdir(dossier):
        for nom in os.listdir(dossier):
            if nom.endswith('.json'):
                lots.append(_lire_lot(etat, nom[:-5]))
    lots.sort(key=lambda l: (l['contenu']['propose_le'], l['contenu']['id']))
    if not lots:
        return 'Aucun lot.'
    lignes = []
    for lot in lots[-max(n, 0):] if n > 0 else []:
        c = lot['contenu']
        lignes.append('{}  {}  {:<13}  {} op.  {}'.format(
            c['id'], datetime.fromisoformat(c['propose_le']).strftime('%d/%m %H:%M'),
            ETATS[_etat_affiche(lot, maintenant)], len(c['operations']), c['titre']))
    return '\n'.join(lignes)


# ---------------------------------------------------------------- enveloppe MCP

def creer_serveur(config):
    """Serveur MCP `taskwarrior` : les cinq fonctions, sur la base et l'etat de `config`."""
    from typing import Any

    from mcp.server.mcpserver import MCPServer

    taskrc, etat = config['taskrc'], config['etat']
    serveur = MCPServer('taskwarrior')

    def protege(fonction):
        @functools.wraps(fonction)
        def enveloppe(*args, **kwargs):
            try:
                return fonction(*args, **kwargs)
            except WtmErreur as exc:
                return 'Refusé : {}'.format(exc)
        return enveloppe

    @serveur.tool(name='lire')
    @protege
    def outil_lire(projet: str | None = None, statut: str = 'pending',
                   filtre: str | None = None, limite: int = 50) -> str:
        """Lit les tâches Taskwarrior (lecture seule). Rend un en-tête (nombre de tâches,
        empreinte de la base) puis une ligne par tâche : uuid court (8), projet, description,
        tags, durée, échéance, dépendances. `projet` inclut les sous-projets ; `statut` vaut
        pending, completed, waiting, deleted ou all ; `filtre` est un filtre Taskwarrior
        (`+jde`, `due.before:2026-11-01`), sans mot de commande ; `limite` borne les lignes."""
        return lire(taskrc, projet, statut, filtre, limite)

    @serveur.tool(name='proposer_lot')
    @protege
    def outil_proposer(titre: str, operations: list[dict[str, Any]]) -> str:
        """Propose un lot d'opérations, sans rien écrire dans la base : valide, essaie sur
        une copie, fige le lot (identifiant L-xxxx) et rend un résumé à recopier tel quel à
        l'utilisateur. Un lot avec un bloquant n'est pas figé. Les uuid peuvent être complets
        ou abrégés (8 premiers caractères). Chaque tâche doit finir avec le tag pro ou perso.
        Opérations (champ `op`) :
        - creer : description, project, tags (liste, sans +), estTime, due, scheduled, wait,
          depends (uuid existants, ou "$1", "$2"... = 1re, 2e tâche créée du lot), priority
          (H/M/L), annotations (liste de textes).
        - modifier : uuid, puis les champs à remplacer parmi description, project, estTime,
          due, scheduled, wait, priority (null ou "" retire le champ), tags / depends
          (remplacent la liste), tags_ajout, tags_retrait, depends_ajout, depends_retrait.
        - decouper : uuid, sous_projet (nom ou null), sous_taches (liste d'au moins deux
          {description, estTime, apparier_a}).
        - annoter : uuid, texte.
        estTime : 30min, 1h, 1.5h, 1h30, 1h+30min ou PT1H30M. Dates : 2026-11-04,
        2026-11-04T14:30, 04/11/2026 ou 20261104T130000Z (une date seule = minuit local).
        Interdits (bloquants) : done, delete, purge, undo, sync, config, champ status."""
        return proposer_lot(taskrc, etat, titre, operations)

    @serveur.tool(name='appliquer_lot')
    @protege
    def outil_appliquer(id: str) -> str:
        """Applique un lot proposé (id L-xxxx) : écrit dans la vraie base, après sauvegarde.
        À n'appeler qu'après l'accord explicite de l'utilisateur sur le résumé. Refuse un
        lot inconnu, déjà appliqué, périmé (24 h) ou si la base a changé depuis."""
        return appliquer_lot(taskrc, etat, id)

    @serveur.tool(name='annuler_lot')
    @protege
    def outil_annuler(id: str) -> str:
        """Défait un lot appliqué (id L-xxxx), uniquement sur les tâches qu'il a touchées :
        supprime les tâches créées, remet les valeurs d'avant. Refuse en bloc si l'une de
        ces tâches a été modifiée depuis. À n'appeler qu'avec l'accord de l'utilisateur."""
        return annuler_lot(taskrc, etat, id)

    @serveur.tool(name='lister_lots')
    @protege
    def outil_lister(n: int = 10) -> str:
        """Liste les n derniers lots : id, date, état (proposé, appliqué, annulé, périmé,
        échec partiel), nombre d'opérations, titre."""
        return lister_lots(etat, n)

    return serveur


def main():
    """Point d'entree : serveur stdio sur la base de WTM_MCP_TASKRC."""
    try:
        config = configuration(os.environ)
        print('taskwarrior MCP : base {}, état {}'.format(
            wtm.base_effective(config['taskrc']), config['etat']), file=sys.stderr)
    except WtmErreur as exc:
        print('taskwarrior MCP : {}'.format(exc), file=sys.stderr)
        return 2
    creer_serveur(config).run('stdio')
    return 0


if __name__ == '__main__':
    sys.exit(main())
