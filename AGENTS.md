# AGENTS.md — WebTaskManager

Instructions opérationnelles pour un agent travaillant sur ce dépôt.
À lire avant toute modification. Complète `PROJECT_MEMORY.md` (voir l'avertissement en fin de fichier).

## À ne pas découvrir en cours de route

- **Jamais de commande Taskwarrior (`task`, tests, seed, exploration) sans `TASKRC` ou `TASKDATA`
  sur une base jetable** (`taskwarrior-dev`, `taskwarrior-test`, répertoire temporaire). Le
  backend écrit dans les vraies tâches. Voir §3.
- **Depuis le 2026-09-29, ce PC est un pair de prod** : `C:/Users/irpaui/taskwarrior-prod`, base
  synchronisée par Syncthing (PC Windows, PC Arch, téléphone une fois réparé). Ne jamais la lire
  ni la viser. Voir §2.
- **Ne jamais tuer un processus qu'on n'a pas lancé** (pas de `taskkill /IM python.exe`), ni
  lancer un serveur de test sur le port occupé par la prod (**1875** sur le PC comme sur le téléphone).
- **Ne jamais modifier le worktree `../WebTaskManager-prod`** : on développe ici, la prod reçoit un
  `git merge master` sur demande de l'utilisateur.
- `README.md` et `PROJECT_MEMORY.md` sont **périmés** (ils décrivent Flask sur :5000) ; le backend
  actuel est **FastAPI sur :8000**. Voir §8.

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

- **prod-pc** = `C:/Users/irpaui/taskwarrior-prod`, usage quotidien réel depuis le 2026-09-29 : ne jamais y toucher.
  La prod est une base Syncthing à trois pairs (PC Windows, PC Arch, téléphone à sa réparation).
- Bases jetables sur ce PC : **dev-pc** `taskwarrior-dev`, **test-pc** `taskwarrior-test` (rechargée par
  `outils/recharger-base-test.py`).
- Le PC tourne sur le fork wilt00 `3.5.0.6` (*nightly*), pas sur l'amont `3.5.0` du téléphone : un test vert
  ici ne prouve rien sur le binaire de prod.
- Le code circule par git, les données par Syncthing (jamais par le dépôt). Le serveur de prod du PC peut
  tourner pendant qu'on développe.
- **Serveur de prod du PC** : worktree `../WebTaskManager-prod` (branche `prod`, son propre venv), lancé par
  `Webtaskmanager-prod.ps1` sur **:1875**. Mise à jour : `git merge master` dans ce worktree, puis
  redémarrage. Le dev se lance par `lancer-dev.ps1` (:8000, `taskwarrior-dev`).
- **Verrou** (`verifier_isolation_prod`, `main_fastapi.py`) : le backend refuse de démarrer sur
  `taskwarrior-prod` depuis tout autre dossier que `WebTaskManager-prod`. Port et chemins : `WTM_PORT`,
  `WTM_BASE_PROD`, `WTM_DOSSIER_PROD` (`config.py`).

Détail : docs/topologie-environnements.md — à lire seulement si on touche à Syncthing, aux chemins du
téléphone, ou si l'on prépare l'entrée d'un pair dans le cercle de prod.

---

## 3. Règle absolue : isolation des données

**Ne jamais exécuter de test, de seed ou de commande exploratoire sans `TASKRC` ou `TASKDATA`
explicitement positionné sur une base jetable.**

```powershell
# PC
$env:TASKRC = 'C:/Users/irpaui/taskwarrior-dev/taskrc'
```

Sur le PC, **`C:/Users/irpaui/taskwarrior-prod` est la vraie base** : aucun test, aucun seed,
aucune commande exploratoire ne la vise, pas même en lecture. Bases jetables : `taskwarrior-dev`,
`taskwarrior-test`, ou un répertoire temporaire. Attention : `TASKDATA` hérité l'emporte sur le
`data.location` du taskrc ; vérifier la base effective avec
`task rc:<taskrc> _get rc.data.location`.

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

**UDA requis dans le `taskrc`** (définition de référence : `example_taskrc.txt`) :
`estTime` (duration), `assignee` (string).
Les UDA `pool` et `proposed_scheduled` ont été supprimées le 2026-09-21. Aucune des
277 tâches en attente de la production ne les portait, et le code qui les lisait était
injoignable depuis toute route. Le contexte TaskWarrior porte seul l'information que
`pool` recopiait à la main ; `proposed_scheduled` n'avait plus d'auteur depuis la
suppression de `TWTask.py`.

Pour les retirer d'un `taskrc` existant, il suffit d'en effacer les lignes `uda.pool.*`
et `uda.proposed_scheduled.*` : aucune tâche ne portant ces attributs, il n'y a rien à
migrer.
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

- Deux scripts, à exécuter **sur le téléphone** sous Termux : `seed-staging.sh` (bootstrap du staging, une
  fois) et `deploy.sh` (valide sur staging :8765 puis avance la prod :1875).
- `deploy.sh` refuse de tourner si Syncthing tourne, si le clone de staging manque ou s'il est sale.
- Playwright ne tourne pas sur Termux : le staging valide le binaire Taskwarrior amont, pas le navigateur.
- Rien de tout cela ne s'exécute depuis le PC.

Détail : docs/deploiement-telephone.md — à lire seulement si on modifie `deploy.sh` / `seed-staging.sh`
ou si l'on diagnostique un déploiement sur le téléphone.

---

## 8. Avertissement sur la documentation existante

`README.md` et `PROJECT_MEMORY.md` **sont périmés sur un point central** : ils décrivent Flask
(`app.py`) sur le port 5000 comme le backend du projet, alors que la migration vers FastAPI a
été faite (cf. `openspec/changes/archive/2026-08-07-migrate-to-fastapi/`). `PROJECT_MEMORY.md`
reste utile pour les UDA et la cartographie du frontend. En cas de contradiction avec le
présent fichier, **AGENTS.md fait foi**.

---

## 9. Historique des décisions

- 2026-09-18 : Taskwarrior natif sur le PC (fork wilt00 via Scoop), réécriture d'un backend Windows abandonnée.
- 2026-09-18 : modèle deux clones git + Syncthing pour les données ; `pull.ps1` abandonné.
- Reste à faire : lancer `seed-staging.sh` sur le téléphone (le clone de staging n'existe pas encore).

Détail : docs/decisions.md — à lire seulement avant de proposer une refonte de l'architecture de
déploiement ou de revenir sur le choix du fork natif.

---

## Où trouver quoi

| Fichier | Quand le lire |
|---|---|
| `docs/topologie-environnements.md` | Syncthing, chemins réels du téléphone, entrée d'un pair dans la prod, pièges de topologie |
| `docs/deploiement-telephone.md` | modifier ou diagnostiquer `deploy.sh` / `seed-staging.sh` |
| `docs/decisions.md` | avant de proposer une refonte ou de revenir sur une décision passée |
| `docs/metadata-taches-reference.md` | (préexistant) référence des métadonnées de tâches |
| `docs/fix_port_5000_in_use.md` | (préexistant) port 5000 déjà occupé (ancien backend Flask) |
