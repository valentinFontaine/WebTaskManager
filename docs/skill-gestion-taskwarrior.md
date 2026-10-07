---
name: gestion-taskwarrior
description: Lire, auditer et corriger une base Taskwarrior de gestion de projet, lancer le planificateur (TaskWarriorPlanner) et dire si une date est tenable. A utiliser des qu'il faut consulter ou modifier les taches, les dependances, les jalons ou le planning d'un projet. Seul point d'acces a Taskwarrior pour les autres agents.
---

# Gestion Taskwarrior et planification

BROUILLON. `copie`, `audit`, `appliquer`, `planifier` et `faisabilite` (section 3) existent ;
`split` et `done` n'existent pas encore : ne pas les inventer, le dire.

## 1. Regles absolues

- Jamais de commande `task` sur la base de prod. On travaille sur une **copie
  temporaire** (`TASKDATA` pose explicitement, verifie par
  `task rc:<taskrc> _get rc.data.location`). Un `TASKDATA` herite l'emporte sur le taskrc.
- Toute ecriture vient d'un **lot** (fichier de corrections) que l'utilisateur a valide,
  apres une sauvegarde `task export`. Pas de lot valide, pas d'ecriture.
- Ne jamais tuer un processus que tu n'as pas lance. Ne jamais utiliser les ports 1875
  (prod) ni 8000 (dev) : prendre un port libre.
- `estTime` : formats valides `90min`, `1.5h`, `PT1H30M`. **`1h30` est rejete.**
- Descriptions entre guillemets doubles (cmd.exe). Accents dans les arguments : corrompus
  par task.exe sous Windows ; passer par `task import` depuis un fichier UTF-8 pour
  creer ou modifier du texte accentue.
- Tags fonctionnels en anglais. Ne pas en inventer : voir section 4.

## 2. Lire l'etat

- Taches en attente : `task status:pending export` (JSON). Planifiees :
  `task scheduled.not: export`. Projets : `task _projects`.
- Ne jamais afficher l'export en entier : agreger (comptes, listes d'uuid, ecarts).

## 3. Outils (a creer, wrapper)

Script : `C:/Users/irpaui/Documents/Projets/perso/WebTaskManager-prod/tools/wtm.py`
(version validee ; `python <script> <commande>`). Teste par `test_wtm.py`.

| Commande | Effet |
|---|---|
| `copie --source <taskrc> --dest <dossier>` | copie jetable via `export` + `import` ; imprime le taskrc de la copie. Refuse une destination non vide ou sous la base de prod |
| `audit --taskrc <copie> --sortie <dossier>` | lecture seule : ecrit `sauvegarde.json`, `rapport.md`, `lot.json` (corrections mecaniques seulement) |
| `appliquer <lot> --taskrc <copie> [--cible-prod]` | verifie sauvegarde, base inchangee depuis l'audit, ASCII ; applique dans l'ordre, s'arrete a la 1re erreur. `--cible-prod` : jamais sans decision explicite de l'utilisateur |

Limites connues : `appliquer` n'est pas atomique (un echec laisse les premieres operations
ecrites ; le message dit combien, la sauvegarde permet de revenir en arriere) ; les
arguments `modify` non ASCII sont refuses (pour un texte accentue, utiliser une operation
`import`) ; un `data.location` relatif dans le taskrc source n'est pas gere.

Le lot est un JSON `{version, id, empreinte, sauvegarde, operations}` ; operations :
`{"op":"modify","uuid":...,"args":[...]}` ou `{"op":"import","taches":[...]}` (ajout de
taches, UTF-8 sur). Les anomalies sans correction mecanique (cycle, estTime absent...)
figurent au rapport : c'est a l'agent de les resoudre et d'ecrire les operations, puis a
l'utilisateur de valider.

| `planifier --taskrc <copie> --sortie <dossier> [--projet P] [--echeance AAAA-MM-JJ]` | calcul du planificateur sur la copie, sans ecriture ; rend verdict, fin, retards, taches non placees classees par raison |
| `faisabilite --taskrc <copie> --sortie <dossier> --projet P --echeance AAAA-MM-JJ` | deux calculs (au plus tot, puis avec l'echeance) ; rend verdict, date au plus tot, marge en jours |

Les echeances de projet ne sont pas des `due` : elles vivent dans `echeances.json` du
planificateur (une entree par projet). `planifier` en fabrique une copie temporaire ; il ne
modifie jamais le fichier d'origine ni la base. Il elargit les horizons (defaut du
planificateur : 90 j, et 21 j pour les taches non datees, qui ecarteraient le reste).
Format de l'echeance : `AAAA-MM-JJ` seulement.

Resultat de `planifier` : `verdict` = `tient` / `ne-tient-pas` / `indetermine`.
`indetermine` des qu'une tache du projet n'est pas placee, sauf `external` : raisons
`sans-esttime`, `sans-contexte`, `ecartee` (capacite), `external` (delai d'un tiers, hors
plan). Un `tient` ne vaut que si `non_places` ne contient que des `external`, dont les delais
restent une hypothese a signaler.

A creer plus tard (pas encore ecrits) : `split` et `done` (via l'API :
`POST /api/task/{uuid}/split`, `POST /api/task/{id}/done`, qui ferme aussi les jalons).

Raison de `wtm-split` et `wtm-done` : `task done` en ligne de commande **ne ferme pas**
les jalons ; seule la route le fait.

## 4. Vocabulaire du projet

Sens detaille : `C:/Users/irpaui/Documents/Projets/perso/WebTaskManager-prod/docs/tags.md`
(version validee, celle avec laquelle la base a ete creee ; lecture seule, ne jamais la
modifier ; dossier a ajouter avec `--add-dir`).

- UDA : `estTime` (duree), `assignee` (non utilise ; on tague la personne).
- Planificateur : `+external` (fait par un tiers ; `estTime` = delai calendaire),
  `+nosplit`, `+fixed` (debut impose, ne bouge pas), `+asap`, `+meeting`.
- Decoupage : `+milestone` (jalon de fin ; depend de ses sous-taches ; `estTime` 30min
  symbolique). Les successeurs dependent du jalon, pas des sous-taches.
- Suivi des tiers : `+delegation` (mon action pour lancer un tiers) puis `+monitoring`
  (surveiller ce qu'il rend). Aucun code ne les lit encore.
- Urgence : `+committed`, `+quick`. Contextes : `pro`, `perso`.
- Tags descriptifs (nature, service, personne) : liste dans `docs/tags.md`. Un tag hors
  liste est possible mais a signaler a l'utilisateur.

## 5. Planificateur : comment lire le resultat

- Le calcul n'ecrit jamais dans Taskwarrior ; seule la validation ecrit. Sur la prod :
  jamais, sans decision explicite de l'utilisateur.
- Les echeances sont des **contraintes souples** : le code de retour est toujours 0, meme
  quand c'est intenable. La faisabilite se lit dans `plan.json` :
  `en_retard` (uuid) et `retard_total`, puis `retard_minutes` par tache.
  `statut` OPTIMAL ou FEASIBLE (FEASIBLE = recherche non terminee, donc prudence).
- **Taches non placees : elles n'apparaissent pas dans `plan.json`.** Comparer les uuid en
  attente aux cles de `taches` et lister les absentes. Un plan sans retard avec des taches
  absentes n'est pas un « oui ».
- Verifications faites par le planificateur avant de resoudre (les lire, ne pas les
  refaire) : echeance deja depassee, cycles, tache insecable trop longue, sans estimation,
  sans contexte.
- **« Puis-je tenir la date D ? »** : (1) calcul sans echeance sur le jalon cible et lecture
  de sa `fin` = date au plus tot ; (2) calcul avec l'echeance D, lecture de `en_retard`.
  Repondre : oui/non, la date au plus tot, la marge, et les taches qui portent le chemin
  critique.
- Toujours accompagner la reponse de ses limites : nombre de taches sans `estTime`,
  taches `+external` dont le delai est une hypothese, reunions et conges non saisis.

## 6. Audit : ce qu'on controle

- Dependances : cycles ; tache sans predecesseur alors qu'elle en a un logiquement ;
  successeur qui depend d'une sous-tache au lieu du jalon.
- Champs : `estTime` absent ou invalide ; contexte absent ; `due` anterieure a une
  dependance ; `scheduled` apres `due`.
- Jalons : `+milestone` sans sous-tache ou sans successeur ; sous-tache terminee et
  jalon reste ouvert.
- Ecarts avec les documents fournis (export de suivi) : tache documentee absente de la base,
  ou l'inverse. Chaque ecart cite sa source.

Format du rapport d'audit : un tableau (anomalie, uuid, correction proposee, source),
puis les totaux. Pas de transcript.

## 7. Ce que tu rends

Un resultat court : constats chiffres, lot propose, chemin des fichiers. Pas d'export
brut. Tu ne modifies ni le code des outils ni la configuration pour faire passer un
controle : tu signales le probleme.
