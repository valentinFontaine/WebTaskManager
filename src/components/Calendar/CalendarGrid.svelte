<script>
    import { CALENDAR_CONSTANTS } from './calendarUtils.js';
    import { getStartOfWeek, getDaysInWeek, getWorkDayTimeSlots, isSameDay } from './calendarUtils.js';
    
    // Props
    export let currentDate = new Date();
    export let currentView = 'week';
    export let tasks = [];
    export let onSlotDrop = () => {};
    export let onSlotOver = () => {};
    export let onSlotLeave = () => {};

    // Day width and slot height
    const dayWidth = CALENDAR_CONSTANTS.DAY_WIDTH;
    const slotHeight = CALENDAR_CONSTANTS.TIME_SLOT_HEIGHT;
    const hourStart = CALENDAR_CONSTANTS.HOUR_START;
    const hourEnd = CALENDAR_CONSTANTS.HOUR_END;

    // Calculate days to display based on view
    $: days = calculateDays();
    $: timeSlots = getWorkDayTimeSlots(currentDate, 60); // 1-hour slots

    function calculateDays() {
        const days = [];
        switch (currentView) {
            case 'day':
                days.push(new Date(currentDate));
                break;
            case 'week':
                return getDaysInWeek(currentDate);
            case 'month':
                // For month view, show 5 weeks (35 days)
                const startOfWeek = getStartOfWeek(currentDate);
                for (let i = -7; i < 28; i++) {
                    const day = new Date(startOfWeek);
                    day.setDate(startOfWeek.getDate() + i);
                    days.push(day);
                }
                break;
        }
        return days;
    }

    // Generate time labels for the left column
    $: timeLabels = [];
    for (let hour = hourStart; hour <= hourEnd; hour++) {
        timeLabels.push({
            hour: hour,
            label: `${hour}:00`
        });
    }

    // Handle drag over on time slots
    function handleDragOver(event, dayIndex, slotIndex) {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        onSlotOver(dayIndex, slotIndex, event);
    }

    // Handle drag leave
    function handleDragLeave(event) {
        event.preventDefault();
        onSlotLeave();
    }

    // Handle drop on time slot
    function handleDrop(event, dayIndex, slotIndex) {
        event.preventDefault();
        const taskData = JSON.parse(event.dataTransfer.getData('text/plain'));
        onSlotDrop(taskData, dayIndex, slotIndex);
    }

    // Check if a task is in this time slot
    function isTaskInSlot(task, dayIndex, slotIndex) {
        if (!task || !task.scheduled) return false;
        
        const daysList = getDaysInWeek(currentDate);
        if (dayIndex >= daysList.length) return false;
        
        const slotDate = daysList[dayIndex];
        const taskDate = new Date(task.scheduled);
        
        if (!isSameDay(taskDate, slotDate)) return false;
        
        const taskHour = taskDate.getHours();
        const slotHour = hourStart + slotIndex;
        
        return taskHour >= slotHour && taskHour < slotHour + 1;
    }

    // Get tasks for a specific day
    function getTasksForDay(dayIndex) {
        const daysList = currentView === 'week' ? getDaysInWeek(currentDate) : days;
        if (dayIndex >= daysList.length) return [];
        
        const day = daysList[dayIndex];
        return tasks.filter(task => {
            if (!task.scheduled) return false;
            const taskDate = new Date(task.scheduled);
            return isSameDay(taskDate, day);
        });
    }
</script>

<div class="calendar-grid-container">
    <!-- Time labels column -->
    <div class="time-column">
        {#each timeLabels as slot}
            <div class="time-label" data-hour={slot.hour}>
                {slot.label}
            </div>
        {/each}
    </div>
    
    <!-- Day columns -->
    <div class="day-columns">
        {#each days as day, dayIndex}
            <div 
                class="day-column"
                data-day-index={dayIndex}
                data-date={day.toISOString()}
                on:dragover={(e) => handleDragOver(e, dayIndex, 0)}
                on:dragleave={handleDragLeave}
                on:drop={(e) => handleDrop(e, dayIndex, 0)}
            >
                <!-- Day header -->
                <div class="day-header">
                    <span class="day-name">{day.toLocaleDateString('en-US', { weekday: 'short' })}</span>
                    <span class="day-date">{day.getDate()}</span>
                </div>
                
                <!-- Time slots for this day -->
                <div class="day-slots">
                    {#each timeSlots as slot, slotIndex}
                        <div 
                            class="time-slot"
                            class:has-task={getTasksForDay(dayIndex).some(t => isTaskInSlot(t, dayIndex, slotIndex))}
                            data-day-index={dayIndex}
                            data-slot-index={slotIndex}
                            data-start-time={slot.start.toISOString()}
                            data-end-time={slot.end.toISOString()}
                            on:dragover={(e) => handleDragOver(e, dayIndex, slotIndex)}
                            on:dragleave={handleDragLeave}
                            on:drop={(e) => handleDrop(e, dayIndex, slotIndex)}
                        >
                            <!-- Tasks that fall in this slot will be rendered here -->
                            <slot name="events" {dayIndex} {slotIndex} {slot}>
                                <!-- Default content for tasks -->
                                {#each getTasksForDay(dayIndex) as task}
                                    {#if isTaskInSlot(task, dayIndex, slotIndex)}
                                        <div class="slot-task-preview">
                                            {task.description}
                                        </div>
                                    {/if}
                                {/each}
                            </slot>
                        </div>
                    {/each}
                </div>
            </div>
        {/each}
    </div>
</div>

<style>
    .calendar-grid-container {
        display: flex;
        border: 1px solid var(--border-color);
        border-radius: var(--border-radius);
        overflow: hidden;
        background-color: var(--white-color);
        box-shadow: var(--box-shadow);
    }
    
    .time-column {
        width: 60px;
        background-color: #f8f9fa;
        border-right: 1px solid var(--border-color);
        display: flex;
        flex-direction: column;
    }
    
    .time-label {
        height: v-bind(slotHeight + 'px');
        display: flex;
        align-items: center;
        justify-content: flex-end;
        padding: 0 10px;
        font-size: 11px;
        color: var(--light-text-color);
        border-bottom: 1px solid var(--border-color);
        box-sizing: border-box;
    }
    
    .time-label:last-child {
        border-bottom: none;
    }
    
    .day-columns {
        display: flex;
        flex: 1;
        min-width: 0;
    }
    
    .day-column {
        flex: 1;
        min-width: v-bind(dayWidth + 'px');
        border-right: 1px solid var(--border-color);
        display: flex;
        flex-direction: column;
    }
    
    .day-column:last-child {
        border-right: none;
    }
    
    .day-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 8px;
        background-color: #f8f9fa;
        border-bottom: 1px solid var(--border-color);
        font-size: 12px;
        font-weight: 500;
        color: var(--text-color);
    }
    
    .day-name {
        color: var(--primary-color);
    }
    
    .day-date {
        background-color: var(--primary-color);
        color: var(--white-color);
        width: 20px;
        height: 20px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 10px;
        font-weight: bold;
    }
    
    .day-slots {
        display: flex;
        flex-direction: column;
        flex: 1;
        min-height: calc(v-bind(dayWidth + 'px') * 1.5);
    }
    
    .time-slot {
        height: v-bind(slotHeight + 'px');
        border-bottom: 1px solid var(--border-color);
        position: relative;
        box-sizing: border-box;
    }
    
    .time-slot:last-child {
        border-bottom: none;
    }
    
    .time-slot.has-task {
        background-color: #f0f8ff;
    }
    
    .slot-task-preview {
        position: absolute;
        top: 2px;
        left: 2px;
        right: 2px;
        font-size: 10px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        background-color: var(--primary-color);
        color: var(--white-color);
        padding: 2px;
        border-radius: var(--border-radius);
        cursor: move;
    }
</style>
