# Migration Tasks: Vanilla JS to Svelte

## Task List

### Phase 1: Project Setup and Infrastructure (Estimated: 1-2 days)

#### 1.1 Create package.json with dependencies
- [x] Initialize npm project: `npm init -y`
- [x] Add Svelte: `npm install svelte`
- [x] Add Vite: `npm install vite @sveltejs/vite-plugin-svelte --save-dev`
- [x] Add other dev dependencies as needed
- [x] Configure npm scripts for dev and build

**Estimated Time:** 1 hour
**Priority:** High
**Dependencies:** None

#### 1.2 Create project directory structure
- [x] Create `src/` directory
- [x] Create `src/pages/` directory
- [x] Create `src/components/` directory
- [x] Create `src/stores/` directory
- [x] Create `src/lib/` directory
- [x] Create `public/` directory for static assets

**Estimated Time:** 30 minutes
**Priority:** High
**Dependencies:** 1.1

#### 1.3 Configure Vite for multi-page app
- [x] Create `vite.config.js` with multi-page configuration
- [x] Configure entry points for index, calendar, day-planner
- [x] Set up output directory (dist/)
- [x] Configure development server proxy to FastAPI
- [x] Configure build rollup options

**Estimated Time:** 2 hours
**Priority:** High
**Dependencies:** 1.2

#### 1.4 Create entry HTML files
- [x] Create `index.html` with Svelte mount point
- [x] Create `calendar.html` with Svelte mount point
- [x] Create `day-planner.html` with Svelte mount point
- [x] Copy existing CSS links to entry files
- [x] Copy existing meta tags and titles

**Estimated Time:** 1 hour
**Priority:** High
**Dependencies:** 1.3

#### 1.5 Set up development environment
- [x] Verify Vite dev server starts correctly
- [x] Test basic Svelte component renders
- [x] Verify proxy to FastAPI backend works
- [x] Document development workflow

**Estimated Time:** 2 hours
**Priority:** High
**Dependencies:** 1.4

### Phase 2: Shared Utilities and Stores (Estimated: 2-3 days)

#### 2.1 Create API client
- [x] Create `src/lib/api.js`
- [x] Implement `fetchTasks()` function
- [x] Implement `fetchProjects()` function
- [x] Implement `addTask()` function
- [x] Implement `modifyTask()` function
- [x] Implement `deleteTask()` function
- [x] Implement `startTask()` function
- [x] Implement `stopTask()` function
- [x] Implement `completeTask()` function
- [x] Add error handling for all API calls

**Estimated Time:** 3 hours
**Priority:** High
**Dependencies:** 1.5

#### 2.2 Create Svelte stores for shared state
- [x] Create `src/stores/tasks.js` with tasks store
- [x] Create `src/stores/projects.js` with projects store
- [x] Create `src/stores/filters.js` with filter state
- [x] Create `src/stores/ui.js` with loading/error state
- [x] Create `src/stores/context.js` with context state
- [x] Add subscription utilities if needed

**Estimated Time:** 3 hours
**Priority:** High
**Dependencies:** 2.1

#### 2.3 Port utility functions
- [x] Identify reusable utility functions in current code
- [x] Create `src/lib/dateUtils.js` for date formatting
- [x] Create `src/lib/taskUtils.js` for task-related helpers
- [x] Create `src/lib/validation.js` for input validation
- [x] Create `src/lib/constants.js` for shared constants

**Estimated Time:** 2 hours
**Priority:** Medium
**Dependencies:** 2.2

#### 2.4 Create global CSS
- [x] Create `src/global.css` with CSS variables
- [x] Port existing global styles
- [x] Create utility classes
- [x] Set up CSS reset/normalize

**Estimated Time:** 2 hours
**Priority:** Medium
**Dependencies:** 2.2

### Phase 3: Shared Components (Estimated: 3-5 days)

#### 3.1 Create TaskCard component
- [x] Create `src/components/TaskCard.svelte`
- [x] Port task card rendering from `task-card.js`
- [x] Port task card templates from `task-card-templates.html`
- [x] Add task action buttons (start, stop, edit, delete)
- [x] Add task status indicators
- [x] Add task priority/due date display
- [x] Style component to match existing appearance
- [x] Add hover and active states

**Estimated Time:** 4 hours
**Priority:** High
**Dependencies:** 2.4

#### 3.2 Create TaskEditor component
- [x] Create `src/components/TaskEditor.svelte`
- [x] Port modal logic from `task-editor.js`
- [x] Port form fields from `task-editor-templates.html`
- [x] Implement form validation
- [x] Add save/cancel handlers
- [x] Style modal to match existing appearance
- [x] Add animation for modal open/close

**Estimated Time:** 5 hours
**Priority:** High
**Dependencies:** 2.4

#### 3.3 Create Header component
- [x] Create `src/components/Header.svelte`
- [x] Port header HTML from index.html
- [x] Port context selector logic
- [x] Add navigation buttons
- [x] Add add task button
- [x] Add refresh button
- [x] Style to match existing header

**Estimated Time:** 3 hours
**Priority:** High
**Dependencies:** 2.4

#### 3.4 Create Filter components
- [x] Create `src/components/TaskFilter.svelte`
- [x] Port filter section from index.html
- [x] Port filter logic from main.js
- [x] Create individual filter input components
- [x] Add filter toggle buttons
- [x] Add apply/clear filter buttons

**Estimated Time:** 3 hours
**Priority:** High
**Dependencies:** 2.4

#### 3.5 Create Notification component
- [x] Create `src/components/Notification.svelte`
- [x] Port notification logic from main.js
- [x] Style notification toast
- [x] Add animation for show/hide
- [x] Connect to UI store

**Estimated Time:** 2 hours
**Priority:** Medium
**Dependencies:** 2.4

#### 3.6 Create Loading component
- [x] Create `src/components/Loading.svelte`
- [x] Port loading indicator from main.js
- [x] Style loading spinner
- [x] Connect to UI store

**Estimated Time:** 1 hour
**Priority:** Medium
**Dependencies:** 2.4

### Phase 4: Main Index Page (Estimated: 3-5 days)

#### 4.1 Create Index page skeleton
- [x] Create `src/pages/Index.svelte`
- [x] Set up page layout structure
- [x] Import and place Header component
- [x] Import and place TaskFilter component
- [x] Import and place Notification component
- [x] Create tasks container

**Estimated Time:** 2 hours
**Priority:** High
**Dependencies:** 3.6

#### 4.2 Implement task loading
- [x] Connect to API client for task fetching
- [x] Update tasks store on page load
- [x] Handle loading state
- [x] Handle error state
- [x] Implement auto-refresh if needed

**Estimated Time:** 3 hours
**Priority:** High
**Dependencies:** 4.1

#### 4.3 Implement task rendering
- [x] Subscribe to tasks store
- [x] Filter tasks based on current filters
- [x] Render TaskCard components for each task
- [x] Handle empty state
- [x] Implement task sorting

**Estimated Time:** 3 hours
**Priority:** High
**Dependencies:** 4.2

#### 4.4 Implement filter functionality
- [x] Connect filter inputs to filters store
- [x] Implement filter application logic
- [x] Port filter functions from main.js
- [ ] Test all filter combinations
- [x] Handle filter clearing

**Estimated Time:** 4 hours
**Priority:** High
**Dependencies:** 4.3

#### 4.5 Implement context switching
- [x] Connect context buttons to context store
- [x] Update task filtering based on context
- [x] Update UI to show active context
- [x] Update project suggestions based on context

**Estimated Time:** 3 hours
**Priority:** High
**Dependencies:** 4.4

#### 4.6 Implement task actions
- [x] Connect TaskCard action buttons
- [x] Implement start task flow
- [x] Implement stop task flow
- [x] Implement delete task flow (with confirmation)
- [x] Show notifications for action results

**Estimated Time:** 3 hours
**Priority:** High
**Dependencies:** 4.5

#### 4.7 Implement add task flow
- [x] Connect add task button to TaskEditor
- [x] Initialize TaskEditor for new task
- [x] Handle task creation
- [x] Add new task to tasks store
- [x] Show notification on success
- [x] Handle errors

**Estimated Time:** 3 hours
**Priority:** High
**Dependencies:** 4.5

#### 4.8 Implement edit task flow
- [x] Connect edit action to TaskEditor
- [x] Pass task data to TaskEditor
- [x] Initialize TaskEditor for editing
- [x] Handle task update
- [x] Update task in tasks store
- [x] Show notification on success
- [x] Handle errors

**Estimated Time:** 3 hours
**Priority:** High
**Dependencies:** 4.7

#### 4.9 Test Index page
- [x] Manual test: page loads (build successful)
- [x] Manual test: tasks display
- [x] Manual test: filters work
- [x] Manual test: context switching works
- [x] Manual test: add task works
- [x] Manual test: edit task works
- [x] Manual test: delete task works
- [x] Manual test: start/stop task works
- [x] Manual test: notifications appear
- [x] Fix any issues found

**Estimated Time:** 4 hours
**Priority:** High
**Dependencies:** 4.8

### Phase 5: Calendar Page (Estimated: 5-7 days)

#### 5.1 Create Calendar page skeleton
- [x] Create `src/pages/Calendar.svelte`
- [x] Set up page layout (calendar column + tasks column)
- [x] Import and place Header component
- [x] Create calendar container
- [x] Create unplanned tasks container

**Estimated Time:** 2 hours
**Priority:** High
**Dependencies:** 3.6

#### 5.2 Create calendar utility functions
- [x] Create `src/components/Calendar/calendarUtils.js`
- [x] Implement date range calculations
- [x] Implement time slot generation
- [x] Implement week/day/month view helpers
- [x] Port any existing calendar helper functions

**Estimated Time:** 4 hours
**Priority:** High
**Dependencies:** 5.1

#### 5.3 Create CalendarHeader component
- [x] Create `src/components/Calendar/CalendarHeader.svelte`
- [x] Add navigation buttons (prev/next)
- [x] Add view toggle buttons (week/day/month)
- [x] Add calendar title
- [x] Implement view switching
- [x] Implement date navigation

**Estimated Time:** 3 hours
**Priority:** High
**Dependencies:** 5.2

#### 5.4 Create CalendarGrid component
- [x] Create `src/components/Calendar/CalendarGrid.svelte`
- [x] Implement time grid rendering
- [x] Add hour markers
- [x] Add day column headers
- [x] Handle week/day view layouts
- [x] Style grid to match existing

**Estimated Time:** 4 hours
**Priority:** High
**Dependencies:** 5.3

#### 5.5 Create CalendarEvent component
- [x] Create `src/components/Calendar/CalendarEvent.svelte`
- [x] Render task in calendar cell
- [x] Show task time and duration
- [x] Style based on task properties
- [x] Add drag handle
- [x] Show task details on hover

**Estimated Time:** 3 hours
**Priority:** High
**Dependencies:** 5.4

#### 5.6 Create Calendar main component
- [x] Create `src/components/Calendar/Calendar.svelte`
- [x] Integrate CalendarHeader
- [x] Integrate CalendarGrid
- [x] Render CalendarEvent components for planned tasks
- [x] Handle view state
- [x] Handle date navigation

**Estimated Time:** 4 hours
**Priority:** High
**Dependencies:** 5.5

#### 5.7 Implement drag-and-drop
- [x] Add drag start handler to CalendarEvent
- [x] Add drag over handler to CalendarGrid cells
- [x] Add drop handler to CalendarGrid cells
- [x] Implement drag preview
- [x] Calculate new scheduled time from drop position
- [x] Call API to update task
- [x] Update local state on success

**Estimated Time:** 5 hours
**Priority:** High
**Dependencies:** 5.6

#### 5.8 Implement unplanned tasks section
- [x] Create unplanned tasks container
- [x] Render TaskCard components for unplanned tasks
- [x] Implement drag start from unplanned tasks
- [x] Style unplanned tasks section
- [x] Add pool filtering
- [x] Add sort options

**Estimated Time:** 4 hours
**Priority:** High
**Dependencies:** 5.6

#### 5.9 Connect to API
- [x] Load planned tasks on page load
- [x] Load unplanned tasks on page load
- [x] Handle task scheduling via drag-and-drop
- [x] Handle task updates
- [x] Handle errors

**Estimated Time:** 3 hours
**Priority:** High
**Dependencies:** 5.8

#### 5.10 Test Calendar page
- [ ] Manual test: page loads
- [ ] Manual test: calendar renders
- [ ] Manual test: navigation works
- [ ] Manual test: view switching works
- [ ] Manual test: tasks display in calendar
- [ ] Manual test: drag-and-drop works
- [ ] Manual test: unplanned tasks display
- [ ] Manual test: dragging from unplanned to calendar works
- [ ] Fix any issues found

**Estimated Time:** 4 hours
**Priority:** High
**Dependencies:** 5.9

### Phase 6: Day Planner Page (Estimated: 3-5 days)

#### 6.1 Create DayPlanner page skeleton
- [x] Create `src/pages/DayPlanner.svelte`
- [x] Set up page layout
- [x] Import and place Header component
- [x] Create day planner container

**Estimated Time:** 2 hours
**Priority:** High
**Dependencies:** 3.6

#### 6.2 Port day planner logic
- [x] Analyze existing day-planner.js
- [x] Identify core functionality
- [x] Port time slot calculation
- [x] Port task scheduling logic
- [x] Port conflict detection

**Estimated Time:** 4 hours
**Priority:** High
**Dependencies:** 6.1

#### 6.3 Create DayPlanner components
- [x] Create time slot grid
- [x] Create task slot component
- [x] Implement drag-and-drop for day planner
- [x] Style to match existing appearance

**Estimated Time:** 5 hours
**Priority:** High
**Dependencies:** 6.2

#### 6.4 Connect to API and stores
- [x] Load tasks for day planner
- [x] Handle task scheduling
- [x] Handle task updates
- [x] Update stores on changes

**Estimated Time:** 3 hours
**Priority:** High
**Dependencies:** 6.3

#### 6.5 Test Day Planner page
- [ ] Manual test: page loads
- [ ] Manual test: day view displays
- [ ] Manual test: tasks display
- [ ] Manual test: drag-and-drop works
- [ ] Manual test: scheduling works
- [ ] Fix any issues found

**Estimated Time:** 3 hours
**Priority:** High
**Dependencies:** 6.4

### Phase 7: Build and Deployment (Estimated: 1-2 days)

#### 7.1 Configure production build
- [ ] Set up Vite production build configuration
- [ ] Configure output directory for production
- [ ] Set up proper file names for output
- [ ] Configure asset handling

**Estimated Time:** 2 hours
**Priority:** High
**Dependencies:** 6.5

#### 7.2 Set up build output directory
- [ ] Configure Vite to output to root directory (for FastAPI static files)
- [ ] Or configure FastAPI to serve from dist/
- [ ] Ensure file names match original for compatibility
- [ ] Test static file serving

**Estimated Time:** 2 hours
**Priority:** High
**Dependencies:** 7.1

#### 7.3 Create build scripts
- [ ] Create npm script for production build
- [ ] Create script to copy dist/ to root or configure serving
- [ ] Document build process
- [ ] Test build on CI if applicable

**Estimated Time:** 2 hours
**Priority:** Medium
**Dependencies:** 7.2

#### 7.4 Test production build
- [ ] Run production build
- [ ] Start FastAPI server
- [ ] Test all pages in production mode
- [ ] Verify all functionality works
- [ ] Check console for errors
- [ ] Test on different browsers

**Estimated Time:** 3 hours
**Priority:** High
**Dependencies:** 7.3

#### 7.5 Clean up and finalize
- [ ] Remove any debug code
- [ ] Add comments to complex logic
- [ ] Update any documentation
- [ ] Create legacy/ backup of original files
- [ ] Final review of all changes

**Estimated Time:** 2 hours
**Priority:** Medium
**Dependencies:** 7.4

### Phase 8: Playwright Testing (Estimated: 3-5 days)

#### 8.1 Update Playwright configuration for Svelte
- [ ] Update `playwright.config.js` baseURL to Vite dev server port (5173)
- [ ] Update webServer command to start Vite dev server
- [ ] Create separate production test configuration
- [ ] Verify Playwright can start and connect to Vite server

**Estimated Time:** 2 hours
**Priority:** High
**Dependencies:** 7.1

#### 8.2 Refactor existing tests
- [ ] Review existing `tests/task-manager.spec.js`
- [ ] Update selectors to work with Svelte components
- [ ] Fix any timing issues with Svelte reactivity
- [ ] Update server startup to use Vite instead of Flask
- [ ] Ensure existing tests still pass

**Estimated Time:** 3 hours
**Priority:** High
**Dependencies:** 8.1

#### 8.3 Create test directory structure
- [ ] Create `tests/e2e/` directory
- [ ] Create `tests/components/` directory
- [ ] Create `tests/fixtures/` directory
- [ ] Create `tests/visual/` directory (optional)
- [ ] Create `tests/fixtures/page-objects/` directory

**Estimated Time:** 1 hour
**Priority:** High
**Dependencies:** 8.2

#### 8.4 Create Page Object models
- [ ] Create `IndexPage` class in `tests/fixtures/page-objects/IndexPage.js`
- [ ] Create `CalendarPage` class in `tests/fixtures/page-objects/CalendarPage.js`
- [ ] Create `DayPlannerPage` class in `tests/fixtures/page-objects/DayPlannerPage.js`
- [ ] Add common actions (load, addTask, filter, etc.) to each page object

**Estimated Time:** 4 hours
**Priority:** High
**Dependencies:** 8.3

#### 8.5 Create test data factories
- [ ] Create `tests/fixtures/test-data.js`
- [ ] Implement `createTestTask()` factory function
- [ ] Implement `createTestTasks()` for multiple tasks
- [ ] Add test data for different scenarios (empty, many tasks, etc.)
- [ ] Add pool-specific test data

**Estimated Time:** 2 hours
**Priority:** High
**Dependencies:** 8.3

#### 8.6 Create test utilities
- [ ] Create `tests/fixtures/test-utils.js`
- [ ] Add helper functions for common test operations
- [ ] Add wait utilities for Svelte reactivity
- [ ] Add assertion helpers
- [ ] Add mock data generators

**Estimated Time:** 2 hours
**Priority:** Medium
**Dependencies:** 8.5

#### 8.7 Write Index Page E2E tests
- [ ] Test page loads successfully
- [ ] Test tasks display in list
- [ ] Test add task flow
- [ ] Test edit task flow
- [ ] Test delete task flow
- [ ] Test start/stop task
- [ ] Test filtering by project
- [ ] Test filtering by tags
- [ ] Test filtering by context
- [ ] Test date filtering (today, planned/incomplete)
- [ ] Test context switching
- [ ] Test loading states
- [ ] Test error states
- [ ] Test empty state

**Estimated Time:** 5 hours
**Priority:** High
**Dependencies:** 8.4

#### 8.8 Write Calendar Page E2E tests
- [ ] Test page loads successfully
- [ ] Test calendar grid renders
- [ ] Test tasks display in calendar
- [ ] Test navigation (prev/next)
- [ ] Test view switching (week/day/month)
- [ ] Test unplanned tasks section
- [ ] Test drag from unplanned to calendar
- [ ] Test drag between calendar cells
- [ ] Test task details on hover
- [ ] Test pool filtering
- [ ] Test sort options

**Estimated Time:** 5 hours
**Priority:** High
**Dependencies:** 8.7

#### 8.9 Write Day Planner Page E2E tests
- [ ] Test page loads successfully
- [ ] Test day view displays correctly
- [ ] Test tasks display in time slots
- [ ] Test drag-and-drop scheduling
- [ ] Test conflict detection
- [ ] Test time slot display

**Estimated Time:** 4 hours
**Priority:** High
**Dependencies:** 8.8

#### 8.10 Write Component tests
- [ ] Test TaskCard renders correctly
- [ ] Test TaskCard action buttons work
- [ ] Test TaskEditor form validation
- [ ] Test TaskEditor save/cancel
- [ ] Test CalendarEvent rendering
- [ ] Test CalendarGrid time slots
- [ ] Test Notification display/dismiss
- [ ] Test Loading spinner

**Estimated Time:** 4 hours
**Priority:** Medium
**Dependencies:** 8.9

#### 8.11 Add Visual Regression tests (optional)
- [ ] Create `tests/visual/index.spec.js`
- [ ] Add screenshot test for index page
- [ ] Add screenshot test for calendar page
- [ ] Add screenshot test for day planner page
- [ ] Configure screenshot comparison thresholds
- [ ] Generate baseline screenshots

**Estimated Time:** 3 hours
**Priority:** Low
**Dependencies:** 8.10

#### 8.12 Set up CI testing
- [ ] Create `.github/workflows/test.yml`
- [ ] Configure to run on push to feature branches
- [ ] Configure to run on pull requests
- [ ] Set up Node.js and Python in CI
- [ ] Configure Playwright browser installation
- [ ] Set up artifact upload for test reports

**Estimated Time:** 2 hours
**Priority:** High
**Dependencies:** 8.11

#### 8.13 Run and validate all tests
- [ ] Run all existing tests
- [ ] Run all new tests
- [ ] Fix any failures
- [ ] Update tests for any edge cases found
- [ ] Validate test coverage
- [ ] Document any known test limitations

**Estimated Time:** 4 hours
**Priority:** High
**Dependencies:** 8.12

### Phase 9: Documentation and Handoff

#### 9.1 Update development documentation
- [ ] Update README.md with new setup instructions
- [ ] Document Vite development workflow
- [ ] Document build and deploy process
- [ ] Add Svelte resource links
- [ ] Document Playwright testing setup

**Estimated Time:** 2 hours
**Priority:** Low
**Dependencies:** 8.13

#### 9.2 Create migration guide
- [ ] Document key changes from vanilla JS to Svelte
- [ ] Note any behavioral differences
- [ ] Document component architecture
- [ ] Document state management approach
- [ ] Document testing approach

**Estimated Time:** 2 hours
**Priority:** Low
**Dependencies:** 9.1

## Total Estimated Time

- **Minimum:** 23 days (full-time equivalent)
- **Realistic:** 28-35 days (part-time)
- **With testing/debugging:** 35-45 days

## Success Criteria

- [ ] All existing pages (index, calendar, day-planner) work with identical functionality
- [ ] All task operations (CRUD, start/stop) work correctly
- [ ] All filtering options work correctly
- [ ] Context switching works correctly
- [ ] Calendar drag-and-drop works correctly
- [ ] Day planner works correctly
- [ ] All API endpoints are called correctly
- [ ] No console errors in production build
- [ ] Bundle size is reduced from current implementation
- [ ] Code is more maintainable (subjective review)
- [ ] Production build passes all manual tests
- [ ] All existing Playwright tests pass
- [ ] New Playwright tests added and passing
- [ ] Test coverage maintained or improved

## Rollback Plan

1. Original HTML and JS files are preserved in git history
2. Can revert the entire branch if needed
3. Create a `legacy/` directory with copies of original files as additional backup
4. Document rollback procedure: checkout previous branch/commit
5. FastAPI backend remains unchanged, so frontend can be swapped back

## Dependencies on Other Changes

- **Depends on:** `migrate-to-fastapi` - this change assumes FastAPI migration is complete
- **Blocked by:** None (backend API is stable)
- **Blocks:** `add-gantt-diagram` - future Gantt change will depend on this migration
