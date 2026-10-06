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

## Fait le 2026-10-06
1. **Emoji** : mesuré sur taskwarrior-test, 😀 passe (même par argv seul, sans réparation).
   Cas ajoutés aux tests réels (`adfe49c`), aucun correctif.
2. **estTime** : `1h30` et `1h30min` refusés par le fork 3.5.0.6, `1h+30min` accepté (stocké
   `PT1H30M`, idem en modify). Normalisation `NhM` -> `Nh+Mmin` en add et modify (`fccf7a2`).
3. **Tags** renommés (`08e470c` ici, `887f29b` TaskWarriorPlanner) : fige->fixed,
   externe->external, insecable->nosplit, rapide->quick, commit fusionné dans committed.
   Référence : `docs/tags.md`. Taskrc dev + example mis à jour ; base dev migrée (1 tâche
   `+rapide`) ; base test resemée. Migration mesurée sur base test (pending, completed,
   deleted ; double `commit`+`committed` -> un seul `committed`).
   Identifiants internes français (clés `externe`/`fige` du plan, régime, CSS, `/figer`) gardés.
   **Prod migrée le 2026-10-06** (sur autorisation explicite) : 1 fixed, 7 external, 625 quick
   (dont 617 terminées/supprimées), committed 9 ; anciens tags à 0, total 2452 inchangé.
   Taskrc prod : `tag.commit` supprimé, `tag.rapide` -> `tag.quick`. Sauvegarde avant migration :
   `C:/Users/irpaui/taskwarrior-prod-backup-20261006-tags` (data + taskrc, hors Syncthing).
   Pair Arch : son taskrc doit recevoir la même modification des urgences.
   `pro`/`perso` en dur dans TaskWarriorPlanner (`planif/config.py`, `planif/tampon.py`,
   `TWsched_task_to_caldav.py`) : signalé, non corrigé. Rien en dur dans WebTaskManager.
   `TaskWarriorPlanner/tests/test_retard_par_tache.py` (non suivi) : 3 rouges, déjà avant le renommage.
   `openspec/.../design.md` du planificateur emploie encore les anciens noms (historique).

4. **Projets et tags de la prod fusionnés** (2026-10-06, sur validation de l'utilisateur) :
   158 -> 137 projets, 145 -> 115 tags, 445 tâches modifiées (toutes statuts), total 2462
   inchangé, aucun autre champ touché (comparaison d'exports). Répété d'abord sur une copie.
   Casse/frappe (NPD.heliside -> NPD.Heliside, taskwarrior, comitted -> committed…) et
   regroupements : deleg -> delegation, plans -> plan, consult/verif/compet (forme courte),
   Helisem -> NPD.Helisem, CDCO/CDCO77 -> CO.CDCO77, sport -> Sport, toutes les variantes
   balise -> CO.Balise77 (tag balise -> balise77). Sauvegarde juste avant :
   `C:/Users/irpaui/taskwarrior-prod-backup-20261006-avant-fusion`.
   Piège : `+3D` (initiale non alphabétique) n'est pas lu comme un tag, `modify -3d +3D` écrase
   la description ; passer par `tags:liste,complete`.
   Puis `NPD.suivi` + `NPD.suiviProduits` -> `NPD.Suivi` (6 tâches). `NX` et
   `NX_drafting_suite` sont distincts : à garder. `informatique` -> `education.informatique`
   (1 tâche), projet `rapide` retiré (1 tâche). `info` / `info.arch` gardés. Fusion terminée.

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
