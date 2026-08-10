# React State Management Specification

## ADDED Requirements

### Requirement: React Context API for shared state
The system SHALL use React Context API to manage shared state across components.

#### Scenario: Tasks state is shared
- **WHEN** any component needs access to tasks data
- **THEN** it SHALL be able to access it via a TasksContext

#### Scenario: Projects state is shared
- **WHEN** any component needs access to projects data
- **THEN** it SHALL be able to access it via a ProjectsContext

#### Scenario: Filters state is shared
- **WHEN** any component needs to read or modify filter state
- **THEN** it SHALL be able to access it via a FiltersContext

#### Scenario: UI state is shared
- **WHEN** any component needs to access UI state (loading, notifications)
- **THEN** it SHALL be able to access it via a UIContext

### Requirement: TasksContext
The system SHALL have a TasksContext that manages all task-related state and operations.

#### Scenario: TasksContext provides tasks list
- **WHEN** a component consumes TasksContext
- **THEN** it SHALL receive an array of tasks and a function to update them

#### Scenario: TasksContext provides task operations
- **WHEN** a component needs to fetch, add, update, or delete tasks
- **THEN** the corresponding functions SHALL be available via TasksContext

#### Scenario: Tasks state updates propagate
- **WHEN** tasks are fetched from the API
- **THEN** all components consuming TasksContext SHALL receive the updated tasks list

#### Scenario: Task modifications update state
- **WHEN** a task is added, updated, or deleted
- **THEN** the TasksContext state SHALL be updated and all consumers SHALL re-render

### Requirement: ProjectsContext
The system SHALL have a ProjectsContext that manages all project-related state and operations.

#### Scenario: ProjectsContext provides projects list
- **WHEN** a component consumes ProjectsContext
- **THEN** it SHALL receive an array of projects

#### Scenario: ProjectsContext provides project operations
- **WHEN** a component needs to fetch or modify projects
- **THEN** the corresponding functions SHALL be available via ProjectsContext

### Requirement: FiltersContext
The system SHALL have a FiltersContext that manages all filter-related state.

#### Scenario: FiltersContext provides current filters
- **WHEN** a component consumes FiltersContext
- **THEN** it SHALL receive the current filter state (project, tags, context, date filters)

#### Scenario: FiltersContext provides filter update function
- **WHEN** a component needs to update filters
- **THEN** it SHALL be able to call a function to update the filter state

#### Scenario: Filter changes trigger task list update
- **WHEN** filter state is updated via FiltersContext
- **THEN** the task list SHALL automatically filter and re-render

### Requirement: UIContext
The system SHALL have a UIContext that manages UI-related state.

#### Scenario: UIContext provides loading state
- **WHEN** a component consumes UIContext
- **THEN** it SHALL receive the current loading state

#### Scenario: UIContext provides notification system
- **WHEN** a component needs to display a notification
- **THEN** it SHALL be able to call a function to show a notification message

#### Scenario: Notifications are dismissible
- **WHEN** user clicks to dismiss a notification
- **THEN** the notification SHALL be removed from the UI

### Requirement: Custom hooks for state access
The system SHALL provide custom hooks for easy access to context values.

#### Scenario: useTasks hook
- **WHEN** a component calls the useTasks hook
- **THEN** it SHALL receive the tasks list and task operations from TasksContext

#### Scenario: useProjects hook
- **WHEN** a component calls the useProjects hook
- **THEN** it SHALL receive the projects list and project operations from ProjectsContext

#### Scenario: useFilters hook
- **WHEN** a component calls the useFilters hook
- **THEN** it SHALL receive the filter state and update function from FiltersContext

#### Scenario: useUI hook
- **WHEN** a component calls the useUI hook
- **THEN** it SHALL receive the UI state and functions from UIContext

### Requirement: Context providers at root level
The system SHALL have all context providers configured at the root level of each page.

#### Scenario: Index page has all providers
- **WHEN** Index page is rendered
- **THEN** it SHALL wrap its content in TasksProvider, ProjectsProvider, FiltersProvider, and UIProvider

#### Scenario: Calendar page has all providers
- **WHEN** Calendar page is rendered
- **THEN** it SHALL wrap its content in TasksProvider, ProjectsProvider, FiltersProvider, and UIProvider

#### Scenario: DayPlanner page has all providers
- **WHEN** DayPlanner page is rendered
- **THEN** it SHALL wrap its content in TasksProvider, ProjectsProvider, FiltersProvider, and UIProvider

### Requirement: Shared state across pages
The system SHALL maintain shared state across different pages when navigating between them.

#### Scenario: State persists between page navigation
- **WHEN** user navigates from index to calendar page
- **THEN** the tasks and filter state SHALL be maintained

### Requirement: React to backend changes
The system SHALL automatically update context state when backend data changes.

#### Scenario: Tasks refresh on external changes
- **WHEN** a task is modified by another user/client
- **THEN** the TasksContext SHALL fetch updated data and propagate changes to all consumers

#### Scenario: Error handling in context
- **WHEN** an API call fails
- **THEN** the error SHALL be caught and displayed via UIContext notification system
