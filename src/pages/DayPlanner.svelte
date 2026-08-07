<script>
    import { onMount } from 'svelte';
    import '../global.css';
    import { tasks } from '../stores/tasks.js';
    import { ui } from '../stores/ui.js';
    import { fetchTasks, modifyTask } from '../lib/api.js';
    import { getWorkDayTimeSlots, isSameDay, sortTasksByStartTime, CALENDAR_CONSTANTS, findTaskConflicts } from '../components/Calendar/calendarUtils.js';
    import Header from '../components/Header.svelte';
    import Notification from '../components/Notification.svelte';
    import Loading from '../components/Loading.svelte';
    import TaskEditor from '../components/TaskEditor.svelte';
    import CalendarEvent from '../components/Calendar/CalendarEvent.svelte';
    
    // Local state
    let isLoading = true;
    let error = null;
    let unplannedTasks = [];
    let scheduledTasks = [];
    
    // Day planner state
    let currentDate = new Date();
    let sortBy = 'priority';
    
    // Drag and drop state
    let draggedTask = null;
    let dragOverSlotIndex = null;
    let showConflictWarning = false;
    let conflictTasks = [];

    // Time slots for the day
    const timeSlots = getWorkDayTimeSlots(currentDate, 30); // 30-minute slots
    const slotHeight = CALENDAR_CONSTANTS.TIME_SLOT_HEIGHT / 2; // Half height for 30-min slots
    const hoursStart = CALENDAR_CONSTANTS.HOUR_START;

    // Load data on mount
    onMount(async () => {
        try {
            ui.showLoading();
            
            // Load all tasks
            const tasksData = await fetchTasks();
            tasks.setTasks(tasksData);
            
            // Separate scheduled vs unplanned tasks
            scheduledTasks = tasksData.filter(task => task.scheduled);
            unplannedTasks = tasksData.filter(task => !task.scheduled);
            
        } catch (err) {
            error = err.message;
            ui.setError(err.message);
            ui.showNotification(`Error loading data: ${err.message}`, 'error');
        } finally {
            isLoading = false;
            ui.hideLoading();
        }
    });
    
    // Format current date for display
    $: currentDateDisplay = currentDate.toLocaleDateString('fr-FR', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric'
    });
    
    // Get scheduled tasks for current date
    $: currentDateScheduledTasks = scheduledTasks.filter(task => {
        if (!task.scheduled) return false;
        const taskDate = new Date(task.scheduled);
        return isSameDay(taskDate, currentDate);
    });
    
    // Sort tasks
    function sortTasks(tasks, sortBy) {
        return [...tasks].sort((a, b) => {
            switch (sortBy) {
                case 'priority':
                    const priorityMap = { H: 1, M: 2, L: 3, '': 4 };
                    return (priorityMap[a.priority] || 4) - (priorityMap[b.priority] || 4);
                case 'duration':
                    const aDuration = parseFloat(a.duration) || 0;
                    const bDuration = parseFloat(b.duration) || 0;
                    return bDuration - aDuration;
                case 'alphabetical':
                    return a.description.localeCompare(b.description);
                default:
                    return (priorityMap[a.priority] || 4) - (priorityMap[b.priority] || 4);
            }
        });
    }
    
    $: sortedUnplannedTasks = sortTasks(unplannedTasks, sortBy);
    
    // Handle sort change
    function handleSortChange(event) {
        sortBy = event.target.value;
    }
    
    // Drag and drop handlers
    function handleDragStart(task) {
        draggedTask = task;
    }
    
    function handleDragEnd() {
        draggedTask = null;
        dragOverSlotIndex = null;
        showConflictWarning = false;
        conflictTasks = [];
    }
    
    function handleSlotOver(slotIndex, event) {
        event.preventDefault();
        dragOverSlotIndex = slotIndex;
        
        // Check for conflicts if we have a dragged task
        if (draggedTask) {
            checkForConflicts(slotIndex);
        }
    }
    
    function handleSlotLeave() {
        dragOverSlotIndex = null;
        showConflictWarning = false;
        conflictTasks = [];
    }
    
    // Check for scheduling conflicts
    function checkForConflicts(slotIndex) {
        if (!draggedTask) return;
        
        const slot = timeSlots[slotIndex];
        const newScheduledTime = slot.start.toISOString();
        const duration = parseFloat(draggedTask.duration) || 60;
        
        // Create temporary task with new time
        const tempTask = {
            ...draggedTask,
            scheduled: newScheduledTime,
            duration: duration
        };
        
        // Get all tasks except the one being dragged
        const allTasks = [...currentDateScheduledTasks, ...unplannedTasks].filter(t => t.uuid !== draggedTask.uuid);
        conflictTasks = findTaskConflicts(tempTask, allTasks);
        showConflictWarning = conflictTasks.length > 0;
    }
    
    // Handle drop on time slot
    async function handleSlotDrop(taskData, slotIndex) {
        if (!taskData || !taskData.uuid || slotIndex === null) return;
        
        try {
            ui.showLoading();
            
            const slot = timeSlots[slotIndex];
            const scheduledDate = slot.start.toISOString();
            
            // Update task
            const updatedTask = {
                ...taskData,
                scheduled: scheduledDate
            };
            
            // Call API to update task
            const result = await modifyTask(taskData.uuid, updatedTask);
            
            // Update local state
            tasks.updateTask(taskData.uuid, result);
            
            // Remove from unplanned and add to scheduled
            unplannedTasks = unplannedTasks.filter(t => t.uuid !== taskData.uuid);
            if (!scheduledTasks.some(t => t.uuid === taskData.uuid)) {
                scheduledTasks.push(result);
            }
            
            ui.showNotification('Task scheduled successfully', 'success');
            
        } catch (err) {
            ui.showNotification(`Failed to schedule task: ${err.message}`, 'error');
        } finally {
            ui.hideLoading();
            handleDragEnd();
        }
    }
    
    // Handle drop on unplanned (remove from schedule)
    async function handleUnplannedDrop(taskData) {
        if (!taskData || !taskData.uuid) return;
        
        try {
            ui.showLoading();
            
            // Remove scheduled time
            const updatedTask = {
                ...taskData,
                scheduled: null
            };
            
            // Call API to update task
            const result = await modifyTask(taskData.uuid, updatedTask);
            
            // Update local state
            tasks.updateTask(taskData.uuid, result);
            scheduledTasks = scheduledTasks.filter(t => t.uuid !== taskData.uuid);
            if (!unplannedTasks.some(t => t.uuid === taskData.uuid)) {
                unplannedTasks.push(result);
            }
            
            ui.showNotification('Task removed from schedule', 'info');
            
        } catch (err) {
            ui.showNotification(`Failed to remove from schedule: ${err.message}`, 'error');
        } finally {
            ui.hideLoading();
        }
    }
    
    // Handle drag start from unplanned tasks
    function handleUnplannedDragStart(task, event) {
        event.dataTransfer.setData('text/plain', JSON.stringify(task));
        event.dataTransfer.effectAllowed = 'move';
        draggedTask = task;
    }
    
    // Handle drag end from unplanned tasks
    function handleUnplannedDragEnd() {
        draggedTask = null;
        dragOverSlotIndex = null;
        showConflictWarning = false;
    }
    
    // Get position for scheduled task in day planner
    function getTaskPosition(task) {
        if (!task || !task.scheduled) return null;
        
        const taskDate = new Date(task.scheduled);
        const duration = parseFloat(task.duration) || 60; // minutes
        
        // Calculate time from start of work day
        const minutesFromStart = (taskDate.getHours() - hoursStart) * 60 + taskDate.getMinutes();
        const top = minutesFromStart * (slotHeight / 30); // 30-min slots
        const height = (duration / 30) * slotHeight;
        
        return {
            top,
            height,
            duration
        };
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
    
    // Format time
    function formatTime(dateString) {
        if (!dateString) return '';
        const date = new Date(dateString);
        return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    }
</script>

<svelte:head>
    <title>Planificateur de Journée</title>
</svelte:head>

<div class="app-container">
    <!-- Header Component -->
    <Header />

    <div class="main-content">
        <!-- Left Column: Day Schedule -->
        <div class="calendar-column">
            <div class="calendar-header">
                <h2>Ma Journée</h2>
                <div class="date-display">{currentDateDisplay}</div>
            </div>
            <div class="calendar-container">
                <div class="time-slots" on:dragover|preventDefault on:dragleave|preventDefault>
                    <!-- Time labels column -->
                    <div class="time-column">
                        {#each timeSlots as slot, index}
                            <div class="time-label" data-hour={index}>
                                {slot.label}
                            </div>
                        {/each}
                    </div>
                    
                    <!-- Main time slots area with scheduled tasks -->
                    <div class="slots-area" style="position: relative;" on:drop|preventDefault={(e) => {
                        const taskData = JSON.parse(e.dataTransfer.getData('text/plain'));
                        handleSlotDrop(taskData, dragOverSlotIndex);
                    }}>
                        <!-- Render scheduled tasks -->
                        {#each currentDateScheduledTasks as task (task.uuid)}
                            {#if getTaskPosition(task)}
                                <div 
                                    class="scheduled-task"
                                    class:conflict={showConflictWarning && conflictTasks.some(ct => ct.uuid === task.uuid)}
                                    style="top: {getTaskPosition(task).top}px; height: {getTaskPosition(task).height}px; background-color: {getTaskColor(task)};"
                                    draggable="true"
                                    on:dragstart={(e) => {
                                        e.dataTransfer.setData('text/plain', JSON.stringify(task));
                                        handleDragStart(task);
                                    }}
                                    on:dragend={handleDragEnd}
                                    title="{task.description}\n{formatTime(task.scheduled)} ({getTaskPosition(task)?.duration || 60}m)"
                                >
                                    <div class="task-content">
                                        <strong>{task.description}</strong>
                                        {#if task.project}
                                            <span class="task-project"> - {task.project}</span>
                                        {/if}
                                        <div class="task-time">
                                            {formatTime(task.scheduled)} ({getTaskPosition(task)?.duration || 60}m)
                                        </div>
                                    </div>
                                </div>
                            {/if}
                        {/each}
                        
                        <!-- Drop indicator -->
                        {#if dragOverSlotIndex !== null}
                            <div 
                                class="drop-indicator"
                                style="top: {dragOverSlotIndex * slotHeight}px; height: {slotHeight}px;"
                            ></div>
                        {/if}
                        
                        <!-- Conflict warning overlay -->
                        {#if showConflictWarning && conflictTasks.length > 0}
                            <div class="conflict-warning">
                                <span class="warning-icon">⚠️</span>
                                <span>Conflict with {conflictTasks.length} task(s)</span>
                            </div>
                        {/if}
                    </div>
                </div>
            </div>
        </div>

        <!-- Right Column: Tasks to Schedule -->
        <div class="tasks-column">
            <div class="tasks-header">
                <h2>Tâches à planifier</h2>
                <div class="tasks-controls">
                    <button 
                        id="add-task-btn" 
                        class="btn btn-small btn-primary"
                        on:click={() => ui.openTaskEditor(null, 'add')}
                    >
                        <span class="icon">➕</span>
                        Ajouter
                    </button>
                    <select id="sort-tasks" class="sort-select" bind:value={sortBy} on:change={handleSortChange}>
                        <option value="priority">Par priorité</option>
                        <option value="duration">Par durée</option>
                        <option value="alphabetical">Alphabétique</option>
                    </select>
                </div>
            </div>
            
            <div class="tasks-container" id="unplanned-tasks">
                {#if isLoading}
                    <Loading />
                {:else if sortedUnplannedTasks.length === 0}
                    <div class="loading-message">
                        <span class="icon">⏳</span>
                        Aucune tâche à planifier
                    </div>
                {:else}
                    {#each sortedUnplannedTasks as task (task.uuid)}
                        <div 
                            class="unplanned-task-item"
                            draggable="true"
                            on:dragstart={(e) => handleUnplannedDragStart(task, e)}
                            on:dragend={handleUnplannedDragEnd}
                            title="Drag to schedule"
                        >
                            <div class="task-info">
                                <strong>{task.description}</strong>
                                {#if task.project}
                                    <span class="task-meta"> - {task.project}</span>
                                {/if}
                                {#if task.priority}
                                    <span class="priority-badge {task.priority}">{task.priority}</span>
                                {/if}
                            </div>
                            <div class="task-actions">
                                <button class="btn btn-small btn-success" title="Add to schedule" on:click|preventDefault|stopPropagation={() => handleSlotDrop(task, 0)}>
                                    <span class="icon">➕</span>
                                </button>
                            </div>
                        </div>
                    {/each}
                {/if}
            </div>
        </div>
    </div>

    <!-- Drag Overlay -->
    <div id="drag-overlay" class="drag-overlay"></div>

    <!-- Task Editor Modal -->
    {#if $ui.taskEditorOpen}
        <TaskEditor 
            task={$ui.taskEditorData} 
            mode={$ui.taskEditorMode}
        />
    {/if}

    <!-- Notification Component -->
    <Notification />
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
        justify-content: space-between;
        align-items: center;
        margin-bottom: 15px;
    }
    
    .calendar-header h2 {
        margin: 0;
        color: var(--text-color);
    }
    
    .date-display {
        color: var(--light-text-color);
        font-size: 14px;
    }
    
    .calendar-container {
        background-color: var(--white-color);
        border-radius: var(--border-radius);
        padding: 20px;
        box-shadow: var(--box-shadow);
        min-height: 500px;
    }
    
    .time-slots {
        min-height: 400px;
    }
    
    .time-slots-placeholder {
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
    
    .tasks-controls {
        display: flex;
        gap: 10px;
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
        display: flex;
        justify-content: space-between;
        align-items: center;
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
    
    .task-info {
        flex: 1;
    }
    
    .task-meta {
        color: var(--light-text-color);
        font-size: 12px;
        margin-left: 10px;
    }
    
    .priority-badge {
        display: inline-block;
        padding: 2px 6px;
        border-radius: 3px;
        font-size: 10px;
        font-weight: bold;
        color: white;
        margin-left: 8px;
    }
    
    .priority-badge.H {
        background-color: var(--danger-color);
    }
    
    .priority-badge.M {
        background-color: var(--warning-color);
    }
    
    .priority-badge.L {
        background-color: var(--success-color);
    }
    
    .loading-message {
        text-align: center;
        padding: 20px;
        color: var(--light-text-color);
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
    
    .btn-small {
        padding: 4px 8px;
        font-size: 12px;
    }
    
    .btn-primary {
        background-color: var(--primary-color);
        color: var(--white-color);
    }
    
    .btn-primary:hover {
        background-color: #2980b9;
    }
    
    .btn-success {
        background-color: var(--success-color);
        color: var(--white-color);
    }
    
    .btn-success:hover {
        background-color: #219653;
    }
    
    .sort-select {
        padding: 8px 12px;
        border: 1px solid var(--border-color);
        border-radius: var(--border-radius);
        font-size: 14px;
        background-color: var(--white-color);
        cursor: pointer;
    }
    
    .sort-select:focus {
        outline: none;
        border-color: var(--primary-color);
        box-shadow: 0 0 0 2px rgba(52, 152, 219, 0.2);
    }
    
    .icon {
        margin: 0;
        font-size: 16px;
    }
    
    .drag-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background-color: rgba(0, 0, 0, 0.1);
        pointer-events: none;
        z-index: 999;
        display: none;
    }
</style>