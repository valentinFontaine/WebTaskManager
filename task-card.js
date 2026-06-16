/**
 * TaskActionHandler - Interface pour gérer les actions des tâches
 * Version autonome sans dépendance à l'objet app global
 */
class TaskActionHandler {
    /**
     * @param {Object} options - Options de configuration
     * @param {Function} options.onTaskUpdate - Callback pour mise à jour des tâches
     * @param {Function} options.onTaskDelete - Callback pour suppression de tâche
     * @param {Function} options.onEditRequest - Callback pour demande d'édition
     * @param {Function} options.showNotification - Callback pour afficher des notifications
     */
    constructor(options = {}) {
        this.onTaskUpdate = options.onTaskUpdate || (() => {});
        this.onTaskDelete = options.onTaskDelete || (() => {});
        this.onEditRequest = options.onEditRequest || (() => {});
        this.showNotification = options.showNotification || (() => {});
    }

    async performTaskAction(taskUuid, action) {
        const actionMap = {
            'start': 'POST',
            'stop': 'POST',
            'done': 'POST',
            'delete': 'DELETE'
        };

        const method = actionMap[action];
        const endpoint = action === 'delete' ? `/api/task/${taskUuid}/delete` : `/api/task/${taskUuid}/${action}`;

        try {
            const response = await fetch(endpoint, { method });
            const data = await response.json();

            if (data.success) {
                if (action === 'delete' || action === 'done') {
                    this.onTaskDelete(taskUuid);
                } else if (data.task) {
                    this.onTaskUpdate(data.task);
                } else {
                    this.onTaskUpdate(null);
                }
                if (data.warnings && data.warnings.length > 0) {
                    this.showNotification(data.warnings.join(' | '), 'warning');
                } else {
                    this.showNotification(`Task ${action} successful`, 'success');
                }
            } else {
                this.showNotification(data.message || `Failed to ${action} task`, 'error');
            }
        } catch (error) {
            this.showNotification('Network error: ' + error.message, 'error');
        }
    }
    

    
    confirmDelete(taskUuid) {
        if (confirm('Are you sure you want to delete this task?')) {
            this.performTaskAction(taskUuid, 'delete');
        }
    }
}

/**
 * ScriptTaskActionHandler - Implémentation spécifique pour main.js
 * Maintenue pour compatibilité ascendante
 */
class ScriptTaskActionHandler extends TaskActionHandler {
    constructor() {
        super({
            onTaskUpdate: (task) => {
                if (task) {
                    const taskIndex = app.tasks.findIndex(t => t.uuid === task.uuid);
                    if (taskIndex !== -1) {
                        app.tasks[taskIndex] = task;
                    }
                }
                app.renderTasks();
            },
            onTaskDelete: (taskUuid) => {
                app.removeTaskCard(taskUuid);
                app.tasks = app.tasks.filter(task => task.uuid !== taskUuid);
            },
            onEditRequest: (task) => {
                if (typeof taskEditor !== 'undefined') {
                    taskEditor.showForTask(task);
                } else {
                    console.error('taskEditor is not defined');
                }
            },
            showNotification: (message, type) => app.showNotification(message, type)
        });
    }
}


class TaskCardManager {
    static SYSTEM_TAGS = new Set(['PENDING','UNBLOCKED','TAGGED','ACTIVE','ANNOTATED','RECURRING','WAITING','DELETED','COMPLETED']);

    constructor(actionHandler = null) {
        this.actionHandler = actionHandler || new TaskActionHandler();
        // Single delegated listener for all action buttons
        document.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-task-action]');
            if (!btn) return;
            const uuid   = btn.dataset.taskUuid;
            const action = btn.dataset.taskAction;
            if (!uuid || !action) return;
            if (action === 'delete') {
                this.actionHandler.confirmDelete(uuid);
            } else if (action === 'edit') {
                const card = btn.closest('.task-card');
                if (card && typeof taskEditor !== 'undefined') {
                    taskEditor.showForTask(JSON.parse(card.dataset.taskData));
                }
            } else {
                this.actionHandler.performTaskAction(uuid, action);
            }
        });
    }

    createTaskCard(task) {
        const pri   = String(task.priority || '');
        const tags  = (task.tags || []).filter(t => !TaskCardManager.SYSTEM_TAGS.has(t));
        const active = !!task.start;

        const priClass = ['1','2','H'].includes(pri) ? 'pri-high'
                       : ['3','4','M'].includes(pri) ? 'pri-med'
                       : ['5','6','L'].includes(pri) ? 'pri-low' : '';

        const proj     = task.project ? `<span class="card-proj">${this._e(task.project)}</span>` : '';
        const dueHtml  = this._due(task.due);
        const schedHtml = this._sched(task.scheduled);
        const durHtml  = task.sched_duration ? `<span class="card-dur">⏱ ${this._fmtDur(this._parseDur(task.sched_duration))}</span>` : '';
        const tagsHtml = tags.map(t => `<span class="card-tag">+${this._e(t)}</span>`).join('');

        const anns = task.annotations || [];
        const annHtml = anns.length
            ? `<div class="card-annotations">${anns.map(a => `<div class="card-ann">${this._e(a.description)}</div>`).join('')}</div>`
            : '';

        const card = document.createElement('div');
        card.className = 'task-card';
        if (active) card.classList.add('task-started');
        card.dataset.taskId   = task.uuid;
        card.dataset.taskData = JSON.stringify(task);
        if (pri) card.dataset.pri = pri;
        if      (task.scheduled && task.due) card.dataset.type = 'both';
        else if (task.scheduled)             card.dataset.type = 'scheduled';
        else if (task.due)                   card.dataset.type = 'due';

        card.innerHTML =
            `<div class="card-main">` +
                `<div class="card-desc">${this._e(task.description)}</div>` +
                `<div class="card-meta">` +
                    (pri ? `<span class="card-pri ${priClass}">${pri}</span>` : '') +
                    proj + dueHtml + schedHtml + durHtml + tagsHtml +
                `</div>` +
                annHtml +
            `</div>` +
            `<div class="card-actions">` +
                `<button class="ca-btn ca-stop"   data-task-action="stop"   data-task-uuid="${task.uuid}" ${active ? '' : 'style="display:none"'}>⏸</button>` +
                `<button class="ca-btn ca-start"  data-task-action="start"  data-task-uuid="${task.uuid}" ${active ? 'style="display:none"' : ''}>▶</button>` +
                `<button class="ca-btn ca-edit"   data-task-action="edit"   data-task-uuid="${task.uuid}">✏</button>` +
                `<button class="ca-btn ca-done"   data-task-action="done"   data-task-uuid="${task.uuid}">✓</button>` +
                `<button class="ca-btn ca-delete" data-task-action="delete" data-task-uuid="${task.uuid}">✕</button>` +
            `</div>`;

        return card;
    }

    _due(due) {
        if (!due) return '';
        const m = due.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
        if (!m) return '';
        const d    = new Date(Date.UTC(+m[1], +m[2]-1, +m[3], +m[4], +m[5], +m[6]));
        const days = (d - Date.now()) / 86400000;
        const cls  = days < 0 ? 'overdue' : days < 3 ? 'due-soon' : '';
        const lbl  = d.toLocaleDateString(undefined, {month:'short', day:'numeric'});
        return `<span class="card-due ${cls}">${lbl}</span>`;
    }

    _sched(scheduled) {
        if (!scheduled) return '';
        const m = scheduled.match(/^(\d{4})(\d{2})(\d{2})/);
        if (!m) return '';
        const lbl = new Date(+m[1], +m[2]-1, +m[3]).toLocaleDateString(undefined, {month:'short', day:'numeric'});
        return `<span class="card-sched">${lbl}</span>`;
    }

    _parseDur(s) {
        if (!s) return 0;
        if (s.startsWith('PT')) {
            const m = s.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
            return m ? (+m[1]||0)*60 + (+m[2]||0) : 0;
        }
        const m = s.match(/(?:(\d+)h)?(?:(\d+)min)?/);
        return m ? (+m[1]||0)*60 + (+m[2]||0) : 0;
    }

    _fmtDur(mins) {
        if (!mins) return '';
        const h = Math.floor(mins/60), m = mins%60;
        return h && m ? `${h}h${m}m` : h ? `${h}h` : `${m}m`;
    }

    _e(t) {
        const d = document.createElement('div');
        d.textContent = String(t ?? '');
        return d.innerHTML;
    }
}


