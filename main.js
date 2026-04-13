// TaskWarrior Web UI - Frontend JavaScript

class TaskWarriorUI {
    constructor() {
        this.tasks = [];
        this.currentEditingTask = null;
        this.currentContext = ''; // 'pro', 'perso', or '' for all
        this.currentFilters = {
            project: null,
            tags: []
        };
        this.projects = new Set(); // Pour stocker la liste des projets uniques
        
        // Initialiser le composant TaskEditor
        this.taskEditor = new TaskEditor({
            showAllFields: true,
            priorityFormat: 'letters',
            language: 'en',
            modalId: 'unified-task-editor',
            onSave: (taskData, isEdit) => this.handleTaskSave(taskData, isEdit),
            onCancel: () => this.handleTaskCancel()
        });
       
        // Attendre que les composants soient initialisés avant de charger les tâches
        setTimeout(() => {
            this.initializeEventListeners();
            this.loadTasks();
            this.updateProjectSuggestions();
        }, 100);
    }

    initializeEventListeners() {
        document.getElementById('refresh-btn').addEventListener('click', () => this.loadTasks());
        
        // Add event listener for the add task button
        const addTaskBtn = document.getElementById('add-task-btn');
        console.log('Blabla');
        // Bouton pour ajouter une nouvelle tâche
        if (addTaskBtn) {
            addTaskBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                console.log('Bouton ajouter tâche cliqué');
                if (typeof taskEditor !== 'undefined') {
                    taskEditor.show(); // Ouvrir l'éditeur sans données de tâche
                } else {
                    console.error('taskEditor is not defined');
                    alert('Task editor is not available.');
                }
            });
        }
        
        // Add context selection event listeners
        document.querySelectorAll('.context-option').forEach(button => {
            button.addEventListener('click', (e) => this.setContext(e.target.getAttribute('data-context')));
        });

        // Add advanced filters event listeners
        document.getElementById('apply-filters').addEventListener('click', () => this.applyFilters());
        document.getElementById('clear-filters').addEventListener('click', () => this.clearFilters());
        
        // Apply filters on Enter key in filter inputs
        const projectInput = document.getElementById('filter-project');
        const tagsInput = document.getElementById('filter-tags');
        
        // Update project suggestions as user types
        projectInput.addEventListener('input', (e) => {
            this.updateProjectSuggestions(e.target.value);
        });
        
        // Apply filters on Enter
        [projectInput, tagsInput].forEach(input => {
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.applyFilters();
                }
            });
        });
    }



    async loadTasks() {
        try {
            this.showLoading(true);
            this.hideError();

            // Load tasks and projects in parallel
            const [tasksResponse, projectsResponse] = await Promise.all([
                fetch('/api/tasks'),
                fetch('/api/projects')
            ]);

            const tasksData = await tasksResponse.json();
            const projectsData = await projectsResponse.json();

            if (tasksData.success) {
                this.tasks = tasksData.tasks;
                this.renderTasks();
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
        this.showNotification(isEdit ? 'Task updated successfully' : 'Tâche ajoutée avec succès', 'success');
    }
    
    // Gestionnaire pour l'annulation
    handleTaskCancel() {
        this.currentEditingTask = null;
    }
    


    // Filter tasks based on current context and advanced filters
    getFilteredTasks() {
        return this.tasks.filter(task => {
            // Filter by context (pro/perso)
            if (this.currentContext) {
                if (!task.tags || !task.tags.includes(this.currentContext)) {
                    return false;
                }
            }
            
            // Filter by project
            if (this.currentFilters.project && task.project !== this.currentFilters.project) {
                return false;
            }
            
            // Filter by tags
            if (this.currentFilters.tags && this.currentFilters.tags.length > 0) {
                if (!task.tags || !this.currentFilters.tags.every(tag => task.tags.includes(tag))) {
                    return false;
                }
            }
            
            // Filter by planned & incomplete status
            if (this.currentFilters.showPlannedIncomplete) {
                // Check if task has a scheduled date in the past and is not completed
                if (task.scheduled && !task.completed) {
                    // Parse scheduled date (format: YYYYMMDDTHHMMSSZ)
                    const scheduledDate = new Date(task.scheduled.replace(
                        /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/,
                        '$1-$2-$3T$4:$5:$6'
                    ));
                    const now = new Date();
                    
                    // Check if scheduled date is in the past
                    if (scheduledDate < now) {
                        return true;
                    }
                }
                return false;
            }
            
            return true;
        });
    }
    
    // Apply advanced filters
    applyFilters() {
        const project = document.getElementById('filter-project').value.trim();
        const tags = document.getElementById('filter-tags').value
            .split(',')
            .map(tag => tag.trim())
            .filter(tag => tag.length > 0);
        const showPlannedIncomplete = document.getElementById('filter-planned-incomplete').checked;
            
        this.currentFilters = {
            project: project || null,
            tags: tags,
            showPlannedIncomplete: showPlannedIncomplete
        };
        
        this.renderTasks();
    }
    
    // Clear all filters
    clearFilters() {
        document.getElementById('filter-project').value = '';
        document.getElementById('filter-tags').value = '';
        document.getElementById('filter-planned-incomplete').checked = false;
        
        this.currentFilters = {
            project: null,
            tags: [],
            showPlannedIncomplete: false
        };
        
        this.renderTasks();
    }

    // Set the current context and update the UI
    setContext(context) {
        this.currentContext = context;
        
        // Update active state of context buttons
        document.querySelectorAll('.context-option').forEach(button => {
            if (button.getAttribute('data-context') === context) {
                button.classList.add('active');
            } else {
                button.classList.remove('active');
            }
        });
        
        // Re-render tasks with the new filter
        this.updateProjectsList();
        this.renderTasks();
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
        
        // Update projects list whenever tasks are rendered
        this.updateProjectsList();
        
        const filteredTasks = this.getFilteredTasks();
        
        if (filteredTasks.length === 0) {
            container.innerHTML = '<div class="no-tasks">No tasks found' + 
                (this.currentContext ? ` in context "${this.currentContext}"` : '') + 
                (this.currentFilters.project ? ` for project "${this.currentFilters.project}"` : '') + 
                (this.currentFilters.tags.length > 0 ? ` with tags: ${this.currentFilters.tags.join(', ')}` : '') + 
                '</div>';
            return;
        }
        
        // Vide le conteneur
        container.innerHTML = '';
        
        // Crée et ajoute chaque carte de tâche
        filteredTasks.forEach(task => {
            const taskCard = taskCardManager.createTaskCard(task, 'full');
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

    showNotification(message, type = 'success') {
        const notification = document.getElementById('notification');
        notification.textContent = message;
        notification.className = `notification ${type}`;
        notification.classList.add('show');

        setTimeout(() => {
            notification.classList.remove('show');
        }, 3000);
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
