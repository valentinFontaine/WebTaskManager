<script>
    import { onMount, onDestroy } from 'svelte';
    import '../global.css';
    import { tasks } from '../stores/tasks.js';
    import { projects } from '../stores/projects.js';
    import { filters } from '../stores/filters.js';
    import { context } from '../stores/context.js';
    import { ui } from '../stores/ui.js';
    import { fetchTasks, fetchProjects } from '../lib/api.js';
    import Header from '../components/Header.svelte';
    import TaskFilter from '../components/TaskFilter.svelte';
    import TaskCard from '../components/TaskCard.svelte';
    import Notification from '../components/Notification.svelte';
    import Loading from '../components/Loading.svelte';
    import TaskEditor from '../components/TaskEditor.svelte';
    
    // Local state
    let isLoading = true;
    let error = null;
    let filteredTasks = [];
    
    // Load tasks and projects on mount
    onMount(async () => {
        try {
            ui.showLoading();
            
            // Load tasks and projects in parallel
            const [tasksData, projectsData] = await Promise.all([
                fetchTasks(),
                fetchProjects()
            ]);
            
            tasks.setTasks(tasksData);
            projects.setProjects(projectsData);
            
        } catch (err) {
            error = err.message;
            ui.setError(err.message);
            ui.showNotification(`Error loading data: ${err.message}`, 'error');
        } finally {
            isLoading = false;
            ui.hideLoading();
        }
    });
    
    // Auto-refresh tasks every 30 seconds
    const refreshInterval = setInterval(async () => {
        try {
            const tasksData = await fetchTasks();
            tasks.setTasks(tasksData);
        } catch (err) {
            console.error('Auto-refresh failed:', err);
        }
    }, 30000);
    
    // Cleanup interval on unmount
    onDestroy(() => {
        clearInterval(refreshInterval);
    });
    
    // Get filtered and sorted tasks
    $: {
        let currentTasks = $tasks;
        let currentFilters = $filters;
        let currentContext = $context;
        
        // Apply context filter (context is implemented as tags in this system)
        filteredTasks = [...currentTasks];
        if (currentContext && currentContext !== '') {
            filteredTasks = filteredTasks.filter(task => 
                (task.tags || []).includes(currentContext)
            );
        }
        
        // Apply other filters
        if (currentFilters.project) {
            filteredTasks = filteredTasks.filter(task => 
                task.project === currentFilters.project
            );
        }
        
        if (currentFilters.tags && currentFilters.tags.length > 0) {
            filteredTasks = filteredTasks.filter(task => {
                const taskTags = task.tags || [];
                return currentFilters.tags.every(tag => taskTags.includes(tag));
            });
        }
        
        if (currentFilters.plannedIncomplete) {
            filteredTasks = filteredTasks.filter(task => 
                !task.scheduled && task.status !== 'completed'
            );
        }
        
        if (currentFilters.today) {
            const today = new Date().toISOString().split('T')[0];
            filteredTasks = filteredTasks.filter(task => {
                if (!task.due) return false;
                const dueDate = new Date(task.due).toISOString().split('T')[0];
                return dueDate === today;
            });
        }
        
        // Sort by urgency (descending) by default
        filteredTasks.sort((a, b) => (b.urgency || 0) - (a.urgency || 0));
    }
</script>

<svelte:head>
    <title>TaskWarrior Web UI</title>
</svelte:head>

<div class="container">
    <!-- Header Component -->
    <Header />

    <!-- Filters Section -->
    <TaskFilter />

    <!-- Tasks Section -->
    <div class="tasks-section">
        <h2>Pending Tasks</h2>
        
        {#if isLoading}
            <Loading />
        {:else if error}
            <div class="error-message">{error}</div>
        {:else}
            <div id="tasks-container">
                {#each filteredTasks as task (task.uuid)}
                    <TaskCard {task} />
                {/each}
            </div>
        {/if}
        
        {#if filteredTasks.length === 0 && !isLoading}
            <div class="empty-state">
                <p>No tasks found. Add a new task to get started!</p>
            </div>
        {/if}
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
</div>

<style>
    .container {
        max-width: 1200px;
        margin: 0 auto;
        padding: 20px;
    }
    
    .tasks-section {
        background-color: var(--white-color);
        border-radius: var(--border-radius);
        padding: 20px;
        box-shadow: var(--box-shadow);
        margin-top: 20px;
    }
    
    .tasks-section h2 {
        margin-bottom: 15px;
        color: var(--text-color);
    }
    
    #tasks-container {
        display: flex;
        flex-direction: column;
        gap: 10px;
    }
    
    .empty-state {
        text-align: center;
        padding: 40px;
        color: var(--light-text-color);
        font-style: italic;
    }
    
    .error-message {
        background-color: #f8d7da;
        color: #721c24;
        padding: 15px;
        border-radius: var(--border-radius);
        margin: 10px 0;
        border: 1px solid #f5c6cb;
    }
</style>