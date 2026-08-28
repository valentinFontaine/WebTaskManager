/**
 * API Client for TaskWarrior Web UI
 * Wrapper functions for all FastAPI endpoints
 */

const BASE_URL = ''; // Same origin as FastAPI server

/**
 * Generic fetch wrapper with error handling
 * @param {string} url - The URL to fetch
 * @param {Object} options - Fetch options
 * @returns {Promise<Object>} - Parsed JSON response
 */
async function apiFetch(url, options = {}) {
  try {
    const response = await fetch(url, options);
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || data.message || `HTTP error! status: ${response.status}`);
    }
    
    if (data.success === false) {
      throw new Error(data.error || data.message || 'API request failed');
    }
    
    return data;
  } catch (error) {
    console.error('API fetch error:', error.message);
    throw error;
  }
}

/**
 * Fetch all pending tasks
 * @returns {Promise<Array>} - Array of task objects
 */
export async function fetchTasks() {
  const data = await apiFetch(`${BASE_URL}/api/tasks`);
  return data.tasks || [];
}

/**
 * Fetch all planned tasks (with scheduled date)
 * @returns {Promise<Array>} - Array of planned task objects
 */
export async function fetchPlannedTasks() {
  const data = await apiFetch(`${BASE_URL}/api/tasks/planned`);
  return data.data || [];
}

/**
 * Fetch all projects
 * @returns {Promise<Array>} - Array of project names
 */
export async function fetchProjects() {
  const data = await apiFetch(`${BASE_URL}/api/projects`);
  return data.projects || [];
}

/**
 * Add a new task
 * @param {Object} taskData - Task data to create
 * @returns {Promise<Object>} - Result with success status and task data
 */
export async function addTask(taskData) {
  const options = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(taskData)
  };
  return await apiFetch(`${BASE_URL}/api/task/add`, options);
}

/**
 * Modify an existing task
 * @param {string} taskId - The task UUID
 * @param {Object} updates - Task updates
 * @returns {Promise<Object>} - Result with success status
 */
export async function modifyTask(taskId, updates) {
  const options = {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates)
  };
  return await apiFetch(`${BASE_URL}/api/task/${taskId}/modify`, options);
}

/**
 * Start a task
 * @param {string} taskId - The task UUID
 * @returns {Promise<Object>} - Result with success status
 */
export async function startTask(taskId) {
  const options = { method: 'POST' };
  return await apiFetch(`${BASE_URL}/api/task/${taskId}/start`, options);
}

/**
 * Stop a task
 * @param {string} taskId - The task UUID
 * @returns {Promise<Object>} - Result with success status
 */
export async function stopTask(taskId) {
  const options = { method: 'POST' };
  return await apiFetch(`${BASE_URL}/api/task/${taskId}/stop`, options);
}

/**
 * Mark a task as done/completed
 * @param {string} taskId - The task UUID
 * @returns {Promise<Object>} - Result with success status
 */
export async function completeTask(taskId) {
  const options = { method: 'POST' };
  return await apiFetch(`${BASE_URL}/api/task/${taskId}/done`, options);
}

/**
 * Delete a task
 * @param {string} taskId - The task UUID
 * @returns {Promise<Object>} - Result with success status
 */
export async function deleteTask(taskId) {
  const options = { method: 'DELETE' };
  return await apiFetch(`${BASE_URL}/api/task/${taskId}/delete`, options);
}

export default {
  fetchTasks,
  fetchPlannedTasks,
  fetchProjects,
  addTask,
  modifyTask,
  startTask,
  stopTask,
  completeTask,
  deleteTask
};
