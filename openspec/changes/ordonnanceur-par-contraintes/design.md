# Conception — ordonnanceur de projet par contraintes

Document de référence. Il doit se suffire à lui-même : un agent qui n'a pas suivi la
discussion doit pouvoir implémenter un lot de `tasks.md` en ne lisant que ce fichier et
`proposal.md`.

---

## 1. Modèle du temps

- **Granularité** `g` = 30 min, **paramétrable**. Toutes les durées et positions sont des
  entiers en nombre de créneaux. Jamais de flottant d'heures dans le modèle.
- **Origine** `t0` = début du jour courant, minuit local.
- **Horizon détaillé** `H_d` = 2 semaines par défaut, paramétrable. C'est la fenêtre où l'on
  produit des heures.
- **Horizon de faisabilité** `H_f` ≥ `H_d`, couvrant la plus lointaine échéance de projet.
  Au-delà de `H_d`, la capacité est agrégée par jour au lieu d'être posée au créneau.

> Pourquoi deux horizons : une fenêtre de deux semaines ne peut pas dire si un projet à trois
> mois est faisable. Mais modéliser trois mois au créneau de 30 min ferait exploser le modèle.

---

## 2. Entités

### Tâche (lue depuis Taskwarrior)

| Champ | Source | Rôle |
|---|---|---|
| `uuid`, `description`, `project` | Taskwarrior | identité |
| `estimated` | UDA `estTime` | durée de travail, ou **délai** si `+externe` |
| `due` | Taskwarrior | échéance **réelle** (un engagement) |
| `depends[]` | Taskwarrior | précédence |
| `tags[]` | Taskwarrior | contexte + marqueurs |
| `urgency` | Taskwarrior | ordre du régime opportuniste |

**Marqueurs, par tags — aucun UDA nouveau :**

| Tag | Effet |
|---|---|
| `+externe` | la tâche n'est pas réalisée par l'utilisateur : intervalle **hors** de la contrainte de non-chevauchement. `estimated` est un **délai calendaire**, pas du travail. |
| `+insecable` | un seul bloc, pas de fractionnement |
| `+fige` | début imposé : on conserve le `scheduled` courant |
| `+asap` | exception au « au plus tard » — traité par une échéance artificielle proche |

### Contexte

Un contexte Taskwarrior (`context.<nom>.read`) fournit **l'éligibilité** : quelles tâches
peuvent occuper ses créneaux. **Le filtre n'est jamais réinterprété** — on demande les UUID à
Taskwarrior (`task <filtre> _uuids`) et on s'en tient à la réponse.

Configuration associée à chaque contexte :

```toml
[contextes.pro]
contexte_tw = "pro"          # nom du contexte TaskWarrior
bloc_min    = "2h"
marge_jour  = "2h"           # capacité réservée, jamais planifiée
grille      = { lun = ["08:30-12:00", "14:00-18:30"], ... }

[contextes.perso]
contexte_tw = "perso"
bloc_min    = "1h"
marge_jour  = "30min"
grille      = { lun = ["07:00-08:00", "18:40-19:30"], sam = ["07:00-12:00"], ... }
```

> La **forme** des créneaux compte ici, contrairement à taskcheck : on place à l'heure.

### Réunion

Intervalle fixe, issu d'iCal. Entre dans la contrainte de non-chevauchement au même titre
qu'une tâche `+fige`. **Source à brancher** : le flux iCal existe déjà côté utilisateur
(cf. `TWsched_task_to_caldav.py` du dépôt TaskWarriorPlanner, qui n'écrit que dans un sens).

### Projet

```toml
[projets."NPD.helisides"]
echeance = "2026-12-15"
```

---

## 3. Calendrier disponible

Fonction pure, testable sans solveur ni réseau :

```
disponibilite(contexte, jour) = grille(contexte, jour)
                              − réunions(jour)
                              − marge_jour(contexte)
```

Elle produit, par contexte et par jour, la liste des créneaux libres en indices de créneaux.

**Règle de la marge** : la marge est un *volume* réservé, pas une plage. On retire
`marge_jour` du total disponible du jour ; on ne fige pas *quand*.

---

## 4. Le tampon de sécurité

```
echeance_effective(due) :
    t = due − 24 h
    reculer jusqu'à la fin du dernier jour ouvré strictement antérieur à t
```

Vérifié sur les deux exemples de référence :

| `due` | − 24 h | fin du dernier jour ouvré antérieur | résultat |
|---|---|---|---|
| jeudi 14 h 00 | mercredi 14 h 00 | mardi 18 h 30 | **mardi 18 h 30** |
| mardi 8 h 00 | lundi 8 h 00 | vendredi 18 h 30 | **vendredi 18 h 30** |

**Appliqué une seule fois, aux `due` réelles.** Les dates dérivées le long du graphe de
dépendances ne sont pas tamponnées : sinon le tampon se cumule et une chaîne de cinq tâches
accumulerait une dizaine de jours ouvrés de rembourrage invisible.

---

## 5. Le modèle de contraintes

### Variables

Pour chaque tâche `i` retenue dans l'horizon détaillé :

- si `+insecable` ou `estimated ≤ bloc_min` : **un** intervalle `I_i`
- sinon : `k_i` intervalles `I_{i,1..k}`, où `k_i = ceil(estimated / bloc_min)`,
  chacun de durée `bloc_min` sauf le dernier (le reste)

Chaque intervalle porte `start`, `size`, `end` et, pour les blocs optionnels du reste, une
variable de présence.

### Contraintes

1. **Conservation** : `Σ size(I_{i,*}) = estimated(i)`
2. **Fenêtres** : chaque intervalle est inclus dans un créneau disponible du contexte de `i`
3. **Bloc minimum** : `size ≥ bloc_min(contexte(i))`, sauf l'intervalle de reste
4. **Ressource unique** : `AddNoOverlap` sur **tous** les intervalles des tâches non `+externe`,
   **plus** les réunions, **plus** les tâches `+fige`
5. **Tiers** : une tâche `+externe` a un intervalle de durée `estimated`, soumis aux précédences
   mais **absent** de la contrainte 4 — c'est toute la différence, et c'est une ligne
6. **Précédence** : pour `i → j`, `start(premier bloc de j) ≥ end(dernier bloc de i)`
7. **Échéance** : `end(dernier bloc de i) ≤ echeance_effective(i)`
8. **Figées** : `start(I_i)` fixé à la valeur courante de `scheduled`

### Objectif — deux résolutions, pas deux objectifs

Les deux régimes ne se mélangent pas dans une seule optimisation : ils s'enchaînent.

**Passe 1 — le mur.** On ne retient que les tâches datées (directement, ou par dépendance vers
une tâche datée).

```
minimiser   Σ retard_i            (lexicographiquement prioritaire)
puis
maximiser   Σ start_i             ← « au plus tard en sécurité »
```

Le résultat : chaque tâche datée est à sa date limite. **Sa date planifiée *est* sa marge.**
La question « puis-je décaler cette commande ? » se lit dans le plan, sans seconde requête.

**Passe 2 — l'opportuniste.** Le plan de la passe 1 est **figé**. Les tâches non datées
remplissent la capacité restante, par urgence décroissante, au plus tôt.

```
maximiser   Σ urgence_i × planifiée_i
départager  par start croissant
```

> Pourquoi figer la passe 1 : pour que la marge annoncée soit **actionnable**. Une marge
> obtenue en réorganisant tout le reste est vraie mais inutilisable — on ne la suivra pas, et
> on cessera de faire confiance au chiffre.

---

## 6. Diagnostics

### Pré-vérifications, avant tout appel au solveur

Elles sont bêtes, rapides, et évitent un `INFEASIBLE` sans explication :

| Vérification | Message attendu |
|---|---|
| tâche `+insecable` plus longue que le plus grand créneau disponible | « 8 h indivisibles ne tiennent dans aucune de vos journées (max 6 h utiles) — découpez, ou déclarez une journée exceptionnelle, ou rognez la marge ce jour-là » |
| cycle de dépendances | nommer le cycle |
| `due` déjà passée | lister |
| tâche `+externe` sans `estimated` | « délai fournisseur non renseigné » |
| tâche sans contexte attribuable | lister |

### En cas d'infaisabilité

CP-SAT rend un **noyau d'insatisfiabilité** via des hypothèses (`AddAssumption`). Chaque
contrainte d'échéance et chaque tâche figée est posée comme une hypothèse étiquetée, de sorte
que le noyau se retraduise en langage courant :

> « Ces trois éléments s'opposent : l'échéance du 15/12 sur *Finaliser IOM US*, la tâche figée
> *Réunion revue de projet* du 12/12, et les 8 h indivisibles de *Test de qualification*. »

**On diagnostique, on ne tranche pas.** Les règles d'arbitrage viendront de l'usage observé.

### Rapport, en sortie nominale

- par échéance : la marge restante, en temps ouvré
- la **chaîne critique** : les tâches dont tout report décale la fin de projet
- la part de la semaine qui est contrainte, contre la part opportuniste
- ce qui n'a pas pu être placé, et pourquoi

---

## 7. Où vivent les données

| Donnée | Emplacement | Raison |
|---|---|---|
| tâches, durées, échéances, dépendances, tags | **Taskwarrior** | source de vérité unique |
| grilles, marges, blocs, horizons, échéances de projet | fichier de configuration du dépôt | pas la place de Taskwarrior |
| réunions | iCal | déjà ailleurs, ne pas dupliquer |
| plan calculé | fichier JSON + `scheduled:` dans Taskwarrior | l'un pour l'interface, l'autre pour la ligne de commande |

Le plan JSON est le contrat avec l'interface web. Elle ne connaît pas le solveur.

---

## 8. Interfaces

```
plan            résout et écrit le plan
plan --check    pré-vérifications seules, aucun solveur
plan --dry-run  résout sans rien écrire
why <tâche>     marge, chaîne critique, ce qui la contraint
```

---

## Annexe — constats taskcheck (2026-09-21)

Établis en exécutant l'outil, sur base jetable. Conservés parce qu'ils documentent les
pièges du domaine, et parce qu'ils sont à remonter en amont.

1. `subprocess.run(["task","export"], text=True)` sans `encoding='utf-8'` → accents corrompus
   sous Windows (`common.py:32`). Défaut identique à celui corrigé dans ce dépôt le 2026-09-18.
2. `config["report"]` (`report.py:285`) et `config["calendars"]` (`common.py:213`) lus sans
   défaut → plantage si la section documentée comme optionnelle est absente.
3. `import termios` inconditionnel (`theme.py:4`) → `--report` et `--timeline` inutilisables
   sous Windows. Correctif de 11 lignes écrit et vérifié.
4. Durées non normalisées : `PT1H60M` au lieu de `PT2H`.
5. `[[0, 24]]` dans une grille fait planter : `hours_to_time(24)` produit `"24:0"`.
6. `allocation <= 0.05` (≈ 3 min) dans `allocate_time_to_task` → une tâche plus courte n'est
   **jamais** planifiée, donc jamais terminée, et **bloque ses dépendants en silence**.
7. Limite structurelle : `compute_total_available_hours` prend le **max** des grilles, pas leur
   somme, et le budget journalier est partagé. Deux contextes ne donnent pas deux capacités.
   Contournement trouvé : une tâche sentinelle sur une grille large. Reproduction en deux
   tâches disponible.
