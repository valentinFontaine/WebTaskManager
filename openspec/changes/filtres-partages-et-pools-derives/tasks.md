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

- [x] Test : saisir un projet dans la barre nav reduit la liste de l'accueil **et** met
      le compteur a jour sous la forme `filtre/total`
- [x] Test : le champ tags filtre en conjonction (`perso, sport` → les deux)
- [x] Test : avec 6 contextes simules, la barre rend un `<select>` ; avec 3, des boutons
- [x] Test : un filtre projet restaure depuis `localStorage` au chargement est annonce
      par la barre de resume, et « tout effacer » le retire
- [x] Test : la section « Advanced Filters » a disparu, les deux vues sont restees
- [x] Test : le kanban applique le filtre projet **sans** relancer `/api/tasks`
- [x] Champs `project` et `tags` restaures dans `nav.js`, avec anti-rebond
- [x] Contextes : boutons jusqu'a 5, `<select>` au-dela
- [x] Barre de resume des filtres + bouton « tout effacer »
- [x] `main.js` consomme `tw-filter-change` ; `clientOnly` → re-rendu, sinon rechargement
- [x] `index.html` : section supprimee, les deux vues conservees dans une barre fine
- [x] `kanban.html` : meme contrat client (sinon il rechargeait a chaque frappe **en
      ignorant** le filtre — regression introduite par le drapeau `clientOnly`)
- [x] Commit

### Deux choses apprises en chemin

- **`test.describe.configure({ mode: 'serial' })` etait declare au niveau du fichier.**
  En mode serial, le premier echec fait *sauter* tous les tests suivants : quatre des
  cinq tests de ce lot n'apparaissaient ni en vert ni en rouge. Les tests independants
  vivent desormais dans un describe `Pages et filtres` explicitement parallele.
- **Le filtre client etait mis en cache sur evenement.** L'etat de nav est restaure du
  `localStorage` *avant* le premier `tw-filter-change`, si bien qu'un filtre pose la
  veille etait ignore au chargement : la liste s'affichait entiere pendant que le resume
  annoncait un filtre. Il est desormais relu a chaque rendu.

## Lot 2 — le calendrier consomme les filtres partages

- [x] Test : filtrer par tag depuis la barre nav reduit la colonne « Taches a planifier »,
      **sans** relancer `/api/tasks` ; changer de contexte, lui, recharge
- [x] Test : le `<select id="filter-pool">` a disparu de la page
- [x] `calendar-planner.js` ecoute `tw-filter-change` et respecte `clientOnly`
- [x] `loadTasks()` passe enfin `stateToParams()` : la page appelait `/api/tasks` **sans
      aucun parametre**, donc ignorait contexte et statut depuis toujours
- [x] `currentFilter.pool` et son menu supprimes
- [x] Commit

### Defaut trouve par le test

Le minuteur anti-rebond de `nav.js` etait **unique et partage** par les deux champs :
ecrire dans « tags » juste apres « projet » annulait la saisie du premier, qui
n'atteignait jamais l'etat. Un minuteur par champ desormais.

## Lot 3 — deux sources, et les blocs hors filtre

- [x] Test : en contexte `pro`, un bloc planifie absent de la reponse `/api/tasks` est
      **present** dans le calendrier, hachure, et son titre n'est pas rendu
- [x] Test : la bascule est cochee par defaut, et la decocher fait disparaitre ces blocs
- [x] Test : un bloc **dans** le filtre garde son titre — garde-fou contre un masquage
      trop large (vert avant comme apres, il ne prouve pas la correction mais empeche
      la sur-correction)
- [x] `uuidsEnContexte` : les UUID retenus par le backend pour le filtre courant. Le
      contexte est une expression TaskWarrior, seul le serveur sait y repondre — on se
      souvient donc de sa reponse au lieu de la reinterpreter en JavaScript. Aucune
      requete supplementaire : la reponse contenait deja les taches planifiees.
- [x] Calendrier `hors-filtre` dedie, titre vide, `raw` reduit a l'UUID, `isReadOnly`
- [x] Hachures en CSS plutot que transparence : la transparence est deja le langage des
      cartes selectionnees, les deux se seraient confondues
- [x] Bascule « Blocs hors filtre », persistee, a cote de « Pretes seulement »
- [x] Commit

### Defaut corrige au passage

`template.time` injectait `event.title` dans `innerHTML` **sans echappement** : une
description contenant du balisage etait interpretee. Echappe desormais — et c'est aussi
ce qui garantit qu'un titre hors filtre ne fuite pas dans le DOM.

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
