"""
Wrapper de securite entre les agents et Taskwarrior.

Trois gestes : copier une base, l'auditer en lecture seule, appliquer un lot
valide (apres sauvegarde, sur une base inchangee depuis l'audit).

Toute commande `task` passe par `executer_task`, qui pose TASKRC et retire
TASKDATA herite (il l'emporterait sur le taskrc).

Deux gestes de planification en lecture seule : `planifier` lance le planificateur
sans jamais ecrire dans Taskwarrior, `faisabilite` dit si un projet tient une echeance.
"""

import argparse
import hashlib
import json
import os
import subprocess
import sys
import tempfile
from datetime import date, datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import config  # noqa: E402
from config import BASE_PROD  # noqa: E402


class WtmErreur(Exception):
    """Erreur attendue : refus de securite ou echec d'une commande."""


def executer_task(taskrc, args, entree=None):
    """Lance `task` (liste d'arguments, sans shell) sur le taskrc donne."""
    env = dict(os.environ)
    env['TASKRC'] = taskrc
    env.pop('TASKDATA', None)
    fini = subprocess.run(['task', *args], env=env, input=entree,
                          capture_output=True, text=True, encoding='utf-8',
                          shell=False)
    return fini.returncode, fini.stdout, fini.stderr


def _normaliser(chemin):
    """Chemin comparable : slashs, casse, sans separateur ni `/data` final."""
    c = chemin.strip().replace('\\', '/').lower().rstrip('/')
    if c.endswith('/data'):
        c = c[:-5].rstrip('/')
    return c


def base_effective(taskrc):
    """Dossier de donnees effectif du taskrc, tel que Taskwarrior le rapporte."""
    code, sortie, err = executer_task(taskrc, ['_get', 'rc.data.location'])
    if code != 0:
        raise WtmErreur('base effective illisible : ' + err.strip())
    return sortie.strip()


def _exporter(taskrc):
    code, sortie, err = executer_task(taskrc, ['export'])
    if code != 0:
        raise WtmErreur('export impossible : ' + err.strip())
    try:
        return json.loads(sortie) if sortie.strip() else []
    except ValueError as exc:
        raise WtmErreur('export illisible : {}'.format(exc))


def empreinte(taches):
    """Empreinte sha256 des couples uuid|modified, independante de l'ordre."""
    lignes = sorted('{}|{}'.format(t.get('uuid', ''), t.get('modified', ''))
                    for t in taches)
    return hashlib.sha256('\n'.join(lignes).encode('utf-8')).hexdigest()


def _deps(tache):
    d = tache.get('depends') or []
    if isinstance(d, str):
        d = d.split(',')
    return [x.strip() for x in d if x and x.strip()]


def _anomalie(code, tache, detail, correction=None):
    return {'code': code, 'uuid': tache['uuid'],
            'description': tache.get('description', ''),
            'detail': detail, 'correction': correction}


def anomalies(taches):
    """Anomalies des taches pending/waiting (dicts code/uuid/description/detail/correction)."""
    connus = {t['uuid'] for t in taches}
    sujets = [t for t in taches if t.get('status') in ('pending', 'waiting')]
    par_uuid = {t['uuid']: t for t in sujets}
    trouvees = []

    for t in sujets:
        for d in _deps(t):
            if d not in connus:
                trouvees.append(_anomalie(
                    'depends-inconnu', t, 'depend de {} absent'.format(d),
                    ['depends:-' + d]))

    # Cycles : parcours en profondeur sur les dependances entre sujets.
    etat = {}
    dans_cycle = set()

    def visiter(u, chemin):
        etat[u] = 1
        chemin.append(u)
        for d in _deps(par_uuid[u]):
            if d not in par_uuid:
                continue
            if etat.get(d) == 1:
                dans_cycle.update(chemin[chemin.index(d):])
            elif d not in etat:
                visiter(d, chemin)
        chemin.pop()
        etat[u] = 2

    for u in par_uuid:
        if u not in etat:
            visiter(u, [])
    for u in sorted(dans_cycle):
        trouvees.append(_anomalie('cycle', par_uuid[u], 'dans un cycle de dependances'))

    for t in sujets:
        if not t.get('estTime'):
            trouvees.append(_anomalie('sans-esttime', t, 'estTime absent'))
        if t.get('scheduled') and t.get('due') and t['scheduled'] > t['due']:
            trouvees.append(_anomalie(
                'scheduled-apres-due', t,
                'scheduled {} apres due {}'.format(t['scheduled'], t['due'])))
        if 'milestone' in (t.get('tags') or []) and not _deps(t):
            trouvees.append(_anomalie('jalon-sans-sous-tache', t,
                                      'jalon sans depends'))
    return trouvees


def _importer(taskrc, taches):
    """Importe des taches en passant par un fichier temporaire UTF-8."""
    if not taches:
        return
    fd, chemin = tempfile.mkstemp(suffix='.json')
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as f:
            json.dump(taches, f, ensure_ascii=False)
        code, _, err = executer_task(taskrc, ['import', chemin])
    finally:
        os.unlink(chemin)
    if code != 0:
        raise WtmErreur('import echoue : ' + err.strip())


def copier(source_taskrc, dest_dir):
    """Copie la base de `source_taskrc` dans `dest_dir` ; rend le taskrc de la copie."""
    if not source_taskrc:
        raise WtmErreur('source obligatoire')
    if not os.path.isfile(source_taskrc):
        raise WtmErreur('taskrc source introuvable : ' + source_taskrc)
    dest = os.path.abspath(dest_dir)
    if os.path.isdir(dest) and os.listdir(dest):
        raise WtmErreur('destination non vide : ' + dest)
    n_dest = _normaliser(dest)
    n_prod = _normaliser(BASE_PROD)
    if n_dest == n_prod or n_dest.startswith(n_prod + '/'):
        raise WtmErreur('destination sous la base de prod refusee')
    n_src = _normaliser(base_effective(source_taskrc))
    if n_dest == n_src or n_dest.startswith(n_src + '/'):
        raise WtmErreur('destination egale a la base de la source')

    taches = _exporter(source_taskrc)

    os.makedirs(os.path.join(dest, 'data'), exist_ok=True)
    with open(source_taskrc, encoding='utf-8') as f:
        lignes = [l for l in f.read().splitlines()
                  if not l.strip().startswith('data.location')]
    lignes.insert(0, 'data.location=' + os.path.join(dest, 'data').replace('\\', '/'))
    taskrc = os.path.join(dest, 'taskrc')
    with open(taskrc, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lignes) + '\n')

    _importer(taskrc, taches)
    if {t['uuid'] for t in _exporter(taskrc)} != {t['uuid'] for t in taches}:
        raise WtmErreur('la copie ne contient pas les memes taches que la source')
    return taskrc


def auditer(taskrc, sortie_dir):
    """Audit en lecture seule : ecrit sauvegarde.json, rapport.md et lot.json."""
    taches = _exporter(taskrc)
    trouvees = anomalies(taches)
    os.makedirs(sortie_dir, exist_ok=True)
    sauvegarde = os.path.join(sortie_dir, 'sauvegarde.json')
    with open(sauvegarde, 'w', encoding='utf-8') as f:
        json.dump(taches, f, ensure_ascii=False)

    def cellule(x):
        return str(x).replace('|', '/').replace('\n', ' ')

    lignes = ['# Rapport d\'audit', '',
              '| anomalie | uuid | description | correction proposee |',
              '|---|---|---|---|']
    for a in trouvees:
        corr = ' '.join(a['correction']) if a['correction'] else '(aucune)'
        lignes.append('| {} | {} | {} | {} |'.format(
            a['code'], a['uuid'], cellule(a['description']), cellule(corr)))
    rapport = os.path.join(sortie_dir, 'rapport.md')
    with open(rapport, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lignes) + '\n')

    lot = {'version': 1,
           'id': 'lot-' + empreinte(taches)[:12],
           'empreinte': empreinte(taches),
           'sauvegarde': sauvegarde,
           'operations': [{'op': 'modify', 'uuid': a['uuid'], 'args': a['correction']}
                          for a in trouvees if a['correction']]}
    chemin_lot = os.path.join(sortie_dir, 'lot.json')
    with open(chemin_lot, 'w', encoding='utf-8') as f:
        json.dump(lot, f, ensure_ascii=False, indent=2)
    return {'lot': chemin_lot, 'rapport': rapport, 'sauvegarde': sauvegarde,
            'anomalies': trouvees}


def appliquer(lot_path, taskrc, cible_prod=False):
    """Applique un lot apres controles ; s'arrete a la premiere erreur."""
    try:
        with open(lot_path, encoding='utf-8') as f:
            lot = json.load(f)
    except (OSError, ValueError) as exc:
        raise WtmErreur('lot illisible : {}'.format(exc))

    sauv = lot.get('sauvegarde')
    if not sauv or not os.path.isfile(sauv) or os.path.getsize(sauv) == 0:
        raise WtmErreur('sauvegarde absente ou vide : {}'.format(sauv))

    if _normaliser(base_effective(taskrc)) == _normaliser(BASE_PROD) and not cible_prod:
        raise WtmErreur('base de prod visee sans --cible-prod')

    if empreinte(_exporter(taskrc)) != lot.get('empreinte'):
        raise WtmErreur('la base a change depuis l\'audit (empreinte differente)')

    operations = lot.get('operations', [])
    for op in operations:
        if op.get('op') == 'modify':
            for a in [op.get('uuid', '')] + list(op.get('args', [])):
                if not str(a).isascii():
                    raise WtmErreur('argument non ASCII refuse : {!r}'.format(a))

    faites = 0
    for op in operations:
        if op.get('op') == 'modify':
            code, _, err = executer_task(
                taskrc, ['rc.confirmation=off', op['uuid'], 'modify', *op['args']])
        elif op.get('op') == 'import':
            try:
                _importer(taskrc, op.get('taches', []))
                code, err = 0, ''
            except WtmErreur as exc:
                code, err = 1, str(exc)
        else:
            code, err = 1, 'operation inconnue : {!r}'.format(op.get('op'))
        if code != 0:
            raise WtmErreur('echec a l\'operation {} ({} reussies avant) : {}'.format(
                faites + 1, faites, err.strip()))
        faites += 1
    return {'appliquees': faites}


def executer_planif(taskrc, args):
    """Lance le planificateur (liste d'arguments, sans shell) sur le taskrc donne."""
    env = dict(os.environ)
    env['TASKRC'] = taskrc
    env.pop('TASKDATA', None)
    fini = subprocess.run([config.PLANIFICATEUR_PYTHON, *args], env=env,
                          cwd=config.PLANIFICATEUR_RACINE,
                          capture_output=True, text=True, encoding='utf-8',
                          shell=False)
    return fini.returncode, fini.stdout, fini.stderr


def lire_echeances():
    """Echeances par projet du planificateur ({} si le fichier est absent)."""
    chemin = (config.PLANIFICATEUR_ECHEANCES
              or os.path.join(config.PLANIFICATEUR_RACINE, 'echeances.json'))
    if not os.path.isfile(chemin):
        return {}
    try:
        with open(chemin, encoding='utf-8') as f:
            brut = json.load(f)
    except (OSError, ValueError) as exc:
        raise WtmErreur('echeances illisibles ({}) : {}'.format(chemin, exc))
    return {k: v for k, v in brut.items() if not k.startswith('_')}


def analyser_plan(plan, taches, projet=None, contextes=('pro', 'perso')):
    """Resume un plan.json sur le perimetre : retards, taches non placees, verdict."""
    def dans_perimetre(t):
        if t.get('status') != 'pending':
            return False
        if projet is None:
            return True
        p = t.get('project') or ''
        return p == projet or p.startswith(projet + '.')

    perimetre = [t for t in taches if dans_perimetre(t)]
    places = plan.get('taches', {})
    en_retard = [{'uuid': t['uuid'], 'description': t.get('description', ''),
                  'retard_minutes': places[t['uuid']].get('retard_minutes', 0)}
                 for t in perimetre
                 if t['uuid'] in plan.get('en_retard', []) and t['uuid'] in places]
    non_places = []
    for t in perimetre:
        if t['uuid'] in places:
            continue
        tags = t.get('tags') or []
        if 'external' in tags:
            raison = 'external'
        elif not t.get('estTime'):
            raison = 'sans-esttime'
        elif not any(c in tags for c in contextes):
            raison = 'sans-contexte'
        else:
            raison = 'ecartee'
        non_places.append({'uuid': t['uuid'], 'description': t.get('description', ''),
                           'raison': raison})
    fins = [places[t['uuid']]['fin'] for t in perimetre
            if t['uuid'] in places and places[t['uuid']].get('fin')]
    if en_retard:
        verdict = 'ne-tient-pas'
    elif (any(x['raison'] != 'external' for x in non_places)
          or plan.get('statut') != 'OPTIMAL'):
        verdict = 'indetermine'
    else:
        verdict = 'tient'
    return {'statut': plan.get('statut'), 'retard_total': plan.get('retard_total', 0),
            'en_retard': en_retard, 'non_places': non_places,
            'fin': max(fins) if fins else None, 'perimetre': len(perimetre),
            'verdict': verdict}


def planifier(taskrc, sortie_dir, projet=None, echeance=None, cible_prod=False,
              horizon_jours=120):
    """Calcule un plan sans rien ecrire dans Taskwarrior ; rend l'analyse du plan."""
    if echeance and not projet:
        raise WtmErreur('echeance sans projet')
    if _normaliser(base_effective(taskrc)) == _normaliser(BASE_PROD) and not cible_prod:
        raise WtmErreur('base de prod visee sans --cible-prod')

    os.makedirs(sortie_dir, exist_ok=True)
    echeances = lire_echeances()
    horizon = horizon_jours
    if projet:
        echeances.pop(projet, None)
    if echeance:
        echeances[projet] = echeance
        try:
            reste = (date.fromisoformat(echeance) - date.today()).days
        except ValueError:
            raise WtmErreur('echeance illisible : ' + echeance)
        horizon = max(horizon_jours, reste + 14)
    fichier = os.path.join(sortie_dir, 'echeances.json')
    with open(fichier, 'w', encoding='utf-8') as f:
        json.dump(echeances, f, ensure_ascii=False, indent=2)
    chemin_plan = os.path.join(sortie_dir, 'plan.json')

    code, _, err = executer_planif(taskrc, [
        '-m', 'planif', '--sortie', chemin_plan, '--echeances', fichier,
        '--horizon', str(horizon), '--horizon-opportuniste', str(horizon)])
    if code != 0:
        raise WtmErreur('planificateur en echec : ' + err.strip())
    try:
        with open(chemin_plan, encoding='utf-8') as f:
            plan = json.load(f)
    except (OSError, ValueError) as exc:
        raise WtmErreur('plan illisible : {}'.format(exc))
    res = analyser_plan(plan, _exporter(taskrc), projet=projet)
    res['plan'] = chemin_plan
    res['echeances'] = fichier
    return res


def faisabilite(taskrc, sortie_dir, projet, echeance, cible_prod=False):
    """Un projet tient-il son echeance ? Deux calculs : au plus tot, puis avec le mur."""
    tot = planifier(taskrc, os.path.join(sortie_dir, 'au-plus-tot'), projet=projet,
                    cible_prod=cible_prod)
    avec = planifier(taskrc, os.path.join(sortie_dir, 'avec-echeance'), projet=projet,
                     echeance=echeance, cible_prod=cible_prod)
    marge = None
    if tot['fin']:
        try:
            limite = (datetime.combine(date.fromisoformat(echeance), datetime.min.time())
                      + timedelta(hours=23, minutes=59))
            marge = (limite - datetime.fromisoformat(tot['fin'])).total_seconds() / 86400
        except ValueError:
            raise WtmErreur('date illisible : ' + echeance)
    verdict = avec['verdict']
    if marge is not None and marge < 0:
        verdict = 'ne-tient-pas'
    return {'au_plus_tot': tot, 'avec_echeance': avec, 'marge_jours': marge,
            'verdict': verdict}


def main(argv=None):
    """Point d'entree CLI ; rend 0, ou 2 sur WtmErreur."""
    p = argparse.ArgumentParser(prog='wtm')
    sub = p.add_subparsers(dest='cmd', required=True)
    c = sub.add_parser('copie')
    c.add_argument('--source', required=True)
    c.add_argument('--dest', required=True)
    a = sub.add_parser('audit')
    a.add_argument('--taskrc', required=True)
    a.add_argument('--sortie', required=True)
    ap = sub.add_parser('appliquer')
    ap.add_argument('lot')
    ap.add_argument('--taskrc', required=True)
    ap.add_argument('--cible-prod', action='store_true')
    pl = sub.add_parser('planifier')
    pl.add_argument('--taskrc', required=True)
    pl.add_argument('--sortie', required=True)
    pl.add_argument('--projet')
    pl.add_argument('--echeance')
    pl.add_argument('--cible-prod', action='store_true')
    fa = sub.add_parser('faisabilite')
    fa.add_argument('--taskrc', required=True)
    fa.add_argument('--sortie', required=True)
    fa.add_argument('--projet', required=True)
    fa.add_argument('--echeance', required=True)
    fa.add_argument('--cible-prod', action='store_true')
    args = p.parse_args(argv)
    try:
        if args.cmd == 'copie':
            print(copier(args.source, args.dest))
        elif args.cmd == 'audit':
            res = auditer(args.taskrc, args.sortie)
            print('{} anomalie(s) ; lot : {} ; rapport : {}'.format(
                len(res['anomalies']), res['lot'], res['rapport']))
        elif args.cmd == 'planifier':
            res = planifier(args.taskrc, args.sortie, projet=args.projet,
                            echeance=args.echeance, cible_prod=args.cible_prod)
            print(json.dumps(res, ensure_ascii=False, indent=2))
        elif args.cmd == 'faisabilite':
            res = faisabilite(args.taskrc, args.sortie, args.projet, args.echeance,
                              cible_prod=args.cible_prod)
            print(json.dumps(res, ensure_ascii=False, indent=2))
        else:
            res = appliquer(args.lot, args.taskrc, cible_prod=args.cible_prod)
            print('{} operation(s) appliquee(s)'.format(res['appliquees']))
    except WtmErreur as exc:
        print('wtm : {}'.format(exc), file=sys.stderr)
        return 2
    return 0


if __name__ == '__main__':
    sys.exit(main())
