import { useState, useEffect, useCallback } from 'react';
import { useTasks } from '../contexts/TasksContext';
import { useProjects } from '../contexts/ProjectsContext';
import { useUI } from '../contexts/UIContext';
import { getDefaultTask } from '../lib/taskUtils';
import { formatDate } from '../lib/dateUtils';

/**
 * TaskEditor component - Modal dialog for adding/editing tasks
 * @param {Object} props - Component props
 * @param {Object|null} props.task - Task to edit (null for new task)
 * @param {Function} props.onSave - Callback when task is saved
 * @param {Function} props.onCancel - Callback when editor is cancelled
 * @param {boolean} props.isOpen - Whether the editor is visible
 * @returns {JSX.Element}
 */
export default function TaskEditor({ task, onSave, onCancel, isOpen }) {
  const { createTask, updateTask, projects } = useTasks();
  const { projects: allProjects, fetchAllProjects } = useProjects();
  const { showError, showSuccess, setIsLoading } = useUI();

  const [formData, setFormData] = useState(getDefaultTask());
  const [errors, setErrors] = useState({});
  const [availableProjects, setAvailableProjects] = useState([]);

  // Initialize form data when task or isOpen changes
  useEffect(() => {
    if (isOpen) {
      if (task) {
        // Edit mode
        setFormData({
          uuid: task.uuid,
          description: task.description || '',
          project: task.project || '',
          tags: task.tags || [],
          due: task.due || '',
          scheduled: task.scheduled || '',
          priority: task.priority || '',
          estTime: task.estTime || '',
          context: task.context || ''
        });
      } else {
        // Add mode
        setFormData(getDefaultTask());
      }
      
      // Load projects
      const loadProjects = async () => {
        if (allProjects.length === 0) {
          await fetchAllProjects();
        }
        setAvailableProjects(allProjects);
      };
      loadProjects();
    }
  }, [task, isOpen, allProjects, fetchAllProjects]);

  // Effect to update available projects when allProjects changes
  useEffect(() => {
    setAvailableProjects(allProjects);
  }, [allProjects]);

  /**
   * Validate form data
   * @returns {boolean} - Whether form is valid
   */
  const validateForm = useCallback(() => {
    const newErrors = {};
    
    if (!formData.description || formData.description.trim() === '') {
      newErrors.description = 'Description is required';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [formData]);

  /**
   * Handle form input change
   * @param {Event} e - Input event
   */
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    
    // Clear error when user types
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: null
      }));
    }
  };

  /**
   * Handle tags input change
   * @param {Event} e - Input event
   */
  const handleTagsChange = (e) => {
    const { value } = e.target;
    const tags = value.split(',').map(t => t.trim()).filter(t => t.length > 0);
    setFormData(prev => ({
      ...prev,
      tags
    }));
  };

  /**
   * Handle form submission
   * @param {Event} e - Form submit event
   */
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      showError('Please fix the errors in the form');
      return;
    }
    
    setIsLoading(true);
    
    try {
      // Prepare task data for API
      const taskData = {
        description: formData.description.trim(),
        project: formData.project.trim() || null,
        tags: formData.tags.length > 0 ? formData.tags : null,
        due: formData.due || null,
        scheduled: formData.scheduled || null,
        priority: formData.priority || null,
        estTime: formData.estTime || null,
        context: formData.context || null
      };
      
      let result;
      if (formData.uuid) {
        // Update existing task
        result = await updateTask(formData.uuid, taskData);
      } else {
        // Create new task
        result = await createTask(taskData);
      }
      
      if (result.success) {
        showSuccess(`Task ${formData.uuid ? 'updated' : 'created'} successfully`);
        if (onSave) {
          onSave(result.task || { ...taskData, uuid: result.task?.uuid || formData.uuid });
        }
      } else {
        showError(result.error || 'Failed to save task');
      }
    } catch (err) {
      showError(`Error saving task: ${err.message}`);
      console.error('Error saving task:', err);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Handle cancel
   */
  const handleCancel = () => {
    setFormData(getDefaultTask());
    setErrors({});
    if (onCancel) {
      onCancel();
    }
  };

  /**
   * Handle modal backdrop click
   */
  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      handleCancel();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={handleBackdropClick}>
      <div className="modal task-editor-modal">
        <div className="modal-header">
          <h2>{formData.uuid ? 'Edit Task' : 'Add New Task'}</h2>
          <button 
            className="modal-close"
            onClick={handleCancel}
            title="Close"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="task-editor-form">
          <div className="form-group">
            <label htmlFor="description">Description *</label>
            <textarea
              id="description"
              name="description"
              value={formData.description}
              onChange={handleInputChange}
              className={errors.description ? 'input-error' : ''}
              rows={3}
              autoFocus
            />
            {errors.description && (
              <span className="error-message">{errors.description}</span>
            )}
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="project">Project</label>
              <select
                id="project"
                name="project"
                value={formData.project}
                onChange={handleInputChange}
              >
                <option value="">No project</option>
                {availableProjects.map(project => (
                  <option key={project} value={project}>
                    {project}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="priority">Priority</label>
              <select
                id="priority"
                name="priority"
                value={formData.priority}
                onChange={handleInputChange}
              >
                <option value="">No priority</option>
                <option value="H">High</option>
                <option value="M">Medium</option>
                <option value="L">Low</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="tags">Tags (comma separated)</label>
            <input
              id="tags"
              name="tags"
              type="text"
              value={formData.tags.join(', ')}
              onChange={handleTagsChange}
              placeholder="home, work, important"
            />
            <small className="form-hint">Separate tags with commas</small>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="due">Due Date</label>
              <input
                id="due"
                name="due"
                type="date"
                value={formData.due ? formatDate(formData.due, { dateStyle: 'medium' }).split(' ')[0] : ''}
                onChange={handleInputChange}
              />
            </div>

            <div className="form-group">
              <label htmlFor="scheduled">Scheduled Date</label>
              <input
                id="scheduled"
                name="scheduled"
                type="date"
                value={formData.scheduled ? formatDate(formData.scheduled, { dateStyle: 'medium' }).split(' ')[0] : ''}
                onChange={handleInputChange}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="estTime">Estimated Time</label>
              <input
                id="estTime"
                name="estTime"
                type="text"
                value={formData.estTime}
                onChange={handleInputChange}
                placeholder="1h, 2d, 1w"
              />
              <small className="form-hint">e.g., 1h, 2d, 1w</small>
            </div>

            <div className="form-group">
              <label htmlFor="context">Context</label>
              <input
                id="context"
                name="context"
                type="text"
                value={formData.context}
                onChange={handleInputChange}
                placeholder="@home, @work"
              />
              <small className="form-hint">e.g., @home, @work</small>
            </div>
          </div>

          <div className="modal-footer">
            <button 
              type="button" 
              className="btn btn-cancel"
              onClick={handleCancel}
            >
              Cancel
            </button>
            <button 
              type="submit" 
              className="btn btn-save"
              disabled={!formData.description || formData.description.trim() === ''}
            >
              {formData.uuid ? 'Update Task' : 'Add Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
