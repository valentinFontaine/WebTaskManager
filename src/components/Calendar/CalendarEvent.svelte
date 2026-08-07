<script>
    import { CALENDAR_CONSTANTS } from './calendarUtils.js';
    import { calculateEventPosition, isSameDay } from './calendarUtils.js';
    
    // Props
    export let task = null;
    export let date = new Date();
    export let dayIndex = 0;
    export let onDragStart = () => {};
    export let onDragEnd = () => {};

    // Calculate event position
    $: position = calculateEventPosition(task, date, CALENDAR_CONSTANTS.DAY_WIDTH, CALENDAR_CONSTANTS.TIME_SLOT_HEIGHT);

    // Get task duration in minutes
    $: duration = parseFloat(task?.duration) || 60;

    // Check if task is scheduled
    $: isScheduled = task && task.scheduled;

    // Handle drag start
    function handleDragStart(event) {
        if (!task) return;
        event.dataTransfer.setData('text/plain', JSON.stringify(task));
        event.dataTransfer.effectAllowed = 'move';
        onDragStart(task);
    }

    // Handle drag end
    function handleDragEnd(event) {
        onDragEnd(task);
    }

    // Format time display
    function formatTime(dateString) {
        if (!dateString) return '';
        const date = new Date(dateString);
        return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    }

    // Get task color based on priority
    function getTaskColor() {
        if (!task) return '';
        switch (task.priority) {
            case 'H': return 'var(--danger-color)';
            case 'M': return 'var(--warning-color)';
            case 'L': return 'var(--success-color)';
            default: return 'var(--primary-color)';
        }
    }
</script>

{#if position}
    <div 
        class="calendar-event"
        class:dragging={false}
        style="top: {position.top}px; left: {position.left}px; width: {position.width}px; height: {position.height}px; background-color: {getTaskColor()};"
        draggable="true"
        on:dragstart={handleDragStart}
        on:dragend={handleDragEnd}
        data-task-id={task.uuid}
        title="{task.description}\nStart: {formatTime(task.scheduled)}\nDuration: {duration} minutes"
    >
        <div class="event-content">
            <div class="event-title">{task.description}</div>
            {#if task.project}
                <div class="event-project">{task.project}</div>
            {/if}
            <div class="event-time">
                {formatTime(task.scheduled)} ({duration}m)
            </div>
        </div>
        <div class="event-resize-handle" title="Drag to resize"></div>
    </div>
{/if}

<style>
    .calendar-event {
        position: absolute;
        border-radius: var(--border-radius);
        padding: 4px;
        color: var(--white-color);
        font-size: 11px;
        cursor: move;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
        z-index: 10;
        user-select: none;
        box-sizing: border-box;
        overflow: hidden;
        min-height: 16px;
    }
    
    .calendar-event.dragging {
        opacity: 0.5;
    }
    
    .event-content {
        height: 100%;
        overflow: hidden;
    }
    
    .event-title {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        font-weight: 500;
    }
    
    .event-project {
        font-size: 10px;
        opacity: 0.8;
        margin-top: 2px;
    }
    
    .event-time {
        font-size: 10px;
        opacity: 0.8;
        margin-top: 2px;
    }
    
    .event-resize-handle {
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        height: 6px;
        cursor: ns-resize;
        background-color: rgba(255, 255, 255, 0.2);
    }
    
    .event-resize-handle:hover {
        background-color: rgba(255, 255, 255, 0.4);
    }
</style>
