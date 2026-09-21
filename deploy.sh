#!/data/data/com.termux/files/usr/bin/bash
# deploy.sh — pipeline de deploiement Termux : staging (pytest + smoke HTTP)
# puis, seulement si vert, avance de la prod (git pull + redemarrage :1875).
#
# Usage :
#   ./deploy.sh            # pipeline complet, y compris l'etape prod
#   ./deploy.sh --dry-run  # tout sauf l'etape prod (etape 6) -- pour valider
#                          # le script sans toucher a la prod
#
# Chaque etape s'arrete BRUYAMMENT au premier rouge, sans rien deployer.

set -euo pipefail

STAGING_HOME="$HOME"
STAGING_CLONE="$STAGING_HOME/phone-sync-projects/WebTaskManager-staging"
PROD_CLONE="$STAGING_HOME/phone-sync-projects/WebTaskManager"
STAGING_TASKRC="$STAGING_HOME/taskwarrior-staging/taskrc"
STAGING_PORT=8765
PROD_PORT=1875
PROD_LOG="$STAGING_HOME/webtaskmanager-prod.log"

# Origine du code. HTTPS et non l'URL SSH du clone de prod : le telephone n'a
# pas de credential GitHub utilisable sans interaction (la cle ~/.ssh/id_ed25519
# est protegee par une phrase de passe et aucun agent ne tourne -- verifie le
# 2026-09-21, `git clone git@github.com:...` echoue en "Permission denied").
# Le deploiement ne fait que LIRE : sur un depot public, HTTPS anonyme suffit.
REPO_URL="${WTM_REPO_URL:-https://github.com/valentinFontaine/WebTaskManager.git}"

# Aucun script ne doit se bloquer sur une invite de mot de passe.
export GIT_TERMINAL_PROMPT=0
export GIT_SSH_COMMAND="${GIT_SSH_COMMAND:-ssh -o BatchMode=yes}"
STAGING_WAIT_MAX_S=30

DRY_RUN=0
for arg in "$@"; do
    case "$arg" in
        --dry-run) DRY_RUN=1 ;;
        *) echo "ERREUR : argument inconnu '$arg'" >&2; exit 1 ;;
    esac
done
if [ "${DEPLOY_DRY_RUN:-0}" = "1" ]; then
    DRY_RUN=1
fi

STEP=""
fail() {
    echo "" >&2
    echo "XX ECHEC a l'etape : $STEP" >&2
    echo "XX $*" >&2
    exit 1
}
step() {
    STEP="$1"
    echo ""
    echo "==> [$STEP]"
}

# ----------------------------------------------------------------------
# Etape 1 : garde-fou Syncthing
# ----------------------------------------------------------------------
step "1. Verification Syncthing"
if pgrep -x syncthing >/dev/null 2>&1; then
    fail "Syncthing tourne. Ce script ecrit dans la base de staging et redemarre la prod : arrete Syncthing toi-meme avant de continuer."
fi
echo "Syncthing n'est pas actif."

# ----------------------------------------------------------------------
# Etape 2 : le clone de staging doit exister (bootstrap = seed-staging.sh)
# ----------------------------------------------------------------------
step "2. Verification du clone de staging"
if [ ! -d "$STAGING_CLONE/.git" ]; then
    fail "Clone de staging absent ($STAGING_CLONE). Lance d'abord ./seed-staging.sh : c'est lui qui bootstrap ce clone, une seule fois. deploy.sh ne le fait pas lui-meme -- deploy tourne a chaque deploiement et doit rester previsible, alors qu'un 'git clone' est une operation reseau qui peut echouer a moitie ; en faire un cas particulier de deploy ferait que le tout premier passage, celui qui compte le plus, emprunterait un chemin qu'aucun passage suivant n'emprunte jamais."
fi
[ -f "$STAGING_TASKRC" ] || fail "taskrc de staging absent ($STAGING_TASKRC). Lance ./seed-staging.sh."
echo "Clone de staging present : $STAGING_CLONE"

# ----------------------------------------------------------------------
# Etape 3 : mise a jour du clone de staging sur origin/master
# ----------------------------------------------------------------------
step "3. Mise a jour du clone de staging"
if [ -n "$(git -C "$STAGING_CLONE" status --porcelain)" ]; then
    fail "L'arbre de travail du clone de staging n'est pas propre (modifications locales/non suivies). On ne deploie pas par-dessus : nettoie ou commite dans $STAGING_CLONE."
fi
# On fetch par URL explicite plutot que par `origin` : le remote enregistre
# peut etre en SSH, inutilisable sans interaction sur ce telephone (cf. le
# commentaire sur REPO_URL plus haut).
git -C "$STAGING_CLONE" fetch "$REPO_URL" master     || fail "fetch impossible depuis $REPO_URL."
git -C "$STAGING_CLONE" checkout -B master FETCH_HEAD
echo "Staging aligne sur origin/master : $(git -C "$STAGING_CLONE" rev-parse --short HEAD)"

# ----------------------------------------------------------------------
# Etape 4 : pytest dans le clone de staging, avec son venv
# ----------------------------------------------------------------------
step "4. pytest (staging)"
STAGING_PY="$STAGING_CLONE/venv/bin/python"
STAGING_PYTEST="$STAGING_CLONE/venv/bin/pytest"
[ -x "$STAGING_PYTEST" ] || fail "pytest introuvable dans le venv de staging ($STAGING_PYTEST). Le venv a-t-il ete cree par seed-staging.sh avec requirements-dev.txt installe ?"
(
    cd "$STAGING_CLONE"
    TASKRC="$STAGING_TASKRC" "$STAGING_PYTEST"
) || fail "pytest a echoue dans le clone de staging."
echo "pytest vert."

# ----------------------------------------------------------------------
# Etape 5 : uvicorn de staging (:8765) + smoke test HTTP
# ----------------------------------------------------------------------
step "5. Smoke test HTTP contre uvicorn de staging (:$STAGING_PORT)"

STAGING_UVICORN_PID=""
stop_staging_server() {
    if [ -n "$STAGING_UVICORN_PID" ] && kill -0 "$STAGING_UVICORN_PID" 2>/dev/null; then
        echo "Arret du serveur de staging (pid $STAGING_UVICORN_PID)."
        kill "$STAGING_UVICORN_PID" 2>/dev/null || true
        wait "$STAGING_UVICORN_PID" 2>/dev/null || true
    fi
}
trap stop_staging_server EXIT

(
    cd "$STAGING_CLONE"
    TASKRC="$STAGING_TASKRC" DEVELOPER_MODE=false \
        "$STAGING_PY" -m uvicorn main_fastapi:app --host 127.0.0.1 --port "$STAGING_PORT" \
        >"$STAGING_HOME/webtaskmanager-staging.log" 2>&1 &
    echo $! > /tmp/deploy-staging-uvicorn.pid
)
STAGING_UVICORN_PID="$(cat /tmp/deploy-staging-uvicorn.pid)"
rm -f /tmp/deploy-staging-uvicorn.pid

echo "uvicorn de staging lance (pid $STAGING_UVICORN_PID), attente de la reponse (max ${STAGING_WAIT_MAX_S}s)..."
READY=0
for _ in $(seq 1 "$STAGING_WAIT_MAX_S"); do
    if ! kill -0 "$STAGING_UVICORN_PID" 2>/dev/null; then
        fail "uvicorn de staging s'est arrete tout seul avant de repondre. Voir $STAGING_HOME/webtaskmanager-staging.log"
    fi
    if curl -fsS -o /dev/null "http://127.0.0.1:$STAGING_PORT/api/config" 2>/dev/null; then
        READY=1
        break
    fi
    sleep 1
done
[ "$READY" -eq 1 ] || fail "uvicorn de staging n'a pas repondu sur :$STAGING_PORT en ${STAGING_WAIT_MAX_S}s. Voir $STAGING_HOME/webtaskmanager-staging.log"
echo "uvicorn de staging repond."

"$STAGING_PY" "$STAGING_CLONE/tools/staging-smoke.py" "http://127.0.0.1:$STAGING_PORT" \
    || fail "Le smoke test HTTP de staging a echoue."
echo "Smoke test de staging vert."

stop_staging_server
trap - EXIT
STAGING_UVICORN_PID=""

# ----------------------------------------------------------------------
# --dry-run s'arrete ici, sans toucher a la prod
# ----------------------------------------------------------------------
if [ "$DRY_RUN" -eq 1 ]; then
    echo ""
    echo "==> --dry-run : etape 6 (prod) sautee volontairement. Tout le reste est vert."
    exit 0
fi

# ----------------------------------------------------------------------
# Etape 6 : avance de la prod
# ----------------------------------------------------------------------
step "6. Deploiement en prod"
[ -d "$PROD_CLONE/.git" ] || fail "Clone de prod introuvable ($PROD_CLONE)."

if [ -n "$(git -C "$PROD_CLONE" status --porcelain)" ]; then
    fail "L'arbre de travail du clone de prod n'est pas propre. On ne 'git pull' pas par-dessus des modifications locales : nettoie $PROD_CLONE d'abord."
fi

git -C "$PROD_CLONE" pull --ff-only "$REPO_URL" master     || fail "git pull impossible sur le clone de prod depuis $REPO_URL."
echo "Prod mise a jour : $(git -C "$PROD_CLONE" rev-parse --short HEAD)"

# Tuer l'ancien process d'appli prod sur :1875, s'il y en a un. On cible le
# motif de la commande (uvicorn/main_fastapi), jamais un `pkill python` aveugle
# qui tuerait n'importe quel autre script python de l'utilisateur.
OLD_PIDS="$(pgrep -f 'uvicorn.*main_fastapi:app.*--port 1875' || true)"
if [ -n "$OLD_PIDS" ]; then
    echo "Arret de l'ancien process prod (pid(s) : $OLD_PIDS)."
    kill $OLD_PIDS
    sleep 2
fi

echo "Redemarrage de la prod sur :$PROD_PORT (log : $PROD_LOG)."
# La prod utilise sa base par defaut (~/.task) : pas de TASKRC positionne ici.
(
    cd "$PROD_CLONE"
    nohup ./venv/bin/python -m uvicorn main_fastapi:app --host 0.0.0.0 --port "$PROD_PORT" \
        >>"$PROD_LOG" 2>&1 &
    disown
)

echo "Verification que la prod repond (max ${STAGING_WAIT_MAX_S}s)..."
PROD_READY=0
for _ in $(seq 1 "$STAGING_WAIT_MAX_S"); do
    if curl -fsS -o /dev/null "http://127.0.0.1:$PROD_PORT/api/config" 2>/dev/null; then
        PROD_READY=1
        break
    fi
    sleep 1
done

if [ "$PROD_READY" -eq 1 ]; then
    echo ""
    echo "==> Deploiement termine : la prod repond sur :$PROD_PORT."
else
    echo "" >&2
    echo "XX Le deploiement a eu lieu (code a jour, redemarrage tente) MAIS LA PROD NE REPOND PAS sur :$PROD_PORT." >&2
    echo "XX Regarde $PROD_LOG pour comprendre pourquoi le process ne sert pas de reponse." >&2
    exit 1
fi
