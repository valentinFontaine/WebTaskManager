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

### Chemins réels sur le téléphone — vérifiés le 2026-09-21

Le tableau ci-dessus décrit une **cible**. L'état effectif en diffère, et c'est important :

| | Chemin réel | État |
|---|---|---|
| clone de prod | `~/phone-sync-projects/WebTaskManager` | existe, sert la prod sur le port 1875 |
| clone de staging | `~/phone-sync-projects/WebTaskManager-staging` | **n'existe pas encore** — créé par `seed-staging.sh` |
| taskrc de staging | `~/taskwarrior-staging/taskrc` | existe, UDA complets |
| données de staging | `~/.task-staging` | existe |
| données de prod | `~/.task` | **ne jamais y toucher** |

**Il n'y a à ce jour qu'un seul clone sur le téléphone, et c'est celui de la prod.** La
séparation staging/prod est une cible, pas l'état courant : tant que `seed-staging.sh` n'a
pas tourné, valider et déployer se feraient au même endroit, ce qui vide l'étage staging de
son sens.

Autres faits constatés le 2026-09-21, à ne pas redécouvrir :

- `rsync` et `jq` sont **absents** de Termux. `python`, `node`, `npm`, `git`, `curl` sont là.
- Le remote est en **SSH** côté téléphone, en **HTTPS** côté PC.
- Aucun service ni `~/.termux/boot` : le lancement de l'application est **manuel**.
- Les port-forwards adb (`tcp:8022` pour ssh, `tcp:1875` pour la prod) **sautent** à chaque
  reconnexion du téléphone ou redémarrage du serveur adb. Un téléphone qui semble injoignable
  est le plus souvent un forward tombé : `adb devices`, `adb forward --list`, puis les
  remonter.

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
| `PW_BASE_URL` | cible complète (ex. `http://localhost:8765`, staging du téléphone via adb) |
| `PW_PORT` | port seul, si l'hôte reste localhost |
| `PW_NO_SERVER=1` | ne pas démarrer de backend local (serveur déjà lancé) |
| `PW_CIBLE_PROD=1` | lever le refus de viser le port de production — voir l'avertissement ci-dessous |
| `PW_SERVER_CMD` | commande de démarrage alternative |

> **Le port 1875 du téléphone sert la PRODUCTION.** Une version antérieure de ce fichier
> donnait `PW_BASE_URL=http://localhost:1875 npm test` comme la façon de tester le téléphone.
> C'était dangereux : les tests créent, modifient et suppriment de vraies tâches, dans la base
> `~/.task` synchronisée par Syncthing sur trois machines.
>
> Le garde-fou `TASKRC` ne couvrait pas ce cas, et ne pouvait pas le couvrir : il est
> conditionné au démarrage d'un backend local, et surtout, **quand le backend tourne ailleurs,
> c'est l'environnement du serveur qui décide de la base touchée**. Un `TASKRC` posé côté
> client n'est jamais lu par le processus qui écrit.
>
> `playwright.config.js` **refuse** désormais toute cible sur le port 1875, sauf
> `PW_CIBLE_PROD=1` posé en connaissance de cause. Pour tester le téléphone, viser son
> serveur de staging :
>
> ```bash
> adb forward tcp:8765 tcp:8765
> PW_NO_SERVER=1 PW_BASE_URL=http://localhost:8765 npm test
> ```

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
3. **staging sur téléphone** — mêmes tests sur `~/.task-staging`. **Non facultatif** : le PC tourne
   sur le fork wilt00 (nightly build `3.5.0.6`), qui n'est pas le même binaire que l'amont
   sur le téléphone, même à version équivalente. Seul l'étage staging valide le comportement réel.

Prod ne reçoit qu'un `git pull` + redémarrage, jamais de test.

### Règle : tout bug corrigé laisse un test derrière lui

**Aucune correction de bug n'est complète sans un test qui échoue avant elle et passe
après.** Écrire le test *d'abord* : un test qui n'a jamais rougi ne prouve rien.

Cinq exigences, apprises en se faisant avoir sur chacune :

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
4. **Compter les tests exécutés, pas seulement les verts.** En mode `serial`, le premier
   échec fait *sauter* tous les tests suivants du bloc : ils n'apparaissent alors ni en
   vert ni en rouge, et un `10 passed` masquait quatre tests qui n'avaient jamais tourné.
   Le mode `serial` se déclare dans le `describe` qui en a besoin — jamais au niveau du
   fichier, où il contamine tout ce qui suit.
5. **Ce qui écrit dans la vraie base ne se parallélise pas.** Le backend sérialise ses
   sous-processus Taskwarrior, et la base de dev est unique : deux tests qui créent des
   tâches en même temps se disputent les deux. Le plus lourd dépassait son délai une fois
   sur trois. D'où `fullyParallel: false` et un seul bloc `mode: 'parallel'`, réservé aux
   tests entièrement stubbés — ceux-là n'ont rien à se disputer.

Les tests Playwright tournent sous Chromium uniquement. Plusieurs bugs remontés l'ont été
depuis Firefox, dont les messages d'erreur diffèrent : un vert ici ne couvre pas tout.

---

## 5. Surface Taskwarrior utilisée

Tout passe par `run_task_command()` (`main_fastapi.py`), qui appelle
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

**UDA requis dans le `taskrc`** (définition de référence : `example_taskrc.txt`) :
`estTime` (duration), `proposed_scheduled` (date), `assignee` (string).
L'UDA `pool` a été supprimée le 2026-09-21 : aucune des 277 tâches en attente de la
production ne la portait, et le code qui la lisait était injoignable. Le contexte
TaskWarrior porte seul cette information. `proposed_scheduled` n'a plus non plus ni
lecteur ni auteur depuis la suppression de `TWTask.py` — à trancher séparément.
Également nécessaires : `urgency.inherit=on`, `urgency.blocked/blocking.coefficient`,
`urgency.user.tag.{committed,commit,rapide}=2`, contextes `pro`/`perso`.
Sans ces UDA, les requêtes de `twplanner.py` échouent ou renvoient des résultats faux.

### Points de fragilité vérifiés

- `shell=True` passe par **cmd.exe sur Windows**, pas bash. Ça fonctionne parce que les
  descriptions sont entourées de guillemets **doubles** (`main_fastapi.py`, fonction `add_task()`).
  Ne jamais passer aux guillemets simples : cmd.exe ne les interprète pas comme des délimiteurs.
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
  inertes. **Non validé sur staging** — obligatoire avant prod (cf. §4, l'étage staging teste
  le binaire de prod). Détail : `openspec/changes/fix-nonascii-argv-windows/`.

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

## 7. Déployer sur le téléphone

Deux scripts, à exécuter **sur le téléphone** sous Termux. Ils remplacent une procédure écrite
qui dépendait de la vigilance humaine à chaque passage — le mode de défaillance que le garde-fou
`TASKRC` élimine côté tests.

| Script | Rôle | Fréquence |
|---|---|---|
| `seed-staging.sh` | bootstrap : crée le clone de staging, son venv, son taskrc, et sème un jeu de tâches | une fois, puis à chaque évolution du jeu de seed |
| `deploy.sh` | valide sur staging, puis avance la prod si tout est vert | à chaque déploiement |

```bash
./seed-staging.sh          # bootstrap
./deploy.sh --dry-run      # tout sauf l'étape prod
./deploy.sh                # pipeline complet
```

### Pourquoi deux scripts et pas un

`deploy.sh` **refuse de tourner** si le clone de staging est absent, et renvoie vers
`seed-staging.sh`. Un `git clone` est un bootstrap unique, dépendant du réseau, qui peut échouer
à moitié ; l'intégrer à `deploy.sh` ferait que le tout premier passage — celui qui compte le
plus — emprunterait un chemin qu'aucun passage suivant n'emprunte jamais.

### Ce que valide réellement l'étage staging

**Playwright ne peut pas tourner sur Termux.** Ce n'est pas une question d'installation :
`playwright-core` lève `Error: Unsupported platform: android` avant même de chercher un
navigateur, et il n'y a pas de chromium système. Vérifié le 2026-09-21.

L'étage staging valide donc ce que lui seul peut valider — **le binaire Taskwarrior 3.5.0 amont
à travers la vraie API** — et non la couche navigateur, qui est identique sur PC et téléphone et
reste couverte par l'étage dev-pc. Concrètement, `deploy.sh` enchaîne :

1. refus si Syncthing tourne ;
2. refus si le clone de staging manque, ou si son arbre de travail est sale ;
3. mise à jour du clone de staging sur `master` ;
4. `pytest` (mocké) dans le venv de staging ;
5. un uvicorn de staging sur **:8765** avec `TASKRC` sur `~/taskwarrior-staging/taskrc`, puis
   `tools/staging-smoke.py` — appels HTTP réels contre la base de staging, y compris une
   description accentuée relue après écriture et un `estTime` invalide qui doit être refusé
   proprement plutôt que de produire un 500. Le serveur est arrêté par un `trap`, y compris en
   cas d'échec ;
6. seulement si tout est vert : `git pull` dans le clone de prod, redémarrage sur **:1875**,
   et vérification que la prod répond.

Pour lancer Playwright contre ce serveur de staging depuis le PC :

```bash
adb forward tcp:8765 tcp:8765
PW_NO_SERVER=1 PW_BASE_URL=http://localhost:8765 npm test
```

### Pièges du téléphone, vérifiés le 2026-09-21

- **Pas de credential GitHub utilisable sans interaction.** `~/.ssh/id_ed25519` est protégé par
  une phrase de passe et aucun agent ne tourne : `git clone git@github.com:…` échoue en
  `Permission denied (publickey)`. Le dépôt étant public et le déploiement en **lecture seule**,
  les deux scripts passent par l'URL **HTTPS anonyme** (`WTM_REPO_URL` pour la surcharger), avec
  `GIT_TERMINAL_PROMPT=0` pour qu'aucune invite ne puisse les bloquer. Si le dépôt devient privé,
  il faudra un credential non interactif.
- **`rc.confirmation=off` ne suffit pas pour une modification en lot.** Taskwarrior redemande
  alors tâche par tâche, ne lit rien sur une entrée non interactive, et annonce
  « Deleted 0 tasks » avec un code de retour **nul**. `rc.bulk=0` est obligatoire — sans lui, la
  purge de `seed-staging.sh` ne purgeait rien et le script accumulait des doublons à chaque
  passage.
- **`pgrep -x` ne suffit pas à détecter Syncthing.** Vérifié le 2026-09-21 : un processus dont
  `/proc/<pid>/comm` vaut exactement `syncthing` n'est trouvé ni par `pgrep -x syncthing` ni par
  `pgrep syncthing`, alors que `pidof syncthing` et `pgrep -f syncthing` le trouvent tous les
  deux — et que `pgrep -x bash` ou `pgrep -x sleep` fonctionnent normalement sur la même machine.
  La cause n'est pas établie. Les deux scripts combinent donc `pidof`, `pgrep -x` et
  `pgrep -f '[s]yncthing'` : on ne fait pas reposer la protection des données de prod sur une
  seule commande dont on a constaté qu'elle pouvait manquer sa cible.

- **`pydantic-core` n'a pas de roue pour Android/aarch64** : pip le compile, et maturin s'arrête
  sur « Failed to determine Android API level ». D'où `ANDROID_API_LEVEL=24` posé par
  `seed-staging.sh`. La compilation est longue.
- **Fins de ligne.** `core.autocrlf=true` sur le PC : les copies sur disque ont des CR, les blobs
  git sont propres. `.gitattributes` fixe `*.sh text eol=lf` pour que la garantie ne dépende plus
  de la configuration git locale — un `.sh` en CRLF échoue sous Termux en `bad interpreter`.

---

## 8. Avertissement sur la documentation existante

`README.md` et `PROJECT_MEMORY.md` **sont périmés sur un point central** : ils décrivent Flask
(`app.py`) sur le port 5000 comme le backend du projet, alors que la migration vers FastAPI a
été faite (cf. `openspec/changes/archive/2026-08-07-migrate-to-fastapi/`). `PROJECT_MEMORY.md`
reste utile pour les UDA et la cartographie du frontend. En cas de contradiction avec le
présent fichier, **AGENTS.md fait foi**.

---

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
