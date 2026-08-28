import { useState, useEffect, useCallback } from 'react';
import { TasksProvider, useTasks } from '../contexts/TasksContext';
import { ProjectsProvider, useProjects } from '../contexts/ProjectsContext';
import { FiltersProvider, useFilters } from '../contexts/FiltersContext';
import { UIProvider, useUI } from '../contexts/UIContext';
import TaskCard from '../components/TaskCard';
import TaskEditor from '../components/TaskEditor';
import TaskFilter from '../components/TaskFilter';
import Header from '../components/Header';
import { NotificationContainer } from '../components/Notification';
import { FullPageLoading } from '../components/LoadingSpinner';
import {
  filterByProject,
  filterByTags,
  filterByContext,
  filterByStatus,
  sortByUrgency
} from '../lib/taskUtils';

/**
 * IndexPageContent component - The actual page content
 * This is separated to allow access to context hooks
 */
function IndexPageContent() {
  const { 
    tasks, 
    loading, 
    error, 
    fetchAllTasks 
  } = useTasks();
  const { fetchAllProjects } = useProjects();
  const { currentFilters } = useFilters();
  const { setIsLoading } = useUI();

  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingTask, setEditingTask] = useState(null);

  // Load data on mount
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      try {
        await Promise.all([
          fetchAllTasks(),
          fetchAllProjects()
        ]);
      } catch (err) {
        console.error('Error loading data:', err);
      } finally {
        setIsLoading(false);
      }
    };
    
    loadData();
  }, [fetchAllTasks, fetchAllProjects, setIsLoading]);

  /**
   * Apply filters to tasks
   */
  const applyFilters = useCallback((tasksList) => {
    let filtered = [...tasksList];
    
    // Apply filters in sequence
    if (currentFilters.project) {
      filtered = filterByProject(filtered, currentFilters.project);
    }
    
    if (currentFilters.tags && currentFilters.tags.length > 0) {
      filtered = filtered.filter(task => 
        currentFilters.tags.every(tag => 
          (task.tags || []).some(t => t.toLowerCase() === tag.toLowerCase())
        )
      );
    }
    
    if (currentFilters.context) {
      filtered = filterByContext(filtered, currentFilters.context);
    }
    
    if (currentFilters.status) {
      filtered = filterByStatus(filtered, currentFilters.status);
    }
    
    if (currentFilters.search) {
      const searchLower = currentFilters.search.toLowerCase();
      filtered = filtered.filter(task => 
        (task.description || '').toLowerCase().includes(searchLower) ||
        (task.project || '').toLowerCase().includes(searchLower) ||
        (task.tags || []).some(t => t.toLowerCase().includes(searchLower))
      );
    }
    
    return filtered;
  }, [currentFilters]);

  /**
   * Handle editor save
   */
  const handleEditorSave = (savedTask) => {
    setIsEditorOpen(false);
    setEditingTask(null);
    // Task list will be refreshed automatically by context
  };

  /**
   * Handle editor cancel
   */
  const handleEditorCancel = () => {
    setIsEditorOpen(false);
    setEditingTask(null);
  };

  /**
   * Handle edit task
   */
  const handleEditTask = (task) => {
    setEditingTask(task);
    setIsEditorOpen(true);
  };

  /**
   * Handle add new task
   */
  const handleAddTask = () => {
    setEditingTask(null);
    setIsEditorOpen(true);
  };

  /**
   * Sort tasks by urgency
   */
  const sortedTasks = applyFilters(tasks);
  const finalTasks = sortByUrgency(sortedTasks);

  if (loading) {
    return <FullPageLoading />;
  }

  return (
    <div className="index-page">
      <Header />
      
      <main className="main-content">
        <div className="page-header">
          <h2>Your Tasks</h2>
          <button 
            className="btn btn-add-task"
            onClick={handleAddTask}
          >
            + Add Task
          </button>
        </div>

        {error && (
          <div className="error-message">
            Error loading tasks: {error}
          </div>
        )}

        <TaskFilter />

        <div className="task-list-container">
          {finalTasks.length === 0 ? (
            <div className="empty-state">
              <p>No tasks found</p>
              {currentFilters.project || 
               currentFilters.tags.length > 0 || 
               currentFilters.context ||
               currentFilters.status ||
               currentFilters.search ? (
                <p>Try adjusting your filters</p>
              ) : (
                <p>Add your first task to get started!</p>
              )}
            </div>
          ) : (
            <div className="task-list">
              {finalTasks.map(task => (
                <TaskCard 
                  key={task.uuid} 
                  task={task} 
                  onEdit={handleEditTask}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      <TaskEditor
        task={editingTask}
        isOpen={isEditorOpen}
        onSave={handleEditorSave}
        onCancel={handleEditorCancel}
      />

      <NotificationContainer />
    </div>
  );
}

/**
 * IndexPage component - Main index page with all providers
 * @returns {JSX.Element}
 */
export default function IndexPage() {
  return (
    <UIProvider>
      <ProjectsProvider>
        <FiltersProvider>
          <TasksProvider>
            <IndexPageContent />
          </TasksProvider>
        </FiltersProvider>
      </ProjectsProvider>
    </UIProvider>
  );
}
