import { useTasks } from '../contexts/TasksContext';
import { useUI } from '../contexts/UIContext';
import { useFilters } from '../contexts/FiltersContext';
import {
  getStatusText,
  getPriorityInfo,
  getUrgencyClass,
  getDueStatus,
  formatTags
} from '../lib/taskUtils';
import { formatDate, isOverdue } from '../lib/dateUtils';

/**
 * TaskCard component - Displays a single task with all its properties and action buttons
 * @param {Object} props - Component props
 * @param {Object} props.task - Task object to display
 * @param {Function} props.onEdit - Callback when edit button is clicked
 * @returns {JSX.Element}
 */
export default function TaskCard({ task, onEdit }) {
  const { startTask, stopTask, completeTask, deleteTask } = useTasks();
  const { showSuccess, showError, showInfo } = useUI();
  const { currentFilters } = useFilters();

  if (!task) {
    return null;
  }

  const statusText = getStatusText(task.status);
  const priorityInfo = getPriorityInfo(task.priority);
  const urgencyClass = getUrgencyClass(task.urgency);
  const dueStatus = getDueStatus(task.due);
  const tagsText = formatTags(task.tags);

  const isActive = task.start && task.status === 'pending';
  const isOverDue = isOverdue(task.due);

  /**
   * Handle start task action
   */
  const handleStart = async () => {
    try {
      await startTask(task.uuid);
      showSuccess(`Task "${task.description}" started`);
    } catch (err) {
      showError(`Failed to start task: ${err.message}`);
    }
  };

  /**
   * Handle stop task action
   */
  const handleStop = async () => {
    try {
      await stopTask(task.uuid);
      showSuccess(`Task "${task.description}" stopped`);
    } catch (err) {
      showError(`Failed to stop task: ${err.message}`);
    }
  };

  /**
   * Handle complete task action
   */
  const handleComplete = async () => {
    if (window.confirm(`Mark "${task.description}" as completed?`)) {
      try {
        await completeTask(task.uuid);
        showSuccess(`Task "${task.description}" completed`);
      } catch (err) {
        showError(`Failed to complete task: ${err.message}`);
      }
    }
  };

  /**
   * Handle delete task action
   */
  const handleDelete = async () => {
    if (window.confirm(`Delete "${task.description}"? This cannot be undone.`)) {
      try {
        await deleteTask(task.uuid);
        showSuccess(`Task "${task.description}" deleted`);
      } catch (err) {
        showError(`Failed to delete task: ${err.message}`);
      }
    }
  };

  /**
   * Handle edit task action
   */
  const handleEdit = () => {
    if (onEdit) {
      onEdit(task);
    }
  };

  return (
    <div className={`task-card ${urgencyClass} ${dueStatus} ${isActive ? 'active' : ''} ${isOverDue ? 'overdue' : ''}`}>
      <div className="task-card-header">
        <div className="task-description">{task.description}</div>
        {priorityInfo.text && (
          <span className={`task-priority ${priorityInfo.className}`}>
            {priorityInfo.text}
          </span>
        )}
      </div>

      <div className="task-card-body">
        {task.project && (
          <div className="task-project">
            <span className="label">Project:</span>
            <span className="value project-badge">{task.project}</span>
          </div>
        )}

        {tagsText && (
          <div className="task-tags">
            <span className="label">Tags:</span>
            <span className="value">{tagsText}</span>
          </div>
        )}

        {task.due && (
          <div className={`task-due ${dueStatus}`}>
            <span className="label">Due:</span>
            <span className="value">{formatDate(task.due, { dateStyle: 'short' })}</span>
          </div>
        )}

        {task.scheduled && (
          <div className="task-scheduled">
            <span className="label">Scheduled:</span>
            <span className="value">{formatDate(task.scheduled, { dateStyle: 'short' })}</span>
          </div>
        )}

        {task.urgency !== undefined && (
          <div className="task-urgency">
            <span className="label">Urgency:</span>
            <span className="value">{task.urgency}</span>
          </div>
        )}

        {task.uuid && (
          <div className="task-uuid">
            <span className="value uuid">{task.uuid}</span>
          </div>
        )}
      </div>

      <div className="task-card-footer">
        <div className="task-actions">
          {!isActive ? (
            <button 
              className="btn btn-start"
              onClick={handleStart}
              title="Start task"
            >
              <span className="btn-icon">▶</span>
              <span className="btn-text">Start</span>
            </button>
          ) : (
            <button 
              className="btn btn-stop"
              onClick={handleStop}
              title="Stop task"
            >
              <span className="btn-icon">⏹</span>
              <span className="btn-text">Stop</span>
            </button>
          )}

          <button 
            className="btn btn-edit"
            onClick={handleEdit}
            title="Edit task"
          >
            <span className="btn-icon">✏</span>
            <span className="btn-text">Edit</span>
          </button>

          <button 
            className="btn btn-complete"
            onClick={handleComplete}
            title="Complete task"
          >
            <span className="btn-icon">✓</span>
            <span className="btn-text">Done</span>
          </button>

          <button 
            className="btn btn-delete"
            onClick={handleDelete}
            title="Delete task"
          >
            <span className="btn-icon">✗</span>
            <span className="btn-text">Delete</span>
          </button>
        </div>

        <div className="task-status">
          {statusText}
        </div>
      </div>
    </div>
  );
}
