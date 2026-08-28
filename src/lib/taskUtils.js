/**
 * Task utility functions for TaskWarrior Web UI
 */

/**
 * Get task status display text
 * @param {string} status - Task status
 * @returns {string}
 */
export function getStatusText(status) {
  const statusMap = {
    pending: 'Pending',
    completed: 'Completed',
    deleted: 'Deleted',
    waiting: 'Waiting',
    recurring: 'Recurring'
  };
  return statusMap[status] || status || 'Unknown';
}

/**
 * Get task priority display text and color class
 * @param {string|null} priority - Task priority
 * @returns {{text: string, className: string}}
 */
export function getPriorityInfo(priority) {
  if (!priority) return { text: '', className: '' };
  
  const priorityMap = {
    H: { text: 'High', className: 'priority-high' },
    M: { text: 'Medium', className: 'priority-medium' },
    L: { text: 'Low', className: 'priority-low' },
    h: { text: 'High', className: 'priority-high' },
    m: { text: 'Medium', className: 'priority-medium' },
    l: { text: 'Low', className: 'priority-low' }
  };
  
  return priorityMap[priority] || { text: priority, className: '' };
}

/**
 * Get urgency color class based on urgency value
 * @param {number} urgency - Task urgency value
 * @returns {string}
 */
export function getUrgencyClass(urgency) {
  if (urgency === undefined || urgency === null) return '';
  
  if (urgency >= 15) return 'urgency-very-high';
  if (urgency >= 10) return 'urgency-high';
  if (urgency >= 5) return 'urgency-medium';
  if (urgency >= 1) return 'urgency-low';
  return 'urgency-none';
}

/**
 * Get task age in days
 * @param {string} createdDate - Task creation date ISO string
 * @returns {number|null}
 */
export function getTaskAge(createdDate) {
  if (!createdDate) return null;
  const created = new Date(createdDate);
  const now = new Date();
  const diffTime = Math.abs(now - created);
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Format task tags for display
 * @param {Array<string>} tags - Array of tag strings
 * @returns {string}
 */
export function formatTags(tags) {
  if (!tags || tags.length === 0) return '';
  return tags.join(', ');
}

/**
 * Get task due date status
 * @param {string|null} dueDate - Due date ISO string
 * @returns {string} - 'overdue', 'due-today', 'due-soon', 'due-future', or ''
 */
export function getDueStatus(dueDate) {
  if (!dueDate) return '';
  
  const today = new Date();
  const due = new Date(dueDate);
  
  // Remove time component for comparison
  today.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);
  
  const diffTime = due - today;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays < 0) return 'overdue';
  if (diffDays === 0) return 'due-today';
  if (diffDays <= 3) return 'due-soon';
  if (diffDays <= 7) return 'due-week';
  return 'due-future';
}

/**
 * Filter tasks by project
 * @param {Array<Object>} tasks - Array of task objects
 * @param {string} project - Project name to filter by
 * @returns {Array<Object>}
 */
export function filterByProject(tasks, project) {
  if (!project) return tasks;
  return tasks.filter(task => task.project === project);
}

/**
 * Filter tasks by tags (AND logic - task must have ALL tags)
 * @param {Array<Object>} tasks - Array of task objects
 * @param {Array<string>} tags - Array of tag names to filter by
 * @returns {Array<Object>}
 */
export function filterByTags(tasks, tags) {
  if (!tags || tags.length === 0) return tasks;
  const tagSet = new Set(tags.map(t => t.toLowerCase()));
  return tasks.filter(task => {
    const taskTags = task.tags || [];
    return tagSet.every(tag => taskTags.some(t => t.toLowerCase() === tag));
  });
}

/**
 * Filter tasks by status
 * @param {Array<Object>} tasks - Array of task objects
 * @param {string} status - Status to filter by
 * @returns {Array<Object>}
 */
export function filterByStatus(tasks, status) {
  if (!status) return tasks;
  return tasks.filter(task => task.status === status);
}

/**
 * Filter tasks by context
 * @param {Array<Object>} tasks - Array of task objects
 * @param {string} context - Context to filter by
 * @returns {Array<Object>}
 */
export function filterByContext(tasks, context) {
  if (!context) return tasks;
  return tasks.filter(task => task.context === context);
}

/**
 * Sort tasks by urgency (descending)
 * @param {Array<Object>} tasks - Array of task objects
 * @returns {Array<Object>}
 */
export function sortByUrgency(tasks) {
  return [...tasks].sort((a, b) => (b.urgency || 0) - (a.urgency || 0));
}

/**
 * Sort tasks by due date (ascending - soonest first)
 * @param {Array<Object>} tasks - Array of task objects
 * @returns {Array<Object>}
 */
export function sortByDueDate(tasks) {
  return [...tasks].sort((a, b) => {
    const aDue = a.due ? new Date(a.due).getTime() : Infinity;
    const bDue = b.due ? new Date(b.due).getTime() : Infinity;
    return aDue - bDue;
  });
}

/**
 * Sort tasks by creation date (descending - newest first)
 * @param {Array<Object>} tasks - Array of task objects
 * @returns {Array<Object>}
 */
export function sortByNewest(tasks) {
  return [...tasks].sort((a, b) => {
    const aCreated = a.entry ? new Date(a.entry).getTime() : 0;
    const bCreated = b.entry ? new Date(b.entry).getTime() : 0;
    return bCreated - aCreated;
  });
}

/**
 * Sort tasks by description (alphabetical)
 * @param {Array<Object>} tasks - Array of task objects
 * @returns {Array<Object>}
 */
export function sortByDescription(tasks) {
  return [...tasks].sort((a, b) => {
    const aDesc = a.description || '';
    const bDesc = b.description || '';
    return aDesc.localeCompare(bDesc);
  });
}

/**
 * Get a default task object
 * @returns {Object}
 */
export function getDefaultTask() {
  return {
    description: '',
    project: '',
    tags: [],
    due: null,
    scheduled: null,
    priority: null,
    estTime: null,
    context: ''
  };
}

/**
 * Check if a task is active (started but not stopped)
 * @param {Object} task - Task object
 * @returns {boolean}
 */
export function isTaskActive(task) {
  return task && task.status === 'pending' && task.start;
}

/**
 * Get active task count from task list
 * @param {Array<Object>} tasks - Array of task objects
 * @returns {number}
 */
export function getActiveTaskCount(tasks) {
  return tasks.filter(isTaskActive).length;
}

/**
 * Get completed task count from task list
 * @param {Array<Object>} tasks - Array of task objects
 * @returns {number}
 */
export function getCompletedTaskCount(tasks) {
  return tasks.filter(task => task.status === 'completed').length;
}

/**
 * Get task by UUID
 * @param {Array<Object>} tasks - Array of task objects
 * @param {string} uuid - Task UUID
 * @returns {Object|null}
 */
export function getTaskByUuid(tasks, uuid) {
  return tasks.find(task => task.uuid === uuid) || null;
}

/**
 * Get index of task by UUID
 * @param {Array<Object>} tasks - Array of task objects
 * @param {string} uuid - Task UUID
 * @returns {number}
 */
export function getTaskIndexByUuid(tasks, uuid) {
  return tasks.findIndex(task => task.uuid === uuid);
}

export default {
  getStatusText,
  getPriorityInfo,
  getUrgencyClass,
  getTaskAge,
  formatTags,
  getDueStatus,
  filterByProject,
  filterByTags,
  filterByStatus,
  filterByContext,
  sortByUrgency,
  sortByDueDate,
  sortByNewest,
  sortByDescription,
  getDefaultTask,
  isTaskActive,
  getActiveTaskCount,
  getCompletedTaskCount,
  getTaskByUuid,
  getTaskIndexByUuid
};
