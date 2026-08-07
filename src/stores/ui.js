import { writable } from 'svelte/store';

/**
 * UI Store
 * Manages UI-related state like loading, errors, and notifications
 */

function createUIStore() {
    const { subscribe, set, update } = writable({
        loading: false,
        error: null,
        notification: null,
        notificationType: 'info', // 'info', 'success', 'warning', 'error'
        taskEditorOpen: false,
        taskEditorData: null,
        taskEditorMode: 'add' // 'add' or 'edit'
    });

    return {
        subscribe,
        
        /**
         * Show loading state
         */
        showLoading: () => update(ui => ({ ...ui, loading: true })),
        
        /**
         * Hide loading state
         */
        hideLoading: () => update(ui => ({ ...ui, loading: false })),
        
        /**
         * Set error message
         * @param {string|null} error - Error message or null to clear
         */
        setError: (error) => update(ui => ({ ...ui, error })),
        
        /**
         * Clear error message
         */
        clearError: () => update(ui => ({ ...ui, error: null })),
        
        /**
         * Show notification
         * @param {string} message - Notification message
         * @param {string} type - Notification type ('info', 'success', 'warning', 'error')
         */
        showNotification: (message, type = 'info') => update(ui => ({
            ...ui,
            notification: message,
            notificationType: type
        })),
        
        /**
         * Clear notification
         */
        clearNotification: () => update(ui => ({
            ...ui,
            notification: null,
            notificationType: 'info'
        })),
        
        /**
         * Open task editor
         * @param {Object|null} taskData - Task data for editing, null for new task
         * @param {string} mode - Editor mode ('add' or 'edit')
         */
        openTaskEditor: (taskData = null, mode = 'add') => update(ui => ({
            ...ui,
            taskEditorOpen: true,
            taskEditorData: taskData,
            taskEditorMode: mode
        })),
        
        /**
         * Close task editor
         */
        closeTaskEditor: () => update(ui => ({
            ...ui,
            taskEditorOpen: false,
            taskEditorData: null,
            taskEditorMode: 'add'
        })),
        
        /**
         * Toggle task editor
         */
        toggleTaskEditor: (taskData = null, mode = 'add') => update(ui => ({
            ...ui,
            taskEditorOpen: !ui.taskEditorOpen,
            taskEditorData: ui.taskEditorOpen ? null : taskData,
            taskEditorMode: ui.taskEditorOpen ? 'add' : mode
        })),
        
        /**
         * Check if task editor is open
         * @returns {boolean} Whether task editor is open
         */
        isTaskEditorOpen: () => {
            let isOpen = false;
            subscribe(ui => {
                isOpen = ui.taskEditorOpen;
            })();
            return isOpen;
        },
        
        /**
         * Clear all UI state
         */
        clearAll: () => set({
            loading: false,
            error: null,
            notification: null,
            notificationType: 'info',
            taskEditorOpen: false,
            taskEditorData: null,
            taskEditorMode: 'add'
        })
    };
}

export const ui = createUIStore();