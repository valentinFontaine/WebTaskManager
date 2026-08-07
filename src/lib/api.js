/**
 * API Client for TaskWarrior Web UI
 * Centralized API client to handle all communication with the FastAPI backend
 */

const BASE_URL = ''; // Same origin as FastAPI

/**
 * Generic fetch wrapper with error handling
 */
async function apiFetch(url, options = {}) {
    try {
        const response = await fetch(url, options);
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
        }
        
        return await response.json();
    } catch (error) {
        console.error(`API fetch error for ${url}:`, error);
        throw new Error(`Network error: ${error.message}`);
    }
}

/**
 * Fetch all pending tasks
 * @returns {Promise<Array>} Array of task objects
 */
export async function fetchTasks() {
    const data = await apiFetch('/api/tasks');
    if (data.success) {
        return data.tasks;
    }
    throw new Error(data.error || 'Failed to fetch tasks');
}

/**
 * Fetch all planned tasks (for calendar view)
 * @returns {Promise<Array>} Array of planned task objects
 */
export async function fetchPlannedTasks() {
    const data = await apiFetch('/api/tasks/planned');
    if (data.success) {
        return data.tasks;
    }
    throw new Error(data.error || 'Failed to fetch planned tasks');
}

/**
 * Fetch all projects
 * @returns {Promise<Array>} Array of project names
 */
export async function fetchProjects() {
    const data = await apiFetch('/api/projects');
    if (data.success) {
        return data.projects;
    }
    throw new Error(data.error || 'Failed to fetch projects');
}

/**
 * Add a new task
 * @param {Object} taskData - Task data to add
 * @returns {Promise<Object>} The created task
 */
export async function addTask(taskData) {
    const data = await apiFetch('/api/task/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(taskData)
    });
    
    if (data.success) {
        return data.task;
    }
    throw new Error(data.error || 'Failed to add task');
}

/**
 * Modify an existing task
 * @param {string} taskId - Task UUID
 * @param {Object} updates - Task updates
 * @returns {Promise<Object>} The updated task
 */
export async function modifyTask(taskId, updates) {
    const data = await apiFetch(`/api/task/${taskId}/modify`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
    });
    
    if (data.success) {
        return data.task;
    }
    throw new Error(data.error || 'Failed to modify task');
}

/**
 * Delete a task
 * @param {string} taskId - Task UUID
 * @returns {Promise<Object>} Confirmation object
 */
export async function deleteTask(taskId) {
    const data = await apiFetch(`/api/task/${taskId}/delete`, {
        method: 'DELETE'
    });
    
    if (data.success) {
        return data;
    }
    throw new Error(data.error || 'Failed to delete task');
}

/**
 * Start a task (begin tracking time)
 * @param {string} taskId - Task UUID
 * @returns {Promise<Object>} The started task
 */
export async function startTask(taskId) {
    const data = await apiFetch(`/api/task/${taskId}/start`, {
        method: 'POST'
    });
    
    if (data.success) {
        return data.task;
    }
    throw new Error(data.error || 'Failed to start task');
}

/**
 * Stop a task (stop tracking time)
 * @param {string} taskId - Task UUID
 * @returns {Promise<Object>} The stopped task
 */
export async function stopTask(taskId) {
    const data = await apiFetch(`/api/task/${taskId}/stop`, {
        method: 'POST'
    });
    
    if (data.success) {
        return data.task;
    }
    throw new Error(data.error || 'Failed to stop task');
}

/**
 * Mark a task as completed
 * @param {string} taskId - Task UUID
 * @returns {Promise<Object>} The completed task
 */
export async function completeTask(taskId) {
    const data = await apiFetch(`/api/task/${taskId}/done`, {
        method: 'POST'
    });
    
    if (data.success) {
        return data.task;
    }
    throw new Error(data.error || 'Failed to complete task');
}

export default {
    fetchTasks,
    fetchPlannedTasks,
    fetchProjects,
    addTask,
    modifyTask,
    deleteTask,
    startTask,
    stopTask,
    completeTask
};