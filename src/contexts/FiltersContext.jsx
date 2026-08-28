import { createContext, useState, useContext, useCallback } from 'react';

/**
 * FiltersContext for managing filter state across the application
 */
const FiltersContext = createContext(null);

/**
 * FiltersProvider component that wraps the application
 * @param {Object} props - Component props
 * @param {React.ReactNode} props.children - Child components
 */
export function FiltersProvider({ children }) {
  const [currentFilters, setCurrentFilters] = useState({
    project: null,
    tags: [],
    context: null,
    status: null,
    due: null,
    scheduled: null,
    search: null
  });

  /**
   * Update filter state
   * @param {Object} updates - Filter updates to apply
   */
  const updateFilters = useCallback((updates) => {
    setCurrentFilters(prev => ({
      ...prev,
      ...updates
    }));
  }, []);

  /**
   * Set project filter
   * @param {string|null} project - Project name or null to clear
   */
  const setProjectFilter = useCallback((project) => {
    updateFilters({ project, tags: [] });
  }, [updateFilters]);

  /**
   * Add or remove a tag from the filter
   * @param {string} tag - Tag to add/remove
   */
  const toggleTagFilter = useCallback((tag) => {
    setCurrentFilters(prev => {
      const existingIndex = prev.tags.indexOf(tag);
      if (existingIndex >= 0) {
        // Remove tag
        const newTags = [...prev.tags];
        newTags.splice(existingIndex, 1);
        return { ...prev, tags: newTags };
      } else {
        // Add tag
        return { ...prev, tags: [...prev.tags, tag] };
      }
    });
  }, []);

  /**
   * Set multiple tags at once
   * @param {Array<string>} tags - Array of tag names
   */
  const setTagFilters = useCallback((tags) => {
    updateFilters({ tags });
  }, [updateFilters]);

  /**
   * Set context filter
   * @param {string|null} context - Context name or null to clear
   */
  const setContextFilter = useCallback((context) => {
    updateFilters({ context });
  }, [updateFilters]);

  /**
   * Set status filter
   * @param {string|null} status - Status or null to clear
   */
  const setStatusFilter = useCallback((status) => {
    updateFilters({ status });
  }, [updateFilters]);

  /**
   * Set due date filter
   * @param {string|null} due - Due filter (e.g., 'overdue', 'today', 'week', 'month') or null to clear
   */
  const setDueFilter = useCallback((due) => {
    updateFilters({ due });
  }, [updateFilters]);

  /**
   * Set scheduled date filter
   * @param {string|null} scheduled - Scheduled filter or null to clear
   */
  const setScheduledFilter = useCallback((scheduled) => {
    updateFilters({ scheduled });
  }, [updateFilters]);

  /**
   * Set search text filter
   * @param {string|null} search - Search text or null to clear
   */
  const setSearchFilter = useCallback((search) => {
    updateFilters({ search });
  }, [updateFilters]);

  /**
   * Clear all filters
   */
  const clearAllFilters = useCallback(() => {
    setCurrentFilters({
      project: null,
      tags: [],
      context: null,
      status: null,
      due: null,
      scheduled: null,
      search: null
    });
  }, []);

  /**
   * Check if any filters are active
   * @returns {boolean}
   */
  const hasActiveFilters = useCallback(() => {
    return (
      currentFilters.project !== null ||
      currentFilters.tags.length > 0 ||
      currentFilters.context !== null ||
      currentFilters.status !== null ||
      currentFilters.due !== null ||
      currentFilters.scheduled !== null ||
      currentFilters.search !== null
    );
  }, [currentFilters]);

  /**
   * Get current filter summary for display
   * @returns {string}
   */
  const getFilterSummary = useCallback(() => {
    const parts = [];
    
    if (currentFilters.project) {
      parts.push(`Project: ${currentFilters.project}`);
    }
    if (currentFilters.tags.length > 0) {
      parts.push(`Tags: ${currentFilters.tags.join(', ')}`);
    }
    if (currentFilters.context) {
      parts.push(`Context: ${currentFilters.context}`);
    }
    if (currentFilters.status) {
      parts.push(`Status: ${currentFilters.status}`);
    }
    if (currentFilters.due) {
      parts.push(`Due: ${currentFilters.due}`);
    }
    if (currentFilters.scheduled) {
      parts.push(`Scheduled: ${currentFilters.scheduled}`);
    }
    if (currentFilters.search) {
      parts.push(`Search: "${currentFilters.search}"`);
    }
    
    return parts.length > 0 ? parts.join(', ') : 'No filters active';
  }, [currentFilters]);

  const value = {
    currentFilters,
    updateFilters,
    setProjectFilter,
    toggleTagFilter,
    setTagFilters,
    setContextFilter,
    setStatusFilter,
    setDueFilter,
    setScheduledFilter,
    setSearchFilter,
    clearAllFilters,
    hasActiveFilters,
    getFilterSummary
  };

  return (
    <FiltersContext.Provider value={value}>
      {children}
    </FiltersContext.Provider>
  );
}

/**
 * Custom hook to consume FiltersContext
 * @returns {Object} - Filters context value
 */
export function useFilters() {
  const context = useContext(FiltersContext);
  if (!context) {
    throw new Error('useFilters must be used within a FiltersProvider');
  }
  return context;
}

export default FiltersContext;
