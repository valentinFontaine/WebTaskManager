# Tags fonctionnels — référence

Un tag est **fonctionnel** quand le code (WebTaskManager ou TaskWarriorPlanner) ou le
`taskrc` lui donne un sens. Règle (AGENTS.md §6) : ces tags sont **en anglais**, et un
nouveau tag est documenté ici avant d'être lu par le code.

Les autres tags (personnes, services, thèmes) sont descriptifs : voir « Tags descriptifs ».

## Planificateur (TaskWarriorPlanner, `planif/modele.py`, enum `Marqueur`)

| Tag | Sens | Effet |
|---|---|---|
| `+external` | la tâche n'est pas réalisée par moi (fournisseur, autre service) | hors contrainte de non-chevauchement ; `estTime` est un **délai calendaire**, pas du travail. Combiner avec un tag libre pour dire qui : `+external +serviceAchat` |
| `+nosplit` | un seul bloc, pas de fractionnement | diagnostic si plus long que le plus grand créneau disponible |
| `+fixed` | début imposé : le `scheduled` courant est un fait | le planificateur ne le déplace pas. Posé par WebTaskManager quand on déplace un bloc dans le calendrier (`POST /api/task/{uuid}/figer`) et par l'import des réunions |
| `+asap` | exception au « au plus tard » | traité par une échéance artificielle proche |
| `+meeting` | réunion importée de l'agenda | importée en `+meeting +fixed` avec `scheduled` (design.md, décision du 23/09/2026) |

Détail du modèle : `TaskWarriorPlanner/openspec/changes/ordonnanceur-par-contraintes/design.md`
(rédigé avant le renommage : il emploie encore `fige`, `externe`, `insecable`).

## Suivi des tiers (aucun code ne les lit encore)

| Tag | Sens |
|---|---|
| `+delegation` | l'action que je dois faire pour lancer un tiers : mail aux achats pour passer commande, expliquer les plans de détail à X… |
| `+monitoring` | surveiller ce qu'un tiers doit rendre : « l'inverse » de `+delegation` |

Stratégie de planification `+delegation` → `+monitoring` : à concevoir (NOTES.md, « Plus tard »).

## Urgence (`taskrc`)

| Tag | Réglage |
|---|---|
| `+committed` | `urgency.user.tag.committed=2` — engagement pris auprès de quelqu'un |
| `+quick` | `urgency.user.tag.quick=2` — tâche rapide, à expédier |

## Contextes `pro` / `perso`

Ce ne sont pas des tags fonctionnels au sens du code : ce sont des **contextes** Taskwarrior,
définis dans le `taskrc` (`context.pro.read=+pro`, `context.perso.read=+perso`…). Leurs noms
restent en français (compréhensibles dans les deux langues, et les renommer touche le `taskrc`
des trois pairs). WebTaskManager lit la liste des contextes dans le `taskrc` et ne les nomme pas.
TaskWarriorPlanner les nomme en dur (`planif/config.py` : `CONTEXTES_RETENUS`, `BLOC_MIN_DEFAUT`,
marge ; `planif/tampon.py` : repli sur `pro`).

## Tags descriptifs (liste de saisie)

Aucun code ne les lit. Ils sont listés ici pour qu'on les propose à la saisie : un tag de
cette page est **validé**. On peut toujours en taper un autre, il ne sera simplement pas
proposé. Règles de nommage : minuscules, camelCase pour les services (`serviceBE`), noms
propres en minuscules (`kevin`). Les tags créés depuis le 2026-10-06 sont en anglais ; les
noms français déjà en usage (`devis`, `commande`…) restent tels quels.

Liste arrêtée le 2026-10-06 (inventaire de la prod : `docs/inventaire-tags.md`, non suivi).

### Nature de l'action

| Tag | Sens |
|---|---|
| `+phone` | appel ou message téléphonique |
| `+mail` | à faire par mail (y compris un sondage) |
| `+cao` | conception, modèle 3D, plan (pas de distinction plan / modèle) |
| `+coding` | programmation, outils informatiques, ordinateur |
| `+documentation` | instruction de travail, manuel, IOM, compte rendu, notes |
| `+sourcing` | consultation de fournisseurs, chiffrage de pièces |
| `+devis` | établir un devis ou une offre commerciale |
| `+learning` | formation, cours |
| `+support` | aider un collègue |
| `+administratif` | démarche administrative |
| `+imprevu` | tâche arrivée sans avoir été prévue |
| `+next` | natif Taskwarrior : `urgency.user.tag.next.coefficient` vaut 15 par défaut |

### Contexte pro (sur quoi je travaille, souvent sans action de ma part)

| Tag | Sens |
|---|---|
| `+affaire` | travail lié à une affaire |
| `+commande` | travail lié à une commande client |
| `+sav` | dossier de service après-vente |
| `+jde` | fait dans l'ERP JDE |

### Qui fait l'action (avec `+delegation`, `+monitoring` ou `+external`)

| Tag | Sens |
|---|---|
| `+fournisseur` | un fournisseur (avec `+external` : c'est lui qui agit) |
| `+serviceAchat`, `+serviceBE`, `+serviceMethode`, `+equipeCPQ` | un service de l'entreprise |
| `+kevin`, `+russel`, `+christina` | une personne. L'UDA `assignee` n'est pas utilisée. |

### Perso

| Tag | Sens |
|---|---|
| `+habit` | routine récurrente (mobilité, repas…) |
| `+shopping` | à acheter |
| `+biocoop` | à acheter dans ce magasin ; d'autres magasins pourront suivre le même modèle |
| `+home` | maison, bricolage |
| `+couture` | couture |
| `+finance` | impôts, argent, placements |
| `+health` | santé |
| `+holiday` | vacances, voyage, camping |
| `+asso` | vie associative (CA, animation) |
| `+tracage` | traçage de parcours pour des compétitions (ce n'est pas du sport) |
| `+transit` | changement de lieu. Plus tard, l'optimiseur pourra regrouper les actions par lieu et gérer les trajets : **pas à coder maintenant** |

### Sport

`+sport` est général et toujours couplé à une discipline : `+trail +running +sport`.

| Tag | Sens |
|---|---|
| `+sport` | toute séance |
| `+running` | course à pied ; `+road`, `+trail` pour le terrain |
| `+orienteering` | course d'orientation (le tag ; les projets `CO.*` restent) |
| `+strength` | renforcement, musculation |
| `+swimming` | natation |
| `+cycling` | vélo ; `+gravel`, `+mtb`, `+commute` (vélo en ville) |
| `+race` | compétition |
| `+intense` | séance intense. Futures règles de planification (pas deux fractionnés consécutifs, sortie longue à au moins deux jours d'un fractionné) : **pas à coder maintenant** |

## Historique des noms (renommage du 2026-10-06)

| Ancien | Nouveau |
|---|---|
| `fige` | `fixed` |
| `externe` | `external` |
| `insecable` | `nosplit` |
| `rapide` | `quick` |
| `commit` | fusionné dans `committed` |

Les identifiants internes français (clés `externe` / `fige` du plan JSON, régime `externe`,
classes CSS, route `/figer`) sont restés tels quels : ce ne sont pas des tags.
