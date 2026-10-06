# NOTES — état au 2026-10-06

## Fait (commits locaux, rien poussé)
- Accents sous Windows : `7a8f21a` (octets UTF-8 réinterprétés dans l'ACP avant task.exe),
  `27a6ab9` (journal en UTF-8), `7370491` (tests réels création + modification,
  `TW_REEL=1` sur base jetable, rouges avant correctif, verts après).
- Prod du PC séparée du dev (`6afe8ab`, `6a5956a`, `07e19c3`) : worktree
  `../WebTaskManager-prod` (branche `prod`, venv propre), `Webtaskmanager-prod.ps1` sur :1875,
  verrou `verifier_isolation_prod` (refus de démarrer sur la prod hors de ce dossier),
  `lancer-dev.ps1` sur :8000. Mise à jour de la prod : `git merge master` dans le worktree.
- pytest : 256 verts, 9 ignorés.

## Reste
- Premier lancement réel de `Webtaskmanager-prod.ps1` par l'utilisateur, après le correctif `07e19c3`.
- Correctif accents **non validé sur staging** (téléphone en panne) : obligatoire avant prod
  téléphone (AGENTS.md §4–5). Emoji (😀) : comportement après correctif non noté ici.
- `estTime` sans validation d'entrée (`1h30` rejeté par Taskwarrior).
- `plan.json` désormais écrit dans le worktree de prod : relancer une planification.
- Feuille de route (lots E, H) : `../TaskWarriorPlanner/RESTE-A-FAIRE.md`.
