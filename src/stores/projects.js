import { writable, derived } from 'svelte/store';
import { tasks } from './tasks.js';

/**
 * Projects Store
 * Manages the state of projects in the application
 */

function createProjectsStore() {
    const { subscribe, set, update } = writable(new Set());

    return {
        subscribe,
        
        /**
         * Set all projects
         * @param {Array} projects - Array of project names
         */
        setProjects: (projects) => set(new Set(projects)),
        
        /**
         * Add a new project to the store
         * @param {string} project - Project name to add
         */
        addProject: (project) => update(projects => {
            const newProjects = new Set(projects);
            if (project) newProjects.add(project);
            return newProjects;
        }),
        
        /**
         * Remove a project from the store
         * @param {string} project - Project name to remove
         */
        removeProject: (project) => update(projects => {
            const newProjects = new Set(projects);
            newProjects.delete(project);
            return newProjects;
        }),
        
        /**
         * Get projects as array
         * @returns {Array} Array of project names
         */
        getProjectsArray: () => {
            let projectsArray = [];
            subscribe(projects => {
                projectsArray = Array.from(projects);
            })();
            return projectsArray;
        },
        
        /**
         * Check if project exists
         * @param {string} project - Project name to check
         * @returns {boolean} Whether project exists
         */
        hasProject: (project) => {
            let exists = false;
            subscribe(projects => {
                exists = projects.has(project);
            })();
            return exists;
        },
        
        /**
         * Clear all projects from the store
         */
        clearProjects: () => set(new Set()),
        
        /**
         * Update projects from tasks (extract unique project names from tasks)
         */
        updateFromTasks: () => {
            let taskProjects = new Set();
            const unsubscribe = tasks.subscribe(tasksArray => {
                taskProjects = new Set(
                    tasksArray
                        .map(task => task.project)
                        .filter(project => project && project.trim() !== '')
                );
            });
            unsubscribe();
            set(taskProjects);
        }
    };
}

// Auto-update projects from tasks store
export const projects = createProjectsStore();

// Derived store that combines unique projects from both the projects store and current tasks
export const allProjects = derived(
    [projects, tasks],
    ([$projects, $tasks]) => {
        const projectsFromTasks = new Set(
            $tasks
                .map(task => task.project)
                .filter(project => project && project.trim() !== '')
        );
        
        // Combine both sources and return as sorted array
        const combined = new Set([...$projects, ...projectsFromTasks]);
        return Array.from(combined).sort((a, b) => a.localeCompare(b));
    }
);