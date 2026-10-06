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
5. **Tags commençant par un chiffre** : l'API les refuse désormais en add et modify (`933327c`,
   400 avant toute commande ; en modify `+3D` écrasait la description). Affichage du message
   d'erreur dans l'éditeur non vérifié. Renommage prod `3D` -> `CAO` : lecture de la prod
   refusée à l'agent, script validé sur taskwarrior-test et confié à l'utilisateur.
   Piège PowerShell : `tags:pro,3D` y devient `pro,3` (`3D` = littéral décimal) ; utiliser Bash.

6. **Renommage `3D` -> `CAO` appliqué par l'utilisateur**, vérifié : 9 tâches `CAO`, 0 `3D`/`3`,
   total 2462. Sauvegarde `C:/Users/irpaui/taskwarrior-prod-backup-20261006-120401-tag-3D`.

## Prochaine session : liste des tags
- But : liste de tags proposée à la saisie (on tape dedans). Tags documentés = validés ;
  quelques tags gardés sans doc, non validés.
- Inventaire : `docs/inventaire-tags.md` (115 tags, 44 en attente), **non suivi par git**
  (contient des descriptions de tâches réelles). L'utilisateur remplit la colonne Décision.
- Décisions de l'utilisateur (2026-10-06) :
  - `+sport` général, toujours couplé à une discipline : cap (route, trail, CO), renforcement,
    natation, vélo (gravel, vtt, ville). Ex. trail = `+trail +cap +sport`. `+compet` en plus.
    `+intense` (séances intenses) pour de futures règles de planification (pas 2 fractionnés
    consécutifs, sortie longue à ≥ 2 jours d'un fractionné) : **pas à coder maintenant**.
  - course/courses -> shopping ; reunion -> meeting ; devis gardé ; suivi -> monitoring ;
    BE -> ServiceBE ; urgent -> asap ; CAO gardé pour la conception.
  - Sport en anglais (règles destinées à un outil open source général) : running, road, trail,
    orienteering (remplace le tag CO ; le projet CO.* reste), strength (renfo, muscu),
    swimming, cycling (gravel, mtb, ville ?), intense, compet ?.
  - documentation englobe manuel, instruction, iom (pas de sous-tags, jugé trop lourd).
  - design, plan -> CAO (pas de distinction plan / modèle).
  - Minuscules partout (sauf noms propres / sigles : à confirmer pour CAO, JDE, ServiceBE).
  - Achat : commande gardé (travail lié à une commande client) ; fournisseur gardé (lié à
    external : le fournisseur fait l'action) ; achat -> serviceAchat (comme ServiceBE) ;
    expediting -> monitoring ; budget supprimé ; costly = bidouille de priorité (supprimé ?).
  - Tranché ensuite : minuscules partout -> `cao`, `jde`, `serviceBE`, `serviceAchat` ;
    vélo en ville -> `commute` ; compet -> `race` ; training, entrainement -> `sport` ;
    Athle -> `running` ; costly supprimé ; costing -> `sourcing`.
  - **Revue terminée le 2026-10-06** : colonne Décision de `docs/inventaire-tags.md` entièrement
    remplie (115 tags -> 54 retenus, 27 supprimés), liste documentée dans `docs/tags.md`
    (« Tags descriptifs »). À la migration : `trail` reçoit aussi `+running +sport` ; `offre` ->
    `devis` ou `sourcing` tâche par tâche (3 tâches) ; vérifier que les tâches des tags supprimés
    (NPD, SRMix…) ont un projet.
  - (ancien) Reste : passer en revue les ~90 autres tags de `docs/inventaire-tags.md` (JDE fait ;
    programmation, support, telephone, habit, pointage…), puis documenter dans `docs/tags.md`,
    migrer la prod (sauvegarde, essai sur copie, `tags:` complet via Python, pas PowerShell),
    et enfin la liste de tags à la saisie dans l'éditeur.
- Piège d'instrument : lire l'export Taskwarrior en Python avec `PYTHONUTF8=1`, sinon les
  accents s'affichent en `Ã©` (cp1252) alors que la base est saine.

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
