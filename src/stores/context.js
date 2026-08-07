import { writable } from 'svelte/store';

/**
 * Context Store
 * Manages the current context state for filtering tasks
 */

const CONTEXTS = [
    { id: '', name: 'All', description: 'Show all tasks' },
    { id: 'pro', name: 'Pro', description: 'Show professional tasks' },
    { id: 'perso', name: 'Perso', description: 'Show personal tasks' }
];

function createContextStore() {
    const { subscribe, set, update } = writable(''); // Default to empty string (All)

    return {
        subscribe,
        
        /**
         * Set current context
         * @param {string} contextId - Context ID to set
         */
        setContext: (contextId) => set(contextId),
        
        /**
         * Get available contexts
         * @returns {Array} Array of available contexts
         */
        getAvailableContexts: () => CONTEXTS,
        
        /**
         * Get current context name
         * @returns {string} Current context name
         */
        getContextName: () => {
            let currentContext = '';
            subscribe(contextId => {
                const context = CONTEXTS.find(c => c.id === contextId);
                currentContext = context ? context.name : 'All';
            })();
            return currentContext;
        },
        
        /**
         * Get current context object
         * @returns {Object} Current context object
         */
        getCurrentContext: () => {
            let currentContext = CONTEXTS[0]; // Default to All
            subscribe(contextId => {
                currentContext = CONTEXTS.find(c => c.id === contextId) || CONTEXTS[0];
            })();
            return currentContext;
        },
        
        /**
         * Cycle to next context
         */
        nextContext: () => update(currentContext => {
            const currentIndex = CONTEXTS.findIndex(c => c.id === currentContext);
            const nextIndex = (currentIndex + 1) % CONTEXTS.length;
            return CONTEXTS[nextIndex].id;
        }),
        
        /**
         * Cycle to previous context
         */
        previousContext: () => update(currentContext => {
            const currentIndex = CONTEXTS.findIndex(c => c.id === currentContext);
            const prevIndex = (currentIndex - 1 + CONTEXTS.length) % CONTEXTS.length;
            return CONTEXTS[prevIndex].id;
        }),
        
        /**
         * Reset to default context (All)
         */
        resetContext: () => set(''),
        
        /**
         * Check if current context is 'All'
         * @returns {boolean} Whether current context is All
         */
        isAllContext: () => {
            let isAll = true;
            subscribe(contextId => {
                isAll = contextId === '';
            })();
            return isAll;
        }
    };
}

export const context = createContextStore();

// Export constants
export const CONTEXTS_LIST = CONTEXTS;