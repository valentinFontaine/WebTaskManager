---
name: gestion-taskwarrior
description: Lire, auditer et corriger une base Taskwarrior de gestion de projet, lancer le planificateur (TaskWarriorPlanner) et dire si une date est tenable. A utiliser des qu'il faut consulter ou modifier les taches, les dependances, les jalons ou le planning d'un projet. Seul point d'acces a Taskwarrior pour les autres agents.
---

# Gestion Taskwarrior et planification

Version installee dans `~/.claude/skills/gestion-taskwarrior/SKILL.md` ; source : `docs/skill-gestion-taskwarrior.md`
du depot WebTaskManager (modifier la source, puis recopier). `copie`, `audit`, `appliquer` (dont l'operation `split`), `planifier` et
`faisabilite` (section 3) existent. Il n'y a pas de commande `done` : l'utilisateur termine
les taches et ferme les jalons lui-meme. Ne pas l'inventer, le dire.

## 1. Regles absolues

- Jamais de commande `task` sur la base de prod. On travaille sur une **copie
  temporaire** (`TASKDATA` pose explicitement, verifie par
  `task rc:<taskrc> _get rc.data.location`). Un `TASKDATA` herite l'emporte sur le taskrc.
- Toute ecriture vient d'un **lot** que l'utilisateur a valide, apres une sauvegarde
  `task export`. Pas de lot valide, pas d'ecriture. Chemin normal : le serveur MCP
  (section 3a) ; `wtm.py appliquer` reste un recours.
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

## 3. Outils

### 3a. Serveur MCP `taskwarrior` : le chemin normal pour lire et ecrire

Cinq fonctions (`tools/mcp_taskwarrior.py`, spec `openspec/changes/serveur-mcp-taskwarrior/`).
La base visee est fixee par le serveur (`WTM_MCP_TASKRC`) : l'agent ne pose ni `TASKRC` ni
copie, et ne lance aucune commande `task`.

| Fonction | Effet |
|---|---|
| `lire(projet, statut, filtre, limite)` | lecture seule ; une ligne par tache (uuid court, projet, description, tags, estTime, due, scheduled, depends). `filtre` : filtre Taskwarrior, sans mot de commande |
| `proposer_lot(titre, operations)` | valide, essaie sur une copie jetable, fige le lot (`L-xxxx`) ; rend un resume a **recopier tel quel** a l'utilisateur. Un bloquant : pas d'id, rien de fige |
| `appliquer_lot(id)` | confirmation de l'utilisateur demandee par Claude Code. Refuse si la base a change, si le lot a plus de 24 h ou est deja applique ; sauvegarde, applique, verifie, journalise |
| `annuler_lot(id)` | confirmation demandee. Defait uniquement ce que le lot a touche ; refuse en bloc si une de ces taches a ete retouchee depuis |
| `lister_lots(n)` | derniers lots et leur etat |

Operations : `creer` (`description`, `project`, `tags`, `estTime`, `due`, `scheduled`, `wait`,
`depends` = uuid existants ou `$n` pour la n-ieme tache creee du lot, `priority`,
`annotations`) ; `modifier` (`uuid` + champs a remplacer, `tags_ajout`/`tags_retrait`,
`depends_ajout`/`depends_retrait`) ; `decouper` (memes champs que `split` ci-dessous) ;
`annoter` (`uuid`, `texte`). uuid complet ou court (8). Accents surs partout (ecriture par
`task import`). `estTime` : `30min`, `1.5h`, `1h30`, `PT1H30M`. Dates : `AAAA-MM-JJ`,
`JJ/MM/AAAA`. Toute tache doit garder `+pro` ou `+perso`.

Interdits (refuses par le serveur) : `done`, `delete`, `status`, `purge`, `undo`, `sync`,
config. Avertissements (le lot est fige, l'utilisateur decide) : tag hors de `docs/tags.md`,
projet nouveau, doublon probable, echeance passee, `scheduled` apres `due`, estTime absent.

Deroule : `lire` → `proposer_lot` → montrer le resume → l'utilisateur dit « applique » →
`appliquer_lot`. Ne jamais appeler `appliquer_lot` sans ce oui dans la conversation.

### 3b. wtm.py : audit et planification (lecture seule, sur copie)

Script : `C:/Users/irpaui/Documents/Projets/perso/WebTaskManager-prod/tools/wtm.py`
(version validee ; `python <script> <commande>`).

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

**Decouper une tache (`split`)** : operation de lot, donc validee par l'utilisateur comme
le reste. `{"op":"split","uuid":U,"sous_taches":[{"description":"...","estTime":"2h",
"apparier_a":null}, ...],"sous_projet":null}`. Au moins deux sous-taches. La tache U devient
le jalon (`+milestone`, `estTime` 30min, depend de ses sous-taches) ; les sous-taches
reprennent ses depends, projet, tags (sauf `fixed`) et `due` ; ses successeurs dependent
toujours du jalon. Memes regles que la route de l'application (`decoupage.py`) ; tout refus
(tache inconnue ou deja jalon, une seule sous-tache...) est detecte avant la premiere
ecriture du lot. Les accents sont sans danger (sous-taches importees en UTF-8).
`estTime` accepte `1h30` (normalise en `1h+30min`).

**Pas de `done`** : l'utilisateur ferme les taches et les jalons lui-meme, c'est sa
verification. Un jalon dont toutes les sous-taches sont terminees reste ouvert : le signaler
dans l'audit, ne pas le fermer. (La cloture automatique existe dans l'application, desactivee
par `WTM_FERMER_JALONS`, voir NOTES.md.)

## 4. Vocabulaire du projet

Sens detaille : `C:/Users/irpaui/Documents/Projets/perso/WebTaskManager-prod/docs/tags.md`
(version validee, celle avec laquelle la base a ete creee ; lecture seule, ne jamais la
modifier ; l'acces est autorise par les reglages du projet).

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
