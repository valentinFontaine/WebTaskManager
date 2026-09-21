#!/data/data/com.termux/files/usr/bin/bash
# seed-staging.sh — bootstrap unique de l'etage staging (Termux).
#
# Idempotent : relancable sans dupliquer ni detruire. Ce script :
#   1. refuse de tourner si Syncthing tourne (garde-fou donnees) ;
#   2. cree/verifie ~/.task-staging et ~/taskwarrior-staging/taskrc ;
#   3. cree/verifie le clone ~/phone-sync-projects/WebTaskManager-staging ;
#   4. y installe un venv Python ;
#   5. y seme un jeu de taches de test tague +seed.
#
# Toutes les commandes `task` de ce script passent par TASKRC=le taskrc de
# staging, jamais par la base de prod (~/.task). Voir AGENTS.md §3.

set -euo pipefail

STAGING_HOME="$HOME"
STAGING_TASK_DATA="$STAGING_HOME/.task-staging"
STAGING_TASKRC_DIR="$STAGING_HOME/taskwarrior-staging"
STAGING_TASKRC="$STAGING_TASKRC_DIR/taskrc"
STAGING_CLONE="$STAGING_HOME/phone-sync-projects/WebTaskManager-staging"
PROD_CLONE="$STAGING_HOME/phone-sync-projects/WebTaskManager"

# Origine du code. HTTPS et non l'URL SSH du clone de prod : le telephone n'a
# pas de credential GitHub utilisable sans interaction (la cle ~/.ssh/id_ed25519
# est protegee par une phrase de passe et aucun agent ne tourne -- verifie le
# 2026-09-21, `git clone git@github.com:...` echoue en "Permission denied").
# Le deploiement ne fait que LIRE : sur un depot public, HTTPS anonyme suffit.
REPO_URL="${WTM_REPO_URL:-https://github.com/valentinFontaine/WebTaskManager.git}"

# Aucun script ne doit se bloquer sur une invite de mot de passe.
export GIT_TERMINAL_PROMPT=0
export GIT_SSH_COMMAND="${GIT_SSH_COMMAND:-ssh -o BatchMode=yes}"

# `pydantic-core` n'a pas de roue pour Android/aarch64 : pip le compile, et
# maturin s'arrete alors sur « Failed to determine Android API level ».
# Verifie le 2026-09-21 : sans cette variable, `pip install -r requirements.txt`
# echoue systematiquement dans un venv neuf sous Termux.
export ANDROID_API_LEVEL="${ANDROID_API_LEVEL:-24}"

# Racine du depot dans lequel ce script vit (le clone de prod, en pratique) :
# c'est de la qu'on lit example_taskrc.txt et requirements.txt de reference.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

log()  { echo "==> $*"; }
warn() { echo "!!  $*" >&2; }
die()  { echo "ERREUR : $*" >&2; exit 1; }

# ----------------------------------------------------------------------
# 1. Garde-fou Syncthing
# ----------------------------------------------------------------------

# Detection de Syncthing. Trois methodes, et non `pgrep -x` seul : verifie sur
# ce telephone le 2026-09-21, `pgrep -x syncthing` ne detecte PAS un processus
# dont /proc/<pid>/comm vaut pourtant exactement « syncthing », alors que
# `pidof` et `pgrep -f` le trouvent tous les deux -- et que `pgrep -x bash` ou
# `pgrep -x sleep` fonctionnent normalement. La cause exacte n'est pas
# etablie ; ce qui est etabli, c'est qu'on ne peut pas faire reposer la
# protection des donnees sur cette seule commande.
#
# Le motif `[s]yncthing` evite que la recherche ne se trouve elle-meme dans la
# ligne de commande du `pgrep -f`.
syncthing_tourne() {
    pidof syncthing            >/dev/null 2>&1 && return 0
    pgrep -x syncthing         >/dev/null 2>&1 && return 0
    pgrep -f '[s]yncthing'     >/dev/null 2>&1 && return 0
    return 1
}

if syncthing_tourne; then
    die "Syncthing tourne. Arrete-le toi-meme avant de continuer (ce script ne le tue pas) : le seed va ecrire dans une base qui doit rester hors de son perimetre de synchronisation, et une course avec Syncthing pendant le seed n'est pas quelque chose que ce script peut garantir sans risque."
fi
log "Syncthing n'est pas actif : on continue."

# ----------------------------------------------------------------------
# 2. Base et taskrc de staging
# ----------------------------------------------------------------------
CREATED_TASK_DATA=0
if [ ! -d "$STAGING_TASK_DATA" ]; then
    mkdir -p "$STAGING_TASK_DATA"
    CREATED_TASK_DATA=1
    log "Cree $STAGING_TASK_DATA"
else
    log "$STAGING_TASK_DATA existe deja"
fi

CREATED_TASKRC=0
if [ ! -f "$STAGING_TASKRC" ]; then
    [ -f "$SCRIPT_DIR/example_taskrc.txt" ] || die "example_taskrc.txt introuvable dans $SCRIPT_DIR : impossible de deriver le taskrc de staging."
    mkdir -p "$STAGING_TASKRC_DIR"
    sed 's#^data\.location=~/\.task$#data.location=~/.task-staging#' \
        "$SCRIPT_DIR/example_taskrc.txt" > "$STAGING_TASKRC"
    CREATED_TASKRC=1
    log "Cree $STAGING_TASKRC a partir de example_taskrc.txt"
else
    log "$STAGING_TASKRC existe deja : verification au lieu d'ecrasement."
fi

export TASKRC="$STAGING_TASKRC"
export TASKDATA="$STAGING_TASK_DATA"

# `task _show` dumpe la config effective telle que Taskwarrior l'a resolue :
# plus fiable qu'un grep du fichier, qui ne verifie pas que le fichier est
# valide ni que rien ne le surcharge (variables d'environnement, includes).
TW_SHOW="$(task _show 2>/dev/null || true)"
[ -n "$TW_SHOW" ] || die "'task _show' n'a rien renvoye avec TASKRC=$STAGING_TASKRC. Le taskrc est-il valide ?"

DATA_LOCATION_LINE="$(printf '%s\n' "$TW_SHOW" | grep -E '^data\.location=' || true)"
case "$DATA_LOCATION_LINE" in
    *task-staging*) ;;
    *)
        die "GARDE-FOU : data.location dans $STAGING_TASKRC ne pointe pas sur une base *-staging (trouve : '$DATA_LOCATION_LINE'). Abandon immediat pour ne pas semer dans la prod (~/.task). Corrige le taskrc a la main et relance."
        ;;
esac
log "data.location verifie : pointe bien sur une base de staging ($DATA_LOCATION_LINE)"

# ----------------------------------------------------------------------
# UDA requis (voir AGENTS.md §5 / §3) : ajoutes s'ils manquent.
# ----------------------------------------------------------------------
declare -A REQUIRED_UDA_TYPE=(
    [estTime]="duration"
    [proposed_scheduled]="date"
    [pool]="string"
    [assignee]="string"
    [state]="string"
)
declare -A REQUIRED_UDA_LABEL=(
    [estTime]="estimateTime"
    [proposed_scheduled]="propScheduled"
    [pool]="pool"
    [assignee]="Assignee"
    [state]="State"
)

ADDED_UDA=()
for uda in estTime proposed_scheduled pool assignee state; do
    if ! printf '%s\n' "$TW_SHOW" | grep -q "^uda\.${uda}\.type="; then
        {
            echo ""
            echo "uda.${uda}.type=${REQUIRED_UDA_TYPE[$uda]}"
            echo "uda.${uda}.label=${REQUIRED_UDA_LABEL[$uda]}"
        } >> "$STAGING_TASKRC"
        ADDED_UDA+=("$uda")
    fi
done

if [ "${#ADDED_UDA[@]}" -gt 0 ]; then
    log "UDA manquants ajoutes a $STAGING_TASKRC : ${ADDED_UDA[*]}"
    # Rafraichir TW_SHOW apres modification du taskrc.
    TW_SHOW="$(task _show 2>/dev/null || true)"
else
    log "Tous les UDA requis (estTime, proposed_scheduled, pool, assignee, state) sont deja presents."
fi

# ----------------------------------------------------------------------
# 3-4. Clone de staging + venv
# ----------------------------------------------------------------------
CREATED_CLONE=0
if [ ! -d "$STAGING_CLONE" ]; then
    mkdir -p "$(dirname "$STAGING_CLONE")"
    git clone "$REPO_URL" "$STAGING_CLONE"         || die "Clone impossible depuis $REPO_URL. Si le depot est devenu prive, passe une URL utilisable sans interaction : WTM_REPO_URL=... ./seed-staging.sh"
    CREATED_CLONE=1
    log "Clone de staging cree depuis $REPO_URL"
else
    log "$STAGING_CLONE existe deja."
fi

CREATED_VENV=0
if [ ! -x "$STAGING_CLONE/venv/bin/python" ]; then
    ( cd "$STAGING_CLONE" && python -m venv venv )
    CREATED_VENV=1
    log "venv Python cree dans $STAGING_CLONE/venv"
fi

# On teste l'UTILISABILITE du venv, pas la presence du repertoire. Un venv a
# moitie construit -- le cas normal quand `pip install` echoue en cours de
# route, ce qui arrive ici des que pydantic-core doit se compiler -- laisse un
# repertoire parfaitement present et parfaitement inutilisable. Une condition
# sur `[ -d venv ]` considerait ce venv-la comme fini et ne reinstallait
# jamais rien ; l'echec ne se voyait qu'a l'etape 4 de deploy.sh.
venv_complet() {
    [ -x "$STAGING_CLONE/venv/bin/pytest" ]         && "$STAGING_CLONE/venv/bin/python" -c 'import fastapi, uvicorn' >/dev/null 2>&1
}

if venv_complet; then
    log "venv de staging deja complet (fastapi + pytest) : rien a reinstaller."
else
    log "venv de staging incomplet : (re)installation des dependances."
    [ -f "$STAGING_CLONE/requirements.txt" ]         || die "requirements.txt absent de $STAGING_CLONE."
    ( cd "$STAGING_CLONE" && ./venv/bin/pip install --quiet -r requirements.txt )         || die "Installation de requirements.txt echouee. Si maturin se plaint de l'Android API level, ANDROID_API_LEVEL est deja pose par ce script : regarde plutot la chaine Rust."
    log "Dependances installees depuis requirements.txt"
    # requirements-dev.txt porte pytest, dont deploy.sh a besoin a l'etape 4.
    if [ -f "$STAGING_CLONE/requirements-dev.txt" ]; then
        ( cd "$STAGING_CLONE" && ./venv/bin/pip install --quiet -r requirements-dev.txt )             || die "Installation de requirements-dev.txt echouee."
        log "Dependances de dev installees depuis requirements-dev.txt"
    fi
    venv_complet || die "Le venv de staging reste incomplet apres installation (fastapi ou pytest manquant)."
fi
# Pas de node_modules : Playwright est inutilisable sur Termux (cf. consigne).

# ----------------------------------------------------------------------
# 5. Jeu de taches de test, tague +seed, idempotent
# ----------------------------------------------------------------------
# Choix : on SUPPRIME d'abord les taches +seed existantes puis on reinjecte,
# plutot que de detecter et sauter. Raison : le jeu de seed peut evoluer (ce
# script change avec twplanner.py/TWCalendar.py) et un "si +seed existe deja,
# ne rien faire" figerait silencieusement un vieux jeu de donnees perime a la
# premiere modification de ce fichier. Purger-et-reinjecter cout un peu plus
# cher mais reste toujours a jour et reste idempotent (memes UUID de sortie
# a chaque run, memes proprietes).
EXISTING_SEED_COUNT="$(task rc.confirmation=off +seed _ids 2>/dev/null | wc -w | tr -d ' ')"
if [ "${EXISTING_SEED_COUNT:-0}" -gt 0 ]; then
    log "Suppression de $EXISTING_SEED_COUNT tache(s) +seed existante(s) avant reinjection."
    # `rc.bulk=0` est INDISPENSABLE, et pas une precaution : verifie sur
    # Taskwarrior 3.5.0 le 2026-09-21, `rc.confirmation=off` seul ne couvre pas
    # la confirmation *de lot*. Taskwarrior redemande alors tache par tache, ne
    # lit rien sur une entree non interactive, et annonce « Deleted 0 tasks »
    # avec un code de retour nul. Sans ce reglage, la purge ne purge rien et ce
    # script accumule des doublons a chaque passage.
    task rc.confirmation=off rc.bulk=0 +seed delete >/dev/null
    # `delete` change juste le statut ; on purge pour de bon afin qu'un futur
    # `task export` ne montre pas d'anciennes taches +seed "deleted".
    task rc.confirmation=off rc.bulk=0 +seed purge >/dev/null 2>&1 || true
fi

log "Injection du jeu de taches +seed."

# Couverture visee (cf. twplanner.py, TWCalendar.py, calendar-planner.js) :
#  - pool:pro et pool:perso
#  - avec et sans estTime (formats valides : 90min, 1.5h -- jamais 1h30)
#  - avec proposed_scheduled, avec scheduled, et sans aucun des deux
#  - avec due
#  - une paire avec depends:
#  - tags d'urgency perso : committed, commit, rapide
#  - tags de contexte : +pro, +perso
#  - un projet hierarchique (Maison.Cuisine)
#  - une description accentuee

task rc.confirmation=off add +seed +pro \
    project:Maison.Cuisine pool:pro estTime:90min \
    due:tomorrow+9h \
    "Ranger le tiroir a couverts" >/dev/null

task rc.confirmation=off add +seed +pro +committed \
    project:Maison.Cuisine pool:pro estTime:1.5h \
    scheduled:tomorrow+14h \
    "Réparer le robinet de la cuisine" >/dev/null

task rc.confirmation=off add +seed +perso +rapide \
    project:Perso pool:perso \
    "Appeler le dentiste" >/dev/null

task rc.confirmation=off add +seed +perso +commit \
    project:Perso pool:perso estTime:45min \
    proposed_scheduled:tomorrow+18h30 \
    "Préparer le sac de sport" >/dev/null

task rc.confirmation=off add +seed +pro \
    project:Maison pool:pro estTime:2h \
    "Tâche sans aucune date planifiée" >/dev/null

# Paire avec dependance : la premiere doit exister avant qu'on puisse la
# referencer par UUID dans depends: de la seconde.
task rc.confirmation=off add +seed +pro \
    project:Maison.Cuisine pool:pro estTime:1h \
    "Commander la pièce de rechange" >/dev/null
UUID_DEP_PARENT="$(task +LATEST +seed _uuid)"

task rc.confirmation=off add +seed +pro \
    project:Maison.Cuisine pool:pro estTime:30min \
    "depends:$UUID_DEP_PARENT" \
    "Installer la pièce reçue" >/dev/null

SEED_COUNT="$(task rc.confirmation=off +seed _ids 2>/dev/null | wc -w | tr -d ' ')"

# ----------------------------------------------------------------------
# Resume
# ----------------------------------------------------------------------
echo ""
echo "===== Resume seed-staging.sh ====="
if [ "$CREATED_TASK_DATA" -eq 1 ]; then echo "- ~/.task-staging : CREE"; else echo "- ~/.task-staging : deja present"; fi
if [ "$CREATED_TASKRC" -eq 1 ]; then echo "- taskrc de staging : CREE ($STAGING_TASKRC)"; else echo "- taskrc de staging : deja present ($STAGING_TASKRC)"; fi
if [ "${#ADDED_UDA[@]}" -gt 0 ]; then echo "- UDA ajoutes : ${ADDED_UDA[*]}"; else echo "- UDA : tous deja presents"; fi
if [ "$CREATED_CLONE" -eq 1 ]; then echo "- Clone staging : CREE ($STAGING_CLONE)"; else echo "- Clone staging : deja present ($STAGING_CLONE)"; fi
if [ "$CREATED_VENV" -eq 1 ]; then echo "- venv staging : CREE"; else echo "- venv staging : deja present"; fi
venv_complet && echo "- venv staging : complet (fastapi + pytest verifies)"
echo "- Taches +seed presentes : $SEED_COUNT"
echo "==================================="
