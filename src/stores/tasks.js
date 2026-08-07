import { writable } from 'svelte/store';

/**
 * Tasks Store
 * Manages the state of tasks in the application
 */

function createTasksStore() {
    const { subscribe, set, update } = writable([]);

    return {
        subscribe,
        
        /**
         * Set all tasks
         * @param {Array} tasks - Array of task objects
         */
        setTasks: (tasks) => set(tasks),
        
        /**
         * Add a new task to the store
         * @param {Object} task - Task object to add
         */
        addTask: (task) => update(tasks => [task, ...tasks]),
        
        /**
         * Update an existing task in the store
         * @param {string} taskId - Task UUID
         * @param {Object} updates - Task updates
         */
        updateTask: (taskId, updates) => update(tasks => 
            tasks.map(task => 
                task.uuid === taskId ? { ...task, ...updates } : task
            )
        ),
        
        /**
         * Remove a task from the store
         * @param {string} taskId - Task UUID
         */
        removeTask: (taskId) => update(tasks => 
            tasks.filter(task => task.uuid !== taskId)
        ),
        
        /**
         * Find a task by UUID
         * @param {string} taskId - Task UUID
         * @returns {Object|null} The task object or null if not found
         */
        getTaskById: (taskId) => {
            let foundTask = null;
            subscribe(tasks => {
                foundTask = tasks.find(task => task.uuid === taskId) || null;
            })();
            return foundTask;
        },
        
        /**
         * Filter tasks based on criteria
         * @param {Object} filters - Filter criteria
         * @returns {Array} Filtered array of tasks
         */
        filterTasks: (filters) => {
            let filteredTasks = [];
            subscribe(tasks => {
                filteredTasks = tasks.filter(task => {
                    // Filter by project
                    if (filters.project && task.project !== filters.project) {
                        return false;
                    }
                    
                    // Filter by tags - task must contain ALL specified tags
                    if (filters.tags && filters.tags.length > 0) {
                        const taskTags = task.tags || [];
                        if (!filters.tags.every(tag => taskTags.includes(tag))) {
                            return false;
                        }
                    }
                    
                    // Filter by status
                    if (filters.status && task.status !== filters.status) {
                        return false;
                    }
                    
                    // Filter by context (using tags as context in this implementation)
                    if (filters.context) {
                        const taskTags = task.tags || [];
                        if (!taskTags.includes(filters.context) && filters.context !== '') {
                            return false;
                        }
                    }
                    
                    // Filter for planned and incomplete tasks
                    if (filters.plannedIncomplete && !task.scheduled && task.status !== 'completed') {
                        return false;
                    }
                    
                    // Filter for today's tasks
                    if (filters.today && task.due) {
                        const today = new Date().toISOString().split('T')[0];
                        const dueDate = new Date(task.due).toISOString().split('T')[0];
                        if (dueDate !== today) {
                            return false;
                        }
                    }
                    
                    return true;
                });
            })();
            
            return filteredTasks;
        },
        
        /**
         * Sort tasks by criteria
         * @param {Array} tasks - Tasks to sort
         * @param {string} sortBy - Sort criteria ('urgency', 'due', 'priority', etc.)
         * @returns {Array} Sorted array of tasks
         */
        sortTasks: (tasks, sortBy = 'urgency') => {
            return [...tasks].sort((a, b) => {
                switch (sortBy) {
                    case 'urgency':
                        return (b.urgency || 0) - (a.urgency || 0);
                    case 'due':
                        if (!a.due && !b.due) return 0;
                        if (!a.due) return 1;
                        if (!b.due) return -1;
                        return new Date(a.due) - new Date(b.due);
                    case 'priority':
                        const priorityMap = { H: 5, M: 4, L: 3, '': 0 };
                        return (priorityMap[b.priority] || 0) - (priorityMap[a.priority] || 0);
                    case 'description':
                        return a.description.localeCompare(b.description);
                    default:
                        return (b.urgency || 0) - (a.urgency || 0);
                }
            });
        },
        
        /**
         * Clear all tasks from the store
         */
        clearTasks: () => set([])
    };
}

export const tasks = createTasksStore();