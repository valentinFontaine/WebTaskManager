/**
 * Composant réutilisable pour l'édition de tâches
 * Unifie les formulaires entre index.html et day-planner.html
 */

class TaskEditor {
    constructor(options = {}) {
        this.options = {
            // Configuration par défaut
            showAllFields: true,
            priorityFormat: 'letters', // 'letters' (H/M/L) ou 'words' (high/medium/low)
            language: 'fr', // 'fr' ou 'en'
            modalId: 'task-editor-modal',
            inline: false, // Mode inline ou modal
            containerId: null, // ID du conteneur pour le mode inline
            ...options
        };
        
        this.currentTask = null;
        this.template = null;
        this.onSave = options.onSave || (() => {});
        this.onCancel = options.onCancel || (() => {});
        this.onSaveSuccess = options.onSaveSuccess || (() => {});
        this.onSaveError = options.onSaveError || (() => {});
        
        this.init();
    }
    
    init() {
        if (this.options.inline) {
            this.createInlineContainer();
        } else {
            this.createModal();
            this.bindEvents();
        }
    }
    
    createModal() {
        // Supprimer le modal existant s'il existe
        const existingModal = document.getElementById(this.options.modalId);
        if (existingModal) {
            existingModal.remove();
        }
        
        const modal = document.createElement('div');
        modal.id = this.options.modalId;
        modal.className = 'modal task-editor-modal';
        
        document.body.appendChild(modal);
        this.modal = modal;
        
        // Charger et appliquer le template
        this.loadTemplate().then(() => {
            if (this.template) {
                this.renderModal();
            }
        });
    }
    
    createInlineContainer() {
        const container = document.getElementById(this.options.containerId);
        if (!container) {
            console.error(`Container with id "${this.options.containerId}" not found`);
            return;
        }
        
        // Charger et appliquer le template
        this.loadTemplate().then(() => {
            if (this.template) {
                container.innerHTML = '';
                const templateContent = this.template.content.cloneNode(true);
                container.appendChild(templateContent);
                this.modal = container.querySelector('.modal-content');
                this.populateTemplate();
                this.bindEvents();
            }
        });
    }
    
    async loadTemplate() {
        try {
            const response = await fetch('task-editor-templates.html');
            const html = await response.text();
            
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = html;
            
            this.template = tempDiv.querySelector('#task-editor-modal');
            if (!this.template) {
                console.error('Template task-editor-modal non trouvé');
                return;
            }
            
            document.body.appendChild(this.template);
        } catch (error) {
            console.error('Erreur lors du chargement du template:', error);
        }
    }
    
    renderModal() {
        if (!this.template) return;
        
        const templateContent = this.template.content.cloneNode(true);
        this.modal.appendChild(templateContent);
        
        // Remplir les slots avec les textes appropriés
        this.populateTemplate();
        
        // Re-lier les événements après le rendu
        this.bindEvents();
    }
    
    populateTemplate() {
        const texts = this.getTexts();
        const priorityOptions = this.getPriorityOptions();
        
        // Remplir les slots de texte
        const slots = {
            'title': texts.addTask,
            'description-label': texts.description,
            'tags-label': texts.tags,
            'tags-placeholder': texts.tagsPlaceholder,
            'project-label': texts.project,
            'project-placeholder': texts.projectPlaceholder,
            'priority-label': texts.priority,
            'no-priority': texts.noPriority,
            'duration-label': texts.duration,
            'duration-placeholder': texts.durationPlaceholder,
            'due-label': texts.dueDate,
            'scheduled-label': texts.scheduled,
            'save-button': texts.save,
            'cancel-button': texts.cancel
        };
        
        // Remplir les slots
        Object.entries(slots).forEach(([name, value]) => {
            const slot = this.modal.querySelector(`slot[name="${name}"]`);
            if (slot) {
                slot.textContent = value;
            }
        });
        
        // Remplir les options de priorité
        const prioritySelect = this.modal.querySelector('#task-editor-priority');
        if (prioritySelect) {
            // Supprimer les options existantes (sauf la première option "None")
            while (prioritySelect.options.length > 1) {
                prioritySelect.remove(1);
            }
            
            // Ajouter les nouvelles options
            priorityOptions.forEach(option => {
                const opt = document.createElement('option');
                opt.value = option.value;
                opt.textContent = option.label;
                prioritySelect.appendChild(opt);
            });
        }
        
        // Gérer l'affichage des champs étendus
        this.toggleExtendedFields(this.options.showAllFields);
    }
    
    toggleExtendedFields(show) {
        const extendedFields = this.modal.querySelector('.extended-fields');
        const extendedDates = this.modal.querySelector('.extended-dates');
        
        if (extendedFields) extendedFields.style.display = show ? 'block' : 'none';
        if (extendedDates) extendedDates.style.display = show ? 'block' : 'none';
    }
    
    getTexts() {
        if (this.options.language === 'fr') {
            return {
                addTask: 'Ajouter une tâche',
                editTask: 'Modifier la tâche',
                description: 'Description',
                tags: 'Tags',
                tagsPlaceholder: 'Tags séparés par des virgules',
                project: 'Projet',
                projectPlaceholder: 'Nom du projet',
                priority: 'Priorité',
                noPriority: 'Aucune',
                duration: 'Durée',
                durationPlaceholder: 'ex: 30min, 1h30m, 2d',
                dueDate: 'Date d\'échéance',
                scheduled: 'Planifié',
                save: 'Sauvegarder',
                cancel: 'Annuler'
            };
        } else {
            return {
                addTask: 'Add Task',
                editTask: 'Edit Task',
                description: 'Description',
                tags: 'Tags',
                tagsPlaceholder: 'Comma-separated tags',
                project: 'Project',
                projectPlaceholder: 'Project name',
                priority: 'Priority',
                noPriority: 'None',
                duration: 'Duration',
                durationPlaceholder: 'e.g., 30min, 1h30m, 2d',
                dueDate: 'Due Date',
                scheduled: 'Scheduled',
                save: 'Save Changes',
                cancel: 'Cancel'
            };
        }
    }
    
    getPriorityOptions() {
        if (this.options.priorityFormat === 'letters') {
            return [
                { value: 'H', label: this.options.language === 'fr' ? 'Élevée' : 'High' },
                { value: 'M', label: this.options.language === 'fr' ? 'Moyenne' : 'Medium' },
                { value: 'L', label: this.options.language === 'fr' ? 'Faible' : 'Low' }
            ];
        } else {
            return [
                { value: 'high', label: this.options.language === 'fr' ? 'Élevée' : 'High' },
                { value: 'medium', label: this.options.language === 'fr' ? 'Moyenne' : 'Medium' },
                { value: 'low', label: this.options.language === 'fr' ? 'Faible' : 'Low' }
            ];
        }
    }
    
    bindEvents() {
        // Vérifier que les éléments existent avant d'ajouter les événements
        const closeBtn = this.modal.querySelector('.task-editor-close');
        const cancelBtn = this.modal.querySelector('#task-editor-cancel');
        const form = this.modal.querySelector('#task-editor-form');
        
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                this.hide();
            });
        }
        
        // Fermeture en cliquant à l'extérieur
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) {
                this.hide();
            }
        });
        
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                this.hide();
                this.onCancel();
            });
        }
        
        // Événement de soumission du formulaire
        if (form) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleSave();
            });
        }
        
        // Échap pour fermer
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.modal.style.display === 'block') {
                this.hide();
            }
        });
    }
    
    show(task = null) {
        this.currentTask = task;
        
        // Assurer que le modal et le template sont chargés
        if (!this.modal || !this.template) {
            if (this.options.inline) {
                this.createInlineContainer();
            } else {
                this.createModal();
            }
            return;
        }
        
        const title = this.modal.querySelector('#task-editor-title');
        const texts = this.getTexts();
        
        if (task) {
            if (title) title.textContent = texts.editTask;
            this.populateForm(task);
        } else {
            if (title) title.textContent = texts.addTask;
            this.clearForm();
        }
        
        if (this.options.inline) {
            this.modal.style.display = 'block';
        } else {
            this.modal.style.display = 'block';
        }
        
        // Focus sur le premier champ
        setTimeout(() => {
            const descField = this.modal.querySelector('#task-editor-description');
            if (descField) descField.focus();
        }, 100);
    }
    
    showForTask(task) {
        this.show(task);
    }
    
    hide() {
        if (this.options.inline) {
            this.clearForm();
        } else {
            this.modal.style.display = 'none';
        }
        this.currentTask = null;
    }
    
    populateForm(task) {
        const form = this.modal.querySelector('#task-editor-form');
        if (!form) return;
        
        // Champs de base
        const descField = form.querySelector('#task-editor-description');
        const priorityField = form.querySelector('#task-editor-priority');
        const durationField = form.querySelector('#task-editor-duration');
        
        if (descField) descField.value = task.description || '';
        if (priorityField) {
            // Convertir la priorité au format attendu par la liste déroulante
            const priorityValue = task.priority ?  task.priority : '';
            priorityField.value = priorityValue;
        }
        if (durationField) durationField.value = task.estTime || '';
        
        // Champs étendus si disponibles
        if (this.options.showAllFields) {
            const tagsField = form.querySelector('#task-editor-tags');
            const projectField = form.querySelector('#task-editor-project');
            const dueField = form.querySelector('#task-editor-due');
            const scheduledField = form.querySelector('#task-editor-scheduled');
            
            if (tagsField) tagsField.value = Array.isArray(task.tags) ? task.tags.join(', ') : (task.tags || '');
            if (projectField) projectField.value = task.project || '';
            if (dueField) dueField.value = this.formatDateForInput(task.due);
            if (scheduledField) scheduledField.value = this.formatDateForInput(task.scheduled);
        }
    }
    
    clearForm() {
        const form = this.modal.querySelector('#task-editor-form');
        if (form) form.reset();
    }
    
    handleSave() {
        const form = this.modal.querySelector('#task-editor-form');
        if (!form) return;
        
        const taskData = {
            description: form.querySelector('#task-editor-description').value,
            priority: form.querySelector('#task-editor-priority').value,
            duration: form.querySelector('#task-editor-duration').value
        };
        
        // Ajouter les champs étendus si disponibles
        if (this.options.showAllFields) {
            const tagsField = form.querySelector('#task-editor-tags');
            const projectField = form.querySelector('#task-editor-project');
            const dueField = form.querySelector('#task-editor-due');
            const scheduledField = form.querySelector('#task-editor-scheduled');
            
            if (tagsField) {
                taskData.tags = tagsField.value.split(',').map(tag => tag.trim()).filter(tag => tag);
            }
            if (projectField) taskData.project = projectField.value;
            if (dueField) taskData.due = dueField.value;
            if (scheduledField) taskData.scheduled = scheduledField.value;
        }
        
        // Ajouter l'ID si on modifie une tâche existante
        if (this.currentTask) {
            taskData.id = this.currentTask.id;
            taskData.uuid = this.currentTask.uuid;
        }
        
        // Appeler la nouvelle méthode de sauvegarde
        this.saveTask(taskData, this.currentTask !== null);
    }
    
    async saveTask(taskData, isEdit) {
        try {
            const taskDataForAPI = this.prepareTaskDataForAPI(taskData, isEdit);
            const endpoint = isEdit ? `/api/task/${taskData.uuid}/modify` : '/api/task/add';
            const method = isEdit ? 'PUT' : 'POST';
            
            const response = await fetch(endpoint, {
                method,
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(taskDataForAPI)
            });
            
            const data = await response.json();
            
            if (data.success) {
                this.onSaveSuccess(data.task, isEdit);
                this.hide();
            } else {
                this.onSaveError(data.error || (isEdit ? 'Failed to update task' : 'Failed to add task'));
            }
        } catch (error) {
            this.onSaveError('Network error: ' + error.message);
        }
    }
    
    prepareTaskDataForAPI(taskData, isEdit) {
        const preparedData = {
            description: taskData.description,
            tags: taskData.tags || [],
            project: taskData.project || null,
            priority: taskData.priority || null,
            duration: taskData.duration || null
        };
        
        // Formater les dates si elles existent
        if (taskData.due) {
            preparedData.due = this.formatDateForTask(taskData.due);
        }
        if (taskData.scheduled) {
            preparedData.scheduled = this.formatDateForTask(taskData.scheduled);
        }
        
        // Pour la modification, utiliser 'est' au lieu de 'duration'
        if (preparedData.duration) {
            preparedData.estTime = preparedData.duration;
            delete preparedData.duration;
        }
        
        return preparedData;
    }
    
    formatDateForTask(dateString) {
        // Convertir le format datetime-local en format TaskWarrior
        if (!dateString) return '';
        
        // Retourner la chaîne avec les secondes ajoutées si nécessaire
        return dateString.length === 16 ? `${dateString}:00` : dateString;
    }

    formatDateForInput(dateString) {
        // Convert TaskWarrior date format to HTML datetime-local format
        if (!dateString) return '';
        
        // Handle TaskWarrior format: 20250131T055530Z
        if (/^\d{8}T\d{6}Z$/.test(dateString)) {
            const year = dateString.substring(0, 4);
            const month = dateString.substring(4, 6);
            const day = dateString.substring(6, 8);
            const hour = dateString.substring(9, 11);
            const minute = dateString.substring(11, 13);
            const second = dateString.substring(13, 15);
            
            // Create ISO format string: YYYY-MM-DDTHH:MM:SSZ
            const isoString = `${year}-${month}-${day}T${hour}:${minute}:${second}Z`;
            const date = new Date(isoString);
            return date.toISOString().slice(0, 16);
        }
        
        // Fallback for other date formats
        const date = new Date(dateString);
        return date.toISOString().slice(0, 16);
    }

    formatDurationString(durationString) {
        // Format TaskWarrior duration (e.g., "PT2H30M" or "2h30min") for display
        if (!durationString) return '';
        
        // Handle ISO 8601 duration format (PT2H30M)
        if (durationString.startsWith('PT')) {
            const match = durationString.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
            if (match) {
                const hours = parseInt(match[1] || 0);
                const minutes = parseInt(match[2] || 0);
                const seconds = parseInt(match[3] || 0);
                
                let result = '';
                if (hours > 0) result += `${hours}h `;
                if (minutes > 0) result += `${minutes}m `;
                if (seconds > 0) result += `${seconds}s`;
                
                return result.trim() || '0s';
            }
        }
        
        // Handle simple format (2h30min, 1.5h, etc.)
        return durationString;
    }
    
    // Méthode utilitaire pour convertir entre les formats de priorité
    static convertPriority(priority, fromFormat, toFormat) {
        const priorityMap = {
            'H': 'high',
            'M': 'medium', 
            'L': 'low',
            '': 'None', 
            'high': 'H',
            'medium': 'M',
            'low': 'L',
            'None': ''
        };
        
        if (fromFormat === toFormat) return priority;
        return priorityMap[priority] || priority;
    }
    
    // Méthode pour détruire le composant
    destroy() {
        if (this.modal) {
            if (this.options.inline) {
                this.modal.innerHTML = '';
            } else {
                this.modal.remove();
            }
        }
    }
    
    // Méthode pour mettre à jour les suggestions de projets
    updateProjectSuggestions(projects = []) {
        if (!this.options.showAllFields) return;
        
        const datalist = this.modal?.querySelector('#task-editor-project-options');
        if (!datalist) return;
        
        // Vider les options existantes
        datalist.innerHTML = '';
        
        // Ajouter les nouveaux projets
        projects.forEach(project => {
            if (project) {
                const option = document.createElement('option');
                option.value = project;
                datalist.appendChild(option);
            }
        });
    }
}

// Export pour utilisation en module
if (typeof module !== 'undefined' && module.exports) {
    module.exports = TaskEditor;
}
