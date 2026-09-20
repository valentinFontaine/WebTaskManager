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
        // Projets deduits des taches affichees. Insuffisant a lui seul :
        // une tache masquee par le filtre courant emporte son projet avec elle.
        this.projects = new Set();
        // Projets connus du backend (`task _projects`), taches terminees
        // comprises. C'est la liste qui fait autorite.
        this.backendProjects = [];
        
        // Initialiser le composant TaskEditor
        this.taskEditor = new TaskEditor({
            showAllFields: true,
            priorityFormat: 'letters',
            language: 'en',
            modalId: 'unified-task-editor',
            onSave: (taskData, isEdit) => this.handleTaskSave(taskData, isEdit),
            onCancel: () => this.handleTaskCancel()
        });
       
        // Le court delai attend l'instanciation de taskCardManager, faite juste
        // apres celle-ci. Les templates de cartes, eux, arrivent par fetch : il
        // faut attendre leur disponibilite reelle. Parier sur 100 ms marchait
        // tant que rien d'autre ne sollicitait le reseau au demarrage.
        setTimeout(() => {
            this.initializeEventListeners();
            this.updateProjectSuggestions();
            const templatesPrets =
                (typeof taskCardManager !== 'undefined' && taskCardManager.templatesReady)
                    ? taskCardManager.templatesReady
                    : Promise.resolve();
            templatesPrets.then(() => this.loadTasks());
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

        // nav.js : statuts et contextes filtrent cote serveur, on recharge.
        document.addEventListener('tw-filter-change', () => this.loadTasks());

        // nav.js : le bouton + de la barre ouvre l'editeur.
        document.addEventListener('tw-open-add', () => {
            if (typeof taskEditor !== 'undefined') taskEditor.show();
        });

        // nav.js : bandeau de notification.
        document.addEventListener('tw-show-notification', (e) => {
            const { message, type } = e.detail || {};
            if (message && typeof this.showNotification === 'function') {
                this.showNotification(message, type || 'success');
            }
        });

        // Add event listener for the toggle filter buttons
        const toggleFilterBtn = document.getElementById('filter-planned-incomplete-btn');
        const todayFilterBtn = document.getElementById('filter-today-btn');
        
        if (toggleFilterBtn && todayFilterBtn) {
            toggleFilterBtn.addEventListener('click', () => {
                // Désactiver l'autre bouton si actif
                if (todayFilterBtn.classList.contains('active')) {
                    todayFilterBtn.classList.remove('active');
                }
                toggleFilterBtn.classList.toggle('active');
                this.applyFilters();
            });

            todayFilterBtn.addEventListener('click', () => {
                // Désactiver l'autre bouton si actif
                if (toggleFilterBtn.classList.contains('active')) {
                    toggleFilterBtn.classList.remove('active');
                }
                todayFilterBtn.classList.toggle('active');
                this.applyFilters();
            });
        }

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
                fetch('/api/tasks?' + (window.twNav ? window.twNav.stateToParams() : 'status=pending')),
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
                this.setBackendProjects(projectsData.projects);
                // Mettre à jour aussi les suggestions du TaskCreator
                if (this.taskCreator) {
                    this.taskCreator.updateProjectSuggestions(projectsData.projects);
                }
            }
        } catch (error) {
            // Toute exception etait etiquetee « Network error », ce qui a fait
            // passer une erreur de rendu pour une panne reseau. La trace est
            // desormais conservee en console.
            console.error('loadTasks a échoué :', error);
            this.showError('Erreur au chargement des tâches : ' + error.message);
        } finally {
            this.showLoading(false);
        }
    }
    
    // Enregistre la liste faisant autorite et rafraichit les suggestions.
    //
    // Remplace `updateProjectDatalist()`, qui alimentait `project-options` --
    // un identifiant absent de toutes les pages. Sa garde `if (!datalist)
    // return;` rendait l'echec invisible : la reponse de /api/projects etait
    // recuperee a chaque chargement, puis jetee.
    setBackendProjects(projects) {
        this.backendProjects = (projects || []).filter(Boolean);
        this.updateProjectsList();
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
            
            // Filter by today only
            if (this.currentFilters.showTodayOnly) {
                // Check if task is scheduled for today
                if (task.scheduled) {
                    // Parse scheduled date (format: YYYYMMDDTHHMMSSZ)
                    const scheduledDate = new Date(task.scheduled.replace(
                        /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/,
                        '$1-$2-$3T$4:$5:$6'
                    ));
                    
                    // Get today's date range (00:00:00 to 23:59:59)
                    const now = new Date();
                    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
                    const tomorrowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0);
                    
                    // Check if scheduled date is within today's range
                    if (scheduledDate >= todayStart && scheduledDate < tomorrowStart) {
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
        const toggleFilterBtn = document.getElementById('filter-planned-incomplete-btn');
        const showPlannedIncomplete = toggleFilterBtn ? toggleFilterBtn.classList.contains('active') : false;
        const todayFilterBtn = document.getElementById('filter-today-btn');
        const showTodayOnly = todayFilterBtn ? todayFilterBtn.classList.contains('active') : false;
            
        this.currentFilters = {
            project: project || null,
            tags: tags,
            showPlannedIncomplete: showPlannedIncomplete,
            showTodayOnly: showTodayOnly
        };
        
        this.renderTasks();
    }
    
    // Clear all filters
    clearFilters() {
        document.getElementById('filter-project').value = '';
        document.getElementById('filter-tags').value = '';
        const toggleFilterBtn = document.getElementById('filter-planned-incomplete-btn');
        if (toggleFilterBtn) {
            toggleFilterBtn.classList.remove('active');
        }
        const todayFilterBtn = document.getElementById('filter-today-btn');
        if (todayFilterBtn) {
            todayFilterBtn.classList.remove('active');
        }
        
        this.currentFilters = {
            project: null,
            tags: [],
            showPlannedIncomplete: false,
            showTodayOnly: false
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
        // La liste du backend d'abord : elle seule contient les projets dont
        // toutes les taches sont terminees ou exclues par le filtre en cours.
        this.backendProjects.forEach(projet => this.projects.add(projet));
        // Puis celle des taches affichees : un projet tout juste cree n'est pas
        // encore dans la reponse du backend.
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
        // Une carte qui echoue ne doit pas interrompre le rendu des autres.
        let nonAffichees = 0;
        filteredTasks.forEach(task => {
            try {
                container.appendChild(taskCardManager.createTaskCard(task, 'full'));
            } catch (e) {
                if (nonAffichees === 0) console.error(e);
                nonAffichees++;
            }
        });
        if (nonAffichees > 0) {
            this.showError(`${nonAffichees} tâche(s) non affichées : template de carte indisponible.`);
        }
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
