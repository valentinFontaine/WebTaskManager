# Tâches

Règle AGENTS.md : **chaque correction commence par un test qui échoue.** Les cases
« test » de chaque lot se cochent avant les cases « implémentation ».

## Lot 0 — l'autocompletion des projets ne voyait que ce qui etait deja affiche

Diagnostic corrige apres ecriture du test. Deux mecanismes concurrents :

- `updateProjectDatalist()` etait nourri par `/api/projects` — la liste faisant autorite
  — mais ecrivait dans `project-options`, identifiant absent de toutes les pages. Sa
  garde `if (!datalist) return;` rendait l'echec muet. Code mort.
- `updateProjectSuggestions()` gagnait, nourri par `this.projects`, un Set reconstruit a
  partir des seules taches **affichees**.

La reponse de `/api/projects` etait donc recuperee a chaque chargement puis jetee, et un
projet dont toutes les taches sont terminees ou filtrees restait introuvable. Le defaut
serait devenu bloquant au lot 1, ou le contexte filtre cote serveur.

- [x] Test Playwright : un projet connu du seul backend apparait dans la datalist
- [x] Verifier que le test rougit sur le code actuel
- [x] `setBackendProjects()` remplace `updateProjectDatalist()` ; `updateProjectsList()`
      prend l'union backend + taches affichees
- [x] Commit

## Lot 1 — `nav.js` devient la source unique des filtres

- [ ] Test : saisir un projet dans la barre nav réduit la liste de l'accueil **et** met
      le compteur à jour sous la forme `filtré/total`
- [ ] Test : avec 6 contextes simulés (`page.route` sur `/api/contexts`), la barre rend
      un `<select>` et non des boutons ; avec 3, des boutons
- [ ] Test : un filtre projet restauré depuis `localStorage` au chargement est annoncé
      par la barre de résumé, et « tout effacer » le retire
- [ ] Restaurer les champs `project` et `tags` dans `nav.js` (les clés existent déjà
      dans `defaultState()`)
- [ ] Contextes : boutons jusqu'à 5, `<select>` au-delà
- [ ] Barre de résumé des filtres + bouton « tout effacer »
- [ ] `main.js` : consommer `tw-filter-change` pour `project`/`tags` au lieu de ses
      propres champs
- [ ] `index.html` : supprimer la section « Advanced Filters », conserver les boutons
      « prévues aujourd'hui » et « en retard non faites » dans une barre fine
- [ ] Commit

## Lot 2 — le calendrier consomme les filtres partagés

- [ ] Test : filtrer par tag depuis la barre nav réduit la colonne « Tâches à planifier »
- [ ] Test `pytest` (intégrité source) : plus aucune occurrence de `filter-pool`
- [ ] `calendar-planner.js` : écouter `tw-filter-change`, appliquer contexte (serveur)
      puis projet et tags (client)
- [ ] Retirer le `<select id="filter-pool">` de `calendar-planner.html` et le
      `currentFilter.pool` associé
- [ ] Commit

## Lot 3 — deux sources, et les blocs hors filtre

- [ ] Test : en contexte `pro`, un bloc planifié `+perso` est **présent** dans le
      calendrier, porte la classe hachurée, et son titre n'est pas lisible
- [ ] Test : décocher « Afficher les blocs hors filtre » le fait disparaître ; l'état par
      défaut au premier chargement est **coché**
- [ ] Charger les blocs occupés sans filtre, indépendamment de la liste à planifier
- [ ] Marquer chaque bloc dans/hors filtre ; hachures + titre masqué pour les seconds
- [ ] Bascule « Afficher les blocs hors filtre », à côté de « Prêtes seulement »,
      persistée dans `localStorage`
- [ ] Commit

## Lot 4 — dérivation du pool (préparé, **non branché**)

- [ ] Test `pytest` : une tâche candidate à **zéro** pool est signalée non-planifiable
- [ ] Test `pytest` : une tâche candidate à **plusieurs** pools les renvoie tous
- [ ] Test `pytest` : une tâche portant `pool:asso` explicitement force ce pool, quelle
      que soit la dérivation
- [ ] Table de configuration des pools : nom → (grille hebdomadaire, nom de contexte)
- [ ] Fonction d'éligibilité tâche → liste de pools candidats
- [ ] Grille `perso` : lun-ven 18:30-22:00, sam-dim 09:00-22:00
- [ ] Supprimer le pool `sleep`
- [ ] **Ne pas** modifier `twplanner.py` : l'ancien chemin reste intact
- [ ] Commit

## À trancher au retour de l'utilisateur

- [ ] La grille horaire réelle de `perso` (les valeurs ci-dessus sont un point de départ)
- [ ] `pool:` doit-il rester une surcharge manuelle ou disparaître complètement ?
- [ ] Brancher la dérivation sur `twplanner.py` et migrer la base de dev
