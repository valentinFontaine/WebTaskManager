<script>
    import { onMount } from 'svelte';
    import '../global.css';
    import { tasks } from '../stores/tasks.js';
    import { ui } from '../stores/ui.js';
    import { fetchTasks, fetchPlannedTasks, modifyTask } from '../lib/api.js';
    import { getStartOfWeek, getDaysInWeek, getWorkDayTimeSlots, isSameDay, sortTasksByStartTime, CALENDAR_CONSTANTS } from '../components/Calendar/calendarUtils.js';
    import Header from '../components/Header.svelte';
    import Notification from '../components/Notification.svelte';
    import Loading from '../components/Loading.svelte';
    import TaskEditor from '../components/TaskEditor.svelte';
    import CalendarHeader from '../components/Calendar/CalendarHeader.svelte';
    import CalendarGrid from '../components/Calendar/CalendarGrid.svelte';
    import CalendarEvent from '../components/Calendar/CalendarEvent.svelte';
    
    // Local state
    let isLoading = true;
    let error = null;
    let plannedTasks = [];
    let unplannedTasks = [];
    
    // Calendar view state
    let currentView = 'week';
    let currentDate = new Date();
    let selectedPool = 'all';
    let sortBy = 'urgency';
    
    // Drag and drop state
    let draggedTask = null;
    let dragOverDayIndex = null;
    let dragOverSlotIndex = null;

    // Load data on mount
    onMount(async () => {
        try {
            ui.showLoading();
            
            // Load all tasks
            const tasksData = await fetchTasks();
            tasks.setTasks(tasksData);
            
            // Separate planned vs unplanned manually
            unplannedTasks = tasksData.filter(task => !task.scheduled);
            plannedTasks = tasksData.filter(task => task.scheduled);
            
        } catch (err) {
            error = err.message;
            ui.setError(err.message);
            ui.showNotification(`Error loading data: ${err.message}`, 'error');
        } finally {
            isLoading = false;
            ui.hideLoading();
        }
    });

    // Navigation functions
    function navigatePrevious() {
        if (currentView === 'day') {
            currentDate.setDate(currentDate.getDate() - 1);
        } else if (currentView === 'week') {
            currentDate.setDate(currentDate.getDate() - 7);
        } else if (currentView === 'month') {
            currentDate.setMonth(currentDate.getMonth() - 1);
        }
        currentDate = new Date(currentDate); // Trigger reactivity
    }
    
    function navigateNext() {
        if (currentView === 'day') {
            currentDate.setDate(currentDate.getDate() + 1);
        } else if (currentView === 'week') {
            currentDate.setDate(currentDate.getDate() + 7);
        } else if (currentView === 'month') {
            currentDate.setMonth(currentDate.getMonth() + 1);
        }
        currentDate = new Date(currentDate); // Trigger reactivity
    }
    
    function setView(view) {
        currentView = view;
    }

    // Drag and drop handlers
    function handleDragStart(task) {
        draggedTask = task;
    }
    
    function handleDragEnd(task) {
        draggedTask = null;
        dragOverDayIndex = null;
        dragOverSlotIndex = null;
    }
    
    function handleSlotOver(dayIndex, slotIndex, event) {
        dragOverDayIndex = dayIndex;
        dragOverSlotIndex = slotIndex;
    }
    
    function handleSlotLeave() {
        dragOverDayIndex = null;
        dragOverSlotIndex = null;
    }
    
    // Handle drop on calendar slot
    async function handleSlotDrop(taskData, dayIndex, slotIndex) {
        if (!taskData || !taskData.uuid) return;
        
        try {
            ui.showLoading();
            
            // Calculate new scheduled time
            const daysInWeek = getDaysInWeek(currentDate);
            if (dayIndex >= daysInWeek.length) {
                ui.showNotification('Invalid drop location', 'error');
                return;
            }
            
            const slotDate = daysInWeek[dayIndex];
            const hourStart = CALENDAR_CONSTANTS.HOUR_START;
            const newStartHour = hourStart + slotIndex;
            
            // Create new scheduled date
            const scheduledDate = new Date(slotDate);
            scheduledDate.setHours(newStartHour, 0, 0, 0);
            
            // Update task
            const updatedTask = {
                ...taskData,
                scheduled: scheduledDate.toISOString()
            };
            
            // Call API to update task
            const result = await modifyTask(taskData.uuid, updatedTask);
            
            // Update local state
            tasks.updateTask(taskData.uuid, result);
            
            // Remove from unplanned and add to planned
            unplannedTasks = unplannedTasks.filter(t => t.uuid !== taskData.uuid);
            if (!plannedTasks.some(t => t.uuid === taskData.uuid)) {
                plannedTasks.push(result);
            }
            
            ui.showNotification('Task scheduled successfully', 'success');
            
        } catch (err) {
            ui.showNotification(`Failed to schedule task: ${err.message}`, 'error');
        } finally {
            ui.hideLoading();
            draggedTask = null;
            dragOverDayIndex = null;
            dragOverSlotIndex = null;
        }
    }
    
    // Handle drop on unplanned task (from calendar to unplanned)
    function handleUnplannedDrop(taskData) {
        if (!taskData || !taskData.uuid) return;
        
        // Remove scheduled time
        const updatedTask = {
            ...taskData,
            scheduled: null
        };
        
        // Update task
        modifyTask(taskData.uuid, updatedTask)
            .then(result => {
                tasks.updateTask(taskData.uuid, result);
                plannedTasks = plannedTasks.filter(t => t.uuid !== taskData.uuid);
                if (!unplannedTasks.some(t => t.uuid === taskData.uuid)) {
                    unplannedTasks.push(result);
                }
                ui.showNotification('Task unscheduled', 'info');
            })
            .catch(err => {
                ui.showNotification(`Failed to unschedule task: ${err.message}`, 'error');
            });
    }
    
    // Filter unplanned tasks based on selected pool
    $: filteredUnplannedTasks = unplannedTasks.filter(task => {
        if (selectedPool === 'all') return true;
        return (task.tags || []).includes(selectedPool);
    });
    
    // Sort unplanned tasks
    $: sortedUnplannedTasks = sortTasksByStartTime([...filteredUnplannedTasks]);

    // Handle drag start from unplanned tasks
    function handleUnplannedDragStart(task, event) {
        event.dataTransfer.setData('text/plain', JSON.stringify(task));
        event.dataTransfer.effectAllowed = 'move';
        draggedTask = task;
    }
    
    // Handle drag end from unplanned tasks
    function handleUnplannedDragEnd() {
        draggedTask = null;
    }
    
    // Helper function to get task color
    function getTaskColor(task) {
        if (!task) return 'var(--primary-color)';
        switch (task.priority) {
            case 'H': return 'var(--danger-color)';
            case 'M': return 'var(--warning-color)';
            case 'L': return 'var(--success-color)';
            default: return 'var(--primary-color)';
        }
    }
</script>

<svelte:head>
    <title>Planificateur Calendrier</title>
</svelte:head>

<div class="app-container">
    <!-- Header Component -->
    <Header />

    <div class="main-content">
        <!-- Left Column: Calendar -->
        <div class="calendar-column">
            <CalendarHeader
                currentDate={currentDate}
                currentView={currentView}
                onPrevious={navigatePrevious}
                onNext={navigateNext}
                onViewChange={setView}
            />
            
            <div id="calendar" class="calendar-container">
                <!-- Calendar Grid with Events -->
                <div class="calendar-events-container" style="position: relative;">
                    <CalendarGrid
                        currentDate={currentDate}
                        currentView={currentView}
                        tasks={plannedTasks}
                        onSlotDrop={handleSlotDrop}
                        onSlotOver={handleSlotOver}
                        onSlotLeave={handleSlotLeave}
                    >
                        <!-- Render Calendar Events -->
                        <svelte:fragment slot="events" let:dayIndex let:slotIndex let:slot>
                            {#each plannedTasks as task (task.uuid)}
                                {#if isSameDay(new Date(task.scheduled), getDaysInWeek(currentDate)[dayIndex])}
                                    <CalendarEvent
                                        task={task}
                                        date={currentDate}
                                        dayIndex={dayIndex}
                                        onDragStart={handleDragStart}
                                        onDragEnd={handleDragEnd}
                                    />
                                {/if}
                            {/each}
                        </svelte:fragment>
                    </CalendarGrid>
                </div>
            </div>
        </div>

        <!-- Right Column: Unplanned Tasks -->
        <div class="tasks-column">
            <div class="tasks-header">
                <h2>Tâches à planifier</h2>
                <div class="tasks-stats">
                    <span id="task-count" class="stat-badge">{unplannedTasks.length} tâches</span>
                    <button 
                        id="add-task-btn" 
                        class="btn btn-success header-add-btn"
                        on:click={() => ui.openTaskEditor(null, 'add')}
                    >
                        <span class="icon">➕</span>
                    </button>
                </div>
            </div>
            
            <div class="tasks-filters">
                <select id="filter-pool" class="filter-select" bind:value={selectedPool}>
                    <option value="all">Tous les pools</option>
                    <option value="pro">Pro</option>
                    <option value="perso">Perso</option>
                </select>
                <select id="sort-tasks" class="filter-select" bind:value={sortBy}>
                    <option value="urgency">Par urgence</option>
                    <option value="due">Par échéance</option>
                    <option value="duration">Par durée</option>
                </select>
            </div>
            
            <div class="tasks-container" id="unplanned-tasks">
                {#if isLoading}
                    <Loading />
                {:else if filteredUnplannedTasks.length === 0}
                    <div class="loading-message">
                        <span class="icon">⏳</span>
                        Aucune tâche non planifiée
                    </div>
                {:else}
                    {#each sortedUnplannedTasks as task (task.uuid)}
                        <div 
                            class="unplanned-task-item"
                            draggable="true"
                            on:dragstart={(e) => handleUnplannedDragStart(task, e)}
                            on:dragend={handleUnplannedDragEnd}
                            title="Drag to calendar to schedule"
                        >
                            <div class="task-info">
                                <strong>{task.description}</strong>
                                {#if task.project}
                                    <span class="task-meta"> - {task.project}</span>
                                {/if}
                            </div>
                            <div class="task-priority" style="background-color: {getTaskColor(task)};"></div>
                        </div>
                    {/each}
                {/if}
            </div>
        </div>
    </div>

    <!-- Task Editor Modal -->
    {#if $ui.taskEditorOpen}
        <TaskEditor 
            task={$ui.taskEditorData} 
            mode={$ui.taskEditorMode}
        />
    {/if}

    <!-- Notification Component -->
    <Notification />

    <!-- Drag Overlay -->
    {#if dragOverDayIndex !== null}
        <div class="drag-overlay" style="display: block;"></div>
    {/if}
</div>



<style>
    .app-container {
        padding: 20px;
    }
    
    .main-content {
        display: flex;
        gap: 20px;
    }
    
    .calendar-column {
        flex: 2;
        min-width: 0;
    }
    
    .tasks-column {
        flex: 1;
        min-width: 300px;
    }
    
    .calendar-header {
        display: flex;
        align-items: center;
        gap: 15px;
        margin-bottom: 15px;
    }
    
    .calendar-title {
        text-align: center;
        flex: 1;
    }
    
    .calendar-title h2 {
        margin: 0 0 10px 0;
        color: var(--text-color);
    }
    
    .view-controls {
        display: flex;
        gap: 5px;
        justify-content: center;
        margin-bottom: 5px;
    }
    
    .view-btn {
        padding: 4px 12px;
        border: 1px solid var(--border-color);
        background-color: var(--white-color);
        border-radius: var(--border-radius);
        cursor: pointer;
        font-size: 12px;
        transition: var(--transition);
    }
    
    .view-btn:hover {
        background-color: var(--primary-color);
        color: var(--white-color);
        border-color: var(--primary-color);
    }
    
    .view-btn.active {
        background-color: var(--primary-color);
        color: var(--white-color);
        border-color: var(--primary-color);
    }
    
    .date-range {
        font-size: 14px;
        color: var(--light-text-color);
    }
    
    .nav-btn {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        border: 1px solid var(--border-color);
        background-color: var(--white-color);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: var(--transition);
    }
    
    .nav-btn:hover {
        background-color: var(--primary-color);
        color: var(--white-color);
        border-color: var(--primary-color);
    }
    
    .calendar-container {
        background-color: var(--white-color);
        border-radius: var(--border-radius);
        padding: 20px;
        box-shadow: var(--box-shadow);
        min-height: 500px;
    }
    
    .calendar-placeholder {
        text-align: center;
        padding: 40px;
        color: var(--light-text-color);
        font-style: italic;
    }
    
    .tasks-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 15px;
    }
    
    .tasks-header h2 {
        margin: 0;
        color: var(--text-color);
    }
    
    .tasks-stats {
        display: flex;
        align-items: center;
        gap: 10px;
    }
    
    .stat-badge {
        background-color: var(--primary-color);
        color: var(--white-color);
        padding: 4px 12px;
        border-radius: var(--border-radius);
        font-size: 12px;
    }
    
    .tasks-filters {
        display: flex;
        gap: 10px;
        margin-bottom: 15px;
    }
    
    .filter-select {
        padding: 8px 12px;
        border: 1px solid var(--border-color);
        border-radius: var(--border-radius);
        font-size: 14px;
        background-color: var(--white-color);
        cursor: pointer;
        flex: 1;
    }
    
    .filter-select:focus {
        outline: none;
        border-color: var(--primary-color);
        box-shadow: 0 0 0 2px rgba(52, 152, 219, 0.2);
    }
    
    .tasks-container {
        background-color: var(--white-color);
        border-radius: var(--border-radius);
        padding: 15px;
        box-shadow: var(--box-shadow);
        max-height: 60vh;
        overflow-y: auto;
    }
    
    .unplanned-task-item {
        padding: 10px;
        border-bottom: 1px solid var(--border-color);
        cursor: pointer;
        transition: var(--transition);
    }
    
    .unplanned-task-item:last-child {
        border-bottom: none;
    }
    
    .unplanned-task-item:hover {
        background-color: #f8f9fa;
    }
    
    .task-meta {
        color: var(--light-text-color);
        font-size: 12px;
        margin-left: 10px;
    }
    
    .loading-message {
        text-align: center;
        padding: 20px;
        color: var(--light-text-color);
    }
    
    .icon {
        margin: 0;
        font-size: 16px;
    }
    
    .btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 8px 16px;
        border: none;
        border-radius: var(--border-radius);
        cursor: pointer;
        transition: var(--transition);
        font-size: 14px;
        text-decoration: none;
    }
    
    .btn-success {
        background-color: var(--success-color);
        color: var(--white-color);
    }
    
    .btn-success:hover {
        background-color: #219653;
    }
    
    .header-add-btn {
        border-radius: 50%;
        width: 40px;
        height: 40px;
        padding: 0;
    }
    
    .header-add-btn .icon {
        margin-right: 0;
        font-size: 20px;
    }
</style>