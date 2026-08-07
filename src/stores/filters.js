import { writable } from 'svelte/store';

/**
 * Filters Store
 * Manages the state of filters in the application
 */

const DEFAULT_FILTERS = {
    project: null,
    tags: [],
    status: null,
    context: '',
    plannedIncomplete: false,
    today: false
};

function createFiltersStore() {
    const { subscribe, set, update } = writable({ ...DEFAULT_FILTERS });

    return {
        subscribe,
        
        /**
         * Set filter by project
         * @param {string|null} project - Project name or null to clear
         */
        setProject: (project) => update(filters => ({
            ...filters,
            project: project === '' ? null : project
        })),
        
        /**
         * Set filter by tags
         * @param {Array} tags - Array of tag names
         */
        setTags: (tags) => update(filters => ({
            ...filters,
            tags: tags || []
        })),
        
        /**
         * Set filter by status
         * @param {string|null} status - Task status or null to clear
         */
        setStatus: (status) => update(filters => ({
            ...filters,
            status: status === '' ? null : status
        })),
        
        /**
         * Set filter by context
         * @param {string} context - Context name
         */
        setContext: (context) => update(filters => ({
            ...filters,
            context
        })),
        
        /**
         * Toggle planned and incomplete filter
         */
        togglePlannedIncomplete: () => update(filters => ({
            ...filters,
            plannedIncomplete: !filters.plannedIncomplete
        })),
        
        /**
         * Toggle today filter
         */
        toggleToday: () => update(filters => ({
            ...filters,
            today: !filters.today
        })),
        
        /**
         * Clear all filters
         */
        clearFilters: () => set({ ...DEFAULT_FILTERS }),
        
        /**
         * Reset to default filters
         */
        resetFilters: () => set({ ...DEFAULT_FILTERS }),
        
        /**
         * Check if any filters are active
         * @returns {boolean} Whether any filters are active
         */
        hasActiveFilters: () => {
            let hasActive = false;
            subscribe(filters => {
                hasActive = (
                    filters.project !== null ||
                    filters.tags.length > 0 ||
                    filters.status !== null ||
                    filters.context !== '' ||
                    filters.plannedIncomplete ||
                    filters.today
                );
            })();
            return hasActive;
        },
        
        /**
         * Get current filter object
         * @returns {Object} Current filters
         */
        getFilters: () => {
            let currentFilters = { ...DEFAULT_FILTERS };
            subscribe(filters => {
                currentFilters = { ...filters };
            })();
            return currentFilters;
        }
    };
}

export const filters = createFiltersStore();