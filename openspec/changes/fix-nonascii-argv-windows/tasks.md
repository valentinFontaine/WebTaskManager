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

## Reste à faire

- [ ] **Valider sur staging** (Termux, Taskwarrior 3.3.0) — non facultatif, cf. AGENTS.md §4
- [ ] Remonter le défaut `argv` en amont, au fork wilt00
- [ ] Couvrir `PUT /modify` en bout en bout : seul `add` l'est aujourd'hui
- [ ] `twplanner.py` passe des noms de `pool` en argv (`twplanner.py:145`) : non audité,
      un pool accentué serait probablement affecté par le même défaut
