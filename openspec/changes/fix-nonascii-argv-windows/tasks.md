# Tâches

## Diagnostic

- [x] Reproduire la corruption depuis l'interface (test Playwright)
- [x] Confirmer que la corruption est présente **en base**, pas seulement à l'affichage
- [x] Éliminer `shell=True` / cmd.exe comme cause (`shell=False` corrompt aussi)
- [x] Éliminer Python comme cause (PowerShell natif corrompt aussi)
- [x] Éliminer la page de code console comme cause (`chcp 65001` corrompt aussi)
- [x] Établir que `task import` depuis un fichier UTF-8 préserve la valeur
- [x] Identifier le second défaut : décodage de la sortie en `cp1252` au lieu d'UTF-8

## Implémentation

- [x] `text_field_gaps()` — comparer les champs texte stockés à ceux demandés
- [x] `repair_text_fields()` — réécrire les écarts via `task import` (fichier UTF-8)
- [x] Brancher sur `POST /api/task/add`
- [x] Brancher sur `PUT /api/task/{id}/modify`
- [x] `encoding='utf-8'` explicite dans `run_task_command`

## Tests

- [x] Tests unitaires de `text_field_gaps` (6 cas, dont tags désordonnés et champs absents)
- [x] Test du chemin de réparation : 4 appels à `task`, description corrigée
- [x] Test de non-régression : valeur cohérente → **2 appels seulement**, aucune réparation
- [x] Les tests unitaires préexistants passent sans modification (37 au total)
- [x] Bout en bout Playwright avec descriptions accentuées : 3/3

## Validé sur staging — 2026-09-19

Termux, Taskwarrior **3.5.0** (et non 3.3.0 : AGENTS.md était périmé sur ce point).

- [x] 37 tests unitaires verts sur le téléphone
- [x] `test_add_task_skips_repair_when_stored_value_matches` vert : le chemin de réparation
      **ne se déclenche pas** sous Linux. Le correctif Windows ne change rien à la prod.
- [x] Création et modification accentuées vérifiées directement dans la base
- [x] Playwright 3/3 depuis le PC contre le backend du téléphone
      (`adb forward tcp:1875 tcp:8000`, puis `PW_NO_SERVER=1 PW_BASE_URL=http://localhost:1875`)
- [x] Couverture de `PUT /modify` de bout en bout

Rapport détaillé : `rapport-staging.md`.

## Défaut découvert pendant la validation : filtrage des tags accentués

**Hors périmètre de ce changement, et sans rapport avec lui** : un tag accentué s'affiche
correctement mais reste introuvable par son propre filtre.

| Commande | Sortie |
|---|---|
| `task export` | `"tags":["été","noël"]` — correct |
| `task _unique tags \| cat -A` | `\u00e9t\u00e9,no\u00ebl$` — échappé |
| `task +été count` | `0` — introuvable |

Hypothèse cohérente avec les trois : la clé du tag est stockée échappée, déséchappée à
l'export, mais pas échappée lors de la construction du filtre. Le backend passe `+été`
exactement comme la ligne de commande : aucun `ensure_ascii` par défaut n'existe dans le
dépôt (seul `json.dump` de `main_fastapi.py:115` sérialise, en `ensure_ascii=False`).

- [ ] Confirmer par un test sans backend :
      `task rc.confirmation=off add "x" +café ; task +café count`
- [ ] Si confirmé, remonter en amont et décider si `add`/`modify` doivent passer les tags
      par `import` plutôt que par `+tag`

## Reste à faire

- [ ] Remonter le défaut `argv` en amont, au fork wilt00
- [ ] Ajouter un tag accentué au scénario Playwright : il utilise `test, automatique`,
      du pur ASCII, et n'aurait pas vu le défaut ci-dessus
- [ ] `twplanner.py` passe des noms de `pool` en argv (`twplanner.py:145`) : non audité,
      un pool accentué serait probablement affecté par le même défaut
- [ ] Documenter dans AGENTS.md que Termux exige `ANDROID_API_LEVEL=24` pour compiler
      `pydantic-core`
