# Filtres partagés dans la barre nav, et pools dérivés du contexte

## Summary

Trois pages filtrent les tâches, chacune à sa façon : l'accueil a sa section « Advanced
Filters », le calendrier a un menu « Tous les pools », le kanban n'a rien. On unifie tout
dans `nav.js`, qui devient la source unique de l'état de filtre (`status`, `context`,
`project`, `tags`), partagé entre les trois pages via `localStorage` et l'évènement
`tw-filter-change`.

Dans la foulée, on corrige un contresens de modélisation : l'UDA `pool` recopiait à la
main sur chaque tâche une information déjà portée par ses tags. Le pool redevient ce
qu'il aurait dû rester — un objet de **configuration** — et l'appartenance d'une tâche à
un pool se **dérive** au lieu de se saisir.

## Problem

### 1. Le filtrage est éclaté et non partagé

| Page | Filtres disponibles | Où |
|---|---|---|
| Accueil | projet, tags, 2 vues sur `scheduled` | `index.html` + `main.js:211`, côté client |
| Calendrier | pool (pro/perso), tri, « prêtes seulement » | `calendar-planner.html:75` |
| Kanban | aucun | — |

Rien n'est partagé. Le cas d'usage qui motive ce changement n'est réalisable sur aucune
page : « je suis en contexte pro, je veux planifier d'abord tout le projet X, puis
retirer le filtre et planifier le reste ».

### 2. `pool` est un doublon manuel des tags

Trois objets portent le nom `pro` :

1. le tag `+pro` — ce dont parle la tâche ;
2. le contexte `pro`, dont le filtre de lecture est littéralement `+pro`
   (`example_taskrc.txt`) — **dérivé** du tag, donc pas un doublon ;
3. l'UDA `pool:pro` — **recopié à la main** sur chaque tâche, jamais vérifié.

C'est (3) le doublon, et il ment déjà : `calendar-planner.js:696` fait
`(task.pool || 'pro')`, donc toute tâche sans pool est silencieusement déclarée pro.

### 3. Le modèle correct

Un pool n'est pas un attribut de tâche. C'est :

```
pool := { nom, grille hebdomadaire, filtre d'éligibilité }
```

où le filtre d'éligibilité est le filtre de lecture d'un contexte Taskwarrior. Une tâche
n'« a » pas de pool : elle est **candidate** à tout pool dont elle satisfait le filtre.

Deux conséquences acceptées comme des améliorations, pas comme des régressions :

- **une tâche peut être candidate à plusieurs pools** (`+sport` peut relever de perso et
  d'asso). Le planificateur prend alors le premier créneau libre parmi les candidats —
  strictement mieux que le pool unique figé d'aujourd'hui ;
- **une tâche peut n'être candidate à aucun pool.** Elle est non-planifiable, au même
  titre qu'une tâche sans `estTime`. La bascule « prêtes seulement » couvrira les deux
  raisons.

### 4. `sleep` disparaît, `perso` doit gagner une grille

`TWCalendar.py:23` définit un pool `sleep` (00:00-08:00 et 22:00-24:00 tous les jours)
pour marquer l'indisponibilité, et un pool `perso` de grille **vide**, commenté « pas
besoin de planifier explicitement (c'est le reste du temps) ».

Les deux sont des contournements du même manque. Sous le modèle retenu, **la semaine est
vide par défaut et les pools y découpent des plages** : ce qu'aucun pool ne couvre est
indisponible. `sleep` n'a donc plus de raison d'être et disparaît.

En revanche `perso` ne peut plus rester vide — vide signifie désormais « jamais
disponible », l'exact contraire de l'intention. Valeurs de départ retenues, à ajuster par
l'utilisateur :

| jour | créneau perso |
|---|---|
| lundi → vendredi | 18:30 – 22:00 |
| samedi, dimanche | 09:00 – 22:00 |

### 5. Le calendrier doit montrer ce qu'il ne filtre pas

Filtrer par contexte côté serveur veut dire que le calendrier ne **reçoit** pas les
tâches hors contexte, donc ne peut pas les dessiner. Or les masquer ferait planifier deux
choses en même temps.

La page calendrier a donc besoin de **deux sources** :

- les **blocs occupés** : toutes les tâches planifiées, sans filtre, avec un drapeau
  dans/hors filtre ;
- la **liste à planifier** : filtrée.

Les blocs hors filtre sont hachurés et leur titre masqué. Une bascule permet de les
cacher, **cochée par défaut** : le défaut sûr est de les voir.

## Decisions

### Contexte côté serveur, projet et tags côté client

Un filtre de contexte est une expression Taskwarrior arbitraire : les exemples courants
sont des tags (`+work or +freelance`, `-work -freelance -school`) mais la syntaxe accepte
`project:X`, `due.before:eom`, `(+a or +b) and -c`. Réimplémenter ce parseur en JavaScript
ferait échouer **silencieusement** tout contexte sortant du sous-ensemble supporté.

Il n'y a par ailleurs aucun gain de latence à l'espérer : c'est un `task export` dans les
deux cas, et filtrer côté serveur rend la réponse plus petite. Le mécanisme existe déjà
(`build_task_filter`, `main_fastapi.py:328`), et il injecte le filtre en ligne sans jamais
modifier l'état de Taskwarrior.

`project` et `tags` restent en revanche côté client : ce sont des comparaisons littérales,
le filtrage se fait à la frappe, sans aller-retour. Le compteur affiche alors
`filtré / total-dans-le-contexte`.

### L'état de filtre est persistant, donc il doit être visible

`nav.js` conserve son état dans `localStorage` : il survit à la fermeture de l'onglet. Un
filtre projet laissé actif la veille donnerait le lendemain une liste tronquée sans
explication. La **barre de résumé des filtres** de la PR #1 — retirée au portage faute de
champs à résumer — revient donc au lot 1, avec un bouton « tout effacer ». Ce n'est pas du
confort : c'est ce qui rend l'état persistant supportable.

### Les vues sur `scheduled` restent sur l'accueil

`status`, `context`, `project` et `tags` forment le contrat de filtre partagé. « Prévues
aujourd'hui » et « planifiées dans le passé et non faites » sont d'une autre nature : ce
sont des vues enregistrées sur `scheduled`, propres à la page liste. Sur le calendrier
elles n'ont aucun sens, puisque le calendrier *est* la vue sur `scheduled`.

Les deux boutons restent donc sur l'accueil, dans une barre fine au-dessus de la liste.
Le reste de la section « Advanced Filters » disparaît.

### `pool:` survit comme surcharge manuelle

Le pool est dérivé par défaut. Si une tâche porte explicitement `pool:asso`, cette valeur
gagne. Ça ne coûte rien, n'impose aucune suppression de données, et laisse une porte de
sortie pour le cas particulier. À rediscuter une fois le lot 4 branché.

## Non-goals

- Migrer le calendrier vers FullCalendar ou EventCalendar. TOAST UI v2.1.3 reste.
- La page Gantt (`frappe-gantt`), chantier séparé.
- Le menu latéral, la synchronisation et le flux SSE de la PR #1 : toujours sans
  contrepartie serveur.
- Brancher le pool dérivé sur `twplanner.py`. Le lot 4 prépare et teste la dérivation
  sans débrancher l'ancien chemin.

## Risks

| Risque | Parade |
|---|---|
| L'état `localStorage` filtre une page à l'insu de l'utilisateur | Barre de résumé + bouton « tout effacer », lot 1 |
| Supprimer la section « Advanced Filters » casse un usage existant | Les deux boutons de vue sont conservés ; projet et tags sont repris à l'identique dans nav |
| Charger les blocs occupés sans filtre double le coût du calendrier | Une seule requête supplémentaire par chargement de page, sur les tâches `scheduled` uniquement |
| La dérivation du pool change le comportement de `twplanner.py` | Lot 4 non branché : dérivation testée à côté, ancien chemin intact |
