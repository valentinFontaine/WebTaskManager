"""Decoupage (split) d'une tache en sous-taches et jalon de fin. Logique pure.

Modele (NOTES.md, docs/tags.md) : la tache decoupee garde son uuid, prend
+milestone, un estTime symbolique de 30min, et ne depend plus que de ses
sous-taches. Les sous-taches reprennent ses depends, son projet, ses tags et
sa due. Contrat : test_decoupage.py.
"""

import re

# Temps propre du jalon : symbolique, pour que le planificateur n'ait pas a
# connaitre +milestone (choix de l'utilisateur du 2026-10-07).
ESTTIME_JALON = '30min'

# +fixed n'a pas de sens sans le scheduled, qui n'est pas herite.
TAGS_NON_HERITES = {'fixed', 'milestone'}

UUID_CANONIQUE_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"
)
# Pas de point (il separerait un niveau de plus) ni rien que cmd.exe interprete.
NOM_SOUS_PROJET_RE = re.compile(r"^[\w-]+$")
ESTTIME_RE = re.compile(r"^[\w.+:]+$")
_ESTTIME_H_MIN = re.compile(r'^\s*(\d+)\s*h\s*(\d+)\s*(?:min|m)?\s*$', re.IGNORECASE)


class ErreurDecoupage(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status
        self.message = message


def parse_depends(brut):
    """Liste d'uuid (Taskwarrior 3) ou chaine separee par des virgules (2)."""
    if not brut:
        return []
    if isinstance(brut, list):
        return list(brut)
    return [u.strip() for u in str(brut).split(",") if u.strip()]


def normaliser_esttime(valeur):
    """`1h30` -> `1h+30min` (meme regle que main_fastapi.normaliser_esttime)."""
    m = _ESTTIME_H_MIN.match(valeur or '')
    if not m:
        return valeur
    return f'{int(m.group(1))}h+{int(m.group(2))}min'


def nom_sous_projet_libre(projet, base, projets_existants):
    """Premier nom `base`, `base-2`, `base-3`... dont `projet.nom` n'existe pas."""
    pris = {p.lower() for p in projets_existants}
    nom, n = base, 1
    while f"{projet}.{nom}".lower() in pris:
        n += 1
        nom = f"{base}-{n}"
    return nom


def _verifier_decoupable(tache):
    if tache.get('status') != 'pending':
        raise ErreurDecoupage(409, "Seule une tâche en attente peut être découpée.")
    if 'milestone' in (tache.get('tags') or []):
        raise ErreurDecoupage(409, "Cette tâche est déjà un jalon.")
    if tache.get('recur') or tache.get('parent'):
        raise ErreurDecoupage(409, "Une tâche récurrente ne peut pas être découpée.")


def _projet_des_sous_taches(tache, sous_projet, projets_existants):
    projet = tache.get('project')
    if sous_projet is None:
        return projet
    if not NOM_SOUS_PROJET_RE.fullmatch(sous_projet):
        raise ErreurDecoupage(400, f"Nom de sous-projet invalide : {sous_projet!r} "
                                   "(lettres, chiffres, - et _ seulement).")
    if not projet:
        raise ErreurDecoupage(400, "La tâche n'a pas de projet : pas de sous-projet possible.")
    complet = f"{projet}.{sous_projet}"
    if complet.lower() in {p.lower() for p in projets_existants}:
        raise ErreurDecoupage(409, f"Le projet {complet} existe déjà.")
    return complet


def _sous_taches_appariables(depends, predecesseurs):
    """{uuid de sous-tache: uuid de son jalon}, pour les jalons parmi depends."""
    appariables = {}
    for u in depends:
        p = predecesseurs.get(u)
        if p and 'milestone' in (p.get('tags') or []):
            for s in parse_depends(p.get('depends')):
                appariables[s] = u
    return appariables


def preparer_decoupage(tache, sous_taches, sous_projet, predecesseurs, projets_existants):
    """Valide la demande et renvoie la liste des sous-taches a creer.

    tache : export de la tache a decouper ; sous_taches : [{description,
    estTime, apparier_a}] ; predecesseurs : {uuid: export} des taches dont
    elle depend (necessaire seulement pour apparier_a).
    Leve ErreurDecoupage(status, message) avant toute ecriture.
    """
    _verifier_decoupable(tache)
    if len(sous_taches) < 2:
        raise ErreurDecoupage(400, "Il faut au moins deux sous-tâches.")

    projet = _projet_des_sous_taches(tache, sous_projet, projets_existants)
    depends = parse_depends(tache.get('depends'))
    tags = [t for t in (tache.get('tags') or []) if t not in TAGS_NON_HERITES]
    appariables = _sous_taches_appariables(depends, predecesseurs)

    plan = []
    for s in sous_taches:
        description = (s.get('description') or '').strip()
        if not description or '"' in description:
            raise ErreurDecoupage(400, "Description de sous-tâche vide ou contenant un guillemet.")

        est = (s.get('estTime') or '').strip() or None
        if est is not None:
            est = normaliser_esttime(est)
            if not ESTTIME_RE.fullmatch(est):
                raise ErreurDecoupage(400, f"Durée invalide : {s.get('estTime')!r}")

        deps = list(depends)
        cible = s.get('apparier_a')
        if cible:
            if not UUID_CANONIQUE_RE.fullmatch(cible) or cible not in appariables:
                raise ErreurDecoupage(400, "apparier_a doit désigner une sous-tâche "
                                           "d'un jalon dont dépend la tâche.")
            jalon = appariables[cible]
            deps = [cible if d == jalon else d for d in deps]

        plan.append({
            'description': description,
            'project': projet,
            'tags': tags,
            'due': tache.get('due'),
            'estTime': est,
            'depends': deps,
        })
    return plan


def commande_ajout(sous_tache):
    """Commande `task add` d'une sous-tache preparee (guillemets doubles : cmd.exe)."""
    parts = [f'task add "{sous_tache["description"]}"']
    if sous_tache.get('project'):
        parts.append(f'project:{sous_tache["project"]}')
    parts += [f'+{t}' for t in sous_tache.get('tags') or []]
    if sous_tache.get('due'):
        parts.append(f'due:{sous_tache["due"]}')
    if sous_tache.get('estTime'):
        parts.append(f'estTime:{sous_tache["estTime"]}')
    if sous_tache.get('depends'):
        parts.append(f'depends:{",".join(sous_tache["depends"])}')
    return ' '.join(parts)


def commande_jalon(uuid, anciens_depends, nouveaux):
    """Une seule commande : le jalon ne passe jamais par un etat sans dependance."""
    termes = list(nouveaux) + [f'-{u}' for u in anciens_depends]
    return (f'task rc.confirmation=off {uuid} modify +milestone '
            f'estTime:{ESTTIME_JALON} depends:{",".join(termes)}')


def jalons_a_fermer(uuid_termine, pending):
    """Jalons en attente a fermer apres la fin de uuid_termine, dans l'ordre.

    Un jalon se ferme quand il dependait d'une tache qui vient de se terminer
    et qu'aucune de ses dependances n'est plus en attente. En cascade.
    """
    termines = {uuid_termine}
    en_attente = {t['uuid'] for t in pending}
    fermes = []
    change = True
    while change:
        change = False
        for t in pending:
            u = t['uuid']
            if u in termines or 'milestone' not in (t.get('tags') or []):
                continue
            deps = set(parse_depends(t.get('depends')))
            if deps & termines and not (deps & (en_attente - termines)):
                fermes.append(u)
                termines.add(u)
                change = True
    return fermes
