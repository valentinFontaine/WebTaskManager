/**
 * Application Constants
 * Central location for all application constants
 */

// Task related constants
export const TASK_STATUS = {
    PENDING: 'pending',
    COMPLETED: 'completed',
    DELETED: 'deleted',
    WAITING: 'waiting',
    RECURRING: 'recurring'
};

export const TASK_PRIORITY = {
    HIGH: 'H',
    MEDIUM: 'M',
    LOW: 'L',
    NONE: ''
};

export const TASK_PRIORITY_DISPLAY = {
    H: 'High',
    M: 'Medium',
    L: 'Low',
    '': 'None'
};

// Context constants
export const CONTEXTS = [
    { id: '', name: 'All', description: 'Show all tasks' },
    { id: 'pro', name: 'Pro', description: 'Show professional tasks' },
    { id: 'perso', name: 'Perso', description: 'Show personal tasks' }
];

// Sorting constants
export const SORT_OPTIONS = [
    { id: 'urgency', name: 'By Urgency', description: 'Highest urgency first' },
    { id: 'due', name: 'By Due Date', description: 'Earliest due first' },
    { id: 'priority', name: 'By Priority', description: 'Highest priority first' },
    { id: 'description', name: 'By Description', description: 'Alphabetical order' },
    { id: 'newest', name: 'Newest First', description: 'Most recently added first' },
    { id: 'oldest', name: 'Oldest First', description: 'Least recently added first' }
];

// Filter constants
export const FILTER_TYPES = {
    PROJECT: 'project',
    TAGS: 'tags',
    STATUS: 'status',
    CONTEXT: 'context',
    PLANNED_INCOMPLETE: 'plannedIncomplete',
    TODAY: 'today'
};

// UI constants
export const UI = {
    // Animation durations
    ANIMATION_DURATION: 300,
    NOTIFICATION_DURATION: 3000,
    
    // Colors (can be overridden by CSS variables)
    COLORS: {
        PRIMARY: '#3498db',
        SECONDARY: '#2ecc71',
        SUCCESS: '#27ae60',
        WARNING: '#f39c12',
        DANGER: '#e74c3c',
        INFO: '#16a085'
    },
    
    // Task card appearance
    TASK_CARD: {
        BORDER_RADIUS: '8px',
        SHADOW: '0 2px 10px rgba(0, 0, 0, 0.1)',
        HOVER_SHADOW: '0 4px 15px rgba(0, 0, 0, 0.15)'
    }
};

// API constants
export const API = {
    BASE_URL: '', // Same origin as FastAPI
    TIMEOUT: 30000, // 30 seconds
    RETRY_ATTEMPTS: 3
};

// Date format constants
export const DATE_FORMATS = {
    ISO: 'YYYY-MM-DD',
    DISPLAY: 'MMM DD, YYYY',
    SHORT: 'MM/DD/YYYY',
    TIME: 'HH:mm',
    DATETIME: 'YYYY-MM-DD HH:mm'
};

// Task limits
export const LIMITS = {
    DESCRIPTION_MAX_LENGTH: 500,
    PROJECT_MAX_LENGTH: 100,
    TAG_MAX_LENGTH: 50,
    TAGS_MAX_COUNT: 20,
    TASKS_PER_PAGE: 50
};

// Notification types
export const NOTIFICATION_TYPES = {
    INFO: 'info',
    SUCCESS: 'success',
    WARNING: 'warning',
    ERROR: 'error'
};

// Local storage keys
export const STORAGE_KEYS = {
    LAST_USED_PROJECT: 'lastUsedProject',
    LAST_USED_TAGS: 'lastUsedTags',
    UI_PREFERENCES: 'uiPreferences',
    LAST_TASK_FILTERS: 'lastTaskFilters'
};

// Calendar view constants
export const CALENDAR = {
    VIEWS: [
        { id: 'day', name: 'Day', icon: '📅' },
        { id: 'week', name: 'Week', icon: '📆' },
        { id: 'month', name: 'Month', icon: '🗓️' }
    ],
    DEFAULT_VIEW: 'week',
    HOUR_START: 8, // Work day starts at 8 AM
    HOUR_END: 18, // Work day ends at 6 PM
    TIME_SLOT_HEIGHT: 60 // pixels per hour
};

// Keyboard shortcuts
export const KEYBOARD_SHORTCUTS = {
    ADD_TASK: 'Ctrl+N',
    REFRESH: 'Ctrl+R',
    SEARCH: 'Ctrl+F',
    NEXT_CONTEXT: 'Ctrl+Right',
    PREV_CONTEXT: 'Ctrl+Left',
    TASK_EDITOR: 'Enter',
    TASK_DELETE: 'Delete',
    TASK_START: 'Space',
    TASK_STOP: 'S',
    TASK_COMPLETE: 'C'
};

export default {
    TASK_STATUS,
    TASK_PRIORITY,
    TASK_PRIORITY_DISPLAY,
    CONTEXTS,
    SORT_OPTIONS,
    FILTER_TYPES,
    UI,
    API,
    DATE_FORMATS,
    LIMITS,
    NOTIFICATION_TYPES,
    STORAGE_KEYS,
    CALENDAR,
    KEYBOARD_SHORTCUTS
};