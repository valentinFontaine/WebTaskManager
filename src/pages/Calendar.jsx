import { useState, useEffect, useCallback } from 'react';
import { TasksProvider, useTasks } from '../contexts/TasksContext';
import { ProjectsProvider } from '../contexts/ProjectsContext';
import { FiltersProvider } from '../contexts/FiltersContext';
import { UIProvider, useUI } from '../contexts/UIContext';
import Header from '../components/Header';
import TaskCard from '../components/TaskCard';
import TaskEditor from '../components/TaskEditor';
import { NotificationContainer } from '../components/Notification';
import { FullPageLoading } from '../components/LoadingSpinner';
import { filterByProject } from '../lib/taskUtils';

/**
 * CalendarPageContent component - The actual calendar page content
 */
function CalendarPageContent() {
  const { 
    tasks, 
    plannedTasks,
    loading, 
    error, 
    fetchAllTasks,
    fetchAllPlannedTasks 
  } = useTasks();
  const { setIsLoading } = useUI();

  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [currentView, setCurrentView] = useState('month'); // 'month', 'week', 'day'
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedProject, setSelectedProject] = useState(null);

  // Load data on mount
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      try {
        await Promise.all([
          fetchAllTasks(),
          fetchAllPlannedTasks()
        ]);
      } catch (err) {
        console.error('Error loading data:', err);
      } finally {
        setIsLoading(false);
      }
    };
    
    loadData();
  }, [fetchAllTasks, fetchAllPlannedTasks, setIsLoading]);

  /**
   * Get tasks for the current view and date
   */
  const getTasksForView = useCallback(() => {
    const allTasks = [...plannedTasks, ...tasks];
    
    if (selectedProject) {
      return filterByProject(allTasks, selectedProject);
    }
    
    return allTasks;
  }, [plannedTasks, tasks, selectedProject]);

  /**
   * Navigate to previous period
   */
  const goToPrevious = useCallback(() => {
    setCurrentDate(prev => {
      const newDate = new Date(prev);
      if (currentView === 'month') {
        newDate.setMonth(newDate.getMonth() - 1);
      } else if (currentView === 'week') {
        newDate.setDate(newDate.getDate() - 7);
      } else {
        newDate.setDate(newDate.getDate() - 1);
      }
      return newDate;
    });
  }, [currentView]);

  /**
   * Navigate to next period
   */
  const goToNext = useCallback(() => {
    setCurrentDate(prev => {
      const newDate = new Date(prev);
      if (currentView === 'month') {
        newDate.setMonth(newDate.getMonth() + 1);
      } else if (currentView === 'week') {
        newDate.setDate(newDate.getDate() + 7);
      } else {
        newDate.setDate(newDate.getDate() + 1);
      }
      return newDate;
    });
  }, [currentView]);

  /**
   * Navigate to today
   */
  const goToToday = useCallback(() => {
    setCurrentDate(new Date());
  }, []);

  /**
   * Handle editor save
   */
  const handleEditorSave = (savedTask) => {
    setIsEditorOpen(false);
    setEditingTask(null);
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
   * Change view mode
   */
  const changeView = (view) => {
    setCurrentView(view);
  };

  /**
   * Get month/year label for header
   */
  const getDateLabel = () => {
    if (currentView === 'month') {
      return currentDate.toLocaleString('default', { month: 'long', year: 'numeric' });
    } else if (currentView === 'week') {
      const weekStart = new Date(currentDate);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      
      if (weekStart.getMonth() === weekEnd.getMonth()) {
        return `${weekStart.toLocaleString('default', { month: 'short' })} ${weekStart.getDate()}-${weekEnd.getDate()}, ${weekStart.getFullYear()}`;
      } else {
        return `${weekStart.toLocaleString('default', { month: 'short', day: 'numeric' })} - ${weekEnd.toLocaleString('default', { month: 'short', day: 'numeric', year: 'numeric' })}`;
      }
    } else {
      return currentDate.toLocaleString('default', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    }
  };

  /**
   * Filter tasks by date for current view
   */
  const filterTasksByDate = (tasksList) => {
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth();
    const currentDay = currentDate.getDate();
    
    return tasksList.filter(task => {
      if (!task.scheduled && !task.due) {
        return false; // Unplanned tasks
      }
      
      const taskDate = task.scheduled ? new Date(task.scheduled) : new Date(task.due);
      
      if (currentView === 'month') {
        return taskDate.getFullYear() === currentYear && taskDate.getMonth() === currentMonth;
      } else if (currentView === 'week') {
        const weekStart = new Date(currentDate);
        weekStart.setDate(weekStart.getDate() - weekStart.getDay());
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekEnd.getDate() + 6);
        weekEnd.setHours(23, 59, 59, 999);
        
        return taskDate >= weekStart && taskDate <= weekEnd;
      } else {
        return taskDate.getFullYear() === currentYear && 
               taskDate.getMonth() === currentMonth && 
               taskDate.getDate() === currentDay;
      }
    });
  };

  const allTasks = getTasksForView();
  const visibleTasks = filterTasksByDate(allTasks);
  const unplannedTasks = allTasks.filter(task => !task.scheduled && !task.due);

  if (loading) {
    return <FullPageLoading />;
  }

  return (
    <div className="calendar-page">
      <Header />
      
      <main className="main-content">
        <div className="page-header">
          <h2>Calendar Planner</h2>
        </div>

        {error && (
          <div className="error-message">
            Error: {error}
          </div>
        )}

        <div className="calendar-controls">
          <div className="calendar-nav">
            <button className="btn btn-nav" onClick={goToPrevious}>←</button>
            <span className="calendar-date-label">{getDateLabel()}</span>
            <button className="btn btn-nav" onClick={goToNext}>→</button>
          </div>
          
          <button className="btn btn-today" onClick={goToToday}>Today</button>
        </div>

        <div className="view-switcher">
          <button 
            className={`view-btn ${currentView === 'month' ? 'active' : ''}`}
            onClick={() => changeView('month')}
          >
            Month
          </button>
          <button 
            className={`view-btn ${currentView === 'week' ? 'active' : ''}`}
            onClick={() => changeView('week')}
          >
            Week
          </button>
          <button 
            className={`view-btn ${currentView === 'day' ? 'active' : ''}`}
            onClick={() => changeView('day')}
          >
            Day
          </button>
        </div>

        <div className="project-filter">
          <label>Filter by project:</label>
          <select
            value={selectedProject || ''}
            onChange={(e) => setSelectedProject(e.target.value || null)}
          >
            <option value="">All Projects</option>
            {/* Projects would be populated from context */}
          </select>
        </div>

        {/* Calendar grid placeholder - would be replaced with actual calendar library */}
        <div className="calendar-grid">
          <div className="calendar-header">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
              <div key={day} className="calendar-day-header">{day}</div>
            ))}
          </div>
          
          <div className="calendar-body">
            {/* This is a placeholder - actual implementation would render tasks in calendar cells */}
            <div className="calendar-placeholder">
              Calendar grid will be implemented with react-big-calendar library
            </div>
          </div>
        </div>

        {/* Unplanned tasks section */}
        <div className="unplanned-tasks-section">
          <h3>Unplanned Tasks ({unplannedTasks.length})</h3>
          {unplannedTasks.length > 0 ? (
            <div className="unplanned-tasks-list">
              {unplannedTasks.map(task => (
                <TaskCard 
                  key={task.uuid} 
                  task={task} 
                  onEdit={handleEditTask}
                />
              ))}
            </div>
          ) : (
            <p>No unplanned tasks</p>
          )}
        </div>

        <div className="calendar-hint">
          <p>Drag tasks from "Unplanned Tasks" to the calendar to schedule them</p>
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
 * CalendarPage component - Calendar page with all providers
 * @returns {JSX.Element}
 */
export default function CalendarPage() {
  return (
    <UIProvider>
      <ProjectsProvider>
        <FiltersProvider>
          <TasksProvider>
            <CalendarPageContent />
          </TasksProvider>
        </FiltersProvider>
      </ProjectsProvider>
    </UIProvider>
  );
}
