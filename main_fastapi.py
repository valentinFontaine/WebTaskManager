#!/usr/bin/env python3
"""
TaskWarrior Web UI - FastAPI Backend Server
A modern FastAPI server to interface with TaskWarrior commands
"""

import subprocess
import json
import os
import re
import tempfile
import time
from datetime import datetime
from typing import List, Optional
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, FileResponse, Response
from pydantic import BaseModel

import plan_runner
import import_csv
from config import (
    DEVELOPER_MODE, DEBUG_FILE, TASK_TIMEOUT, KANBAN_COLUMNS,
    NOTIFICATION_TIMEOUT, CONTEXT_CACHE_TTL,
    PORT, BASE_PROD, DOSSIER_PROD,
)
from fastapi_models import TaskBase, TaskCreate, TaskModify, ResponseModel, CommandResult


# TW_WEB=1 signale aux hooks TaskWarrior qu'ils tournent dans un contexte web,
# donc sans terminal : un hook bien ecrit s'abstient alors de demander une saisie.
_TW_ENV = {**os.environ, 'TW_WEB': '1'}


def log_command(command):
    """Log the command to the debug file with a timestamp"""
    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    with open(DEBUG_FILE, 'a', encoding='utf-8') as f:
        f.write(f"[{timestamp}] {command}\n")


def windows_acp_encoding():
    """Encodage ANSI (ACP) du processus sous Windows, None ailleurs ou si deja UTF-8."""
    if os.name != 'nt':
        return None
    import ctypes
    acp = ctypes.windll.kernel32.GetACP()
    return None if acp == 65001 else f'cp{acp}'


def argv_for_task_exe(command, acp=None):
    """Prepare une ligne de commande pour que task.exe recoive de l'UTF-8 exact.

    task.exe (Windows) lit ses arguments en codepage ANSI puis les traite comme de
    l'UTF-8 : "e" accentue arrive en 0xE9, octet de tete d'une sequence a 3 octets, qui
    avale les deux octets suivants (parfois hors du tampon, d'ou un echec selon le
    texte : "integre" accentue en fin de description -> "Unknown error"). On lui
    envoie donc les octets UTF-8 reinterpretes dans l'ACP : la conversion du systeme
    les restitue tels quels a task.exe, qui les lit alors correctement.
    Sans effet sous Linux, en ACP UTF-8 ou pour une commande ASCII.
    """
    if command.isascii():
        return command
    acp = acp or windows_acp_encoding()
    if not acp:
        return command
    out = []
    for byte in command.encode('utf-8'):
        try:
            out.append(bytes([byte]).decode(acp))
        except UnicodeDecodeError:
            out.append(chr(byte))  # octet non defini dans l'ACP (0x81, 0x8D...)
    return ''.join(out)


def run_task_command(command):
    """Execute a TaskWarrior command and return the result"""
    try:
        # Ensure we're using the task command
        if not command.startswith('task'):
            command = f'task {command}'
        
        # Always log the command for debugging purposes
        log_command(command)
        
        if DEVELOPER_MODE:
            # In developer mode, just log the command without executing it
            return CommandResult(
                success=True,
                stdout=f'[DEV MODE] Command logged to {DEBUG_FILE}: {command}',
                stderr='',
                returncode=0
            )
        
        # Normal execution when not in developer mode
        # L'encodage est impose : TaskWarrior ecrit de l'UTF-8, alors que `text=True`
        # seul decoderait avec l'encodage local (cp1252 sous Windows) et rendrait les
        # accents en mojibake -- "Tache" accentuee ressortait en "TA^che".
        result = subprocess.run(
            argv_for_task_exe(command), shell=True, capture_output=True,
            encoding='utf-8', errors='replace',
            env=_TW_ENV, timeout=TASK_TIMEOUT
        )
        return CommandResult(
            success=result.returncode == 0,
            stdout=result.stdout,
            stderr=result.stderr,
            returncode=result.returncode
        )
    except subprocess.TimeoutExpired:
        return CommandResult(
            success=False,
            stdout='',
            stderr=(
                f"Commande interrompue apres {TASK_TIMEOUT} s. "
                "Un hook attend peut-etre une saisie au terminal : "
                "relancez cette commande dans un terminal pour voir ce qu'elle demande."
            ),
            returncode=-1
        )
    except Exception as e:
        return CommandResult(
            success=False,
            stdout='',
            stderr=str(e),
            returncode=-1
        )


def text_field_gaps(task, expected):
    """Compare les champs texte stockes a ceux demandes, et renvoie les ecarts."""
    gaps = {}
    for field, wanted in expected.items():
        if wanted is None:
            continue
        if field == 'tags':
            if set(task.get('tags') or []) != set(wanted):
                gaps['tags'] = list(wanted)
        elif task.get(field, '') != wanted:
            gaps[field] = wanted
    return gaps


def repair_text_fields(task, expected):
    """Reecrit les champs texte que TaskWarrior n'a pas stockes tels qu'ils ont ete demandes.

    Sous Windows, task.exe corrompt le non-ASCII passe dans ses arguments : une
    description "Tache" accentuee ressort mutilee. Son moteur gere pourtant tres bien
    l'UTF-8 -- `task import` depuis un fichier UTF-8 restitue la valeur intacte. On
    repare donc apres coup, par ce canal.
    Voir openspec/changes/fix-nonascii-argv-windows/proposal.md

    Sous Linux les arguments preservent l'UTF-8 : aucun ecart n'est constate et cette
    fonction ne lance aucune commande.

    Renvoie la tache reexportee si une reparation a eu lieu, sinon None.
    """
    gaps = text_field_gaps(task, expected)
    task_uuid = task.get('uuid')
    if not gaps or not task_uuid:
        return None

    # 'id' et 'urgency' sont calcules par TaskWarrior : on ne les reinjecte pas.
    payload = {k: v for k, v in task.items() if k not in ('id', 'urgency')}
    payload.update(gaps)

    path = None
    try:
        with tempfile.NamedTemporaryFile(
            mode='w', suffix='.json', encoding='utf-8', delete=False
        ) as handle:
            json.dump([payload], handle, ensure_ascii=False)
            path = handle.name

        if not run_task_command(f'task import "{path}"').success:
            return None

        export_result = run_task_command(f'task {task_uuid} export')
        if export_result.success and export_result.stdout.strip():
            repaired = json.loads(export_result.stdout)
            if repaired:
                return repaired[0]
    except (OSError, ValueError) as e:
        print(f"Echec de la reparation des champs texte: {e}")
    finally:
        if path:
            try:
                os.unlink(path)
            except OSError:
                pass
    return None


_ESTTIME_H_MIN = re.compile(r'^\s*(\d+)\s*h\s*(\d+)\s*(?:min|m)?\s*$', re.IGNORECASE)


def normaliser_esttime(valeur):
    """Reecrit `1h30` (et `1h30min`) en `1h+30min`, seule forme composee que Taskwarrior accepte.

    Mesure du 2026-10-06 (fork 3.5.0.6) : `1h30` et `1h30min` sont refuses (code 2),
    `1h+30min` est stocke PT1H30M. Toute autre valeur passe telle quelle : Taskwarrior
    la valide et l'API renvoie son message d'erreur.
    """
    m = _ESTTIME_H_MIN.match(valeur or '')
    if not m:
        return valeur
    return f'{int(m.group(1))}h+{int(m.group(2))}min'


def cleaned_tags(tags):
    """Normalise une liste de tags comme le font les commandes d'ecriture."""
    if tags is None:
        return None
    return [tag.strip() for tag in tags if tag and tag.strip()]


def _chemin_normalise(chemin):
    return os.path.normcase(os.path.abspath(os.path.expanduser(chemin.strip())))


def base_autorisee(data_location, racine, base_prod, dossier_prod):
    """Vrai sauf si `data_location` est sous la prod et le code hors du dossier de prod."""
    base = _chemin_normalise(data_location)
    prod = _chemin_normalise(base_prod)
    vise_la_prod = base == prod or base.startswith(prod + os.sep)
    return not vise_la_prod or _chemin_normalise(racine) == _chemin_normalise(dossier_prod)


def verifier_isolation_prod(racine=None, base_prod=BASE_PROD, dossier_prod=DOSSIER_PROD):
    """Refuse de demarrer sur la vraie base depuis un autre dossier que celui de prod.

    TASKDATA herite l'emporte sur le data.location du taskrc : c'est lui qu'on juge.
    """
    racine = racine or os.path.dirname(os.path.abspath(__file__))
    data_location = os.environ.get('TASKDATA')
    if not data_location:
        resultat = run_task_command('task _get rc.data.location')
        data_location = resultat.stdout.strip()
    if data_location and not base_autorisee(data_location, racine, base_prod, dossier_prod):
        raise RuntimeError(
            f"Base de prod ({data_location}) visee depuis {racine} : refus de demarrer. "
            f"La prod ne se sert que depuis {dossier_prod} (Webtaskmanager-prod.ps1) ; "
            f"pour developper, TASKRC=C:/Users/irpaui/taskwarrior-dev/taskrc.")


# Create FastAPI app with lifespan management
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager"""
    # Startup
    if not DEVELOPER_MODE:
        verifier_isolation_prod()
    check_result = run_task_command('task version')
    if not check_result.success:
        print("Warning: TaskWarrior doesn't seem to be installed or accessible")
        print("Please install TaskWarrior: sudo apt-get install taskwarrior")
    else:
        print("TaskWarrior found:", check_result.stdout.split('\n')[0])
    
    print("Starting TaskWarrior Web UI with FastAPI...")
    print(f"Access the interface at: http://localhost:{PORT}")
    print(f"FastAPI docs available at: http://localhost:{PORT}/docs")

    yield
    
    # Shutdown
    print("Shutting down TaskWarrior Web UI...")


# Create FastAPI app instance
app = FastAPI(
    title="TaskWarrior Web UI",
    description="A FastAPI backend for TaskWarrior task management",
    version="1.0.0",
    lifespan=lifespan
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount static files
app.mount("/static", StaticFiles(directory=".", html=True), name="static")


# API Endpoints

# Le template de carte vit dans task-card-templates.html. Sans injection, chaque
# page devait l'aller chercher par fetch, ce qui ouvrait une course avec son
# premier rendu. Une page qui porte le marqueur ci-dessous recoit le template
# directement dans son HTML : plus de requete, donc plus de course possible.
#
# Le marqueur est explicite et greppable : c'est la page qui demande, le serveur
# ne decide pas a sa place.
TEMPLATE_MARKER = '<!-- task-card-templates -->'
TEMPLATE_SOURCE = 'task-card-templates.html'

_tpl_cache = None
_tpl_cache_mtime = None


def carte_template_html():
    """Renvoie le bloc <template id="task-card-full"> du fichier source."""
    global _tpl_cache, _tpl_cache_mtime
    try:
        mtime = os.path.getmtime(TEMPLATE_SOURCE)
    except OSError:
        print(f"Avertissement : {TEMPLATE_SOURCE} introuvable, injection ignoree")
        return ''
    if _tpl_cache is not None and mtime == _tpl_cache_mtime:
        return _tpl_cache

    with open(TEMPLATE_SOURCE, encoding='utf-8') as handle:
        contenu = handle.read()
    trouve = re.search(r'<template\s+id="task-card-full".*?</template>', contenu, re.S)
    if not trouve:
        print(f"Avertissement : aucun <template id=\"task-card-full\"> dans {TEMPLATE_SOURCE}")
    _tpl_cache = trouve.group(0) if trouve else ''
    _tpl_cache_mtime = mtime
    return _tpl_cache


def page_html(chemin):
    """Sert une page HTML, en y injectant le template si elle le demande."""
    with open(chemin, encoding='utf-8') as handle:
        html = handle.read()
    if TEMPLATE_MARKER in html:
        html = html.replace(TEMPLATE_MARKER, carte_template_html(), 1)
    # Meme politique de cache que les autres fichiers : revalidation imposee.
    return HTMLResponse(content=html, headers={"Cache-Control": "no-cache"})


@app.get("/", response_class=HTMLResponse)
async def read_root():
    """Serve the main HTML page"""
    try:
        return page_html("index.html")
    except FileNotFoundError:
        return HTMLResponse(content="<h1>TaskWarrior Web UI</h1><p>Welcome to the TaskWarrior Web Interface</p>", status_code=200)


def empreinte_base():
    """L'empreinte de la base pending, ou None si elle n'a pas pu etre lue.

    Appelle `run_task_command('task status:pending export')` : sous
    DEVELOPER_MODE, la sortie est du texte de log, pas du JSON -- ce n'est pas
    une erreur qui remonte, juste une empreinte qu'on ne sait pas prendre.
    """
    resultat = run_task_command('task status:pending export')
    if not resultat.success:
        return None
    try:
        taches = json.loads(resultat.stdout)
    except (json.JSONDecodeError, TypeError):
        return None
    return plan_runner.empreinte(taches)


@app.post("/api/plan/calculer")
async def calculer_plan():
    """Lance l'ordonnanceur en tache de fond et republie `plan.json`.

    N'ECRIT RIEN dans Taskwarrior : la ligne de commande construite par
    `plan_runner` ne porte aucun drapeau d'ecriture, et un test verifie cette
    ligne elle-meme. C'est ce qui fait de ce bouton un dry-run.

    Rend la main tout de suite -- la resolution prend de 30 s a 2 minutes --
    et l'avancement se lit sur `/api/plan/etat`. L'empreinte de la base est
    prise ici, juste avant de lancer, pour que Valider puisse verifier plus
    tard qu'elle n'a pas change entre-temps.
    """
    accepte, resultat = plan_runner.lancer(empreinte=empreinte_base())
    if not accepte:
        return ResponseModel(success=False, error=resultat)
    return ResponseModel(success=True, data=resultat)


@app.post("/api/plan/valider")
async def valider_plan():
    """Ecrit dans Taskwarrior exactement le plan affiche (`--appliquer`).

    Refuse (409) si : un calcul ou une validation est en cours ; aucun calcul
    termine dans cette session (ou son empreinte est illisible) ; le fichier
    de plan est absent ; la base a change depuis le calcul. Un echec de
    l'ecriture (code de retour non nul) remonte en 500.
    """
    statut_courant = plan_runner.etat()["statut"]
    if statut_courant in ("en_cours", "validation"):
        raise HTTPException(status_code=409,
                            detail="Un calcul ou une validation est déjà en "
                                  "cours ; attendez qu'il finisse.")

    empreinte_calcul = plan_runner.empreinte_du_calcul()
    if statut_courant != "termine" or empreinte_calcul is None:
        raise HTTPException(status_code=409,
                            detail="Aucun plan calculé à valider : lancez "
                                  "d'abord un calcul.")

    if not os.path.exists(plan_runner.SORTIE):
        raise HTTPException(status_code=409,
                            detail="Aucun plan à valider : le fichier de "
                                  "plan est introuvable.")

    # Le statut est celui de la passe 1 (CP-SAT) ; la passe 2 (opportuniste)
    # peut placer des blocs meme si la passe 1 a echoue, donc on ne se fie
    # jamais a la presence/absence de blocs pour decider.
    with open(plan_runner.SORTIE, encoding="utf-8") as fichier_plan:
        statut_plan = json.load(fichier_plan).get("statut")
    if statut_plan in ("INFEASIBLE", "UNKNOWN", "MODEL_INVALID"):
        raise HTTPException(status_code=409,
                            detail="Le plan calculé est infaisable (statut "
                                  "{}) : impossible de le "
                                  "valider.".format(statut_plan))

    empreinte_actuelle = empreinte_base()
    if empreinte_actuelle is None or empreinte_actuelle != empreinte_calcul:
        raise HTTPException(status_code=409,
                            detail="La base a changé depuis le calcul : "
                                  "recalculez avant de valider.")

    code, stdout, stderr = plan_runner.valider()
    if code != 0:
        raise HTTPException(status_code=500,
                            detail=(stderr or "").strip()
                                  or "code de retour {}".format(code))
    try:
        donnees = json.loads(stdout)
    except (json.JSONDecodeError, TypeError):
        raise HTTPException(status_code=500,
                            detail="Réponse illisible du planificateur.")
    return ResponseModel(success=True, data=donnees)


@app.get("/api/plan/etat")
async def etat_plan():
    """Ou en est le calcul : inactif, en_cours, termine ou echec.

    Un echec porte son message : un plan qui n'a pas ete calcule ne doit pas
    ressembler a un plan vide.
    """
    return ResponseModel(success=True, data=plan_runner.etat())


@app.get("/api/tasks/planned")
async def get_planned_tasks():
    """Get all planned tasks (with scheduled date) in JSON format"""
    result = run_task_command('task scheduled.not: export')
    
    if result.success:
        try:
            tasks_data = json.loads(result.stdout)
            return ResponseModel(
                success=True,
                data=tasks_data
            )
        except json.JSONDecodeError as e:
            return ResponseModel(
                success=False,
                error=f'JSON decode error: {str(e)}',
                stdout=result.stdout,
                stderr=result.stderr
            )
    else:
        return ResponseModel(
            success=False,
            error='Error retrieving planned tasks',
            stderr=result.stderr
        )


# Statuts exposes par la barre de boutons, traduits en filtres TaskWarrior.
STATUS_FILTERS = {
    'pending': 'status:pending',
    'waiting': 'status:waiting',
    'completed': 'status:completed',
    'deleted': 'status:deleted',
}

_recur_filter = None


def get_recurrence_filter():
    """Filtre correspondant au statut 'recurring'.

    Le hook « recurrence-overhaul » range la recurrence dans un champ
    personnalise, annonce par `recurrence.field` ; sinon c'est le +RECURRING
    standard. Resolu paresseusement et mis en cache : la PR d'origine le
    calculait a l'import du module, par un subprocess direct qui contournait
    DEVELOPER_MODE -- donc une vraie commande `task` executee sous pytest.
    """
    global _recur_filter
    if _recur_filter is not None:
        return _recur_filter
    valeur = '+RECURRING'
    result = run_task_command('task _show')
    if result.success:
        for line in result.stdout.splitlines():
            if line.startswith('recurrence.field='):
                champ = line.split('=', 1)[1].strip()
                if champ and champ != 'recur':
                    valeur = champ + '.any:'
                break
    _recur_filter = valeur
    return valeur


def build_task_filter(statuses, filter_text='', context_expr=''):
    """Assemble le filtre TaskWarrior, chaque terme en un seul argument quote.

    Le quoting n'est pas cosmetique : `run_task_command` passe par un shell, et
    des parentheses nues sont une erreur de syntaxe pour /bin/sh sous Termux.
    """
    parts = []
    for statut in statuses:
        if statut == 'recurring':
            parts.append(get_recurrence_filter())
        elif statut in STATUS_FILTERS:
            parts.append(STATUS_FILTERS[statut])
    if not parts:
        parts = ['status:pending']

    expression = parts[0] if len(parts) == 1 else '(' + ' or '.join(parts) + ')'

    morceaux = []
    if context_expr:
        # Filtre en ligne plutot que `rc.context=` : l'etat de TaskWarrior
        # n'est jamais modifie par une consultation web.
        morceaux.append('"(%s)"' % context_expr)
    morceaux.append('"%s"' % expression)
    if filter_text:
        morceaux.append('"description.contains:%s"' % filter_text)
    return ' '.join(morceaux)


@app.get("/api/tasks")
async def get_tasks(
    status: str = "pending",
    context: str = "",
    filter_text: str = Query("", alias="filter"),
):
    """Taches au format JSON, filtrees par statut, contexte et texte."""
    statuses = [s.strip() for s in status.split(",") if s.strip()]
    # Le texte libre est reduit a un jeu de caracteres sur : il finit dans
    # une commande shell, et un guillemet suffirait a en sortir.
    filter_text = re.sub(r"[^\w\s\-\.]", "", filter_text.strip())[:80]
    context_expr = get_context_filters().get(context.strip(), "") if context.strip() else ""

    filtre = build_task_filter(statuses, filter_text, context_expr)
    result = run_task_command(f'task {filtre} export')
    
    if result.success:
        try:
            tasks_data = json.loads(result.stdout)
            # Sort tasks by urgency in descending order
            tasks_data.sort(key=lambda x: x.get('urgency', 0), reverse=True)
            return ResponseModel(
                success=True,
                tasks=tasks_data
            )
        except json.JSONDecodeError as e:
            return ResponseModel(
                success=False,
                error=f'JSON decode error: {str(e)}',
                stdout=result.stdout,
                stderr=result.stderr
            )
    else:
        return ResponseModel(
            success=False,
            error='Error retrieving tasks',
            stderr=result.stderr
        )


def _parse_depends(brut):
    """Normalise le champ depends : liste d'uuid (Taskwarrior 3) ou chaine
    separee par des virgules (Taskwarrior 2). Renvoie toujours une liste."""
    if not brut:
        return []
    if isinstance(brut, list):
        return brut
    if isinstance(brut, str):
        return [u.strip() for u in brut.split(",") if u.strip()]
    return []


def _dans_projet(project_tache, projet):
    """Frontiere de point, insensible a la casse : project_tache == projet
    ou sous-projet de projet."""
    if not project_tache:
        return False
    tache_min = project_tache.lower()
    projet_min = projet.lower()
    return tache_min == projet_min or tache_min.startswith(projet_min + ".")


def construire_graphe(taches, projet):
    """Fonction pure : export pending (liste de dicts) + nom de projet ->
    dict de reponse pour GET /api/graphe.

    Regles (voir test_graphe.py) :
    - noeuds du projet : project == projet ou sous-projet, frontiere de point ;
    - voisins directs (predecesseur ou successeur via depends) hors projet
      inclus avec dans_projet=false, sans voisin de voisin ;
    - aretes seulement entre deux noeuds presents dans le resultat ;
    - tri des noeuds par (project, description), insensible a la casse.
    """
    par_uuid = {t["uuid"]: t for t in taches if "uuid" in t}

    uuids_projet = {uuid for uuid, t in par_uuid.items() if _dans_projet(t.get("project"), projet)}

    # Voisins directs : un hop seulement, dans un sens ou dans l'autre, a
    # partir d'une tache du projet. Ne pas etendre a partir d'un voisin.
    voisins = set()
    for uuid, t in par_uuid.items():
        for dep in _parse_depends(t.get("depends")):
            if dep not in par_uuid:
                continue
            dep_dans_projet = dep in uuids_projet
            tache_dans_projet = uuid in uuids_projet
            if tache_dans_projet and not dep_dans_projet:
                voisins.add(dep)
            elif dep_dans_projet and not tache_dans_projet:
                voisins.add(uuid)

    inclus = uuids_projet | voisins

    noeuds = []
    for uuid in inclus:
        t = par_uuid[uuid]
        tags = t.get("tags") or []
        noeuds.append({
            "uuid": uuid,
            "description": t.get("description"),
            "project": t.get("project"),
            "estTime": t.get("estTime"),
            "due": t.get("due"),
            "externe": "external" in tags,
            "fige": "fixed" in tags,
            "dans_projet": uuid in uuids_projet,
        })
    noeuds.sort(key=lambda n: ((n["project"] or "").lower(), (n["description"] or "").lower()))

    aretes = []
    for uuid, t in par_uuid.items():
        if uuid not in inclus:
            continue
        for dep in _parse_depends(t.get("depends")):
            if dep in inclus:
                aretes.append({"de": dep, "vers": uuid})

    return {
        "projet": projet,
        "noeuds": noeuds,
        "aretes": aretes,
    }


@app.get("/api/graphe")
async def get_graphe(projet: str = Query(...)):
    """Graphe des dependances autour d'un projet (et ses sous-projets).

    Le filtrage par projet se fait en Python sur l'export pending complet,
    pas via un filtre project: envoye a Taskwarrior (cf. test_graphe.py).
    """
    if not projet.strip():
        raise HTTPException(status_code=400, detail="Le parametre projet est requis")

    result = run_task_command("task status:pending export")
    if not result.success:
        raise HTTPException(status_code=502, detail=f"Erreur Taskwarrior : {result.stderr}")

    try:
        taches = json.loads(result.stdout)
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=500, detail=f"JSON decode error: {str(e)}")

    return construire_graphe(taches, projet)


class ImportCsvRequest(BaseModel):
    """Corps attendu par les routes d'import CSV."""
    csv: str


def _existantes_pour_import():
    """Lit l'export complet (tous statuts), pour la resolution des references
    de `import_csv.analyser` (prefixes hexadecimaux, fusion). Sans filtre de
    statut : une tache completed ou deleted doit rester visible a la fusion,
    sinon `task import` la rouvrirait en pending. Lecture seule."""
    result = run_task_command("task export")
    if not result.success:
        raise HTTPException(status_code=502, detail=f"Erreur Taskwarrior : {result.stderr}")
    try:
        return json.loads(result.stdout)
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=500, detail=f"JSON decode error: {str(e)}")


@app.post("/api/import/apercu")
async def import_csv_apercu(requete: ImportCsvRequest):
    """Analyse un CSV sans rien ecrire : renvoie taches, erreurs et graphe.

    N'appelle jamais `task import` -- seule la lecture de l'existant, via
    `_existantes_pour_import()`, est effectuee.
    """
    existantes = _existantes_pour_import()
    resultat = import_csv.analyser(requete.csv, existantes)

    uuids_existants = {t["uuid"] for t in existantes if "uuid" in t}
    taches = []
    for indice, tache in enumerate(resultat.taches, start=2):
        taches.append({
            **tache,
            "ligne": indice,
            "nouvelle": tache["uuid"] not in uuids_existants,
        })

    noeuds = [
        {"uuid": tache["uuid"], "description": tache.get("description")}
        for tache in resultat.taches
    ]

    return {
        "taches": taches,
        "erreurs": resultat.erreurs,
        "graphe": {"noeuds": noeuds, "aretes": resultat.aretes},
    }


@app.post("/api/import")
async def import_csv_route(requete: ImportCsvRequest):
    """Importe un CSV : 400 sans ecriture si erreurs d'analyse, sinon UNE
    commande `task import` sur un fichier temporaire JSON."""
    existantes = _existantes_pour_import()
    resultat = import_csv.analyser(requete.csv, existantes)

    if resultat.erreurs:
        raise HTTPException(status_code=400, detail={"erreurs": resultat.erreurs})

    uuids_existants = {t["uuid"] for t in existantes if "uuid" in t}
    creees = sum(1 for t in resultat.taches if t["uuid"] not in uuids_existants)
    mises_a_jour = len(resultat.taches) - creees

    chemin = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".json", encoding="utf-8", delete=False
        ) as handle:
            json.dump(resultat.taches, handle, ensure_ascii=False)
            chemin = handle.name

        resultat_import = run_task_command(f'task import "{chemin}"')
    finally:
        if chemin:
            try:
                os.unlink(chemin)
            except OSError:
                pass

    if not resultat_import.success:
        raise HTTPException(
            status_code=502,
            detail=f"Erreur Taskwarrior : {resultat_import.stderr}",
        )

    return {"success": True, "creees": creees, "mises_a_jour": mises_a_jour}


# Modele telechargeable depuis import.html (#import-modele-lien). Contenu
# identique a EXEMPLE_CSV de test_import_csv.py -- garde en synchronisation
# manuelle, verifie par test_modele_import.py (0 erreur, 5 taches via
# import_csv.analyser). Route dediee plutot que fichier statique servi par le
# catch-all : garantit le Content-Type text/csv independamment de la table
# mimetypes de l'OS (voir le catch-all plus bas, qui utiliserait FileResponse
# et laisserait deviner le type).
# Derive de EXEMPLE_CSV, plus une tache a plusieurs tags pour montrer la syntaxe.
MODELE_IMPORT_CSV = (
    "ref;description;projet;tags;estTime;due;scheduled;priorite;depend_de\n"
    "devis;Demander 3 devis;NPD.Orion.achats;pro;2h;;;M;\n"
    "attente;Reponse fournisseurs;NPD.Orion.achats;external;10j;;;;devis\n"
    "choix;Choisir le fournisseur;NPD.Orion.achats;pro;1h;;;;attente\n"
    "cde;Passer la commande;NPD.Orion.commandes;pro;1h;30/10/2026;;H;choix\n"
    "plan;Plan de montage;NPD.Orion;pro,revue;4h;;;;devis, choix\n"
)


@app.get("/modele-import.csv")
async def get_modele_import_csv():
    return Response(content=MODELE_IMPORT_CSV, media_type="text/csv; charset=utf-8")


@app.get("/api/projects")
async def get_projects():
    """Get all unique projects from TaskWarrior, including completed tasks"""
    result = run_task_command('task _projects')
    
    if result.success:
        try:
            # Split the output by newlines and filter out empty lines
            projects = [p.strip() for p in result.stdout.split('\n') if p.strip()]
            return ResponseModel(
                success=True,
                projects=projects
            )
        except Exception as e:
            return ResponseModel(
                success=False,
                error=f'Failed to parse projects: {str(e)}'
            )
    else:
        return ResponseModel(
            success=False,
            error=result.stderr
        )


# Cache de la liste des contextes. `task _show` dumpe toute la configuration,
# ce qui est cher pour une donnee qui ne change qu'a la main dans le taskrc.
_ctx_cache = {}
_ctx_cache_ts = 0.0


def get_context_filters():
    """Renvoie {nom: filtre de lecture} pour chaque contexte defini."""
    global _ctx_cache, _ctx_cache_ts
    if _ctx_cache_ts and (time.time() - _ctx_cache_ts) < CONTEXT_CACHE_TTL:
        return _ctx_cache
    result = run_task_command('task _show')
    filters = {}
    if result.success:
        for line in result.stdout.splitlines():
            m = re.match(r'^context\.(.+?)\.read=(.+)$', line)
            if m:
                filters[m.group(1)] = m.group(2)
    _ctx_cache, _ctx_cache_ts = filters, time.time()
    return filters


@app.get("/api/contexts")
async def get_contexts():
    """Contextes definis, leurs filtres, et celui qui est actif."""
    filters = get_context_filters()
    # Les contextes composites (nom contenant ':') sont de la plomberie interne
    # de TaskWarrior : ils n'ont pas a apparaitre dans l'interface.
    contexts = [nom for nom in filters if ':' not in nom]

    actif = run_task_command('task _get rc.context')
    return ResponseModel(
        success=True,
        contexts=contexts,
        filters=filters,
        active=actif.stdout.strip() if actif.success else '',
    )


@app.get("/api/config")
async def get_client_config():
    """Reglages lus par le frontend.

    Reponse a plat plutot qu'un ResponseModel : nav.js lit directement
    `notification_timeout` a la racine, sans regarder `success`.
    """
    return {"notification_timeout": NOTIFICATION_TIMEOUT}


@app.get("/api/kanban/columns")
async def get_kanban_columns():
    """Colonnes du tableau Kanban, telles que configurees dans config.py."""
    return ResponseModel(success=True, columns=KANBAN_COLUMNS)


@app.post("/api/task/{task_id}/start")
async def start_task(task_id: str):
    """Start a task"""
    result = run_task_command(f'task {task_id} start')
    return ResponseModel(
        success=result.success,
        message=result.stdout if result.success else result.stderr
    )


@app.post("/api/task/{task_id}/stop")
async def stop_task(task_id: str):
    """Stop a task"""
    result = run_task_command(f'task {task_id} stop')
    return ResponseModel(
        success=result.success,
        message=result.stdout if result.success else result.stderr
    )


@app.post("/api/task/{task_id}/done")
async def complete_task(task_id: str):
    """Mark a task as done"""
    result = run_task_command(f'task {task_id} done')
    return ResponseModel(
        success=result.success,
        message=result.stdout if result.success else result.stderr
    )


@app.delete("/api/task/{task_id}/delete")
async def delete_task(task_id: str):
    """Delete a task"""
    result = run_task_command(f'task rc.confirmation=off {task_id} delete')
    return ResponseModel(
        success=result.success,
        message=result.stdout if result.success else result.stderr
    )


@app.put("/api/task/{task_id}/modify")
async def modify_task(task_id: str, task_data: TaskModify):
    """Modify a task"""
    modifications = []

    if task_data.description and task_data.description.strip():
        # L'editeur renvoie toujours la description, meme inchangee. La passer
        # en argument a task.exe echoue des qu'elle contient du non-ASCII
        # ("12°") : on ne la renvoie que si elle a reellement change.
        description_actuelle = None
        export_desc = run_task_command(f'task {task_id} export')
        if export_desc.success and export_desc.stdout.strip():
            try:
                existante = json.loads(export_desc.stdout)
                if existante:
                    description_actuelle = existante[0].get('description')
            except (json.JSONDecodeError, IndexError):
                pass
        if task_data.description != description_actuelle:
            modifications.append(f'description:"{task_data.description}"')

    if task_data.tags is not None:
        # Validation stricte avant toute commande : shell=True interdit de
        # laisser passer un tag qui contiendrait un caractere de controle
        # shell. Un seul tag invalide bloque toute la modification.
        for tag in task_data.tags:
            if (tag or "").startswith(('+', '-')) or not re.fullmatch(r"[\w.-]+", tag or ""):
                raise HTTPException(
                    status_code=400,
                    detail=f"Tag invalide : {tag!r}"
                )

        # `task modify -TAGS` est un NO-OP sous Taskwarrior 3.5 : on calcule
        # donc le diff entre les tags actuels (export) et les tags demandes,
        # et on ajoute un -t par tag retire et un +t par tag ajoute a la
        # meme commande modify (voir plus bas).
        tags_actuels = []
        export_tags = run_task_command(f'task {task_id} export')
        if export_tags.success and export_tags.stdout.strip():
            try:
                tache_existante = json.loads(export_tags.stdout)
                if tache_existante:
                    tags_actuels = tache_existante[0].get('tags') or []
            except (json.JSONDecodeError, IndexError):
                tags_actuels = []

        tags_demandes = cleaned_tags(task_data.tags) or []
        for tag in tags_actuels:
            if tag not in tags_demandes:
                modifications.append(f'-{tag}')
        for tag in tags_demandes:
            if tag not in tags_actuels:
                modifications.append(f'+{tag}')

    if task_data.due is not None:
        if task_data.due:
            modifications.append(f'due:"{task_data.due}"')
        else:
            modifications.append('due:')

    if task_data.scheduled is not None:
        if task_data.scheduled:
            modifications.append(f'scheduled:"{task_data.scheduled}"')
        else:
            modifications.append('scheduled:')

    if task_data.priority is not None:
        if task_data.priority:
            modifications.append(f'priority:{task_data.priority}')
        else:
            modifications.append('priority:')
            
    if task_data.project is not None:
        if task_data.project:
            modifications.append(f'project:{task_data.project}')
        else:
            modifications.append('project:')
            
    if task_data.estTime is not None:
        # Une chaine vide efface l'UDA, comme pour project et priority.
        modifications.append(f'estTime:{normaliser_esttime(task_data.estTime)}' if task_data.estTime else 'estTime:')

    if task_data.state is not None:
        # Une chaine vide efface l'UDA, comme pour project et priority.
        modifications.append(f'state:{task_data.state}' if task_data.state else 'state:')

    if modifications:
        mod_string = ' '.join(modifications)
        result = run_task_command(f'task rc.confirmation=off {task_id} modify {mod_string}')
        
        if result.success:
            # Export the modified task to get complete data
            export_result = run_task_command(f'task {task_id} export')
            if export_result.success and export_result.stdout.strip():
                try:
                    task = json.loads(export_result.stdout)
                    if task:  # Check that the task list is not empty
                        modified = task[0]
                        applied_description = (
                            task_data.description
                            if task_data.description and task_data.description.strip()
                            else None
                        )
                        repaired = repair_text_fields(modified, {
                            'description': applied_description,
                            'project': task_data.project,
                            'tags': cleaned_tags(task_data.tags),
                        })
                        return ResponseModel(
                            success=True,
                            message=result.stdout,
                            task=repaired or modified
                        )
                except (json.JSONDecodeError, IndexError) as e:
                    print(f"Error parsing task data: {e}")
                    return ResponseModel(
                        success=True,
                        message=result.stdout,
                        task=None
                    )
        
        return ResponseModel(
            success=result.success,
            message=result.stdout if result.success else result.stderr,
            task=None
        )
    else:
        return ResponseModel(
            success=True,
            message='No changes to apply',
            task=None
        )


@app.post("/api/task/add")
async def add_task(task_data: TaskCreate):
    """Add a new task"""
    if not task_data.description:
        raise HTTPException(status_code=400, detail="Description is required")
    
    command_parts = [f'add "{task_data.description}"']
    
    if task_data.tags:
        for tag in task_data.tags:
            if tag and tag.strip():
                command_parts.append(f'+{tag.strip()}')
    
    if task_data.due:
        command_parts.append(f'due:{task_data.due}')
    
    if task_data.scheduled:
        command_parts.append(f'scheduled:{task_data.scheduled}')
    
    if task_data.priority:
        command_parts.append(f'priority:{task_data.priority}')
    
    if task_data.project:
        command_parts.append(f'project:{task_data.project}')
    
    if task_data.estTime:
        command_parts.append(f'estTime:{normaliser_esttime(task_data.estTime)}')
    
    # Create the task without export to avoid export being included in the description
    command = f'task {" ".join(command_parts)}'
    create_result = run_task_command(command)
    
    # If creation succeeded, export the latest task created to get complete data
    if create_result.success:
        export_result = run_task_command('task +LATEST export')
        if export_result.success and export_result.stdout.strip():
            try:
                task = json.loads(export_result.stdout)
                if task:  # Check that the task list is not empty
                    created = task[0]
                    repaired = repair_text_fields(created, {
                        'description': task_data.description,
                        'project': task_data.project,
                        'tags': cleaned_tags(task_data.tags) or None,
                    })
                    return ResponseModel(
                        success=True,
                        message='Task created successfully',
                        task=repaired or created
                    )
            except (json.JSONDecodeError, IndexError) as e:
                print(f"Error parsing task data: {e}")
    
    # In case of error
    return ResponseModel(
        success=create_result.success if create_result else False,
        error=create_result.stderr if create_result and not create_result.success else 'Failed to create task',
        task=None
    )


# Un uuid canonique Taskwarrior, sans marge : c'est la seule forme admise pour
# tout identifiant qui finit dans la commande shell ci-dessous.
UUID_CANONIQUE_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"
)


def _est_uuid_canonique(valeur):
    return bool(UUID_CANONIQUE_RE.fullmatch(valeur))


# Une date UTC compacte, comme l'ordonnanceur l'ecrit : YYYYMMDDTHHMMSSZ.
DATE_COMPACTE_RE = re.compile(r"^\d{8}T\d{6}Z$")


class TaskFiger(BaseModel):
    """Corps de POST /api/task/{uuid}/figer"""
    scheduled: str


@app.post("/api/task/{task_id}/figer")
async def figer_task(task_id: str, corps: TaskFiger):
    """Fige une tache a l'instant ou son bloc propose est depose.

    Ecrit uniquement `+fixed` et `scheduled` en une seule commande, pour ne
    jamais effacer les autres tags (contrairement a PUT /modify).
    """
    if not _est_uuid_canonique(task_id):
        raise HTTPException(status_code=400, detail="Identifiant de tâche invalide")

    if not DATE_COMPACTE_RE.fullmatch(corps.scheduled):
        raise HTTPException(status_code=400, detail="Date de début invalide : format attendu AAAAMMJJTHHMMSSZ")

    result = run_task_command(f'task {task_id} modify +fixed scheduled:{corps.scheduled}')

    if not result.success:
        raise HTTPException(status_code=400, detail=result.stderr)

    task = None
    export_result = run_task_command(f'task {task_id} export')
    if export_result.success and export_result.stdout.strip():
        try:
            exporte = json.loads(export_result.stdout)
            if exporte:
                task = exporte[0]
        except json.JSONDecodeError as e:
            print(f"Error parsing task data: {e}")

    return ResponseModel(success=True, task=task)


class TaskDepends(BaseModel):
    """Corps de POST /api/task/{uuid}/depends"""
    ajouter: List[str] = []
    retirer: List[str] = []


@app.post("/api/task/{task_id:path}/depends")
async def modify_depends(task_id: str, corps: TaskDepends):
    """Ajoute et/ou retire des dependances sur une tache, en une seule commande.

    {task_id} est la tache dependante (celle qui porte le champ depends).
    run_task_command utilise shell=True : tout identifiant (chemin ou corps)
    doit donc etre un uuid canonique avant toute construction de commande.
    """
    tous_identifiants = [task_id] + corps.ajouter + corps.retirer
    if not all(_est_uuid_canonique(i) for i in tous_identifiants):
        raise HTTPException(status_code=400, detail="Identifiant de tâche invalide")

    if not corps.ajouter and not corps.retirer:
        raise HTTPException(status_code=400, detail="Aucune dépendance à ajouter ou à retirer")

    if task_id in corps.ajouter:
        raise HTTPException(status_code=400, detail="Une tâche ne peut pas dépendre d'elle-même")

    termes = list(corps.ajouter) + [f"-{u}" for u in corps.retirer]
    valeur = ",".join(termes)

    result = run_task_command(f'task {task_id} modify depends:{valeur}')

    if not result.success:
        if "circular dependency" in result.stderr.lower():
            raise HTTPException(
                status_code=409,
                detail="Dépendance circulaire détectée : cette modification créerait un cycle de dépendances.",
            )
        raise HTTPException(status_code=400, detail=result.stderr)

    return ResponseModel(success=True, message=result.stdout)


# Catch-all route for static files (must be last)
@app.get("/{filename:path}")
async def read_static_files(filename: str):
    """Serve static files (CSS, JS, etc.) - catch-all route"""
    import os
    if not os.path.exists(filename):
        raise HTTPException(status_code=404, detail="File not found")
    try:
        if filename.endswith('.html'):
            return page_html(filename)
        # `no-cache` n'interdit pas le cache : il impose la revalidation. Avec
        # l'ETag deja emis par FileResponse, un fichier inchange coute un 304.
        # Sans cet en-tete, le navigateur applique un cache heuristique et peut
        # servir un JS perime pendant des heures -- apres un `git pull` sur le
        # telephone, l'interface resterait sur l'ancienne version.
        return FileResponse(filename, headers={"Cache-Control": "no-cache"})
    except (FileNotFoundError, RuntimeError):
        raise HTTPException(status_code=404, detail="File not found")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=PORT)