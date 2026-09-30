<!-- Extrait verbatim de AGENTS.md §2 (déplacé le 2026-09-30). -->

## 2. Topologie des environnements

> **Changement du 2026-09-29 : la prod est sur le PC Windows.** Le téléphone est cassé ; le PC
> sert désormais l'usage quotidien, sur la base `C:\Users\irpaui\taskwarrior-prod`
> (`taskrc` + `data/`). Ce PC détient donc de **vraies données** : c'est la base à ne jamais
> toucher depuis ici, au même titre que `~/.task` sur le téléphone.
>
> **La prod, ce sont trois pairs sur une même base synchronisée par Syncthing** : ce PC
> Windows, le PC perso (Arch Linux) et, une fois réparé, le téléphone. L'utilisateur lance
> l'application **sur la machine où il travaille** : il n'y a pas de serveur central, chaque
> pair sert sa propre copie de la base. Voir « Pièges de cette topologie » pour les préalables
> avant de reconnecter le téléphone.

Historiquement, le déploiement n'était pas un serveur : c'était un téléphone Android sous
Termux qui jouait le rôle de serveur, accessible depuis le PC de travail par un port-forward
adb. Cette description reste valable pour le téléphone quand il reviendra.

| Env | Machine | Taskwarrior | Données | Rôle |
|---|---|---|---|---|
| **dev-pc** | PC Windows | 3.5.0.6 (fork wilt00, *nightly*) | `C:\Users\irpaui\taskwarrior-dev` | itération et tests réels |
| **test-pc** | PC Windows | idem | `C:\Users\irpaui\taskwarrior-test` | base rechargée par le planificateur (`outils/recharger-base-test.py`) |
| **prod-pc** | PC Windows | idem | `C:\Users\irpaui\taskwarrior-prod` | **usage quotidien réel depuis le 2026-09-29** |
| **prod-arch** | PC perso Arch Linux | à relever | à relever | usage quotidien réel, pair Syncthing |
| **dev-tel** | Termux | 3.5.0 | base de dev dédiée | dev ponctuel depuis le téléphone (en panne) |
| **staging** | Termux | 3.5.0 | `~/.task-staging` | validation avant prod (en panne) |
| **prod-tel** | Termux | 3.5.0 | `~/.task` (Syncthing) | suspendue ; reviendra comme troisième pair |

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

- **Le PC Windows détient la prod depuis le 2026-09-29** (`C:\Users\irpaui\taskwarrior-prod`).
  Jusque-là il ne servait que de base de dev isolée ; ce n'est plus vrai. Conséquences :
  - un test, un seed ou une commande exploratoire lancés sans `TASKRC` jetable peuvent
    tomber sur la prod **locale**, pas seulement sur celle du téléphone ;
  - le serveur de prod du PC peut tourner pendant qu'on développe : ne jamais tuer un
    processus qu'on n'a pas lancé (jamais `taskkill /IM python.exe`), et ne pas lancer un
    serveur de test sur le port qu'il occupe. Le refus du port 1875 dans
    `playwright.config.js` protège le téléphone, **pas** le PC.
- **Trois pairs de prod par Syncthing : PC Windows, PC Arch, téléphone à sa réparation.**
  L'application se lance sur la machine où l'on travaille. Faire entrer (ou revenir)
  `taskwarrior-prod/data` dans le cercle Syncthing est un changement à instruire, pas à
  improviser. Préalables :
  - **aligner les binaires des trois pairs** : le PC Windows tourne sur le fork wilt00
    `3.5.0.6` (*nightly*), le téléphone sur l'amont `3.5.0`, la version du PC Arch reste à
    relever. Même numéro affiché, pas le même binaire : vérifier sur une **copie** que chacun
    relit la base écrite par les autres avant de synchroniser la vraie ;
  - suivre l'ordre de mise à jour ci-dessous (pause, sauvegarde, tous les pairs, reprise) ;
  - le `data/` actuel contient déjà trois `taskchampion.sync-conflict-*.sqlite3` (2025) :
    Syncthing ne fusionne pas une base SQLite, il la double. Deux pairs qui écrivent sans
    s'être synchronisés produiront de nouveaux conflits, et l'un des côtés sera perdu à la
    résolution : avant de travailler sur une machine, laisser Syncthing finir de la mettre à
    jour.
  - Constaté le 2026-09-29 : Syncthing ne tourne pas sur le PC.
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
