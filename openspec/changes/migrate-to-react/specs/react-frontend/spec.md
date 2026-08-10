# React Frontend Specification

## ADDED Requirements

### Requirement: React component architecture
The system SHALL have all frontend UI elements implemented as React functional components.

#### Scenario: All pages use React components
- **WHEN** user navigates to any page (index, calendar-planner, day-planner)
- **THEN** the page SHALL be rendered using React components

#### Scenario: Component-based structure
- **WHEN** examining the codebase structure
- **THEN** components SHALL be organized in a `src/components/` directory

#### Scenario: Page components exist
- **WHEN** examining the codebase structure
- **THEN** page-level components SHALL exist in `src/pages/` directory including Index.jsx, Calendar.jsx, and DayPlanner.jsx

### Requirement: Replace vanilla JS with React
The system SHALL replace all vanilla JavaScript DOM manipulation with React's declarative rendering.

#### Scenario: No direct DOM manipulation
- **WHEN** examining component code
- **THEN** there SHALL be no direct DOM manipulation via `document.getElementById`, `document.querySelector`, or similar methods

#### Scenario: Declarative rendering
- **WHEN** component state changes
- **THEN** the UI SHALL automatically re-render to reflect the new state

### Requirement: TaskCard component
The system SHALL have a React TaskCard component that replaces the existing task-card.js functionality.

#### Scenario: TaskCard renders task data
- **WHEN** a TaskCard component receives task data as props
- **THEN** it SHALL display all task fields (description, project, tags, due date, urgency, status)

#### Scenario: TaskCard action buttons
- **WHEN** user clicks action buttons on a TaskCard
- **THEN** the corresponding action (start, stop, edit, delete) SHALL be triggered

### Requirement: TaskEditor component
The system SHALL have a React TaskEditor component that replaces the existing task-editor.js functionality.

#### Scenario: TaskEditor form display
- **WHEN** user opens the add/edit task modal
- **THEN** a TaskEditor component SHALL be displayed with all task fields

#### Scenario: TaskEditor form submission
- **WHEN** user submits the TaskEditor form with valid data
- **THEN** the task SHALL be created or updated via API call

#### Scenario: TaskEditor form validation
- **WHEN** user submits the TaskEditor form with invalid data
- **THEN** validation errors SHALL be displayed and submission SHALL be prevented

### Requirement: Header component
The system SHALL have a React Header component for navigation and branding.

#### Scenario: Header displays navigation
- **WHEN** any page is loaded
- **THEN** the Header component SHALL display navigation links to all pages

#### Scenario: Header displays branding
- **WHEN** any page is loaded
- **THEN** the Header component SHALL display the application name/branding

### Requirement: TaskFilter component
The system SHALL have a React TaskFilter component that replaces the existing filter functionality.

#### Scenario: Filter by project
- **WHEN** user selects a project filter
- **THEN** the task list SHALL update to show only tasks matching the selected project

#### Scenario: Filter by tags
- **WHEN** user selects tag filters
- **THEN** the task list SHALL update to show only tasks matching all selected tags

#### Scenario: Filter by context
- **WHEN** user selects a context filter
- **THEN** the task list SHALL update to show only tasks matching the selected context

#### Scenario: Filter by date
- **WHEN** user applies a date filter
- **THEN** the task list SHALL update to show only tasks matching the date criteria

### Requirement: Calendar component
The system SHALL have a React Calendar component that replaces the TUI Calendar.

#### Scenario: Calendar renders month view
- **WHEN** user navigates to the calendar page
- **THEN** a calendar grid SHALL be displayed showing the current month

#### Scenario: Calendar navigation
- **WHEN** user clicks previous/next navigation buttons
- **THEN** the calendar SHALL display the previous/next month

#### Scenario: Calendar view switching
- **WHEN** user switches between week/day/month views
- **THEN** the calendar SHALL re-render in the selected view mode

### Requirement: DayPlanner component
The system SHALL have a React DayPlanner component for daily task scheduling.

#### Scenario: DayPlanner renders time slots
- **WHEN** user navigates to the day planner page
- **THEN** a time-based grid SHALL be displayed with configurable time slots

#### Scenario: DayPlanner drag-and-drop
- **WHEN** user drags a task to a time slot in the day planner
- **THEN** the task SHALL be scheduled at the dropped time slot

### Requirement: Maintain existing functionality
The system SHALL maintain all existing functionality from the vanilla JS implementation.

#### Scenario: Task listing
- **WHEN** user views the main index page
- **THEN** all tasks SHALL be displayed in a list format

#### Scenario: Task creation
- **WHEN** user creates a new task
- **THEN** the task SHALL appear in the task list and be saved to the backend

#### Scenario: Task editing
- **WHEN** user edits an existing task
- **THEN** the task SHALL be updated both in the UI and in the backend

#### Scenario: Task deletion
- **WHEN** user deletes a task
- **THEN** the task SHALL be removed from both the UI and the backend

#### Scenario: Task start/stop
- **WHEN** user starts or stops a task
- **THEN** the task status SHALL update and the change SHALL be persisted to the backend
