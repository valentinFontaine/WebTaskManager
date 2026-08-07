<script>
    import { context } from '../stores/context.js';
    import { ui } from '../stores/ui.js';
    import { CONTEXTS } from '../lib/constants.js';
    
    // Handle context change
    function handleContextChange(event) {
        const selectedContext = event.target.dataset.context;
        context.setContext(selectedContext);
    }
    
    // Handle add task button click
    function handleAddTask() {
        ui.openTaskEditor(null, 'add');
    }
    
    // Handle refresh button click
    function handleRefresh() {
        // This will trigger a re-fetch of tasks in the parent component
        window.location.reload(); // Simple approach for now
    }
</script>

<header>
    <div class="header-content">
        <h1>TaskWarrior Web UI</h1>
        <div class="context-selector">
            <span class="context-label">Context:</span>
            <div class="context-options">
                {#each CONTEXTS as ctx}
                    <button 
                        type="button" 
                        class="context-option {ctx.id === $context ? 'active' : ''}" 
                        class:active={ctx.id === $context}
                        data-context={ctx.id}
                        on:click={handleContextChange}
                        title={ctx.description}
                    >
                        {ctx.name}
                    </button>
                {/each}
            </div>
        </div>
    </div>
    <div class="header-actions">
        <a href="day-planner.html" class="btn btn-secondary">
            <span class="icon">📅</span>
            Planificateur de Journée
        </a>
        <a href="calendar-planner.html" class="btn btn-secondary">
            <span class="icon">📆</span>
            Calendrier
        </a>
        <button 
            id="add-task-btn" 
            class="btn btn-success header-add-btn"
            on:click={handleAddTask}
            title="Add new task"
        >
            <span class="icon">➕</span>
        </button>
        <button 
            id="refresh-btn" 
            class="btn btn-primary"
            on:click={handleRefresh}
            title="Refresh tasks"
        >
            <span class="icon">🔄</span>
            Refresh
        </button>
    </div>
</header>

<style>
    header {
        background-color: var(--white-color);
        box-shadow: var(--box-shadow);
        padding: 15px 20px;
        margin-bottom: 20px;
        border-radius: var(--border-radius);
        display: flex;
        justify-content: space-between;
        align-items: center;
    }
    
    .header-content {
        display: flex;
        align-items: center;
        gap: 20px;
    }
    
    .header-actions {
        display: flex;
        gap: 10px;
    }
    
    .context-selector {
        display: flex;
        align-items: center;
        gap: 10px;
    }
    
    .context-options {
        display: flex;
        gap: 5px;
    }
    
    .context-option {
        padding: 5px 10px;
        border: 1px solid var(--border-color);
        background-color: var(--white-color);
        border-radius: var(--border-radius);
        cursor: pointer;
        font-size: 12px;
        transition: all 0.2s ease;
    }
    
    .context-option:hover {
        background-color: var(--primary-color);
        color: var(--white-color);
        border-color: var(--primary-color);
    }
    
    .context-option.active {
        background-color: var(--primary-color);
        color: var(--white-color);
        border-color: var(--primary-color);
    }
    
    .context-label {
        font-size: 12px;
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
        transition: all 0.3s ease;
        font-size: 14px;
        text-decoration: none;
    }
    
    .btn-primary {
        background-color: var(--primary-color);
        color: var(--white-color);
    }
    
    .btn-primary:hover {
        background-color: #2980b9;
    }
    
    .btn-secondary {
        background-color: #95a5a6;
        color: var(--white-color);
    }
    
    .btn-secondary:hover {
        background-color: #7f8c8d;
    }
    
    .btn-success {
        background-color: var(--success-color);
        color: var(--white-color);
    }
    
    .btn-success:hover {
        background-color: #219653;
    }
    
    .icon {
        margin-right: 8px;
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
    
    h1 {
        margin: 0;
        color: var(--text-color);
        font-size: 1.5rem;
    }
</style>