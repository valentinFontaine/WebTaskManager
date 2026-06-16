#!/usr/bin/env python3
"""
TaskWarrior Web UI - Backend Server
A lightweight Flask server to interface with TaskWarrior commands
"""

from flask import Flask, jsonify, request, send_from_directory, Response
from flask_cors import CORS
import subprocess
import json
import os
import re
import time
import threading
from queue import Queue, Empty
from pathlib import Path
from datetime import datetime
from config import DEVELOPER_MODE, DEBUG_FILE
try:
    from config import KANBAN_COLUMNS
except ImportError:
    KANBAN_COLUMNS = ['backlog', 'todo', 'doing', 'review', 'done']

# Accepts a UUID (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx) or a plain integer task ID
_TASK_ID_RE = re.compile(
    r'^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\d+)$',
    re.IGNORECASE
)

def _valid_task_id(task_id):
    return bool(_TASK_ID_RE.match(str(task_id)))

# Context filter cache — avoids mutating rc.context on every request
_ctx_cache: dict = {}
_ctx_cache_ts: float = 0.0

def _get_context_filters() -> dict:
    """Return {name: read_filter_string} for all defined contexts, cached 30s."""
    global _ctx_cache, _ctx_cache_ts
    if time.time() - _ctx_cache_ts < 30:
        return _ctx_cache
    result = run_task_command(['task', '_show'])
    filters = {}
    if result['success']:
        for line in result['stdout'].splitlines():
            m = re.match(r'^context\.(.+?)\.read=(.+)$', line)
            if m:
                filters[m.group(1)] = m.group(2)
    _ctx_cache, _ctx_cache_ts = filters, time.time()
    return filters

def log_command(args):
    """Log the command to the debug file with a timestamp"""
    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    with open(DEBUG_FILE, 'a') as f:
        f.write(f"[{timestamp}] {' '.join(args)}\n")

app = Flask(__name__, static_folder='.', static_url_path='')
CORS(app)

# ── Hook prompt system ────────────────────────────────────────────────────────
_PROMPT_DIR = Path('/tmp/tw-web-prompts')
_PROMPT_DIR.mkdir(exist_ok=True)

_sse_clients: dict[int, Queue] = {}
_sse_lock = threading.Lock()

def _sse_broadcast(event: dict):
    """Push an event to all connected SSE clients."""
    msg = f"data: {json.dumps(event)}\n\n"
    with _sse_lock:
        for q in list(_sse_clients.values()):
            try:
                q.put_nowait(msg)
            except Exception:
                pass

def _prompt_watcher():
    """Background thread: watch for .prompt files written by hooks."""
    seen: set[str] = set()
    while True:
        try:
            for pf in sorted(_PROMPT_DIR.glob('*.prompt')):
                stem = pf.stem
                if stem not in seen:
                    seen.add(stem)
                    try:
                        _sse_broadcast(json.loads(pf.read_text()))
                    except Exception:
                        pass
            # Prune stale entries no longer on disk
            seen &= {f.stem for f in _PROMPT_DIR.glob('*.prompt')}
        except Exception:
            pass
        time.sleep(0.3)

_watcher_thread = threading.Thread(target=_prompt_watcher, daemon=True, name='prompt-watcher')
_watcher_thread.start()

def _get_recurrence_filter():
    """Return the TW filter string for the 'recurring' status button.
    Reads recurrence.field from tw-web.rc (via task _show):
      recurrence.field=r    → r.any:    (recurrence-overhaul hook)
      recurrence.field=recur or unset → +RECURRING (standard TW)
    """
    result = subprocess.run(
        ['task', '_show'], capture_output=True, text=True
    )
    for line in result.stdout.splitlines():
        if line.startswith('recurrence.field='):
            field = line.split('=', 1)[1].strip()
            if field and field != 'recur':
                return f'{field}.any:'
    return '+RECURRING'

RECURRING_FILTER = _get_recurrence_filter()

# Environment passed to every task/hook subprocess.
# TW_WEB=1 signals hooks that they are running in a non-interactive web context.
# Hooks should check this and skip prompts, curses UIs, or interactive tools
# (hledger-add, fzf, vim, whiptail, etc.), using defaults or deferring instead.
_TW_ENV = {**os.environ, 'TW_WEB': '1'}

# Timeout (seconds) for any single task command.
# Prevents a hung interactive hook from deadlocking the Flask request.
TASK_TIMEOUT = 15

def run_task_command(args):
    """Execute a TaskWarrior command and return the result.
    args must be a list, e.g. ['task', 'status:pending', 'export'].
    shell=True is intentionally not used.

    rc.confirmation=no is injected per-call (not via tw-web.rc) so it only
    applies to web-context commands, not CLI task/tw invocations.
    """
    try:
        if args[0] != 'task':
            args = ['task'] + args
        # Inject web-only rc overrides immediately after 'task'
        args = [args[0], 'rc.confirmation=no'] + args[1:]

        log_command(args)

        if DEVELOPER_MODE:
            return {
                'success': True,
                'stdout': f'[DEV MODE] Command logged to {DEBUG_FILE}: {" ".join(args)}',
                'stderr': '',
                'returncode': 0
            }

        result = subprocess.run(
            args, capture_output=True, text=True,
            env=_TW_ENV, timeout=TASK_TIMEOUT
        )
        return {
            'success': result.returncode == 0,
            'stdout': result.stdout,
            'stderr': result.stderr,
            'returncode': result.returncode
        }
    except subprocess.TimeoutExpired:
        return {
            'success': False,
            'stdout': '',
            'stderr': (
                f'Command timed out after {TASK_TIMEOUT}s. '
                'A hook may require terminal interaction — run this command in a terminal instead.'
            ),
            'returncode': -1
        }
    except Exception as e:
        return {
            'success': False,
            'stdout': '',
            'stderr': str(e),
            'returncode': -1
        }

def run_command(args):
    """Run an arbitrary command (not task). Returns same dict as run_task_command."""
    try:
        result = subprocess.run(
            args, capture_output=True, text=True,
            env=_TW_ENV, timeout=TASK_TIMEOUT
        )
        return {
            'success': result.returncode == 0,
            'stdout': result.stdout,
            'stderr': result.stderr,
            'returncode': result.returncode
        }
    except subprocess.TimeoutExpired:
        return {'success': False, 'stdout': '', 'stderr': f'Command timed out after {TASK_TIMEOUT}s.', 'returncode': -1}
    except Exception as e:
        return {'success': False, 'stdout': '', 'stderr': str(e), 'returncode': -1}

@app.route('/api/debug', methods=['POST'])
def api_debug():
    """Temporary JS error logging endpoint"""
    data = request.get_json(silent=True) or {}
    print(f"[JS-DEBUG] {data.get('msg', '(no message)')}", flush=True)
    return jsonify({'ok': True})

@app.route('/')
def index():
    """Serve the main HTML page"""
    return send_from_directory('.', 'index.html')

@app.route('/<path:filename>')
def static_files(filename):
    """Serve static files (CSS, JS, etc.)"""
    return send_from_directory('.', filename)

@app.route('/api/tasks/due')
def get_due_tasks():
    """Get tasks that have a due date but no scheduled date (for calendar due-event display)."""
    statuses = [s.strip() for s in request.args.get('status', 'pending').split(',') if s.strip()]
    status_args = _build_task_filter(statuses, None)
    result = run_task_command(['task', 'due.any:', 'scheduled.none:'] + status_args + ['export'])
    if result['success']:
        try:
            tasks = json.loads(result['stdout'])
            return jsonify({'success': True, 'data': tasks})
        except json.JSONDecodeError as e:
            return jsonify({'success': False, 'error': f'JSON decode error: {str(e)}'}), 500
    return jsonify({'success': False, 'error': 'Failed to retrieve due tasks', 'stderr': result['stderr']}), 500

@app.route('/api/tasks/planned')
def get_planned_tasks():
    """Get all planned tasks (with scheduled date) in JSON format"""
    statuses = [s.strip() for s in request.args.get('status', 'pending').split(',') if s.strip()]
    status_args = _build_task_filter(statuses, None)
    result = run_task_command(['task', 'scheduled.not:'] + status_args + ['export'])

    if result['success']:
        try:
            tasks = json.loads(result['stdout'])
            return jsonify({'success': True, 'data': tasks})
        except json.JSONDecodeError as e:
            return jsonify({
                'success': False,
                'error': f'JSON decode error: {str(e)}',
                'stdout': result['stdout'],
                'stderr': result['stderr']
            }), 500
    else:
        return jsonify({
            'success': False,
            'error': 'Failed to retrieve planned tasks',
            'stderr': result['stderr']
        }), 500

def _build_task_filter(statuses, filter_text):
    """Build a TW filter argument list from status ids and optional filter text.
    Multiple statuses are OR'd; filter text is AND'd with the status block.
    Returns a list of args to insert before 'export'.
    """
    STATUS_MAP = {
        'pending':   'status:pending',
        'waiting':   'status:waiting',
        'completed': 'status:completed',
        'deleted':   'status:deleted',
        'recurring': RECURRING_FILTER,
    }
    parts = [STATUS_MAP[s] for s in statuses if s in STATUS_MAP]
    if not parts:
        parts = ['status:pending']

    if len(parts) == 1:
        args = parts
    else:
        args = ['('] + [p for pair in zip(parts, ['or'] * len(parts)) for p in pair][:-1] + [')']

    if filter_text:
        args.append(f'description.contains:{filter_text}')

    return args


@app.route('/api/tasks')
def get_tasks():
    """Get all pending tasks in JSON format.
    Query params: status (comma-separated), filter (text), context (name).
    """
    statuses    = [s.strip() for s in request.args.get('status', 'pending').split(',') if s.strip()]
    # Sanitise filter text: keep only alphanumeric, spaces, and common safe chars
    raw_filter  = request.args.get('filter', '').strip()
    filter_text = re.sub(r'[^\w\s\-\.]', '', raw_filter)[:80]
    context     = request.args.get('context', '').strip()

    args = ['task']
    # Apply context as an inline filter (no rc.context= so TW state is never mutated)
    if context:
        ctx_filters = _get_context_filters()
        ctx_expr = ctx_filters.get(context)
        if ctx_expr:
            args += ['(', ctx_expr, ')']
    args += _build_task_filter(statuses, filter_text)
    args.append('export')

    result = run_task_command(args)

    if result['success']:
        try:
            tasks = json.loads(result['stdout'])
            tasks.sort(key=lambda x: x.get('urgency', 0), reverse=True)
            warnings = [l for l in result['stderr'].splitlines() if l.strip()]
            return jsonify({'success': True, 'tasks': tasks, 'warnings': warnings})
        except json.JSONDecodeError as e:
            return jsonify({
                'success': False,
                'error': f'JSON decode error: {str(e)}',
                'stdout': result['stdout'],
                'stderr': result['stderr']
            }), 500
    else:
        return jsonify({
            'success': False,
            'error': 'Failed to retrieve tasks',
            'stderr': result['stderr']
        }), 500

@app.route('/api/projects')
def get_projects():
    """Get all unique projects from TaskWarrior, including completed tasks"""
    result = run_task_command(['task', '_projects'])

    if result['success']:
        try:
            projects = [p.strip() for p in result['stdout'].split('\n') if p.strip()]
            return jsonify({'success': True, 'projects': projects})
        except Exception as e:
            return jsonify({
                'success': False,
                'error': f'Failed to parse projects: {str(e)}'
            }), 500
    else:
        return jsonify({'success': False, 'error': result['stderr']}), 500

@app.route('/api/contexts')
def get_contexts():
    """Get all defined contexts, their filter definitions, and the active context."""
    filters = _get_context_filters()
    # Exclude cmx composite contexts (contain ':') — they're internal plumbing
    contexts = [k for k in filters if ':' not in k]

    active_result = run_task_command(['task', '_get', 'rc.context'])
    active = active_result['stdout'].strip() if active_result['success'] else ''

    return jsonify({'success': True, 'contexts': contexts, 'filters': filters, 'active': active})

def _warnings(result):
    """Extract non-empty stderr lines as a warnings list."""
    return [l for l in result['stderr'].splitlines() if l.strip()]

@app.route('/api/task/<task_id>/start', methods=['POST'])
def start_task(task_id):
    """Start a task"""
    if not _valid_task_id(task_id):
        return jsonify({'success': False, 'message': 'Invalid task ID'}), 400
    result = run_task_command(['task', task_id, 'start'])
    return jsonify({
        'success': result['success'],
        'message': result['stdout'] if result['success'] else result['stderr'],
        'warnings': _warnings(result)
    })

@app.route('/api/task/<task_id>/stop', methods=['POST'])
def stop_task(task_id):
    """Stop a task"""
    if not _valid_task_id(task_id):
        return jsonify({'success': False, 'message': 'Invalid task ID'}), 400
    result = run_task_command(['task', task_id, 'stop'])
    return jsonify({
        'success': result['success'],
        'message': result['stdout'] if result['success'] else result['stderr'],
        'warnings': _warnings(result)
    })

@app.route('/api/task/<task_id>/done', methods=['POST'])
def complete_task(task_id):
    """Mark a task as done"""
    if not _valid_task_id(task_id):
        return jsonify({'success': False, 'message': 'Invalid task ID'}), 400
    result = run_task_command(['task', task_id, 'done'])
    return jsonify({
        'success': result['success'],
        'message': result['stdout'] if result['success'] else result['stderr'],
        'warnings': _warnings(result)
    })

@app.route('/api/task/<task_id>/delete', methods=['DELETE'])
def delete_task(task_id):
    """Delete a task"""
    if not _valid_task_id(task_id):
        return jsonify({'success': False, 'message': 'Invalid task ID'}), 400
    result = run_task_command(['task', task_id, 'delete'])
    return jsonify({
        'success': result['success'],
        'message': result['stdout'] if result['success'] else result['stderr'],
        'warnings': _warnings(result)
    })

@app.route('/api/task/<task_id>/modify', methods=['PUT'])
def modify_task(task_id):
    """Modify a task"""
    if not _valid_task_id(task_id):
        return jsonify({'success': False, 'message': 'Invalid task ID'}), 400

    data = request.get_json()
    modifications = []

    if 'description' in data and data['description']:
        modifications.append(f'description:{data["description"]}')

    if 'tags' in data:
        # Clear all existing tags atomically in the same modify command
        modifications.append('-TAGS')
        if isinstance(data['tags'], list):
            for tag in data['tags']:
                if tag and tag.strip():
                    modifications.append(f'+{tag.strip()}')

    if 'due' in data:
        modifications.append(f'due:{data["due"]}' if data['due'] else 'due:')

    if 'scheduled' in data:
        modifications.append(f'scheduled:{data["scheduled"]}' if data['scheduled'] else 'scheduled:')

    if 'priority' in data:
        modifications.append(f'priority:{data["priority"]}' if data['priority'] else 'priority:')

    if 'project' in data:
        modifications.append(f'project:{data["project"]}' if data['project'] else 'project:')

    if 'sched_duration' in data and data['sched_duration']:
        modifications.append(f'sched_duration:{data["sched_duration"]}')

    if 'due_duration' in data and data['due_duration']:
        modifications.append(f'due_duration:{data["due_duration"]}')

    if 'state' in data:
        modifications.append(f'state:{data["state"]}' if data['state'] else 'state:')

    if modifications:
        result = run_task_command(['task', task_id, 'modify'] + modifications)

        if result['success']:
            export_result = run_task_command(['task', task_id, 'export'])
            if export_result['success'] and export_result['stdout'].strip():
                try:
                    task = json.loads(export_result['stdout'])
                    if task:
                        return jsonify({
                            'success': True,
                            'message': result['stdout'],
                            'task': task[0],
                            'warnings': _warnings(result)
                        })
                except (json.JSONDecodeError, IndexError) as e:
                    print(f"Error parsing task data: {e}")
                    return jsonify({'success': True, 'message': result['stdout'], 'task': None, 'warnings': _warnings(result)})

        return jsonify({
            'success': result['success'],
            'message': result['stdout'] if result['success'] else result['stderr'],
            'task': None,
            'warnings': _warnings(result)
        })
    else:
        return jsonify({'success': True, 'message': 'No changes to apply', 'task': None, 'warnings': []})

@app.route('/api/config')
def get_config():
    """Return client-configurable settings."""
    import config as _cfg
    return jsonify({
        'notification_timeout': getattr(_cfg, 'NOTIFICATION_TIMEOUT', 3000)
    })

@app.route('/api/kanban/columns')
def get_kanban_columns():
    """Return configured kanban column names"""
    return jsonify({'success': True, 'columns': KANBAN_COLUMNS})

@app.route('/api/task/add', methods=['POST'])
def add_task():
    """Add a new task"""
    data = request.get_json()

    if not data.get('description'):
        return jsonify({'success': False, 'error': 'Description is required'}), 400

    args = ['task', 'add', data['description']]

    if data.get('tags'):
        if isinstance(data['tags'], list):
            for tag in data['tags']:
                args.append(f'+{tag}')

    if data.get('due'):
        args.append(f'due:{data["due"]}')

    if data.get('scheduled'):
        args.append(f'scheduled:{data["scheduled"]}')

    if data.get('priority'):
        args.append(f'priority:{data["priority"]}')

    if data.get('project'):
        args.append(f'project:{data["project"]}')

    if data.get('sched_duration'):
        args.append(f'sched_duration:{data["sched_duration"]}')

    if data.get('due_duration'):
        args.append(f'due_duration:{data["due_duration"]}')

    create_result = run_task_command(args)

    if create_result['success']:
        export_result = run_task_command(['task', '+LATEST', 'export'])
        if export_result['success'] and export_result['stdout'].strip():
            try:
                task = json.loads(export_result['stdout'])
                if task:
                    return jsonify({
                        'success': True,
                        'message': 'Task created successfully',
                        'task': task[0],
                        'warnings': _warnings(create_result)
                    })
            except (json.JSONDecodeError, IndexError) as e:
                print(f"Error parsing task data: {e}")

    return jsonify({
        'success': create_result.get('success', False),
        'error': create_result.get('stderr', 'Failed to create task'),
        'task': None,
        'warnings': _warnings(create_result)
    })

@app.route('/api/sync/status')
def sync_status():
    from pathlib import Path
    task_dir = Path.home() / '.task'
    if not (task_dir / '.git').exists():
        return jsonify({'changes': 0, 'git': False})

    # Primary: count unpushed commits — gittw commits after each task op so
    # this accurately reflects "how many task changes since last sync"
    unpushed_r = subprocess.run(
        ['git', '-C', str(task_dir), 'rev-list', '@{u}..HEAD', '--count'],
        capture_output=True, text=True
    )
    if unpushed_r.returncode == 0:
        unpushed = int(unpushed_r.stdout.strip() or '0')
    else:
        unpushed = 0  # no upstream configured

    # Secondary: uncommitted working-tree changes (non-gittw workflows)
    dirty_r = subprocess.run(
        ['git', '-C', str(task_dir), 'status', '--porcelain'],
        capture_output=True, text=True
    )
    uncommitted = len([l for l in dirty_r.stdout.splitlines() if l.strip()])

    changes = unpushed + uncommitted
    return jsonify({'changes': changes, 'git': True})

@app.route('/api/sync/info')
def sync_info():
    import shutil
    if shutil.which('gittw'):
        return jsonify({'method': 'gittw (git-based sync)'})
    result = run_task_command(['task', '_show'])
    has_server = any(
        line.startswith('taskd.server=') and line.split('=', 1)[1].strip()
        for line in result['stdout'].splitlines()
    )
    return jsonify({'method': 'task sync' + (' — server configured' if has_server else ' — no server configured')})

@app.route('/api/sync', methods=['POST'])
def sync_tasks():
    import shutil
    if shutil.which('gittw'):
        result = run_command(['gittw', 'sync'])
    else:
        result = run_task_command(['task', 'sync'])
    output = result['stdout'].strip() or result['stderr'].strip()
    return jsonify({
        'success': result['success'],
        'output': output,
        'warnings': _warnings(result)
    })

@app.route('/api/events')
def sse_stream():
    """Server-Sent Events stream — delivers hook prompts to the browser."""
    def generate():
        q: Queue = Queue()
        client_id = id(q)
        with _sse_lock:
            _sse_clients[client_id] = q
        try:
            # Replay any prompt files already waiting (e.g. page reload mid-prompt)
            for pf in sorted(_PROMPT_DIR.glob('*.prompt')):
                if not (_PROMPT_DIR / (pf.stem + '.answer')).exists():
                    try:
                        yield f"data: {json.dumps(json.loads(pf.read_text()))}\n\n"
                    except Exception:
                        pass
            while True:
                try:
                    yield q.get(timeout=20)
                except Empty:
                    yield ': ka\n\n'   # keepalive — prevents proxy timeouts
        finally:
            with _sse_lock:
                _sse_clients.pop(client_id, None)

    return Response(generate(), mimetype='text/event-stream',
                    headers={'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no'})


@app.route('/api/hook-answer', methods=['POST'])
def hook_answer():
    """Receive the user's answer to a hook prompt and write it for the hook to read."""
    data = request.get_json(silent=True) or {}
    prompt_id = data.get('id', '')
    answer    = data.get('answer', 'no')
    if not prompt_id or '/' in prompt_id or '..' in prompt_id:
        return jsonify({'ok': False, 'error': 'invalid id'}), 400
    answer_file = _PROMPT_DIR / f'{prompt_id}.answer'
    prompt_file = _PROMPT_DIR / f'{prompt_id}.prompt'
    answer_file.write_text(json.dumps({'answer': answer}))
    # Clean up the prompt file so the watcher stops re-broadcasting it
    prompt_file.unlink(missing_ok=True)
    return jsonify({'ok': True})


if __name__ == '__main__':
    check_result = run_task_command(['task', 'version'])
    if not check_result['success']:
        print("Warning: TaskWarrior doesn't seem to be installed or accessible")
        print("Please install TaskWarrior: sudo apt-get install taskwarrior")
    else:
        print("TaskWarrior found:", check_result['stdout'].split('\n')[0])

    print("Starting TaskWarrior Web UI...")
    print("Access the interface at: http://localhost:5000")
    app.run(host='0.0.0.0', port=5000, debug=True, threaded=True)
