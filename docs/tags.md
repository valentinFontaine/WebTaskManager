# Tags fonctionnels — référence

Un tag est **fonctionnel** quand le code (WebTaskManager ou TaskWarriorPlanner) ou le
`taskrc` lui donne un sens. Règle (AGENTS.md §6) : ces tags sont **en anglais**, et un
nouveau tag est documenté ici avant d'être lu par le code.

Les autres tags (personnes, services, thèmes : `+serviceAchat`, `+Ludovic`…) sont libres.

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
