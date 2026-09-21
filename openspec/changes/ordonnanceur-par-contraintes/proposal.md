# Ordonnanceur de projet par contraintes

## Le problème

L'application sait afficher des tâches planifiées. **Rien ne les planifie.** L'îlot
`twplanner.py` / `TWCalendar.py` / `TWTask.py` a été supprimé le 2026-09-21 : il n'était
atteignable depuis aucune route, et il réimplémentait mal un ordonnanceur généraliste.

Mais le besoin réel n'est pas « remplis ma journée ». Il est :

> **Quand dois-je agir au plus tard, et qu'est-ce qui casse si je ne le fais pas ?**

Trois questions concrètes, qu'aucun outil du projet ne sait traiter :

1. Quel est l'ETA d'un projet, sachant qu'il contient des tâches que je ne réalise pas
   moi-même (fabrication chez un fournisseur, étude par le bureau d'études, impression 3D) ?
2. Dois-je passer cette commande aujourd'hui, ou la semaine prochaine suffit-elle ?
3. Quelle est la vraie date limite d'une tâche, sachant que le projet doit finir le X ?

## Ce qu'on a éprouvé, et pourquoi on ne le retient pas

**taskcheck** (github.com/00sapo/taskcheck) a été évalué sérieusement le 2026-09-21 :
installé, configuré, exercé sur un jeu de cas limites **et sur une copie des 277 tâches
réelles de la production**. Il fait bien ce qu'il annonce — placement par urgence,
dépendances, fractionnement, détection de dérive, annulation — et six défauts y ont été
trouvés, tous reproductibles (voir `openspec/changes/ordonnanceur-par-contraintes/design.md`,
annexe « Constats taskcheck »).

Il n'est **pas retenu**, pour trois raisons structurelles, pas pour ses défauts :

- **Il planifie en heures par jour, jamais à l'heure.** `scheduled:` reçoit une date, et la
  note `scheduling` un volume horaire quotidien. La question « vendredi 12h ou jeudi 18h30 »
  n'est pas exprimable.
- **Il n'a aucune passe arrière.** Il répond « quand est-ce que ça sera fait », jamais
  « avant quand dois-je m'y mettre ». Les questions 2 et 3 lui sont inaccessibles.
- **Il ne sait pas représenter une tâche qui prend du temps sans prendre de capacité.**
  Toutes les contorsions trouvées (tâche sentinelle, `wait:` à date calculée, seuil des
  trois minutes, budget journalier en `max` au lieu de somme) ne sont que des détours
  autour de ce manque.

Les six défauts restent vrais et méritent d'être remontés en amont. **C'est décidé
séparément et différé** : voir `tasks.md`, lot Z.

## L'approche retenue

**Programmation par contraintes**, avec OR-Tools CP-SAT.

L'ordonnancement de projet sous contrainte de ressources en est l'application canonique.
Tout ce qui était contorsion devient formulation directe :

| Contournement imposé par un modèle en capacité | Formulation par contraintes |
|---|---|
| tâche sentinelle pour relever un plafond | n'existe pas |
| `wait:` à date calculée, donc circulaire | n'existe pas |
| seuil sous lequel une tâche bloque en silence | n'existe pas |
| budget journalier partagé au lieu de sommé | n'existe pas |
| « prend du temps sans prendre de capacité » | un intervalle absent de la contrainte de non-chevauchement |
| « je ne fais qu'une chose à la fois » | `AddNoOverlap`, exact et non approché |
| « quelle est ma date limite » | une requête d'optimisation, pas un algorithme à écrire |
| « qu'est-ce qui est en conflit » | noyau d'insatisfiabilité, rendu par le solveur |

Le problème est en outre **étroit** : une seule ressource humaine, plus des tiers à
capacité infinie. C'est un cas très particulier, bien plus facile que le cas général — ce
qui rend crédible de faire mieux que les outils généralistes sur ce périmètre précis.

## Décisions actées

1. **Granularité 30 min**, paramétrable dès le premier jour (15 min envisagé plus tard).
   C'est la maille minimale qui exprime « vendredi 12h » et « jeudi 18h30 ».
2. **Deux horizons.** Un horizon *détaillé* (2 semaines par défaut, réglable) qui produit les
   heures ; un horizon de *faisabilité* couvrant le projet, en capacité agrégée, qui produit
   les dates au plus tard. Une fenêtre de deux semaines ne peut rien dire d'un projet à trois
   mois.
3. **Blocs minimums par contexte** : 2 h en `pro`, 1 h ailleurs. Le bloc est une propriété du
   contexte, pas de la tâche.
4. **Le fractionnement est le travail du solveur, jamais une transformation des données.**
   Une tâche de 20 h reste *une* tâche ; c'est le plan qui contient plusieurs intervalles.
   Découper à la main détruirait sa durée réelle, son échéance et la possibilité de la
   replanifier d'un bloc.
5. **Tâches indivisibles** marquées par tag. Elles créent un cas d'infaisabilité qui doit être
   diagnostiqué *avant* le solveur : 8 h indivisibles ne tiennent dans aucune journée de 6 h
   utiles.
6. **Immobiles** : les réunions (iCal) et les tâches marquées par tag. Même mécanisme,
   deux sources.
7. **Objectif : au plus tard en sécurité, pas au plus tôt.** Un calendrier rempli au plus tôt
   n'absorbe aucun imprévu, et le travail sans pression ne sera pas fait. L'exception « au plus
   tôt » se demande par tag, et s'implémente comme une échéance artificielle proche — un seul
   objectif, pas deux régimes dans le solveur.
8. **Tampon de sécurité** : échéance − 24 h, puis on recule jusqu'à la fin du dernier jour
   ouvré strictement antérieur. Jeudi 14 h → mardi 18 h 30. Mardi 8 h → vendredi 18 h 30.
   **Appliqué une seule fois, sur les échéances réelles.** Les dates dérivées le long du graphe
   sont des conséquences, pas des engagements : les tamponner les cumulerait.
9. **Deux régimes de planification.** Le travail *daté* est placé contre son mur. Le travail
   *non daté* — 224 tâches sur 277 en production — remplit l'espace restant par urgence, et est
   affiché comme **opportuniste**. Les deux doivent être visuellement distincts.
10. **Les tiers ne consomment pas de capacité.** Un intervalle de durée `estimated`, hors de la
    contrainte de non-chevauchement. On ne gère pas leur charge : ils annoncent un délai, on
    suppose qu'il est tenu.
11. **Marge quotidienne réservée** : 2 h en `pro`, 30 min en `perso`, en contrainte dure sur la
    capacité.
12. **Diagnostiquer avant de résoudre.** Quand c'est infaisable, nommer les conflits plutôt que
    de trancher à la place de l'utilisateur. Les règles d'arbitrage viendront de l'usage.
13. **Le solveur tourne sur le PC.** `ortools` est un binaire natif : il existe pour
    `win_amd64` et `manylinux aarch64`, mais Termux utilise la Bionic d'Android, pas la glibc.
    Le résultat est écrit dans Taskwarrior, Syncthing le porte, le téléphone affiche.
14. **Aucun nouvel UDA.** Les marqueurs passent par des **tags** (`+insecable`, `+fige`,
    `+asap`, `+externe`) : rien à changer dans le `taskrc`, et ça reste lisible en ligne de
    commande.

## Hors périmètre

- Gérer la capacité d'autres personnes. Les tiers sont à capacité infinie, par décision.
- Remplacer Taskwarrior comme source de vérité.
- Le multi-utilisateur.
- Réimplémenter la propagation de contraintes à la main : le cours MIT 6.034 donne
  l'intuition, CP-SAT donne l'outil.
- Faire tourner le solveur sur le téléphone.
- Le placement horaire interactif (glisser-déposer) : il viendra une fois le plan produit.

## Risques identifiés

- **Taille du modèle.** 277 tâches fractionnées sur un horizon détaillé peuvent faire exploser
  le nombre d'intervalles. Parade prévue : horizon détaillé court, agrégation au-delà, et ne
  modéliser finement que ce qui porte une échéance.
- **Instabilité du plan.** Si tout est libre de bouger, le plan peut changer entièrement d'un
  calcul au suivant. C'est un motif classique d'abandon d'outil. Une pénalité d'écart au plan
  précédent est prévue en lot tardif, pas au premier jour.
- **Effet déroutant du « au plus tard »** : la semaine prochaine paraîtra vide et le mur sera
  plus loin. C'est l'effet recherché, mais il faut que le régime opportuniste et la distinction
  visuelle arrivent en même temps, sinon l'outil paraîtra cassé.
- **Une échéance intenable ne doit pas empoisonner tout le plan.** Constaté sur taskcheck : une
  seule tâche impossible monopolisait sept journées à urgence 1000. Le modèle doit isoler
  l'infaisable et continuer.
- **Dépendance au PC** pour produire le plan, le téléphone ne pouvant pas exécuter le solveur.
