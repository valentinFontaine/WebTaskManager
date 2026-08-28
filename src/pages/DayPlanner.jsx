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

/**
 * Time slot constants
 */
const TIME_SLOTS = [
  '00:00', '01:00', '02:00', '03:00', '04:00', '05:00',
  '06:00', '07:00', '08:00', '09:00', '10:00', '11:00',
  '12:00', '13:00', '14:00', '15:00', '16:00', '17:00',
  '18:00', '19:00', '20:00', '21:00', '22:00', '23:00'
];

/**
 * DayPlannerPageContent component - The actual day planner page content
 */
function DayPlannerPageContent() {
  const { 
    tasks, 
    loading, 
    error, 
    fetchAllTasks 
  } = useTasks();
  const { setIsLoading } = useUI();

  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [conflicts, setConflicts] = useState([]);

  // Load data on mount
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      try {
        await fetchAllTasks();
      } catch (err) {
        console.error('Error loading data:', err);
      } finally {
        setIsLoading(false);
      }
    };
    
    loadData();
  }, [fetchAllTasks, setIsLoading]);

  /**
   * Navigate to previous day
   */
  const goToPreviousDay = useCallback(() => {
    setSelectedDate(prev => {
      const newDate = new Date(prev);
      newDate.setDate(newDate.getDate() - 1);
      return newDate;
    });
  }, []);

  /**
   * Navigate to next day
   */
  const goToNextDay = useCallback(() => {
    setSelectedDate(prev => {
      const newDate = new Date(prev);
      newDate.setDate(newDate.getDate() + 1);
      return newDate;
    });
  }, []);

  /**
   * Navigate to today
   */
  const goToToday = useCallback(() => {
    setSelectedDate(new Date());
  }, []);

  /**
   * Get tasks scheduled for the selected date
   */
  const getTasksForDate = useCallback(() => {
    const year = selectedDate.getFullYear();
    const month = selectedDate.getMonth();
    const day = selectedDate.getDate();
    
    return tasks.filter(task => {
      if (!task.scheduled && !task.due) {
        return false;
      }
      
      const taskDate = task.scheduled ? new Date(task.scheduled) : new Date(task.due);
      return taskDate.getFullYear() === year && 
             taskDate.getMonth() === month && 
             taskDate.getDate() === day;
    });
  }, [tasks, selectedDate]);

  /**
   * Get unplanned tasks
   */
  const unplannedTasks = tasks.filter(task => !task.scheduled && !task.due);

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
   * Schedule a task at a specific time
   * @param {string} taskId - Task UUID
   * @param {string} time - Time string (HH:MM)
   */
  const handleScheduleTask = (taskId, time) => {
    // Find the task and update its scheduled time
    // This would be implemented with the actual API call
    console.log(`Scheduling task ${taskId} at ${time}`);
    // In a real implementation:
    // await updateTask(taskId, { scheduled: formatDateForTaskWarrior(new Date(selectedDate + time)) })
  };

  /**
   * Check for scheduling conflicts
   */
  const checkConflicts = useCallback(() => {
    // This would check for overlapping tasks
    // For now, just return empty array
    return [];
  }, []);

  useEffect(() => {
    setConflicts(checkConflicts());
  }, [checkConflicts]);

  const scheduledTasks = getTasksForDate();

  /**
   * Get date label for header
   */
  const getDateLabel = () => {
    const today = new Date();
    const isToday = selectedDate.toDateString() === today.toDateString();
    
    const label = selectedDate.toLocaleString('default', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });
    
    return isToday ? `Today, ${label}` : label;
  };

  if (loading) {
    return <FullPageLoading />;
  }

  return (
    <div className="day-planner-page">
      <Header />
      
      <main className="main-content">
        <div className="page-header">
          <h2>Day Planner</h2>
        </div>

        {error && (
          <div className="error-message">
            Error: {error}
          </div>
        )}

        <div className="planner-controls">
          <div className="planner-nav">
            <button className="btn btn-nav" onClick={goToPreviousDay}>←</button>
            <span className="planner-date-label">{getDateLabel()}</span>
            <button className="btn btn-nav" onClick={goToNextDay}>→</button>
          </div>
          
          <button className="btn btn-today" onClick={goToToday}>Today</button>
        </div>

        {conflicts.length > 0 && (
          <div className="conflict-warning">
            ⚠ {conflicts.length} scheduling conflict(s) detected
          </div>
        )}

        {/* Time grid */}
        <div className="time-grid">
          <div className="time-grid-header">
            <div className="time-slot empty"></div>
            <div className="time-slot-header">Scheduled Tasks</div>
          </div>
          
          {TIME_SLOTS.map(timeSlot => {
            // Find tasks scheduled at this time
            const tasksAtTime = scheduledTasks.filter(task => {
              const scheduled = task.scheduled || task.due;
              if (!scheduled) return false;
              const hour = new Date(scheduled).getHours();
              return `${String(hour).padStart(2, '0')}:00` === timeSlot;
            });
            
            return (
              <div key={timeSlot} className="time-row">
                <div className="time-slot">{timeSlot}</div>
                <div className="time-slot-tasks">
                  {tasksAtTime.map(task => (
                    <TaskCard 
                      key={task.uuid}
                      task={task}
                      onEdit={handleEditTask}
                    />
                  ))}
                </div>
              </div>
            );
          })}
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

        <div className="planner-hint">
          <p>Drag tasks from "Unplanned Tasks" to a time slot to schedule them</p>
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
 * DayPlannerPage component - Day planner page with all providers
 * @returns {JSX.Element}
 */
export default function DayPlannerPage() {
  return (
    <UIProvider>
      <ProjectsProvider>
        <FiltersProvider>
          <TasksProvider>
            <DayPlannerPageContent />
          </TasksProvider>
        </FiltersProvider>
      </ProjectsProvider>
    </UIProvider>
  );
}
