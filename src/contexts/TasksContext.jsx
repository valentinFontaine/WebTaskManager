import { createContext, useState, useContext, useCallback } from 'react';
import {
  fetchTasks,
  fetchPlannedTasks,
  addTask,
  modifyTask,
  startTask,
  stopTask,
  completeTask,
  deleteTask
} from '../lib/api';

/**
 * TasksContext for managing task state across the application
 */
const TasksContext = createContext(null);

/**
 * TasksProvider component that wraps the application
 * @param {Object} props - Component props
 * @param {React.ReactNode} props.children - Child components
 */
export function TasksProvider({ children }) {
  const [tasks, setTasks] = useState([]);
  const [plannedTasks, setPlannedTasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  /**
   * Fetch all pending tasks from the API
   */
  const fetchAllTasks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchTasks();
      setTasks(data);
      return data;
    } catch (err) {
      setError(err.message);
      console.error('Error fetching tasks:', err);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Fetch all planned tasks from the API
   */
  const fetchAllPlannedTasks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchPlannedTasks();
      setPlannedTasks(data);
      return data;
    } catch (err) {
      setError(err.message);
      console.error('Error fetching planned tasks:', err);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Add a new task
   * @param {Object} taskData - Task data to create
   * @returns {Promise<Object>} - Result from API
   */
  const createTask = useCallback(async (taskData) => {
    setLoading(true);
    setError(null);
    try {
      const result = await addTask(taskData);
      if (result.success) {
        // Refresh tasks list to get the new task with UUID
        await fetchAllTasks();
      }
      return result;
    } catch (err) {
      setError(err.message);
      console.error('Error creating task:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [fetchAllTasks]);

  /**
   * Update an existing task
   * @param {string} taskId - Task UUID
   * @param {Object} updates - Task updates
   * @returns {Promise<Object>} - Result from API
   */
  const updateTask = useCallback(async (taskId, updates) => {
    setLoading(true);
    setError(null);
    try {
      const result = await modifyTask(taskId, updates);
      if (result.success) {
        // Refresh tasks list to get updated data
        await fetchAllTasks();
      }
      return result;
    } catch (err) {
      setError(err.message);
      console.error('Error updating task:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [fetchAllTasks]);

  /**
   * Start a task
   * @param {string} taskId - Task UUID
   * @returns {Promise<Object>} - Result from API
   */
  const handleStartTask = useCallback(async (taskId) => {
    setLoading(true);
    setError(null);
    try {
      const result = await startTask(taskId);
      if (result.success) {
        // Update the task in the local state
        setTasks(prevTasks => 
          prevTasks.map(task => 
            task.uuid === taskId ? { ...task, start: new Date().toISOString() } : task
          )
        );
      }
      return result;
    } catch (err) {
      setError(err.message);
      console.error('Error starting task:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Stop a task
   * @param {string} taskId - Task UUID
   * @returns {Promise<Object>} - Result from API
   */
  const handleStopTask = useCallback(async (taskId) => {
    setLoading(true);
    setError(null);
    try {
      const result = await stopTask(taskId);
      if (result.success) {
        // Update the task in the local state
        setTasks(prevTasks => 
          prevTasks.map(task => 
            task.uuid === taskId ? { ...task, start: null } : task
          )
        );
      }
      return result;
    } catch (err) {
      setError(err.message);
      console.error('Error stopping task:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Complete a task
   * @param {string} taskId - Task UUID
   * @returns {Promise<Object>} - Result from API
   */
  const handleCompleteTask = useCallback(async (taskId) => {
    setLoading(true);
    setError(null);
    try {
      const result = await completeTask(taskId);
      if (result.success) {
        // Remove the task from the local state (it's now completed)
        setTasks(prevTasks => prevTasks.filter(task => task.uuid !== taskId));
      }
      return result;
    } catch (err) {
      setError(err.message);
      console.error('Error completing task:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Delete a task
   * @param {string} taskId - Task UUID
   * @returns {Promise<Object>} - Result from API
   */
  const handleDeleteTask = useCallback(async (taskId) => {
    setLoading(true);
    setError(null);
    try {
      const result = await deleteTask(taskId);
      if (result.success) {
        // Remove the task from the local state
        setTasks(prevTasks => prevTasks.filter(task => task.uuid !== taskId));
      }
      return result;
    } catch (err) {
      setError(err.message);
      console.error('Error deleting task:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Get a task by UUID
   * @param {string} taskId - Task UUID
   * @returns {Object|null}
   */
  const getTaskById = useCallback((taskId) => {
    return tasks.find(task => task.uuid === taskId) || null;
  }, [tasks]);

  /**
   * Clear error state
   */
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const value = {
    tasks,
    plannedTasks,
    loading,
    error,
    fetchAllTasks,
    fetchAllPlannedTasks,
    createTask,
    updateTask,
    startTask: handleStartTask,
    stopTask: handleStopTask,
    completeTask: handleCompleteTask,
    deleteTask: handleDeleteTask,
    getTaskById,
    clearError
  };

  return (
    <TasksContext.Provider value={value}>
      {children}
    </TasksContext.Provider>
  );
}

/**
 * Custom hook to consume TasksContext
 * @returns {Object} - Tasks context value
 */
export function useTasks() {
  const context = useContext(TasksContext);
  if (!context) {
    throw new Error('useTasks must be used within a TasksProvider');
  }
  return context;
}

export default TasksContext;
