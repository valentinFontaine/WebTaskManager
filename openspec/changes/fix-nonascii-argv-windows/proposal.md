# Réparer la corruption des caractères non-ASCII sous Windows

## Summary

Les descriptions et noms de projet contenant des caractères non-ASCII (accents) sont
stockés corrompus quand le backend tourne sur le PC Windows. La cause est le binaire
`task.exe`, pas le code du projet. On ajoute une étape de comparaison-réparation qui
réécrit les champs texte via `task import`, seul canal qui préserve l'UTF-8.

## Problem

Créer une tâche `Tâche de test` depuis l'interface produit en base :

```
'Tâ£¨e de test'    (rendu console : 'TΓú¨e de test')
```

La corruption se produit **à l'écriture**, avant le stockage : l'export de Taskwarrior
restitue fidèlement ce qui a été enregistré.

### Origine, établie par élimination

| Canal | Résultat |
|---|---|
| `subprocess` `shell=True` (code actuel) | corrompu |
| `subprocess` `shell=False` (liste d'arguments) | corrompu |
| PowerShell natif, sans Python | corrompu |
| PowerShell en page de code UTF-8 (`chcp 65001`) | corrompu |
| **`task import` depuis un fichier UTF-8** | **correct** |

Le caller n'est donc pas en cause : `task.exe` (fork wilt00, 3.5.0) ne sait pas lire de
non-ASCII dans ses arguments sous Windows. En revanche son moteur, son stockage et son
export gèrent parfaitement l'UTF-8 — la preuve étant que `task import` fonctionne.

Ceci contredit AGENTS.md §8, qui affirmait que `task add` avait été validé « avec
accents ». La validation d'origine n'en comportait aucun.

### Portée

Deux endpoints font transiter du texte utilisateur par `argv` :

- `POST /api/task/add` — `description`, `project`
- `PUT /api/task/{id}/modify` — `description`, `project`

Tous les autres appels ne passent que des identifiants et des mots-clés ASCII.
Le défaut ne concerne que l'environnement **dev-pc**. La prod et le staging tournent
sous Termux/Linux, où `argv` gère l'UTF-8 correctement.

### Un second defaut, sur le chemin de lecture

Une fois l'ecriture reparee, les accents ressortaient encore faux, mais differemment :
`TÃ¢che` au lieu de `Tâche`. Ce n'est plus une corruption mais du mojibake --
de l'UTF-8 relu en Latin-1.

Cause : `run_task_command` appelait `subprocess.run(..., text=True)` sans preciser
d'encodage. Python decode alors avec l'encodage local, `cp1252` sur ce poste, alors que
TaskWarrior ecrit de l'UTF-8.

Les deux defauts sont independants et se cumulaient, ce qui a longtemps masque le second :
tant que l'ecriture etait cassee, la lecture n'avait rien de correct a restituer.

## Solution

Après une écriture, comparer ce que Taskwarrior a stocké à ce qui était demandé. En cas
d'écart, réécrire les seuls champs texte via `task import` avec un fichier temporaire
UTF-8, puis réexporter.

Le choix de la comparaison plutôt que d'un passage systématique par `import` est délibéré :

- **Aucun changement de comportement là où `argv` fonctionne.** Sous Linux la comparaison
  réussit, la réparation ne se déclenche jamais, et le nombre d'appels à `task` est
  strictement identique à aujourd'hui. Le risque pour la prod est nul.
- **Taskwarrior reste l'autorité sur les dates.** Reconstruire le JSON à la main aurait
  imposé de réimplémenter la conversion des dates locales en UTC, avec un risque de
  décalage silencieux.
- **La correction est auto-vérifiante** : elle ne s'active que sur un écart constaté.

## Impact

- **Backend** : une fonction utilitaire dans `main_fastapi.py`, appelée depuis `add` et
  `modify`, plus l'encodage UTF-8 explicite dans `run_task_command`. Aucune signature
  d'API modifiée.
- **Frontend** : aucun changement.
- **Tests unitaires** : les tests existants restent valides (sur données ASCII cohérentes,
  la réparation ne se déclenche pas et la séquence d'appels ne change pas). Des tests
  couvrant le chemin de réparation sont ajoutés.
- **Performance** : sous Windows, deux appels supplémentaires à `task` par écriture
  contenant du non-ASCII. Aucun surcoût ailleurs.

## Reste ouvert

- Le défaut amont dans le fork wilt00 n'est pas corrigé, seulement contourné. À remonter.
- Non validé sur l'étage staging (Termux, Taskwarrior 3.3.0) — obligatoire avant prod,
  cf. AGENTS.md §4.
