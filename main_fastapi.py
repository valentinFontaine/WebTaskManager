#!/usr/bin/env python3
"""
TaskWarrior Web UI - FastAPI Backend Server
A modern FastAPI server to interface with TaskWarrior commands
"""

import subprocess
import json
import os
import tempfile
from datetime import datetime
from typing import List, Optional
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, FileResponse

from config import DEVELOPER_MODE, DEBUG_FILE, TASK_TIMEOUT, KANBAN_COLUMNS
from fastapi_models import TaskBase, TaskCreate, TaskModify, ResponseModel, CommandResult


# TW_WEB=1 signale aux hooks TaskWarrior qu'ils tournent dans un contexte web,
# donc sans terminal : un hook bien ecrit s'abstient alors de demander une saisie.
_TW_ENV = {**os.environ, 'TW_WEB': '1'}


def log_command(command):
    """Log the command to the debug file with a timestamp"""
    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    with open(DEBUG_FILE, 'a') as f:
        f.write(f"[{timestamp}] {command}\n")


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
            command, shell=True, capture_output=True,
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


def cleaned_tags(tags):
    """Normalise une liste de tags comme le font les commandes d'ecriture."""
    if tags is None:
        return None
    return [tag.strip() for tag in tags if tag and tag.strip()]


# Create FastAPI app with lifespan management
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager"""
    # Startup
    check_result = run_task_command('task version')
    if not check_result.success:
        print("Warning: TaskWarrior doesn't seem to be installed or accessible")
        print("Please install TaskWarrior: sudo apt-get install taskwarrior")
    else:
        print("TaskWarrior found:", check_result.stdout.split('\n')[0])
    
    print("Starting TaskWarrior Web UI with FastAPI...")
    print("Access the interface at: http://localhost:8000")
    print("FastAPI docs available at: http://localhost:8000/docs")
    
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

@app.get("/", response_class=HTMLResponse)
async def read_root():
    """Serve the main HTML page"""
    try:
        return FileResponse("index.html")
    except FileNotFoundError:
        return HTMLResponse(content="<h1>TaskWarrior Web UI</h1><p>Welcome to the TaskWarrior Web Interface</p>", status_code=200)


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


@app.get("/api/tasks")
async def get_tasks():
    """Get all pending tasks in JSON format"""
    result = run_task_command('task status:pending export')
    
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
        modifications.append(f'description:"{task_data.description}"')

    if task_data.tags is not None:
        # First clear all existing tags, then add new ones
        clear_result = run_task_command(f'task rc.confirmation=off {task_id} modify -TAGS')
        if clear_result.success and task_data.tags:
            # Add new tags
            for tag in task_data.tags:
                if tag and tag.strip():
                    modifications.append(f'+{tag.strip()}')

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
            
    if task_data.estTime is not None and task_data.estTime:
        modifications.append(f'estTime:{task_data.estTime}')

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
        command_parts.append(f'estTime:{task_data.estTime}')
    
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


# Catch-all route for static files (must be last)
@app.get("/{filename:path}")
async def read_static_files(filename: str):
    """Serve static files (CSS, JS, etc.) - catch-all route"""
    import os
    if not os.path.exists(filename):
        raise HTTPException(status_code=404, detail="File not found")
    try:
        return FileResponse(filename)
    except (FileNotFoundError, RuntimeError):
        raise HTTPException(status_code=404, detail="File not found")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)