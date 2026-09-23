# Reste à faire

**Le carnet est unique et il vit dans l'autre dépôt :**
[`../TaskWarriorPlanner/RESTE-A-FAIRE.md`](../TaskWarriorPlanner/RESTE-A-FAIRE.md)

Ce fichier n'est qu'un panneau indicateur. Il existe parce que le carnet a déjà
été cherché ici une fois sans être trouvé — le travail se répartit sur deux
dépôts, la liste des choses à faire ne doit pas se répartir de même, sinon elle
se perd par moitiés.

## Ce qui concerne ce dépôt-ci

Le **lot E — la boucle d'usage** est presque entièrement ici :

| | |
|---|---|
| **E1** | un endpoint qui lance le planificateur et régénère `plan.json`, plus un bouton. Aucune écriture dans la base : c'est le dry-run. |
| **E2** | distinguer à l'écran le **proposé** (`plan.json`) du **réel** (`task scheduled.not: export`). Les deux s'affichent déjà, sans qu'on sache lequel on regarde. |
| **E3** | ajuster : déplacer un bloc et que ça tienne (`+fige` + `scheduled`, ou un `due` humain). |
| **E4** | valider : déclencher l'écriture réelle et rendre le compte rendu `modifiées / inchangées / ignorées`. |

Et le **lot H — la représentation des dépendances** (graphe, puis Gantt) se
dessinera ici aussi.

Deux points d'ancrage déjà en place, à ne pas redécouvrir :

- `calendar-planner.js` lit déjà `/plan.json` (lot 9, commit `07fa503`) ;
- `main_fastapi.py:265` `/api/tasks/planned` lit `task scheduled.not: export`,
  donc **le réel**, pas le plan.
