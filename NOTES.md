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

## Prochaine session (décidé le 2026-10-06), dans cet ordre
1. **Emoji (😀)** : mesurer sur la base test s'il passe encore mal après `7a8f21a` ; si oui,
   test rouge puis correctif.
2. **`estTime` : valider l'entrée** (`1h30` rejeté par Taskwarrior, valeur transmise brute par
   `POST /api/task/add` et `PUT /modify`). Formats valides : `90min`, `1.5h`, `PT1H30M`.
   À trancher : rejeter avec message clair, ou convertir `1h30` → `90min`.
3. **Documentation des tags** : vérifier si `+monitoring` et `+externe` sont documentés
   (ils sont lus par `../TaskWarriorPlanner/planif/` et `graphe.js`), sinon les documenter.
   **Nouveau tag** demandé : l'action que JE dois faire pour lancer un externe (mail aux achats
   pour passer commande, expliquer à X ce qu'il doit faire pour les plans de détail…), « l'inverse »
   de `+monitoring`. Nom à faire choisir à l'utilisateur ; documenter, et décider avec lui si le
   planificateur / le graphe doivent le traiter.

## Reste
- Correctif accents **non validé sur staging** : téléphone toujours en panne (2026-10-06).
- `plan.json` dans le worktree de prod : pas encore tout à fait réglé selon l'utilisateur.
- Lot E (boucle planifier / ajuster / valider) : l'utilisateur le teste lui-même, hors session.
- Lot H : graphe jugé satisfaisant. Carnet `../TaskWarriorPlanner/RESTE-A-FAIRE.md` l. 427 note
  « impossible de modifier une tâche depuis le graphe » (25/09) ; `fa32e1d` (bouton Modifier)
  semble l'avoir réglé, carnet non mis à jour : à confirmer. Gantt et chemin critique non faits.
