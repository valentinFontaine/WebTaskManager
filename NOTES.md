# NOTES — état au 2026-10-07

Historique des sessions précédentes : `docs/archive/notes-2026-10-07.md`.

## État
- Commits locaux uniquement, rien poussé. Prod du PC (`../WebTaskManager-prod`, :1875) à jour
  jusqu'à `4793af0`, redémarrée, graphe multi-projets et redessin sans flash validés par
  l'utilisateur.
- pytest : 313 verts, 13 ignorés. Playwright `tests/graphe*` : 81/81, `tests/import.spec.js` : 19/19.

## Prochaine session : split des tâches (conception, pas d'implémentation)
- Nouveau chantier : découper une tâche en plusieurs. L'utilisateur voit d'abord avec son
  agent comment le prendre en compte ; on établira **comment Taskwarrior peut le représenter**
  (projet, dépendances, UDA, annotations…), l'implémentation viendra plus tard.
- Point de départ : rien d'écrit encore. Mesurer sur `taskwarrior-dev` seulement (AGENTS.md §3).

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
