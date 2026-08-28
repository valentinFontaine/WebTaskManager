import { useEffect, useState } from 'react';
import { useFilters } from '../contexts/FiltersContext';
import { useProjects } from '../contexts/ProjectsContext';

/**
 * TaskFilter component - Filter controls for task list
 * @returns {JSX.Element}
 */
export default function TaskFilter() {
  const {
    currentFilters,
    setProjectFilter,
    toggleTagFilter,
    setTagFilters,
    setContextFilter,
    setDueFilter,
    setSearchFilter,
    clearAllFilters,
    hasActiveFilters
  } = useFilters();

  const { projects, fetchAllProjects } = useProjects();
  const [availableTags, setAvailableTags] = useState([]);
  const [showAllProjects, setShowAllProjects] = useState(false);

  // Load projects on mount
  useEffect(() => {
    if (projects.length === 0) {
      fetchAllProjects();
    }
  }, [projects.length, fetchAllProjects]);

  // For tags, we'd need to fetch from tasks - for now using a predefined list
  // In a real implementation, this would come from the tasks context
  useEffect(() => {
    // This would be replaced with actual tag extraction from tasks
    setAvailableTags([
      'home', 'work', 'important', 'urgent', 'later',
      'personal', 'shopping', 'health', 'finance', 'learning'
    ]);
  }, []);

  /**
   * Handle project filter change
   */
  const handleProjectChange = (e) => {
    const project = e.target.value || null;
    setProjectFilter(project);
  };

  /**
   * Handle tag filter toggle
   */
  const handleTagToggle = (tag) => {
    toggleTagFilter(tag);
  };

  /**
   * Handle context filter change
   */
  const handleContextChange = (e) => {
    const context = e.target.value || null;
    setContextFilter(context);
  };

  /**
   * Handle due filter change
   */
  const handleDueChange = (e) => {
    const due = e.target.value || null;
    setDueFilter(due);
  };

  /**
   * Handle search input change
   */
  const handleSearchChange = (e) => {
    const search = e.target.value || null;
    setSearchFilter(search);
  };

  /**
   * Clear all filters
   */
  const handleClearAll = () => {
    clearAllFilters();
  };

  return (
    <div className="task-filter">
      <div className="filter-section">
        <label htmlFor="filter-search">Search:</label>
        <input
          id="filter-search"
          type="text"
          value={currentFilters.search || ''}
          onChange={handleSearchChange}
          placeholder="Search tasks..."
          className="filter-input"
        />
      </div>

      <div className="filter-section">
        <label htmlFor="filter-project">Project:</label>
        <select
          id="filter-project"
          value={currentFilters.project || ''}
          onChange={handleProjectChange}
          className="filter-input"
        >
          <option value="">All Projects</option>
          {projects.slice(0, showAllProjects ? projects.length : 10).map(project => (
            <option key={project} value={project}>
              {project}
            </option>
          ))}
          {projects.length > 10 && (
            <option 
              value=""
              disabled
              className="show-more-option"
              onClick={() => setShowAllProjects(!showAllProjects)}
            >
              {showAllProjects ? 'Show less...' : `+ ${projects.length - 10} more...`}
            </option>
          )}
        </select>
      </div>

      <div className="filter-section">
        <label>Tags:</label>
        <div className="tag-filter-container">
          {availableTags.map(tag => (
            <button
              key={tag}
              className={`tag-filter-btn ${currentFilters.tags.includes(tag) ? 'active' : ''}`}
              onClick={() => handleTagToggle(tag)}
              title={`Filter by ${tag}`}
            >
              {tag}
            </button>
          ))}
        </div>
        {currentFilters.tags.length > 0 && (
          <div className="active-tags">
            Active: {currentFilters.tags.join(', ')}
            <button 
              className="clear-tags-btn"
              onClick={() => setTagFilters([])}
              title="Clear tag filters"
            >
              ×
            </button>
          </div>
        )}
      </div>

      <div className="filter-section">
        <label htmlFor="filter-context">Context:</label>
        <select
          id="filter-context"
          value={currentFilters.context || ''}
          onChange={handleContextChange}
          className="filter-input"
        >
          <option value="">All Contexts</option>
          <option value="@home">@home</option>
          <option value="@work">@work</option>
          <option value="@computer">@computer</option>
          <option value="@phone">@phone</option>
          <option value="@anywhere">@anywhere</option>
        </select>
      </div>

      <div className="filter-section">
        <label htmlFor="filter-due">Due:</label>
        <select
          id="filter-due"
          value={currentFilters.due || ''}
          onChange={handleDueChange}
          className="filter-input"
        >
          <option value="">All Dates</option>
          <option value="overdue">Overdue</option>
          <option value="today">Due Today</option>
          <option value="tomorrow">Due Tomorrow</option>
          <option value="week">Due This Week</option>
          <option value="month">Due This Month</option>
          <option value="future">Due In Future</option>
          <option value="none">No Due Date</option>
        </select>
      </div>

      {hasActiveFilters() && (
        <div className="filter-actions">
          <button 
            className="btn btn-clear-filters"
            onClick={handleClearAll}
            title="Clear all filters"
          >
            Clear Filters
          </button>
        </div>
      )}
    </div>
  );
}
