#!/usr/bin/env python3
"""
TaskWarrior Web UI - Backend Server
A lightweight Flask server to interface with TaskWarrior commands
"""

from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
import subprocess
import json
import os
import re
from datetime import datetime
from config import DEVELOPER_MODE, DEBUG_FILE

def log_command(command):
    """Log the command to the debug file with a timestamp"""
    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    with open(DEBUG_FILE, 'a') as f:
        f.write(f"[{timestamp}] {command}\n")

app = Flask(__name__, static_folder='.', static_url_path='')
CORS(app)

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
            return {
                'success': True,
                'stdout': f'[DEV MODE] Command logged to {DEBUG_FILE}: {command}',
                'stderr': '',
                'returncode': 0
            }
        
        # Normal execution when not in developer mode
        result = subprocess.run(command, shell=True, capture_output=True, text=True)
        return {
            'success': result.returncode == 0,
            'stdout': result.stdout,
            'stderr': result.stderr,
            'returncode': result.returncode
        }
    except Exception as e:
        return {
            'success': False,
            'stdout': '',
            'stderr': str(e),
            'returncode': -1
        }

@app.route('/')
def index():
    """Serve the main HTML page"""
    return send_from_directory('.', 'index.html')

@app.route('/<path:filename>')
def static_files(filename):
    """Serve static files (CSS, JS, etc.)"""
    return send_from_directory('.', filename)

@app.route('/api/tasks/planned')
def get_planned_tasks():
    """Get all planned tasks (with scheduled date) in JSON format"""
    result = run_task_command('task scheduled.not: export')
    
    if result['success']:
        try:
            tasks = json.loads(result['stdout'])
            return jsonify({
                'success': True,
                'data': tasks
            })
        except json.JSONDecodeError as e:
            return jsonify({
                'success': False,
                'error': f'Erreur de décodage JSON: {str(e)}',
                'stdout': result['stdout'],
                'stderr': result['stderr']
            }), 500
    else:
        return jsonify({
            'success': False,
            'error': 'Erreur lors de la récupération des tâches planifiées',
            'stderr': result['stderr']
        }), 500

@app.route('/api/tasks')
def get_tasks():
    """Get all pending tasks in JSON format"""
    result = run_task_command('task status:pending export')
    
    if result['success']:
        try:
            tasks = json.loads(result['stdout'])
            # Sort tasks by urgency in descending order
            tasks.sort(key=lambda x: x.get('urgency', 0), reverse=True)
            return jsonify({
                'success': True,
                'tasks': tasks
            })
        except json.JSONDecodeError as e:
            return jsonify({
                'success': False,
                'error': f'Erreur de décodage JSON: {str(e)}',
                'stdout': result['stdout'],
                'stderr': result['stderr']
            }), 500
    else:
        return jsonify({
            'success': False,
            'error': 'Erreur lors de la récupération des tâches',
            'stderr': result['stderr']
        }), 500

@app.route('/api/projects')
def get_projects():
    """Get all unique projects from TaskWarrior, including completed tasks"""
    # Get projects from all tasks (including completed ones)
    result = run_task_command('task _projects')
    
    if result['success']:
        try:
            # Split the output by newlines and filter out empty lines
            projects = [p.strip() for p in result['stdout'].split('\n') if p.strip()]
            return jsonify({
                'success': True,
                'projects': projects
            })
        except Exception as e:
            return jsonify({
                'success': False,
                'error': f'Failed to parse projects: {str(e)}'
            }), 500
    else:
        return jsonify({
            'success': False,
            'error': result['stderr']
        }), 500

@app.route('/api/task/<task_id>/start', methods=['POST'])
def start_task(task_id):
    """Start a task"""
    result = run_task_command(f'task {task_id} start')
    return jsonify({
        'success': result['success'],
        'message': result['stdout'] if result['success'] else result['stderr']
    })

@app.route('/api/task/<task_id>/stop', methods=['POST'])
def stop_task(task_id):
    """Stop a task"""
    result = run_task_command(f'task {task_id} stop')
    return jsonify({
        'success': result['success'],
        'message': result['stdout'] if result['success'] else result['stderr']
    })

@app.route('/api/task/<task_id>/done', methods=['POST'])
def complete_task(task_id):
    """Mark a task as done"""
    result = run_task_command(f'task {task_id} done')
    return jsonify({
        'success': result['success'],
        'message': result['stdout'] if result['success'] else result['stderr']
    })

@app.route('/api/task/<task_id>/delete', methods=['DELETE'])
def delete_task(task_id):
    """Delete a task"""
    result = run_task_command(f'task rc.confirmation=off {task_id} delete')
    return jsonify({
        'success': result['success'],
        'message': result['stdout'] if result['success'] else result['stderr']
    })

@app.route('/api/task/<task_id>/modify', methods=['PUT'])
def modify_task(task_id):
    """Modify a task"""
    data = request.get_json()
    modifications = []

    if 'description' in data and data['description']:
        modifications.append(f'description:"{data["description"]}"')

    if 'tags' in data:
        # First clear all existing tags, then add new ones
        clear_result = run_task_command(f'task rc.confirmation=off {task_id} modify -TAGS')
        if clear_result['success'] and isinstance(data['tags'], list) and data['tags']:
            # Add new tags
            for tag in data['tags']:
                if tag and tag.strip():
                    modifications.append(f'+{tag.strip()}')

    if 'due' in data:
        if data['due']:
            modifications.append(f'due:"{data["due"]}"')
        else:
            modifications.append('due:')

    if 'scheduled' in data:
        if data['scheduled']:
            modifications.append(f'scheduled:"{data["scheduled"]}"')
        else:
            modifications.append('scheduled:')

    if 'priority' in data:
        if data['priority']:
            modifications.append(f'priority:{data["priority"]}')
        else:
            modifications.append('priority:')
            
    if 'project' in data:
        if data['project']:
            modifications.append(f'project:{data["project"]}')
        else:
            modifications.append('project:')
            
    if 'estTime' in data and data['estTime']:
        modifications.append(f'estTime:{data["estTime"]}')

    if modifications:
        mod_string = ' '.join(modifications)
        result = run_task_command(f'task rc.confirmation=off {task_id} modify {mod_string}')
        
        if result['success']:
            # Exporter la tâche modifiée pour obtenir les données complètes
            export_result = run_task_command(f'task {task_id} export')
            if export_result['success'] and export_result['stdout'].strip():
                try:
                    task = json.loads(export_result['stdout'])
                    if task:  # Vérifier que la liste des tâches n'est pas vide
                        return jsonify({
                            'success': True,
                            'message': result['stdout'],
                            'task': task[0]  # Prendre la première tâche
                        })
                except (json.JSONDecodeError, IndexError) as e:
                    print(f"Error parsing task data: {e}")
                    return jsonify({
                        'success': True,
                        'message': result['stdout'],
                        'task': None
                    })
        
        return jsonify({
            'success': result['success'],
            'message': result['stdout'] if result['success'] else result['stderr'],
            'task': None
        })
    else:
        return jsonify({
            'success': True,
            'message': 'No changes to apply',
            'task': None
        })

@app.route('/api/task/add', methods=['POST'])
def add_task():
    """Add a new task"""
    data = request.get_json()
    
    if not data.get('description'):
        return jsonify({
            'success': False,
            'error': 'Description is required'
        }), 400
    
    command_parts = [f'add "{data["description"]}"']
    
    if data.get('tags'):
        if isinstance(data['tags'], list):
            for tag in data['tags']:
                command_parts.append(f'+{tag}')
    
    if data.get('due'):
        command_parts.append(f'due:{data["due"]}')
    
    if data.get('scheduled'):
        command_parts.append(f'scheduled:{data["scheduled"]}')
    
    if data.get('priority'):
        command_parts.append(f'priority:{data["priority"]}')
    
    if data.get('project'):
        command_parts.append(f'project:{data["project"]}')
    
    if data.get('estTime'):
        command_parts.append(f'estTime:{data["estTime"]}')
    
    # Créer la tâche sans export pour éviter que export soit inclus dans la description
    command = f'task {" ".join(command_parts)}'
    create_result = run_task_command(command)
    
    # Si la création a réussi, exporter la dernière tâche créée pour obtenir les données complètes
    if create_result['success']:
        export_result = run_task_command('task +LATEST export')
        if export_result['success'] and export_result['stdout'].strip():
            try:
                task = json.loads(export_result['stdout'])
                if task:  # Vérifier que la liste des tâches n'est pas vide
                    return jsonify({
                        'success': True,
                        'message': 'Task created successfully',
                        'task': task[0]  # Prendre la première tâche créée
                    })
            except (json.JSONDecodeError, IndexError) as e:
                print(f"Error parsing task data: {e}")
    
    # En cas d'erreur
    return jsonify({
        'success': create_result.get('success', False),
        'error': create_result.get('stderr', 'Failed to create task'),
        'task': None
    })

@app.route('/api/tasks', methods=['POST'])
def create_task_from_external():
    """Create a task from an external source like Outlook email"""
    data = request.get_json()
    
    # Validate required fields
    if not data or 'source' not in data or 'action' not in data or 'mail' not in data:
        return jsonify({
            'success': False,
            'error': 'Invalid JSON format: missing required fields'
        }), 400
    
    mail_data = data.get('mail', {})
    if 'subject' not in mail_data:
        return jsonify({
            'success': False,
            'error': 'Mail subject is required'
        }), 400
    
    # Use the mail subject as the task description
    description = mail_data['subject']
    
    # Add source and action as tags for tracking
    tags = [data['source'], data['action']]
    
    # Prepare the task creation command
    command_parts = [f'add "{description}"']
    
    # Add tags
    for tag in tags:
        command_parts.append(f'+{tag}')
    
    # Execute the command to create the task
    command = f'task {" ".join(command_parts)}'
    create_result = run_task_command(command)
    
    if create_result['success']:
        # Export the newly created task to get full details
        export_result = run_task_command('task +LATEST export')
        if export_result['success'] and export_result['stdout'].strip():
            try:
                task = json.loads(export_result['stdout'])
                if task:
                    return jsonify({
                        'success': True,
                        'message': 'Task created successfully from external source',
                        'task': task[0]
                    }), 201
            except (json.JSONDecodeError, IndexError) as e:
                print(f"Error parsing task data: {e}")
                return jsonify({
                    'success': False,
                    'error': 'Internal error processing task data'
                }), 500
    
    # Handle errors
    return jsonify({
        'success': False,
        'error': create_result.get('stderr', 'Failed to create task from external source')
    }), 500

if __name__ == '__main__':
    # Check if TaskWarrior is installed
    check_result = run_task_command('task version')
    if not check_result['success']:
        print("Warning: TaskWarrior doesn't seem to be installed or accessible")
        print("Please install TaskWarrior: sudo apt-get install taskwarrior")
    else:
        print("TaskWarrior found:", check_result['stdout'].split('\n')[0])
    
    print("Starting TaskWarrior Web UI...")
    print("Access the interface at: http://localhost:5000")
    app.run(host='0.0.0.0', port=5000, debug=True)
