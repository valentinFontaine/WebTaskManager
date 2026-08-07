<script>
    import { tasks } from '../stores/tasks.js';
    import { ui } from '../stores/ui.js';
    import { startTask, stopTask, completeTask, deleteTask } from '../lib/api.js';
    import { getPriorityClass, getStatusClass, formatTaskDueDate, getTaskClasses } from '../lib/taskUtils.js';
    
    // Props
    export let task;
    
    // Handle task actions
    async function handleStartTask() {
        try {
            if (!task || !task.uuid) return;
            
            ui.showLoading();
            const updatedTask = await startTask(task.uuid);
            tasks.updateTask(task.uuid, { start: updatedTask.start, status: updatedTask.status });
            ui.showNotification('Task started successfully', 'success');
        } catch (error) {
            ui.showNotification(`Failed to start task: ${error.message}`, 'error');
        } finally {
            ui.hideLoading();
        }
    }
    
    async function handleStopTask() {
        try {
            if (!task || !task.uuid) return;
            
            ui.showLoading();
            const updatedTask = await stopTask(task.uuid);
            tasks.updateTask(task.uuid, { start: null, end: updatedTask.end, status: updatedTask.status });
            ui.showNotification('Task stopped successfully', 'success');
        } catch (error) {
            ui.showNotification(`Failed to stop task: ${error.message}`, 'error');
        } finally {
            ui.hideLoading();
        }
    }
    
    async function handleCompleteTask() {
        try {
            if (!task || !task.uuid) return;
            
            ui.showLoading();
            const updatedTask = await completeTask(task.uuid);
            tasks.updateTask(task.uuid, { status: 'completed', end: updatedTask.end });
            ui.showNotification('Task marked as completed', 'success');
        } catch (error) {
            ui.showNotification(`Failed to complete task: ${error.message}`, 'error');
        } finally {
            ui.hideLoading();
        }
    }
    
    async function handleDeleteTask() {
        if (!confirm('Are you sure you want to delete this task? This cannot be undone.')) {
            return;
        }
        
        try {
            if (!task || !task.uuid) return;
            
            ui.showLoading();
            await deleteTask(task.uuid);
            tasks.removeTask(task.uuid);
            ui.showNotification('Task deleted successfully', 'success');
        } catch (error) {
            ui.showNotification(`Failed to delete task: ${error.message}`, 'error');
        } finally {
            ui.hideLoading();
        }
    }
    
    function handleEditTask() {
        if (!task) return;
        ui.openTaskEditor({ ...task }, 'edit');
    }
    
    // Check if task is active (started)
    $: isActive = task && task.start && task.status === 'pending';
    
    // Format due date
    $: dueDateDisplay = formatTaskDueDate(task);
</script>

<div class="task-card" class:active={isActive}>
    <div class="task-header">
        <div class="task-priority-indicator {getPriorityClass(task?.priority)}">
            {#if task?.priority}
                {task.priority}
            {/if}
        </div>
        <div class="task-description">
            <strong>{task?.description || 'Untitled Task'}</strong>
        </div>
        <div class="task-status-indicator {getStatusClass(task?.status)}">
            {#if isActive}
                🕐 Active
            {:else if task?.status === 'completed'}
                ✅ Completed
            {:else if task?.status === 'deleted'}
                🗑️ Deleted
            {:else if task?.status === 'waiting'}
                ⏳ Waiting
            {:else}
                ⏸️ Pending
            {/if}
        </div>
    </div>
    
    <div class="task-meta">
        {#if task?.project}
            <span class="task-project">
                <span class="meta-label">Project:</span> {task.project}
            </span>
        {/if}
        
        {#if task?.tags && task.tags.length > 0}
            <span class="task-tags">
                <span class="meta-label">Tags:</span> {task.tags.join(', ')}
            </span>
        {/if}
        
        {#if task?.due}
            <span class="task-due {isOverdue(task.due) ? 'overdue' : ''}">
                {dueDateDisplay}
            </span>
        {/if}
        
        {#if task?.urgency}
            <span class="task-urgency">
                <span class="meta-label">Urgency:</span> {task.urgency}
            </span>
        {/if}
    </div>
    
    <div class="task-actions">
        {#if !isActive}
            <button 
                class="btn btn-primary task-action-btn" 
                on:click={handleStartTask}
                title="Start task"
            >
                <span class="icon">▶️</span>
            </button>
        {:else}
            <button 
                class="btn btn-warning task-action-btn" 
                on:click={handleStopTask}
                title="Stop task"
            >
                <span class="icon">⏹️</span>
            </button>
        {/if}
        
        {#if task?.status !== 'completed'}
            <button 
                class="btn btn-success task-action-btn" 
                on:click={handleCompleteTask}
                title="Mark as completed"
            >
                <span class="icon">✅</span>
            </button>
        {/if}
        
        <button 
            class="btn btn-secondary task-action-btn" 
            on:click={handleEditTask}
            title="Edit task"
        >
            <span class="icon">✏️</span>
        </button>
        
        <button 
            class="btn btn-danger task-action-btn" 
            on:click={handleDeleteTask}
            title="Delete task"
        >
            <span class="icon">🗑️</span>
        </button>
    </div>
</div>

<style>
    .task-card {
        background-color: var(--white-color);
        border-radius: var(--border-radius);
        box-shadow: var(--box-shadow);
        padding: 15px;
        margin-bottom: 15px;
        transition: var(--transition);
        border-left: 4px solid var(--primary-color);
    }
    
    .task-card:hover {
        box-shadow: 0 4px 15px var(--shadow-color);
        transform: translateY(-2px);
    }
    
    .task-card.active {
        border-left-color: var(--warning-color);
        background-color: #fff8e1;
    }
    
    .task-header {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 10px;
        position: relative;
    }
    
    .task-description {
        flex: 1;
        word-break: break-word;
    }
    
    .task-priority-indicator {
        width: 24px;
        height: 24px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 12px;
        font-weight: bold;
        color: white;
    }
    
    .task-priority-indicator.priority-high {
        background-color: var(--danger-color);
    }
    
    .task-priority-indicator.priority-medium {
        background-color: var(--warning-color);
    }
    
    .task-priority-indicator.priority-low {
        background-color: var(--success-color);
    }
    
    .task-status-indicator {
        padding: 4px 8px;
        border-radius: var(--border-radius);
        font-size: 12px;
        font-weight: bold;
        color: white;
    }
    
    .task-status-indicator.status-pending {
        background-color: #95a5a6;
    }
    
    .task-status-indicator.status-completed {
        background-color: var(--success-color);
    }
    
    .task-status-indicator.status-waiting {
        background-color: var(--warning-color);
    }
    
    .task-status-indicator.status-deleted {
        background-color: var(--danger-color);
    }
    
    .task-meta {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin-bottom: 10px;
        font-size: 13px;
        color: var(--light-text-color);
    }
    
    .meta-label {
        color: #7f8c8d;
        margin-right: 4px;
    }
    
    .task-project {
        font-weight: 500;
        color: var(--primary-color);
    }
    
    .task-tags {
        color: var(--warning-color);
    }
    
    .task-due {
        font-weight: 500;
    }
    
    .task-due.overdue {
        color: var(--danger-color);
        font-weight: bold;
    }
    
    .task-urgency {
        font-weight: 500;
    }
    
    .task-actions {
        display: flex;
        gap: 5px;
        justify-content: flex-end;
    }
    
    .task-action-btn {
        padding: 4px 8px;
        font-size: 12px;
        border-radius: var(--border-radius);
    }
    
    .task-action-btn .icon {
        margin: 0;
        font-size: 12px;
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
    
    .btn-warning {
        background-color: var(--warning-color);
        color: var(--white-color);
    }
    
    .btn-warning:hover {
        background-color: #e67e22;
    }
    
    .btn-danger {
        background-color: var(--danger-color);
        color: var(--white-color);
    }
    
    .btn-danger:hover {
        background-color: #c0392b;
    }
    
    .icon {
        margin-right: 8px;
    }
</style>