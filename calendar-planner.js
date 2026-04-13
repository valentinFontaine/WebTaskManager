/**
 * Calendar Planner - Intégration Toast UI Calendar avec Taskwarrior
 * Permet de glisser-déposer des tâches non planifiées dans le calendrier
 */

/**
 * Valriables globales
 */
let calendar;
let unplannedTasks = [];
let allTasks = [];
let currentFilter = {
    pool: 'all',
    sort: 'urgency'
};
let selectedTaskCard = null;
let selectedTaskData = null;
let tempEventData = null; 

/**
 * Initialisation
 */
document.addEventListener('DOMContentLoaded', () => {
    // Initialiser taskCardManager avec le gestionnaire d'actions pour calendar-planner
    taskCardManager = new TaskCardManager(new CalendarTaskActionHandler());
    initializeCalendar();
    setupEventListeners();
    loadTasks();
    console.log('SetupTasksSelection');
    console.log('Setup Task Selection Done');
    
    // Ajouter un écouteur d'événements pour les événements taskSelected
    document.addEventListener('taskSelected', (e) => {
        handleTaskCardClick(e.detail.cardElement);
    });
});

/**
 * Initialisation du calendrier Toast UI
 */
function initializeCalendar() {
    const calendarEl = document.getElementById('calendar');
    
    calendar = new tui.Calendar(calendarEl, {
        defaultView: 'week',
        useFormPopup: true,
        useDetailPopup: true,
        usageStatistics: false,
        isReadOnly: false,
        week: {
            startDayOfWeek: 1, // Lundi
            dayNames: ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'],
            hourStart: 6,
            hourEnd: 23,
            taskView: true,
            eventView: ['time'],
            collapseDuplicateEvents: {
                getDuplicateEvents: (targetEvent, events) => {
                    return events.filter(event => event.title === targetEvent.title);
                },
                getMainEvent: (events) => events[0]
            }
        },
        month: {
            dayNames: ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'],
            startDayOfWeek: 1,
            narrowWeekend: true
        },
        template: {
            time(event) {
                const { title } = event;
                return `<div class="calendar-event-title">${title}</div>`;
            },
            popupSave() {
              return 'Ajouter';
            }
        },
        calendars: [
            {
                id: 'pro',
                name: 'Pool Pro',
                backgroundColor: '#28a745',
                borderColor: '#1e7e34',
            },
            {
                id: 'perso',
                name: 'Pool Perso',
                backgroundColor: '#ffc107',
                borderColor: '#e0a800',
            }
        ]
    });

    updateCalendarTitle();
}

/**
 * Configuration des écouteurs d'événements 
 */
function setupEventListeners() {
    // Navigation du calendrier
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');
    const todayBtn = document.getElementById('today-btn');
    const addTaskBtn = document.getElementById('add-task-btn');
    
    console.log('Boutons de navigation:', { prevBtn, nextBtn, todayBtn, addTaskBtn });
    
    prevBtn.addEventListener('click', () => {
        console.log('Bouton précédent cliqué');
        try {
            calendar.prev();
            console.log('Navigation précédente effectuée');
            updateCalendarTitle();
        } catch (error) {
            console.error('Erreur lors de la navigation précédente:', error);
        }
    });

    nextBtn.addEventListener('click', () => {
        console.log('Bouton suivant cliqué');
        try {
            calendar.next();
            console.log('Navigation suivante effectuée');
            updateCalendarTitle();
        } catch (error) {
            console.error('Erreur lors de la navigation suivante:', error);
        }
    });

    if (todayBtn) {
        todayBtn.addEventListener('click', () => {
            console.log('Bouton aujourd\'hui cliqué');
            try {
                calendar.today();
                console.log('Retour à aujourd\'hui effectué');
                updateCalendarTitle();
            } catch (error) {
                console.error('Erreur lors du retour à aujourd\'hui:', error);
            }
        });
    }
    
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

    // Changement de vue
    document.querySelectorAll('.view-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const view = e.target.dataset.view;
            changeView(view);
        });
    });

    // Actualiser
    document.getElementById('refresh-btn').addEventListener('click', () => {
        loadTasks();
    });

    // Filtres
    document.getElementById('filter-pool').addEventListener('change', (e) => {
        currentFilter.pool = e.target.value;
        filterAndDisplayTasks();
    });

    document.getElementById('sort-tasks').addEventListener('change', (e) => {
        currentFilter.sort = e.target.value;
        filterAndDisplayTasks();
    });

    // Evenements liées à tui-calendar
    calendar.on('selectDateTime', handleSelectDateTimeEvent);

    calendar.on('beforeCreateEvent', handleBeforeCreateEvent);

    calendar.on('beforeUpdateEvent', handleBeforeUpdateEvent);

    // Écouter la suppression
    calendar.on('beforeDeleteEvent', handleBeforeDeleteEvent);

}

function handleSelectDateTimeEvent(eventInfo) {
    // If a task is selected, adjust the end date based on task duration
    if (selectedTaskData) {
        // Parse the task duration
        const duration = parseEstTime(selectedTaskData.estTime);
        
        if (duration) {
            // Calculate new end date based on task duration
            const newEndDate = new Date(eventInfo.start.getTime() + duration * 60000);
            
             // Update the form fields in the popup
            setTimeout(() => {
                // Find the input fields by class and name attribute
                const endInput = document.querySelector('input.toastui-calendar-content[name="end"]');
                const titleInput = document.querySelector('input.toastui-calendar-content[name="title"]');
                
                if (endInput) {
                    // Format the new end date as 'YYYY-MM-DD HH:MM'
                    const formattedEndDate = formatDateTimeForInput(newEndDate);
                    endInput.value = formattedEndDate;
                } else {
                    console.warn('End date input field not found');
                }
                
                if (titleInput) {
                    titleInput.value = selectedTaskData.description;
                } else {
                    console.warn('Title input field not found');
                }
            }, 100);   

            // Store the modified event data for use in beforeCreateEvent
            tempEventData = {
                id: selectedTaskData.uuid,
                start: eventInfo.start,
                end: newEndDate,
                title: selectedTaskData.description,
                isAllday: eventInfo.isAllday
            };
        }
    }
}

/**
 * Fonction pour gérer l'événement beforeCreateEvent 
 */
async function handleBeforeCreateEvent(eventObj) {
    let newEvent;
    // Use the temporarily stored event data if available
    if (tempEventData) {
        // Create the event with our modified data
        newEvent = {
            ...tempEventData,
            calendarId: eventObj.calendarId || 'scheduled'
        };
        tempEventData = null;// Clear the temporary data
    } else {
        // Default behavior if no temp data
        newEvent = {
            ...eventObj,
            id: 'toast_' + String(Date.now()),
            calendarId: eventObj.calendarId || 'scheduled'
        };
    }
    
    // Handle toast-prefixed events (new tasks)
    if (newEvent.id && newEvent.id.startsWith('toast_')) {
        // Create new task via API
        const newTaskData = {
            description: newEvent.title,
            scheduled: newEvent.start ? (newEvent.start instanceof Date ? DateFromISOtoTW(newEvent.start.toISOString()) : DateFromISOtoTW(newEvent.start)) : null,
            estTime: calculateDurationFromEvent(newEvent)
        };

        const result = await addTaskToBackend(newTaskData);
        if (result.success && result.task && result.task.uuid) {
            // Update the event with the real UUID
            newEvent.id = result.task.uuid;
        } else {
            console.error('Failed to create task to backend:', result.error || 'Unknown error');
            // Show error to user
            showError('Failed to create task to backend: ' + (result.error || 'Unknown error'));
        }
    }
    // Sync to backend if this is a TaskWarrior task (not a toast_ prefixed ID)
    else if (newEvent.id && !newEvent.id.startsWith('toast_')) {
        // Prepare task data in the format expected by the backend
        const modifiedTaskData = {
            description: newEvent.title,
            scheduled: newEvent.start ? DateFromISOtoTW(newEvent.start.toISOString()) : null
        };

        const result = await modifyTaskInBackend(newEvent.id, modifiedTaskData);
        if (!result.success) {
            console.error('Failed to sync task to backend:', result.error);
        }
    }

    calendar.createEvents([newEvent]);
    console.log('Event created :', newEvent);

    // NOUVEAU CODE : Suppression de la taskCard et réinitialisation
    if (selectedTaskCard && selectedTaskData) {
        // Supprimer la taskCard du DOM
        selectedTaskCard.remove();

        // Supprimer la tâche du tableau unplannedTasks (suppression logique)
        const taskIndex = unplannedTasks.findIndex(task => task.uuid === selectedTaskData.uuid);
        if (taskIndex !== -1) {
            unplannedTasks.splice(taskIndex, 1);
        }

        // Réinitialiser les variables
        selectedTaskCard = null;
        selectedTaskData = null;
        tempEventData = null;

        // Mettre à jour le compteur de tâches
        updateTaskCount();
    }
}

/**
 * Fonction pour gérer l'événement beforeUpdateEvent
 */
async function handleBeforeUpdateEvent({ event, changes }) {
    // Only handle TaskWarrior tasks (not toast_ prefixed IDs)
    if (event.id && !event.id.startsWith('toast_')) {
        // Prepare task data in the format expected by the backend
        const modifiedTaskData = {
            description: changes.title || event.title,
            scheduled: null
        };

        // Handle scheduled date using the new helper function
        console.log("Processing date changes - changes.start:", changes.start);
        console.log("Processing date changes - event.start:", event.start);
        
        // Extract dates using the helper function
        const extractedStartDate = extractDateFromToastChange(changes.start);
        const extractedEndDate = extractDateFromToastChange(changes.end);
        
        // Use extracted start date or fall back to event start date
        const finalStartDate = extractedStartDate || extractDateFromToastChange(event.start);
        const finalEndDate = extractedEndDate || extractDateFromToastChange(event.end);
        
        console.log("Extracted start date:", finalStartDate);
        console.log("Extracted end date:", finalEndDate);
        
        // Set scheduled date if we have a valid start date
        if (finalStartDate) {
            modifiedTaskData.scheduled = DateFromISOtoTW(finalStartDate.toISOString());
            console.log("Final scheduled date for backend:", modifiedTaskData.scheduled);
        } else {
            console.warn("No valid start date found - scheduled will remain null");
        }
        
        // Add duration if we have valid dates
        if (finalStartDate && finalEndDate) {
            const duration = calculateDurationFromEvent({
                start: finalStartDate,
                end: finalEndDate
            });
            modifiedTaskData.estTime = duration;
            console.log("Calculated duration:", duration);
        } else if (finalStartDate) {
            // If we have a start date but no end date, use default duration
            modifiedTaskData.estTime = 'PT30M';
            console.log("Using default duration PT30M (no end date available)");
        }

        try {
            console.log("Status : modifiedTaskData : ", modifiedTaskData);
            const result = await modifyTaskInBackend(event.id, modifiedTaskData);
            if (!result.success) {
                console.error('Failed to sync task update to backend:', result.error);
                showError('Failed to update task: ' + (result.error || 'Unknown error'));
                return false; // Prevent the update if backend sync fails
            }
            console.log('Task updated successfully:', event.id);
        } catch (error) {
            console.error('Error updating task:', error);
            showError('Error updating task: ' + error.message);
            return false;
        }
    }

    // Allow the update to proceed
    calendar.updateEvent(event.id, event.calendarId, changes);
    return true;

}

/**
 * Fonction pour gérer l'événement beforeDeleteEvent
 * Supprime la date planifiée d'une tâche au lieu de la supprimer complètement
 */
async function handleBeforeDeleteEvent(event) {
    // Only handle TaskWarrior tasks (not toast_ prefixed IDs)
    if (event.id && !event.id.startsWith('toast_')) {
        console.log('Handling delete event for task:', event.id);
        
        try {
            // Prepare task data to remove the scheduled date
            // Setting scheduled to null or empty string will unschedule the task
            const modifiedTaskData = {
                scheduled: null  // This removes the scheduled date from the task
            };

            console.log('Attempting to unschedule task by removing scheduled date:', modifiedTaskData);
            
            // Call the backend to modify the task (remove scheduled date)
            const result = await modifyTaskInBackend(event.id, modifiedTaskData);
            
            if (result.success) {
                console.log('Task unscheduled successfully:', event.id);
                showSuccess('Task has been unscheduled and moved back to the unplanned tasks list.');
                
                // Remove from calendar frontend
                calendar.deleteEvent(event.id, event.calendarId);
                
                // Refresh the unplanned tasks list to show the newly unscheduled task
                loadTasks();
                
                return true;
            } else {
                console.error('Failed to unschedule task:', result.error);
                showError('Failed to unschedule task: ' + (result.error || 'Unknown error'));
                return false; // Prevent deletion if backend sync fails
            }
        } catch (error) {
            console.error('Error unscheduling task:', error);
            showError('Error unscheduling task: ' + error.message);
            return false;
        }
    } else {
        // For toast_ prefixed events (new events not yet saved), just delete from calendar
        console.log('Deleting temporary event (toast_ prefixed):', event.id);
        calendar.deleteEvent(event.id, event.calendarId);
        return true;
    }
}

/**
 * Chargement des tâches depuis l'API 
 */
function loadTasks() {
    console.log('Chargement des tâches...');
    // Charger les tâches non planifiées
    fetch('/api/tasks')
        .then(response => response.json())
        .then(data => {
            console.log('Tâches non planifiées reçues:', data);
            if (data.success) {
                // Réinitialiser allTasks avant d'ajouter les nouvelles tâches
                allTasks = [];
                const initialTasks = data.tasks || [];
                unplannedTasks = initialTasks.filter(task => !task.scheduled);
                console.log(`${unplannedTasks.length} tâches non planifiées trouvées`);
                filterAndDisplayTasks();

                // Charger les tâches planifiées
                console.log('Chargement des tâches planifiées...');
                return fetch('/api/tasks/planned');
            } else {
                throw new Error(data.error || 'Erreur lors du chargement des tâches');
            }
        })
        .then(response => response.json())
        .then(data => {
            console.log('Tâches planifiées reçues:', data);
            if (data.success) {
                const plannedTasks = data.data || [];
                console.log(`${plannedTasks.length} tâches planifiées trouvées`);
                
                // Afficher les détails des tâches planifiées pour le débogage
                plannedTasks.forEach((task, index) => {
                    /*
                    console.log(`Tâche planifiée ${index + 1}:`, {
                        description: task.description,
                        scheduled: task.scheduled,
                        due: task.due,
                        estTime: task.estTime,
                        pool: task.pool
                    });
                    //*/
                });
                
                // Mettre à jour allTasks avec les tâches non planifiées et planifiées
                allTasks = [...unplannedTasks, ...plannedTasks];
                console.log(`Total des tâches chargées: ${allTasks.length} (${unplannedTasks.length} non planifiées, ${plannedTasks.length} planifiées)`);
                processTasksForCalendar();
            } else {
                console.error('Erreur lors du chargement des tâches planifiées:', data.error);
            }
        })
        .catch(error => {
            console.error('Erreur lors du chargement des tâches:', error);
            showError('Erreur lors du chargement des tâches: ' + error.message);
        });
}

/**
 * Traitement des tâches pour le calendrier 
 */
function processTasksForCalendar() {
    // Séparer les tâches planifiées et non planifiées
    const scheduledTasks = [];
    unplannedTasks = [];

    allTasks.forEach(task => {
        if (task.scheduled) {
            scheduledTasks.push(task);
        } else {
            unplannedTasks.push(task);
        }
    });

    // Créer les événements pour les tâches planifiées
    const events = [];
    scheduledTasks.forEach(task => {
        try {
            const event = createCalendarEvent(task, task.scheduled);
            if (event) {
                events.push(event);
            }
        } catch (e) {
            console.error('Erreur lors de la création de l\'événement pour la tâche:', task, e);
        }
    });
    
    // Effacer les événements existants et ajouter les nouveaux
    calendar.clear();
    if (events.length > 0) {
        calendar.createEvents(events);
    }
    
    // Mettre à jour l'affichage
    calendar.render();
}

/**
 * Créer un événement calendrier depuis une tâche 
 */
function createCalendarEvent(task, scheduledDate) {
    // Vérifier et formater la date de planification au format ISO 8601 (20251220T120000Z)
    let start;
    try {
        // Convertir le format 20251220T120000Z en 2025-12-20T12:00:00Z pour une meilleure compatibilité
        const isoDate = scheduledDate.replace(
            /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/,
            '$1-$2-$3T$4:$5:$6Z'
        );
        start = new Date(isoDate);
        
        if (isNaN(start.getTime())) {
            console.error('Date de planification invalide:', scheduledDate, 'formaté en:', isoDate, 'pour la tâche:', task);
            return null;
        } else {
            //console.log('Date convertie avec succès:', scheduledDate, '->', start);
        }
    } catch (e) {
        console.error('Erreur lors de la création de la date:', e, 'pour la tâche:', task);
        return null;
    }
    
    // Définir une durée par défaut si nécessaire
    let duration;
    if (task.estTime && task.estTime.startsWith('PT')) {
        // Format ISO 8601 pour la durée (ex: PT1H pour 1 heure, PT30M pour 30 minutes)
        const durationMatch = task.estTime.match(/PT(\d+H)?(\d+M)?/);
        let hours = 0, minutes = 0;
        if (durationMatch) {
            if (durationMatch[1]) hours = parseInt(durationMatch[1]);
            if (durationMatch[2]) minutes = parseInt(durationMatch[2]);
        }
        duration = hours * 60 + minutes;
    }
    
    // Durée par défaut de 60 minutes si non spécifiée ou invalide
    duration = duration || 60;
    const end = new Date(start.getTime() + duration * 60000);

    // Déterminer le pool et l'ID du calendrier
    const pool = (task.pool || 'scheduled').toLowerCase();
    const calendarId = ['pro', 'perso'].includes(pool) ? pool : 'scheduled';

    return {
        id: task.uuid,
        calendarId: calendarId,
        title: task.description,
        start: start,
        end: end,
        isReadOnly: false,
        raw: task
    };
}

/**
 * TaskActionHandler pour calendar-planner.js
 */
class CalendarTaskActionHandler extends TaskActionHandler {
    constructor() {
        super({
            onEditRequest: (task) => {
                console.log('Appel de la fonction onEditRequest !')
                if (typeof taskEditor !== 'undefined') {
                    taskEditor.showForTask(task);
                } else {
                    console.error('taskEditor is not defined in calendar-planner');
                    alert('Task editor is not available in this view.');
                }
            }
        });
    }
    
    performTaskAction(taskUuid, action) {
        console.log('Action performed:', action, 'on task:', taskUuid);
    }
    
    confirmDelete(taskUuid) {
        console.log('Delete confirmed for task:', taskUuid);
    }
}

/**
 * Configuration de la sélection des tâches 
 */
function handleTaskCardClick(cardElement) {
    console.log('Evenement declenché !');
    // Deselect currently selected card if it's different
    if (selectedTaskCard && selectedTaskCard !== cardElement) {
        selectedTaskCard.classList.remove('selected');
    }

    // Toggle selection on clicked card
    if (selectedTaskCard === cardElement) {
        // Clicking the same card again - deselect it
        cardElement.classList.remove('selected');
        selectedTaskCard = null;
        selectedTaskData = null;
        tempEventData = null;
    } else {
        // Select the new card
        cardElement.classList.add('selected');
        selectedTaskCard = cardElement;
        selectedTaskData = JSON.parse(cardElement.dataset.taskData);
        
        console.log('Task selected:', selectedTaskData.description);
        console.log('tempEventData updated:', tempEventData);
    }
}
/**
 * Fonction pour obtenir la tâche sélectionnée 
 */
function getSelectedTask() {
    return selectedTaskData;
}

/**
 * Filtrer et afficher les tâches non planifiées 
 */
function filterAndDisplayTasks() {
    let filteredTasks = [...unplannedTasks];

    // Filtrer par pool
    if (currentFilter.pool !== 'all') {
        filteredTasks = filteredTasks.filter(task => 
            (task.pool || 'pro') === currentFilter.pool
        );
    }

    // Trier
    filteredTasks.sort((a, b) => {
        switch (currentFilter.sort) {
            case 'urgency':
                return (b.urgency || 0) - (a.urgency || 0);
            case 'due':
                if (!a.due && !b.due) return 0;
                if (!a.due) return 1;
                if (!b.due) return -1;
                return new Date(a.due) - new Date(b.due);
            case 'duration':
                const durationA = parseEstTime(a.estTime) || 0;
                const durationB = parseEstTime(b.estTime) || 0;
                return durationB - durationA;
            default:
                return 0;
        }
    });

    displayUnplannedTasks(filteredTasks);
}

/**
 * Afficher les tâches non planifiées 
 */
function displayUnplannedTasks(tasks) {
    const container = document.getElementById('unplanned-tasks');
    const countEl = document.getElementById('task-count');

    countEl.textContent = `${tasks.length} tâche${tasks.length > 1 ? 's' : ''}`;

    if (tasks.length === 0) {
        container.innerHTML = `
            <div class="empty-message">
                <span class="icon">✅</span>
                <p>Aucune tâche à planifier</p>
            </div>
        `;
        return;
    }

    // Vide le conteneur
    container.innerHTML = '';

    // Crée et ajoute chaque carte de tâche
    tasks.forEach(task => {
        const taskCard = taskCardManager.createTaskCard(task, 'full');
        container.appendChild(taskCard);
    });
}

/**
 * Met à jour le compteur de tâches sans recharger depuis le serveur
 */
function updateTaskCount() {
    const container = document.getElementById('unplanned-tasks');
    const countEl = document.getElementById('task-count');

    // Compter les taskCards restantes
    const remainingCards = container.querySelectorAll('.task-card').length;

    countEl.textContent = `${remainingCards} tâche${remainingCards > 1 ? 's' : ''}`;

    // Si plus aucune tâche, afficher le message "Aucune tâche à planifier"
    if (remainingCards === 0) {
        container.innerHTML = `
            <div class="empty-message">
                <span class="icon">✅</span>
                <p>Aucune tâche à planifier</p>
            </div>
        `;
    }
}


// La fonction createTaskCard est maintenant gérée par taskCardManager
/**
 * Changement de vue du calendrier 
 */
function changeView(view) {
    calendar.changeView(view);
    
    // Mettre à jour les boutons actifs
    document.querySelectorAll('.view-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.view === view) {
            btn.classList.add('active');
        }
    });

    updateCalendarTitle();
}

/**
 * Mide à jour du titre du calendrier 
 */
function updateCalendarTitle() {
    const titleEl = document.getElementById('calendar-title');
    
    try {
        const dateRange = calendar.getDateRangeStart();
        const view = calendar.getViewName();
        
        // Extraire la date de l'objet dateRange
        let startDate;
        if (dateRange && dateRange.d) {
            // Si dateRange a une propriété 'd' (cas de Toast UI Calendar)
            startDate = new Date(dateRange.d);
        } else if (dateRange instanceof Date || (dateRange && dateRange.getTime)) {
            // Si c'est déjà un objet Date
            startDate = new Date(dateRange);
        } else {
            // Fallback sur la date actuelle
            startDate = new Date();
        }
        
        let title = '';
        
        if (view === 'month') {
            // Pour la vue mois, on prend le 1er jour du mois de la première semaine complète
            // pour éviter d'afficher le mois précédent
            let firstDayOfMonth = new Date(startDate);
            
            // Si on n'est pas le 1er du mois, on passe au mois suivant
            if (firstDayOfMonth.getDate() > 1) {
                firstDayOfMonth.setMonth(firstDayOfMonth.getMonth() + 1, 1);
            }
            
            title = firstDayOfMonth.toLocaleDateString('fr-FR', { 
                month: 'long', 
                year: 'numeric' 
            });
        } else if (view === 'week') {
            let endDateObj = calendar.getDateRangeEnd();
            let endDate = endDateObj && (endDateObj.d ? new Date(endDateObj.d) : new Date(endDateObj));
            
            if (!endDate || isNaN(endDate.getTime())) {
                endDate = new Date(startDate);
                endDate.setDate(endDate.getDate() + 6); // Ajoute 6 jours pour avoir une semaine complète
            }
            
            title = `${startDate.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} - ${endDate.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}`;
        } else {
            // Vue jour
            title = startDate.toLocaleDateString('fr-FR', { 
                weekday: 'long', 
                day: 'numeric', 
                month: 'long', 
                year: 'numeric' 
            });
        }

        titleEl.textContent = title.charAt(0).toUpperCase() + title.slice(1);
        console.log('Titre mis à jour:', titleEl.textContent);
    } catch (error) {
        console.error('Erreur lors de la mise à jour du titre:', error);
    }
}

/**
 * Fonctions utilitaires 
 */
function parseEstTime(estTime) {
    if (!estTime) return null;
    
    // Handle ISO 8601 duration format (PT2H30M) that TaskWarrior uses
    if (estTime.startsWith('PT')) {
        const match = estTime.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
        if (match) {
            const hours = parseInt(match[1] || 0);
            const minutes = parseInt(match[2] || 0);
            const seconds = parseInt(match[3] || 0);
            
            return hours * 60 + minutes + Math.round(seconds / 60);
        }
    }
    
    // Fallback for old format: "1h30min" ou "30min" ou "1h"
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
 * Extracts a Date object from Toast UI Calendar change objects
 * Handles the nested structure: { tzOffset: null, d: { d: Date(...) } }
 * @param {Object} changeObj - The change object from Toast UI Calendar
 * @returns {Date|null} - The extracted Date object or null if not found
 */
function extractDateFromToastChange(changeObj) {
    if (!changeObj) {
        console.log('extractDateFromToastChange: null/undefined input');
        return null;
    }

    // Log the original structure for debugging
    console.log('Extracting date from object:', changeObj);

    // Case 1: Already a Date object
    if (changeObj instanceof Date) {
        console.log('Direct Date object found');
        return changeObj;
    }

    // Case 2: Toast UI nested structure { tzOffset: null, d: { d: Date(...) } }
    if (changeObj.d && changeObj.d.d && changeObj.d.d instanceof Date) {
        console.log('Toast UI nested Date structure found:', changeObj.d.d);
        return changeObj.d.d;
    }

    // Case 3: Simpler nested structure { d: Date(...) }
    if (changeObj.d && changeObj.d instanceof Date) {
        console.log('Simple nested Date structure found:', changeObj.d);
        return changeObj.d;
    }

    // Case 4: String format
    if (typeof changeObj === 'string') {
        console.log('String date found, creating Date object:', changeObj);
        const date = new Date(changeObj);
        return isNaN(date.getTime()) ? null : date;
    }

    // Case 5: Try to create Date from object (fallback)
    try {
        const date = new Date(changeObj);
        if (!isNaN(date.getTime())) {
            console.log('Created Date from object:', date);
            return date;
        }
    } catch (e) {
        console.error('Failed to create Date from object:', e);
    }

    console.warn('Could not extract valid Date from object:', changeObj);
    return null;
}

async function addTaskToBackend(taskData) {
    /**
     * Add a new task to the backend
     * @param {Object} taskData - Task data to add
     * @returns {Promise<Object>} - Promise that resolves to {success: boolean, task: Object, error: string}
     */
    try {
        const response = await fetch('/api/task/add', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(taskData)
        });

        const data = await response.json();

        if (data.success && data.task) {
            return {
                success: true,
                task: data.task,
                error: null
            };
        } else {
            return {
                success: false,
                task: null,
                error: data.error || 'Unknown error creating task'
            };
        }
    } catch (error) {
        console.error('Network error creating task:', error);
        return {
            success: false,
            task: null,
            error: error.message || 'Network error'
        };
    }
}


async function modifyTaskInBackend(taskId, taskData) {
    try {
        const response = await fetch(`/api/task/${taskId}/modify`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(taskData)
        });
        const data = await response.json();

        return {
            success: data.success,
            error: data.error || 'Unknown error creating task'
        };
       
    } catch (error) {
        console.error('Network error modifying task:', error);
        return {
            success: false,
            error: error.message || 'Network error'
        };

    }
}
function calculateDurationFromEvent(event) {
    // Calculate duration between event.start and event.end
    // Returns ISO 8601 duration format (PT2H30M)
    
    if (!event || !event.start || !event.end) {
        console.warn('Event missing start or end time, using default duration');
        return 'PT30M'; // Default 30 minutes
    }
    
    try {
        // Handle cases where start/end might be strings or Date objects
        const startDate = event.start instanceof Date ? event.start : new Date(event.start);
        const endDate = event.end instanceof Date ? event.end : new Date(event.end);
        
        // Check for invalid dates
        if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
            console.warn('Invalid date format in event, using default duration');
            return 'PT30M';
        }
        
        // Calculate duration in milliseconds
        const durationMs = endDate - startDate;
        
        // Handle negative or zero duration
        if (durationMs <= 0) {
            console.warn('Zero or negative duration, using default duration');
            return 'PT30M';
        }
        
        // Convert to hours and minutes
        const durationMinutes = Math.round(durationMs / (1000 * 60));
        const hours = Math.floor(durationMinutes / 60);
        const minutes = durationMinutes % 60;
        
        // Format as ISO 8601 duration (PT2H30M)
        let durationString = 'PT';
        if (hours > 0) {
            durationString += `${hours}H`;
        }
        if (minutes > 0) {
            durationString += `${minutes}M`;
        }
        
        // Default to PT30M if duration is 0 (shouldn't happen due to above check)
        return durationString === 'PT' ? 'PT30M' : durationString;
        
    } catch (error) {
        console.error('Error calculating duration:', error);
        return 'PT30M'; // Fallback to default
    }
}

function DateFromISOtoTW(isoString) {
    // Convert ISO string to YYYY-MM-DDTHH:MM:SS format
    // Input format: 20251220T120000Z or 2025-12-20T12:00:00Z
    // Output format: 2025-12-20T12:00:00
    
    if (!isoString) return null;
    
    // Handle both formats: 20251220T120000Z and 2025-12-20T12:00:00Z
    let date;
    
    // First try the compact format (20251220T120000Z)
    if (/^\d{8}T\d{6}Z$/.test(isoString)) {
        // Convert 20251220T120000Z to 2025-12-20T12:00:00
        const formatted = isoString.replace(
            /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/,
            '$1-$2-$3T$4:$5:$6'
        );
        return formatted;
    }
    // Try the standard ISO format (2025-12-20T12:00:00Z)
    else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(isoString)) {
        // Remove the Z at the end
        return isoString.slice(0, -1);
    }
    // Try format without Z (2025-12-20T12:00:00)
    else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(isoString)) {
        return isoString;
    }
    
    // If format doesn't match, try to parse as Date and format
    try {
        date = new Date(isoString);
        if (!isNaN(date.getTime())) {
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            const hours = String(date.getHours()).padStart(2, '0');
            const minutes = String(date.getMinutes()).padStart(2, '0');
            const seconds = String(date.getSeconds()).padStart(2, '0');
            
            return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
        }
    } catch (e) {
        console.error('Error parsing date:', e);
        return null;
    }
    
    return null;
}
function formatDateTimeForInput(date) {
    // Format a Date object as 'YYYY-MM-DD HH:MM' (with space separator)
    if (!date || !(date instanceof Date)) return '';
    
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    
    return `${year}-${month}-${day} ${hours}:${minutes}`;
}

function formatDuration(minutes) {
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

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showSuccess(message) {
    // Simple notification (peut être amélioré avec une bibliothèque de notifications)
    console.log('✅', message);
    alert(message);
}

function showError(message) {
    console.error('❌', message);
    alert(message);
}
