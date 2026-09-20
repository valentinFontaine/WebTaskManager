// TaskWarrior Web UI - Frontend JavaScript

class TaskWarriorUI {
    constructor() {
        this.tasks = [];
        this.currentEditingTask = null;
        this.currentFilters = {
            project: null,
            tags: []
        };
        
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
        
        // nav.js : contexte et statut filtrent cote serveur, donc on recharge.
        // Projet et tags filtrent cote client : un simple re-rendu suffit, et
        // c'est ce que dit `clientOnly`.
        document.addEventListener('tw-filter-change', (e) => {
            if (e.detail && e.detail.clientOnly) this.applyFilters();
            else this.loadTasks();
        });

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

        // Les deux vues sur `scheduled` sont les seuls filtres restes sur la
        // page : projet, tags, contexte et statut vivent dans la barre nav.
    }



    async loadTasks() {
        try {
            this.showLoading(true);
            this.hideError();

            const reponse = await fetch(
                '/api/tasks?' + (window.twNav ? window.twNav.stateToParams() : 'status=pending'));
            const tasksData = await reponse.json();

            if (tasksData.success) {
                this.tasks = tasksData.tasks;
                this.renderTasks();
            } else {
                this.showError(tasksData.error || 'Failed to load tasks');
            }

            // La liste des projets est demandee une seule fois par page, par la
            // barre nav, qui en a besoin pour sa propre saisie semi-automatique.
            // L'editeur de tache s'y branche plutot que de relancer
            // `task _projects` a chaque rechargement de la liste.
            if (this.taskCreator && window.twNav && window.twNav.projectsReady) {
                window.twNav.projectsReady.then(
                    noms => this.taskCreator.updateProjectSuggestions(noms));
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
    


    // Filtrage client : projet, tags et les deux vues sur `scheduled`. Le
    // contexte et le statut, eux, ont deja ete appliques par le backend.
    getFilteredTasks() {
        return this.tasks.filter(task => {
            // Projet : prefixe sur la hierarchie pointee, comme TaskWarrior.
            // `project:Maison` doit retenir `Maison.Cuisine`.
            const vise = this.currentFilters.project;
            if (vise) {
                const porte = task.project || '';
                if (porte !== vise && !porte.startsWith(vise + '.')) {
                    return false;
                }
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
    
    // Recompose le filtre client a partir de deux sources : l'etat partage de
    // la barre nav (projet, tags) et les deux vues propres a cette page.
    //
    // Relu a chaque rendu plutot que mis en cache sur evenement : l'etat de nav
    // est restaure du localStorage *avant* le premier `tw-filter-change`, si
    // bien qu'un filtre pose la veille etait ignore au chargement -- la liste
    // s'affichait entiere alors que le resume annoncait un filtre.
    lireFiltres() {
        const etat = window.twNav ? window.twNav.getState() : {};
        const tags = window.twNav ? window.twNav.getTags(etat) : [];
        const actif = id => {
            const bouton = document.getElementById(id);
            return bouton ? bouton.classList.contains('active') : false;
        };

        this.currentFilters = {
            project: (etat.project || '').trim() || null,
            tags: tags,
            showPlannedIncomplete: actif('filter-planned-incomplete-btn'),
            showTodayOnly: actif('filter-today-btn')
        };
    }

    applyFilters() {
        this.renderTasks();
    }

    // Ne remet a zero que ce qui appartient a la page. Projet, tags et
    // contexte sont effaces par « Tout effacer » de la barre nav.
    clearViewToggles() {
        ['filter-planned-incomplete-btn', 'filter-today-btn'].forEach(id => {
            const bouton = document.getElementById(id);
            if (bouton) bouton.classList.remove('active');
        });
        this.applyFilters();
    }
    // `setContext()` a disparu avec le champ qu'il posait : le contexte est
    // desormais un filtre TaskWarrior applique cote serveur par /api/tasks.
    // Le refiltrer ici sur les seuls tags donnait un resultat different de
    // celui du backend des qu'un contexte n'etait pas qu'une liste de tags.
    // `updateProjectsList()` et `updateProjectSuggestions()` ont disparu : la
    // saisie semi-automatique des projets appartient desormais a la barre nav,
    // qui la sert aux trois pages depuis un seul appel a /api/projects.
    renderTasks() {
        const container = document.getElementById('tasks-container');
        if (!container) return;

        this.lireFiltres();
        
        const filteredTasks = this.getFilteredTasks();

        // Le compteur de la barre nav : `filtre/total` des que le filtrage
        // client retire quelque chose, `total` sinon.
        if (window.twNav) window.twNav.setCount(filteredTasks.length, this.tasks.length);

        if (filteredTasks.length === 0) {
            container.innerHTML = '<div class="no-tasks">No tasks found' +
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
