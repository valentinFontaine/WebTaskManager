# Affichage du plan calculé par l'ordonnanceur

## Le gros du travail est ailleurs

L'ordonnanceur de projet par contraintes vit dans un **dépôt séparé** :
[TaskWarriorPlanner](https://github.com/valentinFontaine/TaskWarriorPlanner), cloné en local
dans `../TaskWarriorPlanner`. Son cahier des charges complet — problème, décisions, modèle
formel, lots 0 à 8 — est là-bas, dans `openspec/changes/ordonnanceur-par-contraintes/`.

**Pourquoi séparé, et pas ici :**

- `ortools` est un **binaire natif** sans roue Termux. L'ajouter à `requirements.txt` ferait
  échouer `seed-staging.sh:185` sur le téléphone, donc `deploy.sh`, donc tout le pipeline de
  déploiement. Ce n'est pas une préférence, c'est une contrainte.
- Le couplage est nul par conception : l'interface web consomme un **plan JSON** et ne connaît
  ni le solveur, ni le modèle de contraintes, ni la configuration des grilles.
- Le dépôt standalone est public et listé sur taskwarrior.org avec un script non fonctionnel :
  lui donner un contenu qui marche transforme une gêne en atout.

## Ce qui reste ici

Un seul lot : **le calendrier consomme le plan JSON**, et distingue visuellement les deux
régimes du plan.

- **contraint** — le travail daté, placé contre son mur, tampon compris. C'est un engagement.
- **opportuniste** — le travail non daté qui remplit l'espace restant par urgence. C'est une
  suggestion.

La distinction doit être nette. Sans elle, l'utilisateur ne saura plus ce qu'il doit faire et
ce qu'il peut faire — et un plan « au plus tard » affiche par construction une semaine
prochaine clairsemée, ce qui paraîtra cassé si rien ne l'explique visuellement.

## Non-goals

- Calculer quoi que ce soit. L'interface lit un fichier, elle n'ordonnance pas.
- Faire tourner `ortools` sur le téléphone, ni l'ajouter aux dépendances de ce dépôt.
- Le placement horaire interactif (glisser-déposer) : il viendra une fois le plan affiché.

## Risque

Si le fichier de plan manque, est périmé ou malformé, l'affichage doit **se dégrader sans
casser** : pas de bandeau d'erreur, pas de page vide, juste un calendrier sans plan. Le
solveur tourne sur le PC ; le téléphone n'aura pas toujours un plan frais.
