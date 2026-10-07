# NOTES — état au 2026-10-07

## Fait (commits locaux, rien poussé)
- Accents sous Windows : `7a8f21a` (octets UTF-8 réinterprétés dans l'ACP avant task.exe),
  `27a6ab9` (journal en UTF-8), `7370491` (tests réels création + modification,
  `TW_REEL=1` sur base jetable, rouges avant correctif, verts après).
- Prod du PC séparée du dev (`6afe8ab`, `6a5956a`, `07e19c3`) : worktree
  `../WebTaskManager-prod` (branche `prod`, venv propre), `Webtaskmanager-prod.ps1` sur :1875,
  verrou `verifier_isolation_prod` (refus de démarrer sur la prod hors de ce dossier),
  `lancer-dev.ps1` sur :8000. Mise à jour de la prod : `git merge master` dans le worktree.
- pytest : 313 verts, 13 ignorés (2026-10-07). Playwright `tests/import.spec.js` : 19/19,
  graphe (6 fichiers `tests/graphe*.spec.js`) : 77/77.

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
  - **Prod migrée le 2026-10-06** (`tools/migrer-tags-descriptifs.py`, lancé par l'utilisateur) :
    1096 tâches modifiées, 2463 inchangé, 51 tags distincts, tous dans `docs/tags.md`, aucun
    ancien restant. `offre` -> devis pour les 3. Sauvegarde :
    `C:/Users/irpaui/taskwarrior-prod-backup-20261006-tags-descriptifs`. La vérification a
    signalé 4 `mask` modifiés (modèles récurrents appeler mamy/maman, message ondine/Riri) :
    ces modèles ont des **occurrences en double sur le même `imask`** (40 enfants pour 30
    positions), Taskwarrior réécrit `mask[imask]` avec le statut de l'occurrence modifiée.
    Sans effet sur la génération. Doublons préexistants (probablement plusieurs pairs qui
    génèrent les récurrences) : signalé, non traité.
  - **Liste de tags à la saisie faite** (`53cfb70`) : `GET /api/tags` lit `docs/tags.md`, puces +
    suggestions dans l'éditeur, tag inconnu permis mais signalé. Prod : `git merge master` à faire.
  - (ancien) Reste : passer en revue les ~90 autres tags de `docs/inventaire-tags.md` (JDE fait ;
    programmation, support, telephone, habit, pointage…), puis documenter dans `docs/tags.md`,
    migrer la prod (sauvegarde, essai sur copie, `tags:` complet via Python, pas PowerShell),
    et enfin la liste de tags à la saisie dans l'éditeur.
- Piège d'instrument : lire l'export Taskwarrior en Python avec `PYTHONUTF8=1`, sinon les
  accents s'affichent en `Ã©` (cp1252) alors que la base est saine.

## Fait le 2026-10-07 : import CSV
- `docs/tags.md` (`09c5e1b`) : `serviceUsinage`, `serviceProjet`, `serviceProd` ajoutés ;
  `+meeting` peut être saisi à la main (sans `scheduled` : à planifier plus tard), pas
  seulement importé de l'agenda. `longfier` est une personne, volontairement hors liste.
- Fichier de l'utilisateur `Desktop/2026-10-05-modele-import.csv` : tags alignés sur la liste,
  converti en UTF-8 avec BOM, semaines -> jours (7 j). Analyse : 73 tâches, 0 erreur.
  L'utilisateur l'importe lui-même (premier essai refusé en bloc, rien n'avait été écrit).
- Durées Taskwarrior dans l'importeur (`25073b4`) : semaines, quinzaines, mois (30 j),
  trimestres (91 j), années (365 j), `P2W`, et équivalents français. Mesuré avec `task calc`
  sur le fork 3.5.0.6. **`m` seul = mois** (comme Taskwarrior) : `30m` donne 30 jours.
- Import partiel (`a30fe9c`) : ligne en erreur écartée, et en cascade toute ligne qui en
  dépend ; erreur d'en-tête -> rien d'importable. Aperçu : `importables`, `ecartees` ;
  `POST /api/import {csv, partiel: true}`. Bouton « Ajouter les N lignes valides » et
  Annuler, sous l'aperçu. Corrige aussi l'aperçu qui numérotait les tâches par rang
  (une ligne ## Fait le 2026-10-07 (suite) : affichage de l'import, suppression depuis le graphe
- Bug d'affichage de l'import corrigé (`10f75f3`) : au-delà d'une quarantaine de lignes, les
  boutons Importer/Annuler tombaient au milieu du tableau et l'ascenseur s'arrêtait avant la fin.
  Cause : `#import-page` et `.import-corps` en flex avec `min-height: 0`, tassés à la hauteur de
  la fenêtre ; désormais `flex: 1 0 auto`. Test géométrique (80 lignes), rouge avant, vert après.
- Bouton « Supprimer la tâche » dans le graphe (`1f345ce`) : visible pour une seule sélection,
  hors Relier ; grosse confirmation rouge « Êtes-vous sûr ?!? » qui nomme la tâche et ses
  dépendantes ; Annuler a le focus, Échap / fond annulent. `DELETE /api/task/<uuid>/delete`
  renvoie 200 même en échec : seul `success` fait foi. Contrat : `tests/graphe-supprimer.spec.js`
  (5 tests). Suppression par uuid vérifiée sur taskwarrior-dev.
  Volontairement pas fait : suppression multiple, touche Suppr (déjà prise par « retirer le lien »).

## Fait le 2026-10-07 (fin) : graphe, sélection des projets par bulles (`23716ac`)
- Champ « Projets » à bulles (recherche floue, sous-séquence) au-dessus de la barre d'outils :
  c'est LE moyen de choisir le graphe. Plusieurs projets à la fois -> on relie CPQ et JDE sans
  afficher NPD.MRE. `/api/graphe` accepte `projet` répété (union, champ `projets` en réponse).
- À partir de deux racines, chaque projet choisi a son cadre (nom complet) ; une seule : règle
  du 23/09 (pas de cadre). Un projet descendant d'un autre choisi est absorbé.
- Filtre projet de la nav : ne choisit plus rien, masque côté client (préfixe à frontière de
  point), sans appel serveur. Sans bulle : rien. Sélection en localStorage (`graphe-projets`).
- Contrat : `tests/graphe-projets.spec.js` (12 tests, rouges avant). Les `choisirProjet` des 5
  autres specs passent par le champ et mockent `/api/projects`. Marges de `.graphe-toolbar`
  réduites (sinon défilement vertical).
- Point ouvert : le bouton + de la nav préremplit le projet depuis le filtre nav, plus depuis la
  bulle. À trancher (préremplir avec la bulle quand il n'y en a qu'une ?).

## Prochaine session : graphe, niveau 1 (prompt prêt : `PROMPT-graphe-niveau1.md`)
- Redessiner sans flash et sans perdre zoom/position. Niveau 2 (mise à jour sans relayout,
  autre bibliothèque que Mermaid) = chantier séparé de refonte graphique, plus tard.
- PATH de Node : session dédiée, prompt `PROMPT-node-path.md` (relais `.ps1`/bash seulement
  dans `~/.local/bin` ; `.bin/playwright.cmd` retombe sur `"node"`, introuvable pour cmd.exe).
  Les deux `PROMPT-*.md` ne sont pas suivis par git.

## Autres points en attente
- Défaut connu, non corrigé : après un import réussi, le bouton reste actif (un second clic
  réimporte le même fichier, sans doublon : mise à jour des mêmes tâches).
- Non vérifié sous Firefox : affichage de l'import, fenêtre de suppression du graphe.
- Prod : `git merge master` dans `../WebTaskManager-prod` toujours à faire (liste de tags
  `53cfb70`, durées `25073b4`, import partiel `a30fe9c`, affichage import `10f75f3`,
  suppression graphe `1f345ce`, bulles projets `23716ac`), puis redémarrage :1875. Sur demande
  de l'utilisateur.
- Piège d'instrument : Node n'est pas dans le PATH des shells de l'agent, et `npx` échoue même
  sous PowerShell. Playwright :
  `$env:Path='C:\Users\irpaui\AppData\Local\node-v24.17.0-win-x64;'+$env:Path` puis
  `node node_modules/@playwright/test/cli.js test …`, avec `TASKRC` sur taskwarrior-dev. Les
  suites du graphe dépassent 60 s : en arrière-plan, sans modifier les fichiers servis pendant
  le run (le serveur les sert en direct : run contaminé).

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
