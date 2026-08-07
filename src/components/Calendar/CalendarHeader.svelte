<script>
    import { CALENDAR_CONSTANTS } from './calendarUtils.js';
    
    // Props
    export let currentDate = new Date();
    export let currentView = 'week';
    export let onPrevious = () => {};
    export let onNext = () => {};
    export let onViewChange = () => {};

    // Available views
    const views = CALENDAR_CONSTANTS.VIEWS;

    // Format current date for display
    $: calendarTitle = formatDateRange();

    function formatDateRange() {
        switch (currentView) {
            case 'day':
                return currentDate.toLocaleDateString('en-US', {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric'
                });
            case 'week':
                const start = new Date(currentDate);
                start.setDate(currentDate.getDate() - currentDate.getDay()); // Start of week (Sunday)
                const end = new Date(start);
                end.setDate(start.getDate() + 6); // End of week (Saturday)
                
                const startFormatted = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                const endFormatted = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
                return `${startFormatted} - ${endFormatted}`;
            case 'month':
                return currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
            default:
                return currentDate.toLocaleDateString();
        }
    }
</script>

<div class="calendar-header">
    <button class="nav-btn" on:click={onPrevious} title="Previous">
        <span class="icon">◀</span>
    </button>
    
    <div class="calendar-title">
        <h2>Calendar</h2>
        <div class="view-controls">
            {#each views as view}
                <button 
                    class="view-btn {currentView === view.id ? 'active' : ''}"
                    class:active={currentView === view.id}
                    on:click={() => onViewChange(view.id)}
                    title={view.name}
                >
                    {view.icon} {view.name}
                </button>
            {/each}
        </div>
        <div class="date-range">{calendarTitle}</div>
    </div>
    
    <button class="nav-btn" on:click={onNext} title="Next">
        <span class="icon">▶</span>
    </button>
</div>

<style>
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
        display: flex;
        align-items: center;
        gap: 4px;
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
    
    .icon {
        margin: 0;
        font-size: 16px;
    }
</style>
