/**
 * Task Utilities
 * Helper functions for task-related operations
 */

import { formatDate, formatTime, isToday, isOverdue } from './dateUtils.js';

/**
 * Get task priority as display text
 * @param {string} priority - Task priority (H, M, L, or empty)
 * @returns {string} Display text for priority
 */
export function getPriorityDisplay(priority) {
    const priorityMap = {
        'H': 'High',
        'M': 'Medium',
        'L': 'Low'
    };
    return priorityMap[priority] || 'None';
}

/**
 * Get task priority as CSS class
 * @param {string} priority - Task priority
 * @returns {string} CSS class for priority
 */
export function getPriorityClass(priority) {
    const classMap = {
        'H': 'priority-high',
        'M': 'priority-medium',
        'L': 'priority-low'
    };
    return classMap[priority] || 'priority-none';
}

/**
 * Get task status as display text
 * @param {string} status - Task status
 * @returns {string} Display text for status
 */
export function getStatusDisplay(status) {
    const statusMap = {
        'pending': 'Pending',
        'completed': 'Completed',
        'deleted': 'Deleted',
        'waiting': 'Waiting',
        'recurring': 'Recurring'
    };
    return statusMap[status] || status;
}

/**
 * Get task status as CSS class
 * @param {string} status - Task status
 * @returns {string} CSS class for status
 */
export function getStatusClass(status) {
    const classMap = {
        'pending': 'status-pending',
        'completed': 'status-completed',
        'deleted': 'status-deleted',
        'waiting': 'status-waiting',
        'recurring': 'status-recurring'
    };
    return classMap[status] || 'status-unknown';
}

/**
 * Get task urgency display
 * @param {number} urgency - Task urgency value
 * @returns {string} Display text for urgency
 */
export function getUrgencyDisplay(urgency) {
    if (urgency === null || urgency === undefined) return 'None';
    
    if (urgency >= 10) return 'Very High';
    if (urgency >= 7) return 'High';
    if (urgency >= 4) return 'Medium';
    if (urgency >= 1) return 'Low';
    return 'None';
}

/**
 * Check if task is active (started but not completed)
 * @param {Object} task - Task object
 * @returns {boolean} Whether task is active
 */
export function isTaskActive(task) {
    return task && task.status === 'pending' && task.start;
}

/**
 * Check if task is completed
 * @param {Object} task - Task object
 * @returns {boolean} Whether task is completed
 */
export function isTaskCompleted(task) {
    return task && task.status === 'completed';
}

/**
 * Format task due date for display
 * @param {Object} task - Task object
 * @returns {string} Formatted due date
 */
export function formatTaskDueDate(task) {
    if (!task || !task.due) return '';
    
    const dueDate = new Date(task.due);
    if (isNaN(dueDate.getTime())) return '';
    
    if (isToday(dueDate)) {
        return `Due today`;
    } else if (isOverdue(dueDate)) {
        return `Overdue (${formatDate(dueDate, 'MMM DD')})`;
    } else {
        return `Due ${formatDate(dueDate, 'MMM DD')}`;
    }
}

/**
 * Format task scheduled date for display
 * @param {Object} task - Task object
 * @returns {string} Formatted scheduled date
 */
export function formatTaskScheduledDate(task) {
    if (!task || !task.scheduled) return '';
    
    const scheduledDate = new Date(task.scheduled);
    if (isNaN(scheduledDate.getTime())) return '';
    
    return `Scheduled: ${formatDate(scheduledDate, 'MMM DD, YYYY')}`;
}

/**
 * Format task duration
 * @param {Object} task - Task object
 * @returns {string} Formatted duration
 */
export function formatTaskDuration(task) {
    if (!task || !task.duration) return '';
    
    const duration = parseFloat(task.duration);
    if (isNaN(duration)) return '';
    
    if (duration < 1) {
        return `${Math.round(duration * 60)} min`;
    } else if (duration < 24) {
        return `${duration.toFixed(1)} hours`;
    } else {
        return `${(duration / 24).toFixed(1)} days`;
    }
}

/**
 * Format task tags for display
 * @param {Array} tags - Array of tag strings
 * @returns {string} Formatted tags string
 */
export function formatTaskTags(tags) {
    if (!tags || tags.length === 0) return '';
    
    return tags.join(', ');
}

/**
 * Get task CSS classes based on its properties
 * @param {Object} task - Task object
 * @returns {string} CSS classes string
 */
export function getTaskClasses(task) {
    const classes = ['task-card'];
    
    if (!task) return classes.join(' ');
    
    // Add status class
    classes.push(getStatusClass(task.status));
    
    // Add priority class
    if (task.priority) {
        classes.push(getPriorityClass(task.priority));
    }
    
    // Add classes for special states
    if (isTaskActive(task)) {
        classes.push('task-active');
    }
    
    if (isOverdue(task.due)) {
        classes.push('task-overdue');
    }
    
    if (isToday(task.due)) {
        classes.push('task-due-today');
    }
    
    return classes.join(' ');
}

/**
 * Create a new empty task with default values
 * @returns {Object} Empty task object
 */
export function createEmptyTask() {
    return {
        uuid: '',
        description: '',
        project: '',
        status: 'pending',
        priority: '',
        tags: [],
        due: null,
        scheduled: null,
        urgency: null,
        start: null,
        end: null,
        duration: null,
        parent: null,
        recurrence: null
    };
}

/**
 * Prepare task data for API submission
 * @param {Object} taskData - Raw task data from form
 * @returns {Object} Prepared task data for API
 */
export function prepareTaskForAPI(taskData) {
    const prepared = { ...taskData };
    
    // Ensure arrays are properly formatted
    if (prepared.tags && typeof prepared.tags === 'string') {
        prepared.tags = prepared.tags
            .split(',')
            .map(tag => tag.trim())
            .filter(tag => tag.length > 0);
    }
    
    // Handle empty values
    if (!prepared.project || prepared.project.trim() === '') {
        delete prepared.project;
    }
    
    if (!prepared.priority || prepared.priority.trim() === '') {
        delete prepared.priority;
    }
    
    if (!prepared.due || prepared.due.trim() === '') {
        delete prepared.due;
    }
    
    if (!prepared.scheduled || prepared.scheduled.trim() === '') {
        delete prepared.scheduled;
    }
    
    return prepared;
}

/**
 * Validate task data
 * @param {Object} taskData - Task data to validate
 * @returns {Object} Validation result with isValid and errors
 */
export function validateTask(taskData) {
    const errors = {};
    
    if (!taskData || !taskData.description || taskData.description.trim() === '') {
        errors.description = 'Description is required';
    }
    
    // Validate description length
    if (taskData.description && taskData.description.length > 500) {
        errors.description = 'Description must be 500 characters or less';
    }
    
    // Validate project length
    if (taskData.project && taskData.project.length > 100) {
        errors.project = 'Project name must be 100 characters or less';
    }
    
    // Validate date formats
    if (taskData.due) {
        const dueDate = new Date(taskData.due);
        if (isNaN(dueDate.getTime())) {
            errors.due = 'Invalid due date format';
        }
    }
    
    if (taskData.scheduled) {
        const scheduledDate = new Date(taskData.scheduled);
        if (isNaN(scheduledDate.getTime())) {
            errors.scheduled = 'Invalid scheduled date format';
        }
    }
    
    // Validate priority
    const validPriorities = ['H', 'M', 'L', ''];
    if (taskData.priority && !validPriorities.includes(taskData.priority)) {
        errors.priority = 'Invalid priority value';
    }
    
    return {
        isValid: Object.keys(errors).length === 0,
        errors
    };
}

export default {
    getPriorityDisplay,
    getPriorityClass,
    getStatusDisplay,
    getStatusClass,
    getUrgencyDisplay,
    isTaskActive,
    isTaskCompleted,
    formatTaskDueDate,
    formatTaskScheduledDate,
    formatTaskDuration,
    formatTaskTags,
    getTaskClasses,
    createEmptyTask,
    prepareTaskForAPI,
    validateTask
};