# AGENTS.md — WebTaskManager

Instructions opérationnelles pour un agent travaillant sur ce dépôt.
À lire avant toute modification. Complète `PROJECT_MEMORY.md` (voir l'avertissement en fin de fichier).

---

## 1. Ce qu'est ce projet

Interface web pour **Taskwarrior**. Le backend appelle le binaire `task` en sous-processus et
renvoie du JSON ; le frontend est en HTML/CSS/JS vanilla, sans build.

Il n'y a **pas de base de données applicative**. La seule source de vérité est le datastore
Taskwarrior (`.task`, SQLite/taskchampion depuis la v3). Conséquence directe : toute commande
exécutée par le backend écrit dans les vraies données de l'utilisateur. C'est la contrainte
qui structure tout le reste de ce document.

**Backend actuel : FastAPI**, `main_fastapi.py`, port **8000**.
`app.py` est l'ancien backend Flask (port 5000), conservé mais **non maintenu** — ne pas y
porter de nouvelles fonctionnalités.

---

## 2. Topologie des environnements

Le déploiement n'est pas un serveur : c'est un téléphone Android sous Termux qui joue le rôle
de serveur, accessible depuis le PC de travail par un port-forward adb.

| Env | Machine | Taskwarrior | Données | Rôle |
|---|---|---|---|---|
| **dev-pc** | PC Windows | 3.5.0.6 (fork wilt00, *nightly*) | `C:\Users\irpaui\taskwarrior-dev` | itération et tests réels |
| **dev-tel** | Termux | 3.5.0 | base de dev dédiée | dev ponctuel depuis le téléphone |
| **staging** | Termux | 3.5.0 | `~/.task-staging` | validation avant prod |
| **prod** | Termux | 3.5.0 | `~/.task` (Syncthing) | usage quotidien réel |

Le code circule par **git**. Les données circulent par **Syncthing**, sur un canal séparé —
elles ne passent jamais par le dépôt.

### Pièges de cette topologie

- **Trois machines partagent la base de prod par Syncthing** : le téléphone (Termux), le PC
  perso (Arch Linux) et, à terme seulement, le PC de travail. Le PC Windows **ne détient
  aujourd'hui aucune donnée de prod** : il ne sert que de base de dev isolée. Tant que c'est
  le cas, son écart de build est sans conséquence sur les vraies données. Faire entrer le PC
  Windows dans le cercle Syncthing est un changement à instruire, pas à improviser.
- **Ne jamais mettre à jour un seul pair Syncthing.** Un binaire plus récent migre le schéma
  SQLite au premier écrit et rend la base illisible par les pairs restés en arrière ; Syncthing
  réplique le fichier migré sans comprendre son contenu, et il n'y a pas de retour arrière
  automatique. L'ordre est : pause de Syncthing, sauvegarde (`task export` **et** copie du
  répertoire), mise à jour de toutes les machines, puis reprise.
- **Le PC tourne sur le fork wilt00, qui se déclare *nightly build*** et numérote à quatre
  chiffres (`3.5.0.6`). Même aligné sur l'amont `3.5.0`, ce n'est pas le même binaire : un test
  vert sur le PC ne prouve rien sur le comportement en prod. C'est la raison d'être de l'étage
  staging. Vérifié le 2026-09-19.
- **Le PC n'a ni `node_modules` ni `venv`** dans certaines copies (exclus des transferts).
  Vérifier avant de supposer qu'une commande npm/pytest est exécutable.
- `pull.ps1` (transfert de fichiers depuis le téléphone) exclut `.git` : une copie obtenue
  ainsi n'est pas un clone et n'a pas d'historique. Travailler sur un vrai `git clone`.

---

## 3. Règle absolue : isolation des données

**Ne jamais exécuter de test, de seed ou de commande exploratoire sans `TASKRC` ou `TASKDATA`
explicitement positionné sur une base jetable.**

```powershell
# PC
$env:TASKRC = 'C:/Users/irpaui/taskwarrior-dev/taskrc'
```

```bash
# Termux, staging
export TASKRC=~/taskwarrior-staging/taskrc
```

Deux garde-fous existent, de fiabilité inégale :

1. `config.py` force `DEVELOPER_MODE=True` sous pytest — les commandes sont journalisées dans
   `command.debug` au lieu d'être exécutées. Utile, mais c'est un flag : il peut être contourné
   ou oublié, et il empêche les tests d'intégration réels.
2. `playwright.config.js` **refuse de démarrer** si ni `TASKRC` ni `TASKDATA` n'est défini.
   C'est le garde-fou fiable : l'isolation vient de la base, pas d'un drapeau.

Préférer toujours l'isolation par `TASKRC` au `DEVELOPER_MODE`.

---

## 4. Lancer et tester

```bash
python main_fastapi.py          # backend FastAPI sur :8000 (docs sur /docs)
pytest                          # toute la suite unitaire (voir ci-dessous)
npm test                        # Playwright, nécessite TASKRC (cf. §3)
```

`playwright.config.js` cible `localhost:8000` par défaut et démarre le backend lui-même.
Variables de surcharge :

| Variable | Usage |
|---|---|
| `PW_BASE_URL` | cible complète (ex. `http://localhost:1875` pour le téléphone via adb) |
| `PW_PORT` | port seul, si l'hôte reste localhost |
| `PW_NO_SERVER=1` | ne pas démarrer de backend local (serveur déjà lancé) |
| `PW_SERVER_CMD` | commande de démarrage alternative |

```bash
# tester contre le téléphone depuis le PC
PW_NO_SERVER=1 PW_BASE_URL=http://localhost:1875 npm test
```

### Pipeline en trois étages

1. **dev-pc, unitaire** — `pytest`. Instantané, tourne partout. Deux fichiers :
   - `test_fastapi.py` — l'API, entièrement mockée, aucune dépendance à Taskwarrior ;
   - `test_integrite_source.py` — la **forme** des fichiers du dépôt : aucun marqueur de
     conflit laissé en place, aucun commentaire CSS dépareillé. Un `*/` orphelin fait
     jeter au parseur les règles qui suivent **sans rien signaler** ; c'est ainsi que le
     bloc `:root` de `calendar-planner.css` est resté mort six mois.

   Lancer `pytest` sans argument : viser un seul fichier laisserait l'autre de côté.
2. **dev-pc, intégration réelle** — `TASKRC` sur `taskwarrior-dev`, `DEVELOPER_MODE` désactivé,
   vraies commandes `task`, plus Playwright. Sans risque grâce à l'isolation de la base.
3. **staging sur téléphone** — mêmes tests sur `~/.task-staging`. **Non facultatif** : c'est le
   seul étage qui valide le comportement sur Taskwarrior 3.3.0.

Prod ne reçoit qu'un `git pull` + redémarrage, jamais de test.

### Règle : tout bug corrigé laisse un test derrière lui

**Aucune correction de bug n'est complète sans un test qui échoue avant elle et passe
après.** Écrire le test *d'abord* : un test qui n'a jamais rougi ne prouve rien.

Trois exigences, apprises en se faisant avoir sur chacune :

1. **Le test doit être déterministe.** Pour un bug de concurrence, ne pas espérer perdre
   la course : la faire perdre. `page.route()` avec un délai explicite, plutôt qu'un
   `setTimeout` qui marche une fois sur deux.
2. **Le test doit prouver qu'il exerce bien le chemin visé.** Un test qui, après
   refactorisation, ne déclenche plus le code qu'il surveille passe au vert en silence.
   Compter les interceptions et l'assener : `expect(compteur).toBeGreaterThan(0)`.
3. **Vérifier ce que voit l'utilisateur, pas seulement la console.** Le frontend attrape
   ses exceptions et les affiche dans un bandeau ou une `alert()` : une page entièrement
   cassée laisse la console vide. Asserter l'absence de bandeau **et** la présence du
   contenu attendu.

Les tests Playwright tournent sous Chromium uniquement. Plusieurs bugs remontés l'ont été
depuis Firefox, dont les messages d'erreur diffèrent : un vert ici ne couvre pas tout.

---

## 5. Surface Taskwarrior utilisée

Tout passe par `run_task_command()` (`main_fastapi.py:28`), qui appelle
`subprocess.run(..., shell=True)`.

| Commande | Appelée depuis |
|---|---|
| `task version` | contrôle de démarrage |
| `task status:pending export` | `GET /api/tasks` |
| `task scheduled.not: export` | `GET /api/tasks/planned` |
| `task _projects` | `GET /api/projects` |
| `task <id> start\|stop\|done` | endpoints d'action |
| `task rc.confirmation=off <id> delete` | `DELETE /api/task/{id}/delete` |
| `task rc.confirmation=off <id> modify …` | `PUT /api/task/{id}/modify` |
| `task add "<desc>" …` puis `task +LATEST export` | `POST /api/task/add` |
| `task <uuid> export`, `modify proposed_scheduled:` | `TWTask.py` |
| filtre composé `pool:"X" and status.not:"completed" and \( scheduled.not: or proposed_scheduled.not: \)` | `twplanner.py:145` |

**UDA requis dans le `taskrc`** (définition de référence : `example_taskrc.txt`) :
`estTime` (duration), `proposed_scheduled` (date), `pool` (string), `assignee` (string).
Également nécessaires : `urgency.inherit=on`, `urgency.blocked/blocking.coefficient`,
`urgency.user.tag.{committed,commit,rapide}=2`, contextes `pro`/`perso`.
Sans ces UDA, les requêtes de `twplanner.py` échouent ou renvoient des résultats faux.

### Points de fragilité vérifiés

- `shell=True` passe par **cmd.exe sur Windows**, pas bash. Ça fonctionne parce que les
  descriptions sont entourées de guillemets **doubles** (`main_fastapi.py:323`). Ne jamais
  passer aux guillemets simples : cmd.exe ne les interprète pas comme des délimiteurs.
- Le filtre composé de `twplanner.py` se comporte identiquement sous Windows, parenthèses
  échappées (`\(`) ou non.
- **`estTime` n'accepte pas `1h30`** (rejeté, code retour 2). Formats valides : `90min`,
  `1.5h`, `PT1H30M`. `POST /api/task/add` transmet la valeur brute sans validation. L'API
  renvoie bien `success: false` avec le message d'erreur de Taskwarrior, et
  `calendar-planner.js` le propage — mais son affichage à l'écran n'a pas été vérifié.
  Validation d'entrée toujours absente : défaut connu, non corrigé.
- **Non-ASCII sous Windows : deux défauts corrigés le 2026-09-18.** `task.exe` corrompt les
  accents passés dans ses **arguments** (vérifié : identique avec `shell=True`, `shell=False`,
  PowerShell natif et `chcp 65001` ; seul `task import` depuis un fichier UTF-8 y survit) ;
  et `run_task_command` décodait la sortie avec l'encodage local (`cp1252`) au lieu d'UTF-8.
  Corrigés respectivement par `repair_text_fields()` et par `encoding='utf-8'`.
  Ne concerne que **dev-pc** : sous Linux `argv` gère l'UTF-8, et les correctifs y sont
  inertes. **Non validé sur staging** (Taskwarrior 3.3.0) — obligatoire avant prod, cf. §4.
  Détail : `openspec/changes/fix-nonascii-argv-windows/`.

---

## 6. Conventions

- Python : PEP 8, pas de linter configuré.
- JS : ES6+, vanilla, aucune étape de build. Ne pas introduire de bundler sans discussion.
- Frontend découpé par écran : `main.js` / `calendar-planner.js`, plus les composants
  `task-card.js` et `task-editor.js` avec leurs CSS et templates HTML dédiés.
  L'écran `day-planner` a été supprimé le 2026-09-18, remplacé par `calendar-planner`.
- `openspec/changes/` documente les changements structurants ; consulter `archive/` pour
  l'historique des migrations avant de proposer une refonte.

---

## 7. Avertissement sur la documentation existante

`README.md` et `PROJECT_MEMORY.md` **sont périmés sur un point central** : ils décrivent Flask
(`app.py`) sur le port 5000 comme le backend du projet, alors que la migration vers FastAPI a
été faite (cf. `openspec/changes/archive/2026-08-07-migrate-to-fastapi/`). `PROJECT_MEMORY.md`
reste utile pour les UDA et la cartographie du frontend. En cas de contradiction avec le
présent fichier, **AGENTS.md fait foi**.

---

## 8. Historique des décisions

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

### Reste à faire

- créer le remote git et cloner proprement sur le PC
- `deploy.sh` sur le téléphone : `git fetch`, tests staging, puis avance de prod si vert
- script de seed de la base staging
- étendre `.gitignore` (ne couvre pas encore un `taskrc` local)
- envisager d'aligner les versions de Taskwarrior entre PC et téléphone
