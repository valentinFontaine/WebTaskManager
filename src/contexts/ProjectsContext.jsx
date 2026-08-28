import { createContext, useState, useContext, useCallback } from 'react';
import { fetchProjects } from '../lib/api';

/**
 * ProjectsContext for managing project state across the application
 */
const ProjectsContext = createContext(null);

/**
 * ProjectsProvider component that wraps the application
 * @param {Object} props - Component props
 * @param {React.ReactNode} props.children - Child components
 */
export function ProjectsProvider({ children }) {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  /**
   * Fetch all projects from the API
   */
  const fetchAllProjects = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchProjects();
      setProjects(data);
      return data;
    } catch (err) {
      setError(err.message);
      console.error('Error fetching projects:', err);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Get a project by name
   * @param {string} projectName - Project name
   * @returns {string|null} - Project name if exists, null otherwise
   */
  const getProject = useCallback((projectName) => {
    return projects.includes(projectName) ? projectName : null;
  }, [projects]);

  /**
   * Check if a project exists
   * @param {string} projectName - Project name
   * @returns {boolean}
   */
  const hasProject = useCallback((projectName) => {
    return projects.includes(projectName);
  }, [projects]);

  /**
   * Get all projects as options for select dropdown
   * @returns {Array<{value: string, label: string}>}
   */
  const getProjectOptions = useCallback(() => {
    return projects.map(project => ({
      value: project,
      label: project
    }));
  }, [projects]);

  /**
   * Clear error state
   */
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const value = {
    projects,
    loading,
    error,
    fetchAllProjects,
    getProject,
    hasProject,
    getProjectOptions,
    clearError
  };

  return (
    <ProjectsContext.Provider value={value}>
      {children}
    </ProjectsContext.Provider>
  );
}

/**
 * Custom hook to consume ProjectsContext
 * @returns {Object} - Projects context value
 */
export function useProjects() {
  const context = useContext(ProjectsContext);
  if (!context) {
    throw new Error('useProjects must be used within a ProjectsProvider');
  }
  return context;
}

export default ProjectsContext;
