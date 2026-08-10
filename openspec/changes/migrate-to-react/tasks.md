# Implementation Tasks: Migrate Frontend to React

## 1. Project Setup and Infrastructure

- [ ] 1.1 Create src/ directory structure with subdirectories (pages/, components/, contexts/, hooks/, lib/, styles/, entry/)
- [ ] 1.2 Update package.json with React dependencies (react, react-dom)
- [ ] 1.3 Update package.json with dev dependencies (vite, @vitejs/plugin-react)
- [ ] 1.4 Add npm scripts (dev, build, preview) to package.json
- [ ] 1.5 Create vite.config.js with React plugin and multi-page configuration
- [ ] 1.6 Configure vite.config.js rollupOptions for entry points (index, calendar-planner, day-planner)
- [ ] 1.7 Configure vite.config.js proxy for /api requests to localhost:8000
- [ ] 1.8 Configure vite.config.js output directory to dist/
- [ ] 1.9 Install all dependencies with npm install
- [ ] 1.10 Verify Vite dev server starts without errors

## 2. API Client and Utilities

- [ ] 2.1 Create src/lib/api.js with fetch wrapper functions for all FastAPI endpoints
- [ ] 2.2 Implement fetchTasks function in api.js
- [ ] 2.3 Implement fetchProjects function in api.js
- [ ] 2.4 Implement createTask function in api.js
- [ ] 2.5 Implement updateTask function in api.js
- [ ] 2.6 Implement deleteTask function in api.js
- [ ] 2.7 Implement startTask function in api.js
- [ ] 2.8 Implement stopTask function in api.js
- [ ] 2.9 Create src/lib/dateUtils.js with date formatting and manipulation functions
- [ ] 2.10 Create src/lib/taskUtils.js with task-related helper functions
- [ ] 2.11 Add error handling utilities to api.js

## 3. React Contexts and State Management

- [ ] 3.1 Create src/contexts/TasksContext.jsx with Context and Provider
- [ ] 3.2 Implement tasks state and setter in TasksContext
- [ ] 3.3 Implement fetchTasks function in TasksContext using api.js
- [ ] 3.4 Implement addTask function in TasksContext
- [ ] 3.5 Implement updateTask function in TasksContext
- [ ] 3.6 Implement deleteTask function in TasksContext
- [ ] 3.7 Implement startTask function in TasksContext
- [ ] 3.8 Implement stopTask function in TasksContext
- [ ] 3.9 Create useTasks custom hook for consuming TasksContext
- [ ] 3.10 Create src/contexts/ProjectsContext.jsx with Context and Provider
- [ ] 3.11 Implement projects state in ProjectsContext
- [ ] 3.12 Implement fetchProjects function in ProjectsContext
- [ ] 3.13 Create useProjects custom hook
- [ ] 3.14 Create src/contexts/FiltersContext.jsx with Context and Provider
- [ ] 3.15 Implement filters state (project, tags, context, date) in FiltersContext
- [ ] 3.16 Implement filter update function in FiltersContext
- [ ] 3.17 Create useFilters custom hook
- [ ] 3.18 Create src/contexts/UIContext.jsx with Context and Provider
- [ ] 3.19 Implement loading state in UIContext
- [ ] 3.20 Implement notification system in UIContext (add, remove, clear)
- [ ] 3.21 Create useUI custom hook

## 4. Shared Components

- [ ] 4.1 Create src/components/TaskCard.jsx component
- [ ] 4.2 Add all task field displays to TaskCard (description, project, tags, due, urgency, status)
- [ ] 4.3 Implement start action button in TaskCard
- [ ] 4.4 Implement stop action button in TaskCard
- [ ] 4.5 Implement edit action button in TaskCard
- [ ] 4.6 Implement delete action button in TaskCard
- [ ] 4.7 Style TaskCard using existing CSS classes
- [ ] 4.8 Create src/components/TaskEditor.jsx component
- [ ] 4.9 Add form fields for all task attributes to TaskEditor
- [ ] 4.10 Implement form validation in TaskEditor
- [ ] 4.11 Implement form submission handler in TaskEditor
- [ ] 4.12 Implement cancel handler in TaskEditor
- [ ] 4.13 Style TaskEditor modal
- [ ] 4.14 Create src/components/TaskFilter.jsx component
- [ ] 4.15 Implement project filter dropdown in TaskFilter
- [ ] 4.16 Implement tags filter multi-select in TaskFilter
- [ ] 4.17 Implement context filter dropdown in TaskFilter
- [ ] 4.18 Implement date filter inputs in TaskFilter
- [ ] 4.19 Create src/components/Header.jsx component
- [ ] 4.20 Add navigation links to all pages in Header
- [ ] 4.21 Add application branding to Header
- [ ] 4.22 Create src/components/Notification.jsx component
- [ ] 4.23 Implement notification display and dismiss functionality
- [ ] 4.24 Style Notification component
- [ ] 4.25 Create src/components/LoadingSpinner.jsx component

## 5. Page Components

- [ ] 5.1 Create src/pages/Index.jsx component
- [ ] 5.2 Set up all context providers at Index root level
- [ ] 5.3 Implement task list rendering in Index
- [ ] 5.4 Implement task loading from API on mount
- [ ] 5.5 Integrate TaskCard components in task list
- [ ] 5.6 Integrate TaskEditor component for add/edit
- [ ] 5.7 Integrate TaskFilter component
- [ ] 5.8 Integrate Header component
- [ ] 5.9 Implement task start/stop functionality
- [ ] 5.10 Implement task delete functionality
- [ ] 5.11 Create src/pages/Calendar.jsx component
- [ ] 5.12 Set up all context providers at Calendar root level
- [ ] 5.13 Implement calendar grid rendering
- [ ] 5.14 Implement month view navigation (prev/next)
- [ ] 5.15 Implement view switching (week/day/month)
- [ ] 5.16 Integrate Header component
- [ ] 5.17 Integrate TaskCard for unplanned tasks section
- [ ] 5.18 Implement drag-and-drop from unplanned to calendar
- [ ] 5.19 Create src/pages/DayPlanner.jsx component
- [ ] 5.20 Set up all context providers at DayPlanner root level
- [ ] 5.21 Implement time-based grid rendering
- [ ] 5.22 Implement configurable time slots
- [ ] 5.23 Integrate Header component
- [ ] 5.24 Implement drag-and-drop scheduling
- [ ] 5.25 Implement conflict detection visualization

## 6. Entry Points and HTML Files

- [ ] 6.1 Create entry-index.js in src/entry/ with React root render
- [ ] 6.2 Create entry-calendar.js in src/entry/ with React root render
- [ ] 6.3 Create entry-dayplanner.js in src/entry/ with React root render
- [ ] 6.4 Create or update index.html with React mount point
- [ ] 6.5 Create or update calendar-planner.html with React mount point
- [ ] 6.6 Create or update day-planner.html with React mount point
- [ ] 6.7 Add script tags for entry points to each HTML file

## 7. Calendar Library Integration

- [ ] 7.1 Evaluate and select React calendar library (react-big-calendar, react-calendar, or custom)
- [ ] 7.2 Install selected calendar library
- [ ] 7.3 Create Calendar component wrapper for the library
- [ ] 7.4 Integrate Calendar component into Calendar page
- [ ] 7.5 Implement task rendering in calendar cells
- [ ] 7.6 Implement drag-and-drop functionality in calendar
- [ ] 7.7 Implement navigation controls
- [ ] 7.8 Implement view switching
- [ ] 7.9 Style calendar to match existing design

## 8. CSS and Styling

- [ ] 8.1 Move existing global CSS to src/styles/global.css
- [ ] 8.2 Move existing calendar-planner.css to src/styles/calendar.css
- [ ] 8.3 Move existing day-planner.css to src/styles/day-planner.css
- [ ] 8.4 Move existing styles.css to src/styles/main.css
- [ ] 8.5 Move existing task-card-styles.css to src/styles/task-card.css
- [ ] 8.6 Move existing task-editor-styles.css to src/styles/task-editor.css
- [ ] 8.7 Import global CSS in all entry points
- [ ] 8.8 Update component className references to match moved CSS
- [ ] 8.9 Verify all styles are applied correctly

## 9. Build and Testing

- [ ] 9.1 Run production build with npm run build
- [ ] 9.2 Verify dist/ directory is created with correct structure
- [ ] 9.3 Verify all entry HTML files are in dist/
- [ ] 9.4 Verify all assets are in dist/assets/
- [ ] 9.5 Test production build with FastAPI server
- [ ] 9.6 Verify all pages load without errors in production
- [ ] 9.7 Verify all functionality works in production build
- [ ] 9.8 Update Playwright configuration for React testing
- [ ] 9.9 Update existing Playwright tests for React components
- [ ] 9.10 Add new Playwright tests for React-specific functionality

## 10. Integration and Polish

- [ ] 10.1 Test all pages in development mode
- [ ] 10.2 Verify task listing works on all pages
- [ ] 10.3 Verify task creation works
- [ ] 10.4 Verify task editing works
- [ ] 10.5 Verify task deletion works
- [ ] 10.6 Verify task start/stop works
- [ ] 10.7 Verify filtering works (project, tags, context, date)
- [ ] 10.8 Verify calendar navigation works
- [ ] 10.9 Verify calendar drag-and-drop works
- [ ] 10.10 Verify day planner scheduling works
- [ ] 10.11 Verify notifications display and dismiss
- [ ] 10.12 Verify loading states work
- [ ] 10.13 Fix any visual inconsistencies
- [ ] 10.14 Fix any functional bugs
- [ ] 10.15 Performance testing with large task lists

## 11. Cleanup and Documentation

- [ ] 11.1 Remove or archive original vanilla JS files (main.js, calendar-planner.js, day-planner.js, task-card.js, task-editor.js)
- [ ] 11.2 Remove or archive original HTML template files (task-card-templates.html, task-editor-templates.html)
- [ ] 11.3 Update README.md with React migration documentation
- [ ] 11.4 Add development setup instructions to README
- [ ] 11.5 Add build instructions to README
- [ ] 11.6 Document project structure in README
- [ ] 11.7 Add contributing guidelines for React components
- [ ] 11.8 Commit all changes with descriptive commit messages
- [ ] 11.9 Tag the migration commit appropriately
