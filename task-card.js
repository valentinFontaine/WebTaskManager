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
                    // Si pas de tâche retournée, on déclenche une recharge complète
                    this.onTaskUpdate(null);
                }
                this.showNotification(`Task ${action} successful`, 'success');
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


/**
 * TaskCardManager - Gestionnaire centralisé pour la création et la gestion des TaskCards
 * Permet de basculer entre les modes minimaliste et complet
 */

class TaskCardManager {
    constructor(actionHandler = null) {
        this.templates = {};
        this.actionHandler = actionHandler || new TaskActionHandler();
        this.eventListenerAdded = false;
        this.loadTemplates();
    }

    /**
     * Définit un gestionnaire d'actions personnalisé
     * @param {TaskActionHandler} handler - Le gestionnaire d'actions à utiliser
     */
    setActionHandler(handler) {
        this.actionHandler = handler;
    }

    /**
     * Charge les templates depuis le DOM
     */
    loadTemplates() {
        // Vérifier si les templates sont déjà dans le DOM
        const minimalTemplate = document.getElementById('task-card-minimal');
        const fullTemplate = document.getElementById('task-card-full');

        if (minimalTemplate && fullTemplate) {
            this.templates.minimal = minimalTemplate;
            this.templates.full = fullTemplate;
        } else {
            // Si les templates ne sont pas dans le DOM, les charger dynamiquement
            this.loadTemplatesFromFile();
        }
    }

    /**
     * Charge les templates depuis le fichier HTML
     */
    async loadTemplatesFromFile() {
        try {
            const response = await fetch('task-card-templates.html');
            const html = await response.text();
            
            // Créer un élément temporaire pour parser le HTML
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = html;
            
            // Extraire les templates
            const minimalTemplate = tempDiv.querySelector('#task-card-minimal');
            const fullTemplate = tempDiv.querySelector('#task-card-full');
            
            if (minimalTemplate && fullTemplate) {
                this.templates.minimal = minimalTemplate;
                this.templates.full = fullTemplate;
                
                // Ajouter les templates au DOM pour qu'ils soient disponibles
                document.body.appendChild(minimalTemplate);
                document.body.appendChild(fullTemplate);
            } else {
                console.error('Templates non trouvés dans le fichier task-card-templates.html');
            }
        } catch (error) {
            console.error('Erreur lors du chargement des templates:', error);
        }
    }

    /**
     * Crée une TaskCard en utilisant le template approprié
     * @param {Object} task - Les données de la tâche
     * @param {string} mode - Le mode ('minimal' ou 'full')
     * @returns {HTMLElement} - L'élément TaskCard
     */
    createTaskCard(task, mode = 'minimal') {
        if (!this.templates[mode]) {
            console.error(`Template ${mode} non disponible`);
            return null;
        }

        // Cloner le template
        const template = this.templates[mode];
        const card = template.content.cloneNode(true).querySelector('.task-card');

        // Remplir les slots avec les données de la tâche
        this.fillSlots(card, task, mode);

        // Ajouter les données de la tâche à l'élément
        card.dataset.taskId = task.uuid;
        card.dataset.taskData = JSON.stringify(task).replace(/'/g, "&apos;");

        // Ajouter un gestionnaire d'événements pour la sélection
        card.addEventListener('click', function(e) {
            // Ne pas déclencher si le clic est sur le bouton de bascule ou sur un bouton d'action
            if (e.target.closest('.toggle-mode-btn') || e.target.closest('.btn')) {
                return;
            }
            
            // Basculer la classe 'selected' sur la carte
            card.classList.toggle('selected');
            
            // Dispatcher un événement personnalisé avec les données de la tâche
            const taskSelectedEvent = new CustomEvent('taskSelected', {
                detail: {
                    taskData: task,
                    cardElement: card
                },
                bubbles: true
            });
            card.dispatchEvent(taskSelectedEvent);
        });

        return card;
    }

    /**
     * Remplit les slots d'une TaskCard avec les données de la tâche
     * @param {HTMLElement} card - L'élément TaskCard
     * @param {Object} task - Les données de la tâche
     * @param {string} mode - Le mode ('minimal' ou 'full')
     */
    fillSlots(card, task, mode) {
        const urgency = task.urgency !== undefined ? task.urgency : 0;
        const urgencyContainer = card.querySelector('.task-urgency');
        if (urgencyContainer) {
            // Remplir le slot avec la valeur arrondie à 1 décimale
            const urgencySlot = urgencyContainer.querySelector('[name="urgency"]');
            if (urgencySlot) {
                urgencySlot.textContent = Math.round(urgency * 10) / 10;
            }
            
            // Dégradé de couleur en fonction de l'urgence (background-color sur le conteneur)
            let backgroundColor;
            if (urgency < 2.0) {
                // Vert pur pour les valeurs < 2.0
                backgroundColor = '#28a745';
            } else if (urgency > 15.0) {
                // Rouge pur pour les valeurs > 15.0
                backgroundColor = '#dc3545';
            } else {
                // Dégradé vert → jaune/orange → rouge entre 2.0 et 15.0
                // Calculer le ratio de progression (0 = vert, 1 = rouge)
                const ratio = (urgency - 2.0) / (15.0 - 2.0);
                
                // Convertir le ratio en couleurs RGB
                // Vert (99, 190, 123) → Jaune (255, 235, 132) → Rouge (248, 105, 107)
                const r = Math.round(99 + (248 - 99) * ratio);
                const g = Math.round(190 + (105 - 190) * ratio);
                const b = Math.round(123 + (107 - 123) * ratio);
                
                backgroundColor = `rgb(${r}, ${g}, ${b})`;
            }
            
            // Appliquer la couleur de fond au conteneur (pas au slot)
            urgencyContainer.style.backgroundColor = backgroundColor;
        }

        // Priorité
        const priority = task.priority || 'M';
        const priorityClass = priority === 'H' ? 'high' : priority === 'M' ? 'medium' : 'low';
        const priorityText = priority === 'H' ? 'Haute' : priority === 'M' ? 'Moyenne' : 'Basse';
        const prioritySlot = card.querySelector('[name="priority"]');
        if (prioritySlot) {
            prioritySlot.textContent = priorityText;
            prioritySlot.className = `task-priority ${priorityClass}`;
        }

        // Description
        const descriptionSlot = card.querySelector('[name="description"]');
        if (descriptionSlot) {
            descriptionSlot.textContent = this.escapeHtml(task.description);
        }

        // Durée
        const duration = this.parseEstTime(task.estTime);
        const durationText = duration ? this.formatDuration(duration) : 'Non estimé';
        const durationSlot = card.querySelector('[name="duration"]');
        if (durationSlot) {
            durationSlot.textContent = durationText;
        }

        // Pool
        const pool = task.pool || 'pro';
        const poolSlot = card.querySelector('[name="pool"]');
        if (poolSlot) {
            poolSlot.textContent = pool;
        }
        
        // Pour le mode minimal, ajouter l'UUID au bouton edit
        if (mode === 'minimal') {
            const editButton = card.querySelector('.task-edit');
            if (editButton) {
                editButton.dataset.taskUuid = task.uuid;
            }
        }

        // Date d'échéance (uniquement en mode complet)
        if (mode === 'full') {
            let dueDate = '';
            if (task.due) {
                try {
                    const date = new Date(task.due);
                    if (!isNaN(date.getTime())) {
                        dueDate = date.toLocaleDateString('fr-FR');
                    }
                } catch (e) {
                    console.error('Format de date invalide pour la tâche:', task);
                }
            }
            const dueSlot = card.querySelector('[name="due"]');
            if (dueSlot) {
                dueSlot.textContent = dueDate;
            }

            // Tags
            const tags = task.tags || [];
            const tagsSlot = card.querySelector('[name="tags"]');
            if (tagsSlot) {
                tagsSlot.innerHTML = tags.map(tag => `<span class="task-tag">#${this.escapeHtml(tag)}</span>`).join('');
            }

            // Actions
            const actionsContainer = card.querySelector('.task-actions');
            if (actionsContainer) {
                // Ajouter l'UUID de la tâche aux boutons d'action
                const taskUuid = task.uuid;
                actionsContainer.querySelectorAll('[data-task-action]').forEach(button => {
                    button.dataset.taskUuid = taskUuid;
                });
                
                // Gérer l'affichage des boutons Start/Stop en fonction de l'état de la tâche
                const startButton = actionsContainer.querySelector('.task-start');
                const stopButton = actionsContainer.querySelector('.task-stop');
                
                if (task.start) {
                    startButton.style.display = 'none';
                    stopButton.style.display = 'inline-block';
                } else {
                    startButton.style.display = 'inline-block';
                    stopButton.style.display = 'none';
                }
            }
        }

        // Ajouter un écouteur d'événements global pour la délégation d'événements
        if (!this.eventListenerAdded) {
            document.addEventListener('click', (e) => {
                const button = e.target.closest('[data-task-action]');
                if (button) {
                    const taskUuid = button.dataset.taskUuid;
                    const action = button.dataset.taskAction;
                    
                    if (taskUuid && action) {
                        if (action === 'delete') {
                            this.actionHandler.confirmDelete(taskUuid);
                        } else if (action === 'edit') {
                            // Pour l'édition, il faut récupérer les données de la tâche
                            const card = button.closest('.task-card');
                            if (card) {
                                const taskData = JSON.parse(card.dataset.taskData);
                                console.log('Task data retrieved from dataset:', taskData);
                                if (typeof taskEditor !== 'undefined') {
                                    taskEditor.showForTask(taskData);
                                } else {
                                    console.error('taskEditor is not defined');
                                }
                            }
                        } else {
                            this.actionHandler.performTaskAction(taskUuid, action);
                        }
                    }
                }
            });
            this.eventListenerAdded = true;
        }

    }

    /** Formate la durée en minutes pour l'affichage
     * @param {number} minutes - La durée en minutes
     * @returns {string} - La durée formatée
     */
    formatDuration(minutes) {
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        
        if (hours > 0 && mins > 0) {
            return `${hours}h${mins}min`;
        } else if (hours > 0) {
            return `${hours}h`;
        } else {
            return `${mins}min`;
        }
    }

    /**
     * Basculer entre les modes minimaliste et complet
     * @param {HTMLElement} cardElement - L'élément TaskCard
     */
    toggleMode(cardElement) {
        const taskData = JSON.parse(cardElement.dataset.taskData);
        const currentMode = cardElement.classList.contains('full-mode') ? 'full' : 'minimal';
        const newMode = currentMode === 'minimal' ? 'full' : 'minimal';

        // Créer une nouvelle carte avec le mode opposé
        const newCard = this.createTaskCard(taskData, newMode);
        
        // Remplacer l'ancienne carte par la nouvelle
        cardElement.parentNode.replaceChild(newCard, cardElement);
    }

    /**
     * Parse la durée estimée d'une tâche
     * @param {string} estTime - La durée estimée au format ISO 8601 ou autre
     * @returns {number|null} - La durée en minutes
     */
    parseEstTime(estTime) {
        if (!estTime) return null;
        
        // Gérer le format ISO 8601 (PT2H30M)
        if (estTime.startsWith('PT')) {
            const match = estTime.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
            if (match) {
                const hours = parseInt(match[1] || 0);
                const minutes = parseInt(match[2] || 0);
                const seconds = parseInt(match[3] || 0);
                
                return hours * 60 + minutes + Math.round(seconds / 60);
            }
        }
        
        // Gérer l'ancien format (1h30min, 30min, etc.)
        const match = estTime.match(/(\d+)h|(\d+)min/g);
        if (!match) return null;
        
        let minutes = 0;
        match.forEach(part => {
            if (part.includes('h')) {
                minutes += parseInt(part) * 60;
            } else if (part.includes('min')) {
                minutes += parseInt(part);
            }
        });
        
        return minutes;
    }


    /**
     * Échappe les caractères HTML pour éviter les attaques XSS
     * @param {string} text - Le texte à échapper
     * @returns {string} - Le texte échappé
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}


