"""Migration des tags descriptifs arrêtés le 2026-10-06 (docs/tags.md).

Usage :
    python tools/migrer-tags-descriptifs.py --taskrc <taskrc>              # rapport seul
    python tools/migrer-tags-descriptifs.py --taskrc <taskrc> --appliquer  # modifie la base

Toutes les tâches sont visées (pending, waiting, recurring, completed, deleted).
Seuls les tags changent : l'export est comparé avant / après, champ par champ.
Sur la prod, --appliquer exige --sauvegarde <dossier neuf> et --prod.
"""
import argparse
import json
import os
import shutil
import subprocess
import sys

RENOMMER = {
    # nature de l'action
    'telephone': 'phone', 'appel': 'phone', 'sondage': 'mail',
    'design': 'cao', 'plan': 'cao', 'CAO': 'cao', 'JDE': 'jde',
    'programmation': 'coding', 'bug': 'coding', 'taskwarrior': 'coding', 'ordinateur': 'coding',
    'iom': 'documentation', 'instruction': 'documentation', 'manuel': 'documentation',
    'reporting': 'documentation', 'compteRendu': 'documentation', 'notes': 'documentation',
    'costing': 'sourcing', 'consult': 'sourcing', 'offre': 'devis',
    'formation': 'learning', 'cours': 'learning', 'reunion': 'meeting', 'urgent': 'asap',
    # tiers
    'suivi': 'monitoring', 'verif': 'monitoring', 'expediting': 'monitoring',
    'prepaDeleg': 'delegation', 'promptPourPersonne': 'delegation',
    'BE': 'serviceBE', 'ServiceBE': 'serviceBE', 'ServiceMethode': 'serviceMethode',
    'achat': 'serviceAchat', 'CPQ': 'equipeCPQ', 'EquipeCPQ': 'equipeCPQ',
    'Kevin': 'kevin', 'Russel': 'russel', 'SAV': 'sav',
    # perso
    'course': 'shopping', 'courses': 'shopping', 'repas': 'habit',
    'impot': 'finance', 'argent': 'finance', 'maison': 'home', 'bricolage': 'home',
    'sante': 'health', 'vacances': 'holiday', 'voyage': 'holiday', 'camping': 'holiday',
    'trajet': 'transit', 'CA': 'asso', 'animation': 'asso',
    # sport
    'CO': 'orienteering', 'compet': 'race', 'entrainement': 'sport', 'training': 'sport',
    'Athle': 'running', 'muscu': 'strength', 'renfo': 'strength',
}
SUPPRIMER = {
    'NPD', 'SRMix', 'CDCO77', 'balise77', 'GAD', 'ingersoll', 'SeepexEnon', 'MRI', 'US',
    'test', 'calcul', 'technique', 'cale', 'analyse', 'budget', 'costly', 'outillage',
    'pointage', 'proto', 'atelier', 'erreur', 'fabrication', 'ordre', 'planif',
    'outlook', 'mail_to_task', 'vimWiki',
}
AJOUTER_AVEC = {'trail': {'running', 'sport'}}

RC = ['rc.hooks=off', 'rc.confirmation=off', 'rc.recurrence.confirmation=no',
      'rc.bulk=0', 'rc.verbose=nothing']


def task(taskrc, *args):
    env = {k: v for k, v in os.environ.items() if k not in ('TASKDATA', 'TASKRC')}
    r = subprocess.run(['task', f'rc:{taskrc}', *RC, *args], capture_output=True,
                       encoding='utf-8', env=env)
    if r.returncode != 0:
        raise RuntimeError(f'task {" ".join(args)} -> {r.returncode}\n{r.stderr}')
    return r.stdout


def exporter(taskrc):
    return {t['uuid']: t for t in json.loads(task(taskrc, 'export'))}


def nouveaux_tags(tags, uuid, offre_sourcing):
    res = set()
    for t in tags:
        if t in SUPPRIMER:
            continue
        if t == 'offre' and uuid in offre_sourcing:
            res.add('sourcing')
            continue
        res.add(RENOMMER.get(t, t))
        res |= AJOUTER_AVEC.get(t, set())
    return res


def plan(taches, offre_sourcing):
    return {u: nouveaux_tags(t.get('tags', []), u, offre_sourcing)
            for u, t in taches.items()
            if set(t.get('tags', [])) != nouveaux_tags(t.get('tags', []), u, offre_sourcing)}


def rapport(taches, changements):
    anciens = set(RENOMMER) | SUPPRIMER | set(AJOUTER_AVEC)
    compte = {}
    for t in taches.values():
        for tag in t.get('tags', []):
            if tag in anciens:
                compte[tag] = compte.get(tag, 0) + 1
    print(f'{len(taches)} tâches, {len(changements)} à modifier')
    for tag in sorted(compte, key=str.lower):
        cible = 'supprimé' if tag in SUPPRIMER else RENOMMER.get(tag, tag)
        if tag in AJOUTER_AVEC:
            cible += ' + ' + ', '.join(sorted(AJOUTER_AVEC[tag]))
        print(f'  {tag:20} {compte[tag]:5}  -> {cible}')
    print('\nTâches « offre » (devis par défaut ; --offre-sourcing UUID pour sourcing) :')
    for u, t in taches.items():
        if 'offre' in t.get('tags', []):
            print(f'  {u}  [{t["status"]}]  {t["description"][:70]}')
    sans_projet = [t for t in taches.values()
                   if set(t.get('tags', [])) & SUPPRIMER and not t.get('project')]
    print(f'\nTâches portant un tag supprimé sans projet : {len(sans_projet)}')
    for t in sans_projet:
        tags = ','.join(sorted(set(t['tags']) & SUPPRIMER))
        print(f'  {t["uuid"]}  [{t["status"]}]  {tags:15}  {t["description"][:55]}')


def appliquer(taskrc, taches, changements):
    for i, (u, cible) in enumerate(changements.items(), 1):
        avant = set(taches[u].get('tags', []))
        args = [f'-{t}' for t in sorted(avant - cible)] + [f'+{t}' for t in sorted(cible - avant)]
        task(taskrc, u, 'modify', *args)
        if i % 50 == 0:
            print(f'  {i}/{len(changements)}')


def verifier(avant, apres, changements):
    erreurs = []
    if set(avant) != set(apres):
        erreurs.append(f'ensemble des uuid différent : {len(avant)} -> {len(apres)}')
    for u in set(avant) & set(apres):
        a, b = dict(avant[u]), dict(apres[u])
        attendu = changements.get(u, set(a.get('tags', [])))
        if set(b.get('tags', [])) != attendu:
            erreurs.append(f'{u} tags {sorted(b.get("tags", []))} au lieu de {sorted(attendu)}')
        for d in (a, b):
            for champ in ('tags', 'modified', 'urgency', 'id'):
                d.pop(champ, None)
        if a != b:
            diff = sorted(k for k in set(a) | set(b) if a.get(k) != b.get(k))
            erreurs.append(f'{u} autres champs modifiés : {diff}')
    return erreurs


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--taskrc', required=True)
    p.add_argument('--appliquer', action='store_true')
    p.add_argument('--sauvegarde', help='dossier neuf où copier data + taskrc avant modification')
    p.add_argument('--prod', action='store_true', help='autoriser la base taskwarrior-prod')
    p.add_argument('--offre-sourcing', nargs='*', default=[])
    a = p.parse_args()

    data = task(a.taskrc, '_get', 'rc.data.location').strip()
    print(f'Base : {data}')
    est_prod = 'taskwarrior-prod' in os.path.abspath(data).replace('\\', '/') \
        and 'backup' not in data
    if a.appliquer and est_prod and not (a.prod and a.sauvegarde):
        sys.exit('Base de prod : --appliquer exige --prod et --sauvegarde.')

    avant = exporter(a.taskrc)
    changements = plan(avant, set(a.offre_sourcing))
    rapport(avant, changements)
    if not a.appliquer:
        print('\nRapport seul : rien n\'a été modifié (ajouter --appliquer).')
        return

    if a.sauvegarde:
        if os.path.exists(a.sauvegarde):
            sys.exit(f'{a.sauvegarde} existe déjà.')
        shutil.copytree(data, os.path.join(a.sauvegarde, 'data'))
        shutil.copy2(a.taskrc, os.path.join(a.sauvegarde, 'taskrc'))
        print(f'\nSauvegarde : {a.sauvegarde}')

    print(f'\nApplication de {len(changements)} modifications…')
    appliquer(a.taskrc, avant, changements)
    erreurs = verifier(avant, exporter(a.taskrc), changements)
    if erreurs:
        print(f'\nÉCHEC de la vérification ({len(erreurs)}) :')
        for e in erreurs[:30]:
            print('  ' + e)
        sys.exit(1)
    restants = plan(exporter(a.taskrc), set(a.offre_sourcing))
    print(f'\nVérifié : {len(avant)} tâches, seuls les tags ont changé ; '
          f'{len(restants)} tâche(s) encore à migrer.')


if __name__ == '__main__':
    main()
