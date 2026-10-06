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
2. **`estTime` : corriger** (`1h30` rejeté par Taskwarrior, valeur transmise brute par
   `POST /api/task/add` et `PUT /modify`). Formats valides connus : `90min`, `1.5h`, `PT1H30M`.
   Choix de l'utilisateur : normaliser `1h30` en **`1h+30min`** plutôt qu'en minutes.
   **AVANT d'implémenter : mesurer sur la base test que Taskwarrior (fork 3.5.0.6) accepte
   `estTime:1h+30min`**, et ce qu'il stocke / réexporte. S'il le refuse, revenir vers l'utilisateur.
3. **Tags** (règle ajoutée à AGENTS.md §6 : tags fonctionnels en anglais) :
   - documenter tous les tags fonctionnels (inventaire fait le 2026-10-06, voir plus bas) ;
   - nouveau tag **`+delegation`** : l'action que je dois faire pour lancer un externe (mail aux
     achats pour passer commande, expliquer à X les plans de détail…), « l'inverse » de `+monitoring` ;
   - renommer les tags français en anglais (ex. `+fige`) : noms à valider par l'utilisateur,
     puis migration de la base (à mesurer sur base test d'abord) et des deux dépôts.

## Inventaire des tags fonctionnels (2026-10-06)
Doc existante = `TaskWarriorPlanner/openspec/changes/ordonnanceur-par-contraintes/design.md`
(fige, externe, insecable) et AGENTS.md §5 (coefficients d'urgence). Pas de page de référence.

| actuel | lu par | doc | proposition anglaise |
|---|---|---|---|
| `fige` | planif/modele.py:26, main_fastapi.py:631 et :1133 (écrit), calendar-planner.js, graphe.js | design.md | `+pinned` (alt. `+locked`, `+fixed`) |
| `externe` | planif/modele.py:24, solveur.py, main_fastapi.py:630, calendar-planner.js, graphe.js | design.md | `+external` (design.md:54 le suggérait déjà) |
| `insecable` | planif/modele.py:25 | design.md (implicite) | `+atomic` (alt. `+nosplit`) |
| `asap` | planif/modele.py:27 | rapport de nuit seulement | inchangé |
| `rapide` | taskrc (urgence +2) | AGENTS.md §5 | `+quick` |
| `committed` / `commit` | taskrc (urgence +2) | AGENTS.md §5 | garder `+committed`, fusionner `+commit` ? |
| `pro` / `perso` | contextes du taskrc | metadata-taches-reference.md | `+work` / `+personal` ? (coûteux : taskrc des 3 pairs) |
| `meeting` | aucun code (prévu C1) | design.md:143 | inchangé |
| `monitoring` | **aucun code, aucune doc** | — | inchangé |
| `delegation` | nouveau | — | inchangé |

**Noms validés par l'utilisateur le 2026-10-06** (remplacent la colonne « proposition ») :
`fige` → **`+fixed`** (pas `pinned` : un meeting placé ou un choix utilisateur ne se touche pas),
`externe` → **`+external`**, `insecable` → **`+nosplit`**, `rapide` → **`+quick`**,
`commit` fusionné dans **`+committed`**. Inchangés : `asap`, `meeting`, `monitoring`, `delegation`.
**`pro` / `perso` gardés** : ce sont des contextes, compréhensibles en français et en anglais ;
ils ne doivent pas être en dur dans le code (à vérifier : l'inventaire signalait un filtre dans
main_fastapi.py — si c'est le cas, le signaler à l'utilisateur, ne pas corriger d'office).

Renommage = code des 2 dépôts + taskrc (dev, test, example, prod) + tâches de la prod
(`task +fige modify -fige +fixed`, à exécuter par l'utilisateur), mesuré d'abord sur base test.
Syncthing : pas un obstacle selon l'utilisateur (téléphone en panne).

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
