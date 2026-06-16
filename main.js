// TaskWarrior Web UI - Frontend JavaScript

class TaskWarriorUI {
    constructor() {
        this.tasks = [];
        this.serverTotal = null;
        this.currentEditingTask = null;
        this.projects = new Set();
        
        // Initialiser le composant TaskEditor
        this.taskEditor = new TaskEditor({
            showAllFields: true,
            priorityFormat: 'letters',
            language: 'en',
            modalId: 'unified-task-editor',
            onSave: (taskData, isEdit) => this.handleTaskSave(taskData, isEdit),
            onCancel: () => this.handleTaskCancel()
        });
        
        this.viewMode    = localStorage.getItem('tw-view-mode')    || 'card';
        this.sortField   = localStorage.getItem('tw-sort-field')   || 'urgency';
        this.sortReverse = localStorage.getItem('tw-sort-reverse') === 'true';

        // Wait for components to initialise before loading data
        setTimeout(() => {
            this.initializeEventListeners();
            this.loadTasks();
            this.updateProjectSuggestions();
        }, 100);

        // Re-fetch on server-relevant changes; re-filter only for project/tags
        document.addEventListener('tw-filter-change', (e) => {
            if (e.detail && e.detail.clientOnly) {
                this.renderTasks();
            } else {
                this.loadTasks();
            }
        });

        // Add button (nav) → open TaskEditor as a dialog
        document.addEventListener('tw-open-add', () => {
            if (typeof taskEditor !== 'undefined') taskEditor.show();
        });

        // nav.js refresh button → show notification
        document.addEventListener('tw-show-notification', (e) => {
            const { message, type } = e.detail || {};
            if (message) this.showNotification(message, type || 'success');
        });

        // Side menu Sync action → open sync dialog
        document.addEventListener('tw-menu-action', (e) => {
            if (e.detail.action !== 'sync') return;
            this.openSyncDialog();
        });

        // Notification close button
        const notifClose = document.getElementById('notif-close');
        if (notifClose) notifClose.addEventListener('click', () => {
            document.getElementById('notification').classList.remove('show');
        });
    }

    // ── Sort ─────────────────────────────────────────────────────────────────

    static get SORT_FIELDS() {
        return [
            { value: 'urgency',     label: 'Urgency (default)' },
            { value: 'priority',    label: 'Priority' },
            { value: 'due',         label: 'Due date' },
            { value: 'description', label: 'Description' },
            { value: 'project',     label: 'Project' },
            { value: 'entry',       label: 'Created' },
            { value: 'modified',    label: 'Modified' },
            { value: 'start',       label: 'Started' },
            { value: 'scheduled',   label: 'Scheduled' },
            { value: 'wait',        label: 'Wait date' },
            { value: 'id',          label: 'ID' },
            { value: 'tags',        label: 'Tags' },
        ];
    }

    sortTasks(tasks) {
        const field = this.sortField;
        const rev   = this.sortReverse ? -1 : 1;
        if (field === 'urgency') return rev === 1 ? tasks : [...tasks].reverse();

        const PRI = { H: 3, M: 2, L: 1 };
        return [...tasks].sort((a, b) => {
            let av = a[field], bv = b[field];
            if (field === 'priority') { av = PRI[av] || 0; bv = PRI[bv] || 0; }
            else if (field === 'tags') { av = (av || []).join(','); bv = (bv || []).join(','); }
            // Dates come as ISO strings — sort as strings (lexicographic = chronological)
            av = av ?? '';
            bv = bv ?? '';
            if (av < bv) return -1 * rev;
            if (av > bv) return  1 * rev;
            return 0;
        });
    }

    updateSortBtn() {
        const btn = document.getElementById('sort-btn');
        if (!btn) return;
        const isDefault = this.sortField === 'urgency' && !this.sortReverse;
        btn.classList.toggle('sort-active', !isDefault);
        const label = TaskWarriorUI.SORT_FIELDS.find(f => f.value === this.sortField)?.label || this.sortField;
        btn.title = isDefault ? 'Sort' : `Sort: ${label}${this.sortReverse ? ' ↑' : ' ↓'}`;
    }

    initSortPopup() {
        const btn     = document.getElementById('sort-btn');
        const popup   = document.getElementById('sort-popup');
        const fields  = document.getElementById('sort-fields');
        const revBox  = document.getElementById('sort-reverse');
        if (!btn || !popup || !fields || !revBox) return;

        // Build radio list
        fields.innerHTML = TaskWarriorUI.SORT_FIELDS.map(f =>
            `<label><input type="radio" name="tw-sort" value="${f.value}"${f.value === this.sortField ? ' checked' : ''}> ${f.label}</label>`
        ).join('');
        revBox.checked = this.sortReverse;

        // Toggle popup
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            popup.style.display = popup.style.display === 'none' ? 'block' : 'none';
        });

        // Field change
        fields.addEventListener('change', (e) => {
            if (e.target.name === 'tw-sort') {
                this.sortField = e.target.value;
                localStorage.setItem('tw-sort-field', this.sortField);
                this.updateSortBtn();
                this.renderTasks();
            }
        });

        // Reverse toggle
        revBox.addEventListener('change', () => {
            this.sortReverse = revBox.checked;
            localStorage.setItem('tw-sort-reverse', this.sortReverse);
            this.updateSortBtn();
            this.renderTasks();
        });

        // Close on outside click
        document.addEventListener('click', () => { popup.style.display = 'none'; });
        popup.addEventListener('click', (e) => e.stopPropagation());

        this.updateSortBtn();
    }

    initializeEventListeners() {
        const cardBtn = document.getElementById('view-card');
        const listBtn = document.getElementById('view-list');
        if (cardBtn && listBtn) {
            const setView = (mode) => {
                this.viewMode = mode;
                localStorage.setItem('tw-view-mode', mode);
                cardBtn.classList.toggle('active', mode === 'card');
                listBtn.classList.toggle('active', mode === 'list');
                const tc = document.getElementById('tasks-container');
                tc.classList.toggle('list-view', mode === 'list');
                if (mode === 'list') {
                    tc.querySelectorAll('.task-card.expanded').forEach(c => c.classList.remove('expanded'));
                    tc.querySelectorAll('.task-card.collapsed').forEach(c => c.classList.remove('collapsed'));
                }
            };
            setView(this.viewMode);
            cardBtn.addEventListener('click', () => setView('card'));
            listBtn.addEventListener('click', () => setView('list'));
        }
        this.initSortPopup();

        // Single-click anywhere on a card (not an action button) to expand/collapse
        const container = document.getElementById('tasks-container');
        if (container) {
            container.addEventListener('click', (e) => {
                if (e.target.closest('[data-task-action]')) return;
                const card = e.target.closest('.task-card');
                if (!card) return;
                if (this.viewMode === 'list') {
                    card.classList.toggle('expanded');
                } else {
                    card.classList.toggle('collapsed');
                }
            });
        }
    }



    async loadTasks() {
        try {
            this.showLoading(true);
            this.hideError();

            const state  = window.twNav ? window.twNav.getState() : {};
            const params = window.twNav ? window.twNav.stateToParams() : 'status=pending';

            // When a context is active, also fetch the unfiltered status total so the
            // denominator in filtered/total reflects all tasks in this status.
            const statusParams = new URLSearchParams();
            statusParams.set('status', (state.statuses || ['pending']).join(','));
            const needTotal = !!(state.context);

            const fetches = [
                fetch('/api/tasks?' + params).then(r => r.json()),
                needTotal ? fetch('/api/tasks?' + statusParams).then(r => r.json()) : Promise.resolve(null),
                fetch('/api/projects').then(r => r.json()),
            ];
            const [tasksData, totalData, projectsData] = await Promise.all(fetches);

            if (tasksData.success) {
                this.tasks = tasksData.tasks;
                sessionStorage.setItem('tw-tasks-cache', JSON.stringify(this.tasks));
                this.serverTotal = totalData && totalData.success ? totalData.tasks.length : this.tasks.length;
                this.renderTasks();
                if (tasksData.warnings && tasksData.warnings.length > 0) {
                    this.showNotification(tasksData.warnings.join(' | '), 'warning');
                }
            } else {
                this.showError(tasksData.error || 'Failed to load tasks');
            }

            if (projectsData.success) {
                this.updateProjectDatalist(projectsData.projects);
                // Mettre à jour aussi les suggestions du TaskCreator
                if (this.taskCreator) {
                    this.taskCreator.updateProjectSuggestions(projectsData.projects);
                }
            }
        } catch (error) {
            this.showError('Network error: ' + error.message);
        } finally {
            this.showLoading(false);
        }
    }
    
    // Update the project datalist with all available projects
    updateProjectDatalist(projects) {
        const datalist = document.getElementById('project-options');
        if (!datalist) return;
        
        // Clear existing options
        datalist.innerHTML = '';
        
        // Add projects to datalist
        projects.forEach(project => {
            if (project) {  // Only add non-empty projects
                const option = document.createElement('option');
                option.value = project;
                datalist.appendChild(option);
            }
        });
    }


    // Gestionnaire unifié pour la sauvegarde des tâches (ajout et modification)
    handleTaskSaveSuccess(task, isEdit) {
        if (isEdit) {
            // Mettre à jour la tâche dans le tableau local
            const taskIndex = this.tasks.findIndex(t => t.uuid === task.uuid);
            if (taskIndex !== -1) {
                this.tasks[taskIndex] = task;
            }
        } else {
            // Ajouter la nouvelle tâche au début de la liste
            this.tasks.unshift(task);
        }
        this.renderTasks();
        this.showNotification(isEdit ? 'Task updated successfully' : 'Task added successfully', 'success');
    }
    
    // Gestionnaire pour l'annulation
    handleTaskCancel() {
        this.currentEditingTask = null;
    }
    


    // Filter tasks client-side using project/tags from nav state
    getFilteredTasks() {
        const state = window.twNav ? window.twNav.getState() : {};
        const filter   = (state.filter   || '').trim().toLowerCase();
        const priority = (state.priority || '').trim().toLowerCase();
        const project  = (state.project  || '').trim().toLowerCase();
        const tags     = (state.tags     || '').split(',').map(t => t.trim()).filter(Boolean);

        return this.tasks.filter(task => {
            if (filter   && !(task.description || '').toLowerCase().includes(filter)) return false;
            if (priority && !String(task.priority || '').toLowerCase().includes(priority)) return false;
            if (project  && !(task.project      || '').toLowerCase().includes(project)) return false;
            if (tags.length > 0 && !tags.every(t => (task.tags || []).includes(t))) return false;
            return true;
        });
    }

    updateProjectsList() {
        this.projects.clear();
        this.tasks.forEach(task => {
            if (task.project) {
                this.projects.add(task.project);
            }
        });
        this.updateProjectSuggestions();
    }
    
    updateProjectSuggestions(filter = '') {
        const datalist = document.getElementById('project-suggestions');
        if (!datalist) return;
        
        // Clear existing options
        datalist.innerHTML = '';
        
        // Filter and sort projects
        const filteredProjects = Array.from(this.projects)
            .filter(project => 
                project.toLowerCase().includes(filter.toLowerCase())
            )
            .sort();
        
        // Add filtered projects to datalist
        filteredProjects.forEach(project => {
            const option = document.createElement('option');
            option.value = project;
            datalist.appendChild(option);
        });
    }

    renderTasks() {
        const container = document.getElementById('tasks-container');
        if (!container) return;

        const filteredTasks = this.sortTasks(this.getFilteredTasks());

        // Dynamic heading: "N <Status> Tasks" — N is filtered count
        const heading = document.getElementById('tasks-heading');
        if (heading) {
            const state = window.twNav ? window.twNav.getState() : { statuses: ['pending'] };
            const status = state.statuses[0] || 'pending';
            const label = status.charAt(0).toUpperCase() + status.slice(1);
            heading.textContent = `${filteredTasks.length} ${label} Tasks`;
        }

        // Update projects list whenever tasks are rendered
        this.updateProjectsList();

        if (window.twNav) window.twNav.setCount(filteredTasks.length, this.serverTotal != null ? this.serverTotal : this.tasks.length);

        // Filter badge: show active text filter
        const badge = document.getElementById('filter-badge');
        if (badge) {
            const f = window.twNav ? window.twNav.getState().filter : '';
            badge.textContent = f ? `"${f}"` : '';
            badge.classList.toggle('visible', !!f);
        }

        // Preserve view mode class on re-render
        const tc = document.getElementById('tasks-container');
        if (tc && this.viewMode === 'list') tc.classList.add('list-view');

        if (filteredTasks.length === 0) {
            container.innerHTML = '<div class="no-tasks">No tasks found</div>';
            return;
        }
        
        // Vide le conteneur
        container.innerHTML = '';
        
        // Crée et ajoute chaque carte de tâche
        filteredTasks.forEach(task => {
            const taskCard = taskCardManager.createTaskCard(task);
            container.appendChild(taskCard);
        });
    }


    /**
     * Supprime une taskCard spécifique du DOM sans recharger toutes les tâches
     */
    removeTaskCard(taskUuid) {
        const taskCard = document.querySelector(`.task-card[data-task-id="${taskUuid}"]`);
        if (taskCard) {
            taskCard.remove();

            // Mettre à jour le message "aucune tâche" si nécessaire
            const container = document.getElementById('tasks-container');
            if (container && container.querySelectorAll('.task-card').length === 0) {
                container.innerHTML = '<div class="no-tasks">No tasks found</div>';
            }
        }
    }

    // Cette méthode n'est plus nécessaire car TaskEditor gère son propre nettoyage

    showLoading(show) {
        const loading = document.getElementById('loading');
        loading.style.display = show ? 'block' : 'none';
    }

    showError(message) {
        const errorDiv = document.getElementById('error-message');
        errorDiv.textContent = message;
        errorDiv.style.display = 'block';
    }

    hideError() {
        document.getElementById('error-message').style.display = 'none';
    }

    openSyncDialog() {
        const dialog  = document.getElementById('sync-dialog');
        const btn     = document.getElementById('sync-now-btn');
        const output  = document.getElementById('sync-output');
        const method  = document.getElementById('sync-method');
        const closeBtn = document.getElementById('sync-dialog-close');

        // Reset state
        output.style.display = 'none';
        output.textContent = '';
        btn.disabled = false;
        btn.textContent = 'Sync Now';

        // Detect sync method
        fetch('/api/sync/info')
            .then(r => r.json())
            .then(d => { method.textContent = `Method: ${d.method}`; })
            .catch(() => { method.textContent = ''; });

        dialog.style.display = 'flex';

        const close = () => { dialog.style.display = 'none'; };
        closeBtn.onclick = close;
        dialog.onclick = (e) => { if (e.target === dialog) close(); };

        btn.onclick = () => {
            btn.disabled = true;
            btn.textContent = 'Syncing…';
            output.style.display = 'none';
            fetch('/api/sync', { method: 'POST' })
                .then(r => r.json())
                .then(data => {
                    const text = data.output || (data.success ? 'Sync complete.' : 'Sync failed.');
                    output.textContent = text;
                    output.style.display = 'block';
                    btn.textContent = data.success ? 'Sync Now' : 'Retry';
                    btn.disabled = false;
                    if (data.success) { this.loadTasks(); window.twPollSyncStatus?.(); }
                })
                .catch(err => {
                    output.textContent = 'Error: ' + err;
                    output.style.display = 'block';
                    btn.textContent = 'Retry';
                    btn.disabled = false;
                });
        };
    }

    showNotification(message, type = 'success') {
        const notification = document.getElementById('notification');
        const textEl = document.getElementById('notif-text');
        if (textEl) textEl.textContent = message;
        else notification.textContent = message;
        notification.className = `notification ${type} show`;

        const timeout = (window.twNotifTimeout != null) ? window.twNotifTimeout : 3000;
        clearTimeout(this._notifTimer);
        if (timeout > 0) {
            this._notifTimer = setTimeout(() => notification.classList.remove('show'), timeout);
        }
        // timeout === 0: manual close only via × button
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}


// Initialize the app when the page loads
let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new TaskWarriorUI();
    // Initialiser taskCardManager avec le gestionnaire d'actions spécifique à main.js
    taskCardManager = new TaskCardManager(new ScriptTaskActionHandler());
    
    // Initialiser taskEditor comme variable globale
    taskEditor = new TaskEditor({
        showAllFields: true,
        priorityFormat: 'letters',
        language: 'en',
        modalId: 'unified-task-editor',
        onSaveSuccess: (task, isEdit) => app.handleTaskSaveSuccess(task, isEdit),
        onSaveError: (error) => app.showNotification(error, 'error'),
        onCancel: () => app.handleTaskCancel()
    });
});
