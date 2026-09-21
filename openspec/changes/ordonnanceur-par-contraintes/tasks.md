# Lot 9 — Le calendrier consomme le plan

Les lots 0 à 8 et le lot Z vivent dans `../TaskWarriorPlanner`, avec le modèle formel.
Ce fichier ne couvre que la partie interface.

## Règles

Voir `AGENTS.md`. En résumé : jamais de commande Taskwarrior sans `TASKRC` sur une base
jetable ; le test s'écrit d'abord et doit être vu rouge ; `pytest` et `npm test` verts à la fin.

## Prérequis

Le lot 7 de l'autre dépôt, qui produit le fichier de plan. **Tant qu'il n'existe pas, ce lot se
développe sur un plan bouchonné** — ce qui est de toute façon la bonne façon de le tester.

## Le travail

- `calendar-planner.js` lit le plan JSON et affiche ses intervalles.
- **Distinction visuelle nette** entre le régime *contraint* (engagement, daté, contre son mur)
  et le régime *opportuniste* (suggestion, non daté, remplissage par urgence). Ce ne doit pas
  être une nuance de gris : l'utilisateur doit savoir d'un coup d'œil ce qu'il *doit* faire.
- Le fond de grille montre les plages du contexte courant, comme prévu de longue date.
- **Dégradation propre** : plan absent, périmé ou malformé → le calendrier s'affiche sans plan,
  sans bandeau d'erreur et sans page vide.

## Vert quand

Test Playwright sur données bouchonnées, dans le bloc `Filtres partages` (entièrement stubbé,
parallélisable) :

1. les deux régimes sont distinguables par un sélecteur, pas seulement à l'œil ;
2. un plan absent ne produit **ni** `#error-message` visible **ni** calendrier vide ;
3. un plan malformé ne casse pas davantage qu'un plan absent.

Le point 2 mérite son test à lui seul : le frontend attrape ses exceptions et les affiche dans
un bandeau, donc une page entièrement cassée peut laisser la console vide. Asserter l'absence
de bandeau **et** la présence du contenu attendu.
