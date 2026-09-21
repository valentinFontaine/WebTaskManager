# Lots de travail

Chaque lot est **exécutable isolément**. Un agent qui reprend un lot doit pouvoir travailler en
ne lisant que `proposal.md`, `design.md` et ce fichier — il n'a pas le contexte de la
discussion qui les a produits.

## Règles valables pour tous les lots

Elles viennent de `AGENTS.md`, à lire avant toute modification.

1. **Jamais de commande Taskwarrior sans `TASKRC` ou `TASKDATA` sur une base jetable.**
   Sur le PC : `TASKRC=C:/Users/irpaui/taskwarrior-dev/taskrc`. La vraie base de l'utilisateur
   est synchronisée par Syncthing sur trois machines.
2. **Le test s'écrit d'abord et doit être vu rouge.** Un test qui n'a jamais échoué ne prouve
   rien. Compter les tests exécutés, pas seulement les verts.
3. **Ne rien installer hors du `venv` et du `node_modules` du projet.** `ortools` s'installe
   dans le venv du projet et s'ajoute à `requirements.txt`.
4. **Ne jamais publier sur GitHub au nom de l'utilisateur.**
5. `pytest` et `npm test` doivent rester verts à la fin de chaque lot.

---

## Lot 0 — Socle, sans solveur

**But** : lire Taskwarrior et construire le modèle de données, rien de plus.

- Paquet `planif/` à la racine. `ortools` ajouté à `requirements.txt` (roue `win_amd64`
  disponible ; pas de roue Termux, c'est assumé — le solveur tourne sur le PC).
- Lecture par `task export`, **avec `encoding='utf-8'` explicite** : sans lui, les accents sont
  corrompus sous Windows (défaut connu de ce dépôt, corrigé le 2026-09-18 dans
  `run_task_command`).
- Objets : `Tache`, `Contexte`, `Projet`, `Reunion`, selon `design.md` §2.
- Marqueurs par **tags** : `+externe`, `+insecable`, `+fige`, `+asap`. Aucun UDA nouveau.
- Chargement de la configuration (contextes, grilles, marges, blocs, horizons, échéances).

**Vert quand** : sur une base jetable semée, le chargement rend le bon nombre de tâches, les
tags sont correctement traduits en marqueurs, une description accentuée survit à l'aller-retour.

---

## Lot 1 — Calendrier disponible

**But** : la fonction pure `disponibilite(contexte, jour)` de `design.md` §3.

- grille du contexte, moins les réunions, moins la marge quotidienne (un **volume** réservé,
  pas une plage figée).
- Sortie en indices de créneaux de 30 min, granularité **paramétrée**, jamais codée en dur.

**Vert quand** : jeux de tests sans Taskwarrior ni réseau — journée pleine, journée avec
réunion à cheval sur deux créneaux, week-end vide, marge supérieure à la grille (doit rendre
zéro, pas un négatif), granularité changée à 15 min sans rien casser.

---

## Lot 2 — Tampon et dérivation des échéances

**But** : `echeance_effective(due)` de `design.md` §4, et la remontée le long du graphe.

- Règle : `due − 24 h`, puis reculer jusqu'à la fin du dernier jour ouvré strictement antérieur.
- **Tampon appliqué une seule fois**, sur les `due` réelles. Les dates dérivées ne se
  tamponnent pas — sinon le tampon se cumule le long d'une chaîne.

**Vert quand** : les deux exemples de référence tombent juste (jeudi 14 h → mardi 18 h 30 ;
mardi 8 h → vendredi 18 h 30), **et** un test prouve qu'une chaîne de cinq tâches n'accumule
qu'un seul tampon.

---

## Lot 3 — Pré-vérifications

**But** : tout le tableau de `design.md` §6, **sans jamais appeler le solveur**.

Tâche indivisible trop longue pour la plus grande journée, cycle de dépendances, `due`
dépassée, `+externe` sans `estimated`, tâche sans contexte attribuable.

**Vert quand** : chaque cas produit un message nommant les tâches concernées, et le cas
nominal n'en produit aucun. Le message de la tâche indivisible doit proposer les trois issues
(découper / journée exceptionnelle / rogner la marge).

> Lots 0 à 3 : aucun solveur, tout est pur et testable hors ligne. Ce sont les lots les plus
> sûrs à déléguer.

---

## Lot 4 — Modèle CP, passe 1 (le mur)

**But** : `design.md` §5, tâches datées uniquement.

Variables d'intervalle, conservation de la durée, fenêtres, bloc minimum, `AddNoOverlap` sur la
ressource unique + réunions + tâches figées, précédences, échéances.
Objectif lexicographique : minimiser le retard, puis **maximiser** la somme des débuts.

**Vert quand** : sur des scénarios construits à la main — une tâche datée est placée à sa
limite et pas avant ; deux tâches qui se disputent le même créneau ne se chevauchent jamais ;
une échéance intenable est rendue comme telle **sans empêcher les autres d'être planifiées**
(constaté sur taskcheck : une seule tâche impossible monopolisait sept journées).

---

## Lot 5 — Tiers et précédences

**But** : la décision 10 du `proposal.md`.

Une tâche `+externe` a un intervalle de durée `estimated`, soumis aux précédences, **absent de
la contrainte de non-chevauchement**.

**Vert quand** : le scénario de référence tombe juste — `plan (4 h) → commander (30 min) →
fabrication (4 semaines, +externe) → tester (3 h)`. Le test doit démarrer **après** les quatre
semaines, et la capacité de l'utilisateur sur la période doit être **intégralement disponible
pour autre chose**. C'est le scénario qui a motivé tout ce travail : c'est le test qui compte
le plus.

---

## Lot 6 — Passe 2, opportuniste

**But** : remplir la capacité restante avec les tâches non datées, par urgence, au plus tôt,
le plan de la passe 1 étant **figé**.

**Vert quand** : les tâches de la passe 1 ne bougent pas d'un créneau ; les non datées ne
prennent que la place restante ; elles sont marquées comme opportunistes dans la sortie.

---

## Lot 7 — Sortie

**But** : le plan en JSON pour l'interface, et `scheduled:` écrit dans Taskwarrior.

Deux régimes distingués dans le JSON (contraint / opportuniste). Écriture idempotente.
`--dry-run` ne doit rien écrire.

**Vert quand** : deux exécutions successives sans changement d'entrée produisent le même plan
et n'écrivent rien la seconde fois.

---

## Lot 8 — Noyau d'insatisfiabilité

**But** : `design.md` §6, partie infaisabilité.

Chaque contrainte d'échéance et chaque tâche figée posée en hypothèse étiquetée, pour que le
noyau se retraduise en langage courant.

**Vert quand** : un conflit construit à la main rend exactement les éléments en cause, et rien
d'autre.

---

## Lot 9 — Interface calendrier

**But** : `calendar-planner.js` consomme le plan JSON.

Distinction visuelle nette entre contraint et opportuniste. Le fond de grille montre les
plages du contexte courant. Si le fichier de plan manque ou est périmé, l'affichage se dégrade
sans casser.

**Vert quand** : test Playwright sur données bouchonnées — les deux régimes sont distinguables,
et l'absence de plan ne produit ni bandeau d'erreur ni page vide.

---

## Lot Z — Remontées amont taskcheck (différé, décision utilisateur)

Six défauts établis, reproductibles, listés en annexe de `design.md`. **Rien n'est publié sans
accord explicite de l'utilisateur, et jamais en son nom.**

Découpage recommandé si la décision est prise :

- **PR 1** — sections de configuration optionnelles lues sans défaut (`[report]`,
  `[calendars]`). Trivialement correct, touche tout le monde, aucun débat.
- **PR 2** — support Windows : `encoding='utf-8'` manquant + `import termios` conditionnel.
  Le correctif `termios` est écrit et vérifié.
- **Issue** — le budget journalier en `max` au lieu de somme. Formuler en question (« est-ce
  délibéré ? »), avec la reproduction en deux tâches. **C'est la question qui gouverne les
  autres** : si c'est délibéré, l'outil ne peut pas porter plusieurs contextes.
- **Issue** — durées non normalisées, `[[0, 24]]` qui plante, seuil des 3 minutes.

Le projet n'a **ni `CONTRIBUTING`, ni gabarit d'issue** : aucune convention imposée.

---

## À trancher avec l'utilisateur avant le lot 4

- **Source des réunions** : le flux iCal n'est branché nulle part aujourd'hui. Sans lui, le
  calendrier disponible ignore les réunions et le plan sera faux. Faut-il un lot dédié ?
- **Pénalité de stabilité** (écart au plan précédent) : prévue tardivement, mais si le plan
  s'avère trop instable dès le lot 4, elle remonte en priorité.
- **Échéances de projet** : aucune n'existe aujourd'hui dans les données. Il faut en saisir au
  moins une pour que la passe arrière ait un sens.
