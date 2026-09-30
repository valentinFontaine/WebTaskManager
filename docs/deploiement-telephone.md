<!-- Extrait verbatim de AGENTS.md §7 (déplacé le 2026-09-30). -->

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
