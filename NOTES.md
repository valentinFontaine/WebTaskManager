# NOTES — état au 2026-10-07

Historique des sessions précédentes : `docs/archive/notes-2026-10-07.md`.

## État
- Commits locaux uniquement, rien poussé. Prod du PC (`../WebTaskManager-prod`, :1875) à jour
  jusqu'à `4793af0`, redémarrée, graphe multi-projets et redessin sans flash validés par
  l'utilisateur.
- pytest : 360 verts, 13 ignorés. Playwright `tests/graphe*` : 89/89, `tests/import.spec.js` : 19/19.

## Découpage (split) d'une tâche : fait le 2026-10-07, pas encore en prod
Commits `5070bf2` (backend) et `8d72718` (graphe). Modèle : `docs/tags.md` (`+milestone`) et
docstring de `decoupage.py`.
- `POST /api/task/{uuid}/split` : sous-tâches créées d'abord, puis **une** commande sur le jalon
  (`+milestone estTime:30min depends:s1,s2,-anciens`) ; échec en route → sous-tâches supprimées.
- Décision de l'utilisateur : le jalon garde `estTime:30min` (et non vide) pour que
  TaskWarriorPlanner n'ait **rien** à changer. Plus rien à faire côté planificateur.
- Sous-projet : nom pris → 409 (pas de « rejoindre ») ; jalon dans le projet d'origine.
- Clôture auto dans `POST /done` (en cascade). **Pas** si la sous-tâche est finie par `task done`
  en ligne de commande : il faudrait un hook sur chaque pair.
- Bouton « Découper » dans la barre du graphe seulement ; pas encore sur la fiche de tâche.
- Le graphe ne distingue pas visuellement un jalon (`/api/graphe` n'expose pas les tags).
- Vérifié : pytest 360 verts ; Playwright `tests/graphe*` 89/89 ; intégration réelle sur
  taskwarrior-dev (script jetable, 24 contrôles : successeur bloqué tout du long, rollback réel
  sur durée refusée, appariement, clôture). Non fait : staging téléphone, Firefox.
- Prochaine étape : `git merge master` dans `../WebTaskManager-prod`, puis redémarrer :1875
  (sur demande de l'utilisateur).

## Autres points en attente
- Défaut connu, non corrigé : après un import réussi, le bouton reste actif (un second clic
  réimporte le même fichier, sans doublon : mise à jour des mêmes tâches).
- Non vérifié sous Firefox : affichage de l'import, fenêtre de suppression du graphe.
- Piège d'instrument : Node n'est pas dans le PATH des shells de l'agent, et `npx` échoue même
  sous PowerShell. Playwright :
  `$env:Path='C:\Users\irpaui\AppData\Local\node-v24.17.0-win-x64;'+$env:Path` puis
  `node node_modules/@playwright/test/cli.js test …`, avec `TASKRC` sur taskwarrior-dev. Les
  suites du graphe dépassent 60 s : en arrière-plan, sans modifier les fichiers servis pendant
  le run (le serveur les sert en direct : run contaminé).
- Piège d'instrument : svg-pan-zoom applique le zoom à l'image suivante ; lire la
  transformation juste après un clic donne une valeur périmée (`expect.poll`).
- Piège d'instrument : lire l'export Taskwarrior en Python avec `PYTHONUTF8=1`, sinon les
  accents s'affichent en `Ã©` (cp1252) alors que la base est saine.
- Piège de déploiement : après `git merge master` en prod, **redémarrer :1875**. Le frontend
  est servi en direct, pas le Python : une page à jour peut parler à un backend ancien.
- PATH de Node : session dédiée, prompt `PROMPT-node-path.md` (non suivi par git).

## Plus tard (pas les prochaines sessions)
- Clôture automatique des jalons par `done` : **désactivée le 2026-10-07**, l'utilisateur veut fermer
  les jalons lui-même (c'est sa vérification). Le code reste : `decoupage.jalons_a_fermer` et la
  branche de `POST /api/task/{id}/done`, gardée par `config.FERMER_JALONS_AUTO` (variable
  d'environnement `WTM_FERMER_JALONS=1` pour la réactiver ; tests : `TestClotureViaDone` avec le
  drapeau levé, `test_done_jalons.py` pour le défaut). Réintégrer = lever le drapeau, ou en faire
  un réglage de l'interface.
- Stratégie planificateur `+delegation` → `+monitoring` : la tâche `+monitoring` dépend de la
  `+delegation`, mais sa due date dépend de la tâche externe. À concevoir avec l'utilisateur.

## Reste
- Correctif accents **non validé sur staging** : téléphone toujours en panne (2026-10-06).
- `plan.json` dans le worktree de prod : pas encore tout à fait réglé selon l'utilisateur.
- Lot E (boucle planifier / ajuster / valider) : l'utilisateur le teste lui-même, hors session.
- Lot H : graphe jugé satisfaisant. Carnet `../TaskWarriorPlanner/RESTE-A-FAIRE.md` l. 427 note
  « impossible de modifier une tâche depuis le graphe » (25/09) ; `fa32e1d` (bouton Modifier)
  semble l'avoir réglé, carnet non mis à jour : à confirmer. Gantt et chemin critique non faits.
- Récurrences : occurrences en double sur le même `imask` (modèles appeler mamy/maman, message
  ondine/Riri ; probablement plusieurs pairs qui génèrent). Signalé, non traité.
- Graphe niveau 2 (mise à jour sans relayout, autre bibliothèque que Mermaid) : plus tard.
