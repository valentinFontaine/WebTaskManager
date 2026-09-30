<!-- Extrait verbatim de AGENTS.md §9 (déplacé le 2026-09-30). -->

## 9. Historique des décisions

### 2026-09-18 — Taskwarrior natif sur le PC de travail

Le problème : l'app ne tournait que sur le téléphone, donc impossible de coder et tester sur le
PC (pas de droits admin, pas de WSL). Deux options avaient été envisagées — réécrire un backend
Windows imitant Taskwarrior, ou pousser le code vers le téléphone à chaque itération.

Résolu par l'installation de **Taskwarrior 3.5.0 natif sur Windows** :
fork [wilt00/taskwarrior](https://github.com/wilt00/taskwarrior), via Scoop, sans droits admin.

```powershell
scoop bucket add wilt00 https://github.com/wilt00/scoop-bucket
scoop install wilt00/taskwarrior
```

Validé sur base isolée : UDA, urgency avec coefficients personnalisés, `export`, `_projects`,
`+LATEST`, `add` via `shell=True` avec apostrophes/parenthèses, et le filtre composé de
`twplanner.py`. La réécriture d'un backend Windows est donc **abandonnée** : son vrai coût
n'était pas les ~10 commandes appelées, mais le DSL de filtre, le calcul d'urgency, les
dépendances, la récurrence et les contextes — avec un risque de divergence silencieuse sur des
données réelles synchronisées.

**Correction du 2026-09-18** : cette validation ne comportait en réalité **aucun caractère
accentué**, et la mention « avec accents » ci-dessus était fausse. Deux défauts distincts et
cumulés ont été trouvés depuis, puis corrigés — voir
`openspec/changes/fix-nonascii-argv-windows/` et §5.

### 2026-09-18 — Passage au modèle deux clones + git

Le transfert de fichiers (`pull.ps1`) est abandonné au profit de deux clones git (PC et
téléphone) avec un remote commun. Sûr ici parce que git ne transporte que du code : les données
restent sur le canal Syncthing.

Correctif associé : `playwright.config.js` pointait sur `python3 app.py` / port 5000 (l'ancien
backend Flask) et `tests/task-manager.spec.js` codait `http://localhost:5000` en dur,
court-circuitant `baseURL`. Les deux ont été corrigés, la cible est paramétrable par
environnement, et le garde-fou `TASKRC` a été ajouté.

### Fait

- créer le remote git et cloner proprement sur le PC
- aligner les versions de Taskwarrior entre PC et téléphone (les deux sont en 3.5.0 ; seule
  la différence fork/amont subsiste)
- étendre `.gitignore` pour un `taskrc` local
- `seed-staging.sh` et `deploy.sh` (cf. §7)

### Reste à faire

- faire tourner `seed-staging.sh` sur le téléphone : le clone de staging n'existe pas encore
