# Migration Tasks: Vanilla JS to Svelte

## Task List

### Phase 1: Project Setup and Infrastructure (Estimated: 1-2 days)

#### 1.1 Create package.json with dependencies
- [ ] Initialize npm project: `npm init -y`
- [ ] Add Svelte: `npm install svelte`
- [ ] Add Vite: `npm install vite @sveltejs/vite-plugin-svelte --save-dev`
- [ ] Add other dev dependencies as needed
- [ ] Configure npm scripts for dev and build

**Estimated Time:** 1 hour
**Priority:** High
**Dependencies:** None

#### 1.2 Create project directory structure
- [ ] Create `src/` directory
- [ ] Create `src/pages/` directory
- [ ] Create `src/components/` directory
- [ ] Create `src/stores/` directory
- [ ] Create `src/lib/` directory
- [ ] Create `public/` directory for static assets

**Estimated Time:** 30 minutes
**Priority:** High
**Dependencies:** 1.1

#### 1.3 Configure Vite for multi-page app
- [ ] Create `vite.config.js` with multi-page configuration
- [ ] Configure entry points for index, calendar, day-planner
- [ ] Set up output directory (dist/)
- [ ] Configure development server proxy to FastAPI
- [ ] Configure build rollup options

**Estimated Time:** 2 hours
**Priority:** High
**Dependencies:** 1.2

#### 1.4 Create entry HTML files
- [ ] Create `index.html` with Svelte mount point
- [ ] Create `calendar.html` with Svelte mount point
- [ ] Create `day-planner.html` with Svelte mount point
- [ ] Copy existing CSS links to entry files
- [ ] Copy existing meta tags and titles

**Estimated Time:** 1 hour
**Priority:** High
**Dependencies:** 1.3

#### 1.5 Set up development environment
- [ ] Verify Vite dev server starts correctly
- [ ] Test basic Svelte component renders
- [ ] Verify proxy to FastAPI backend works
- [ ] Document development workflow

**Estimated Time:** 2 hours
**Priority:** High
**Dependencies:** 1.4

### Phase 2: Shared Utilities and Stores (Estimated: 2-3 days)

#### 2.1 Create API client
- [ ] Create `src/lib/api.js`
- [ ] Implement `fetchTasks()` function
- [ ] Implement `fetchProjects()` function
- [ ] Implement `addTask()` function
- [ ] Implement `modifyTask()` function
- [ ] Implement `deleteTask()` function
- [ ] Implement `startTask()` function
- [ ] Implement `stopTask()` function
- [ ] Implement `completeTask()` function
- [ ] Add error handling for all API calls

**Estimated Time:** 3 hours
**Priority:** High
**Dependencies:** 1.5

#### 2.2 Create Svelte stores for shared state
- [ ] Create `src/stores/tasks.js` with tasks store
- [ ] Create `src/stores/projects.js` with projects store
- [ ] Create `src/stores/filters.js` with filter state
- [ ] Create `src/stores/ui.js` with loading/error state
- [ ] Create `src/stores/context.js` with context state
- [ ] Add subscription utilities if needed

**Estimated Time:** 3 hours
**Priority:** High
**Dependencies:** 2.1

#### 2.3 Port utility functions
- [ ] Identify reusable utility functions in current code
- [ ] Create `src/lib/dateUtils.js` for date formatting
- [ ] Create `src/lib/taskUtils.js` for task-related helpers
- [ ] Create `src/lib/validation.js` for input validation
- [ ] Create `src/lib/constants.js` for shared constants

**Estimated Time:** 2 hours
**Priority:** Medium
**Dependencies:** 2.2

#### 2.4 Create global CSS
- [ ] Create `src/global.css` with CSS variables
- [ ] Port existing global styles
- [ ] Create utility classes
- [ ] Set up CSS reset/normalize

**Estimated Time:** 2 hours
**Priority:** Medium
**Dependencies:** 2.2

### Phase 3: Shared Components (Estimated: 3-5 days)

#### 3.1 Create TaskCard component
- [ ] Create `src/components/TaskCard.svelte`
- [ ] Port task card rendering from `task-card.js`
- [ ] Port task card templates from `task-card-templates.html`
- [ ] Add task action buttons (start, stop, edit, delete)
- [ ] Add task status indicators
- [ ] Add task priority/due date display
- [ ] Style component to match existing appearance
- [ ] Add hover and active states

**Estimated Time:** 4 hours
**Priority:** High
**Dependencies:** 2.4

#### 3.2 Create TaskEditor component
- [ ] Create `src/components/TaskEditor.svelte`
- [ ] Port modal logic from `task-editor.js`
- [ ] Port form fields from `task-editor-templates.html`
- [ ] Implement form validation
- [ ] Add save/cancel handlers
- [ ] Style modal to match existing appearance
- [ ] Add animation for modal open/close

**Estimated Time:** 5 hours
**Priority:** High
**Dependencies:** 2.4

#### 3.3 Create Header component
- [ ] Create `src/components/Header.svelte`
- [ ] Port header HTML from index.html
- [ ] Port context selector logic
- [ ] Add navigation buttons
- [ ] Add add task button
- [ ] Add refresh button
- [ ] Style to match existing header

**Estimated Time:** 3 hours
**Priority:** High
**Dependencies:** 2.4

#### 3.4 Create Filter components
- [ ] Create `src/components/TaskFilter.svelte`
- [ ] Port filter section from index.html
- [ ] Port filter logic from main.js
- [ ] Create individual filter input components
- [ ] Add filter toggle buttons
- [ ] Add apply/clear filter buttons

**Estimated Time:** 3 hours
**Priority:** High
**Dependencies:** 2.4

#### 3.5 Create Notification component
- [ ] Create `src/components/Notification.svelte`
- [ ] Port notification logic from main.js
- [ ] Style notification toast
- [ ] Add animation for show/hide
- [ ] Connect to UI store

**Estimated Time:** 2 hours
**Priority:** Medium
**Dependencies:** 2.4

#### 3.6 Create Loading component
- [ ] Create `src/components/Loading.svelte`
- [ ] Port loading indicator from main.js
- [ ] Style loading spinner
- [ ] Connect to UI store

**Estimated Time:** 1 hour
**Priority:** Medium
**Dependencies:** 2.4

### Phase 4: Main Index Page (Estimated: 3-5 days)

#### 4.1 Create Index page skeleton
- [ ] Create `src/pages/Index.svelte`
- [ ] Set up page layout structure
- [ ] Import and place Header component
- [ ] Import and place TaskFilter component
- [ ] Import and place Notification component
- [ ] Create tasks container

**Estimated Time:** 2 hours
**Priority:** High
**Dependencies:** 3.6

#### 4.2 Implement task loading
- [ ] Connect to API client for task fetching
- [ ] Update tasks store on page load
- [ ] Handle loading state
- [ ] Handle error state
- [ ] Implement auto-refresh if needed

**Estimated Time:** 3 hours
**Priority:** High
**Dependencies:** 4.1

#### 4.3 Implement task rendering
- [ ] Subscribe to tasks store
- [ ] Filter tasks based on current filters
- [ ] Render TaskCard components for each task
- [ ] Handle empty state
- [ ] Implement task sorting

**Estimated Time:** 3 hours
**Priority:** High
**Dependencies:** 4.2

#### 4.4 Implement filter functionality
- [ ] Connect filter inputs to filters store
- [ ] Implement filter application logic
- [ ] Port filter functions from main.js
- [ ] Test all filter combinations
- [ ] Handle filter clearing

**Estimated Time:** 4 hours
**Priority:** High
**Dependencies:** 4.3

#### 4.5 Implement context switching
- [ ] Connect context buttons to context store
- [ ] Update task filtering based on context
- [ ] Update UI to show active context
- [ ] Update project suggestions based on context

**Estimated Time:** 3 hours
**Priority:** High
**Dependencies:** 4.4

#### 4.6 Implement task actions
- [ ] Connect TaskCard action buttons
- [ ] Implement start task flow
- [ ] Implement stop task flow
- [ ] Implement delete task flow (with confirmation)
- [ ] Show notifications for action results

**Estimated Time:** 3 hours
**Priority:** High
**Dependencies:** 4.5

#### 4.7 Implement add task flow
- [ ] Connect add task button to TaskEditor
- [ ] Initialize TaskEditor for new task
- [ ] Handle task creation
- [ ] Add new task to tasks store
- [ ] Show notification on success
- [ ] Handle errors

**Estimated Time:** 3 hours
**Priority:** High
**Dependencies:** 4.5

#### 4.8 Implement edit task flow
- [ ] Connect edit action to TaskEditor
- [ ] Pass task data to TaskEditor
- [ ] Initialize TaskEditor for editing
- [ ] Handle task update
- [ ] Update task in tasks store
- [ ] Show notification on success
- [ ] Handle errors

**Estimated Time:** 3 hours
**Priority:** High
**Dependencies:** 4.7

#### 4.9 Test Index page
- [ ] Manual test: page loads
- [ ] Manual test: tasks display
- [ ] Manual test: filters work
- [ ] Manual test: context switching works
- [ ] Manual test: add task works
- [ ] Manual test: edit task works
- [ ] Manual test: delete task works
- [ ] Manual test: start/stop task works
- [ ] Manual test: notifications appear
- [ ] Fix any issues found

**Estimated Time:** 4 hours
**Priority:** High
**Dependencies:** 4.8

### Phase 5: Calendar Page (Estimated: 5-7 days)

#### 5.1 Create Calendar page skeleton
- [ ] Create `src/pages/Calendar.svelte`
- [ ] Set up page layout (calendar column + tasks column)
- [ ] Import and place Header component
- [ ] Create calendar container
- [ ] Create unplanned tasks container

**Estimated Time:** 2 hours
**Priority:** High
**Dependencies:** 3.6

#### 5.2 Create calendar utility functions
- [ ] Create `src/components/Calendar/calendarUtils.js`
- [ ] Implement date range calculations
- [ ] Implement time slot generation
- [ ] Implement week/day/month view helpers
- [ ] Port any existing calendar helper functions

**Estimated Time:** 4 hours
**Priority:** High
**Dependencies:** 5.1

#### 5.3 Create CalendarHeader component
- [ ] Create `src/components/Calendar/CalendarHeader.svelte`
- [ ] Add navigation buttons (prev/next)
- [ ] Add view toggle buttons (week/day/month)
- [ ] Add calendar title
- [ ] Implement view switching
- [ ] Implement date navigation

**Estimated Time:** 3 hours
**Priority:** High
**Dependencies:** 5.2

#### 5.4 Create CalendarGrid component
- [ ] Create `src/components/Calendar/CalendarGrid.svelte`
- [ ] Implement time grid rendering
- [ ] Add hour markers
- [ ] Add day column headers
- [ ] Handle week/day view layouts
- [ ] Style grid to match existing

**Estimated Time:** 4 hours
**Priority:** High
**Dependencies:** 5.3

#### 5.5 Create CalendarEvent component
- [ ] Create `src/components/Calendar/CalendarEvent.svelte`
- [ ] Render task in calendar cell
- [ ] Show task time and duration
- [ ] Style based on task properties
- [ ] Add drag handle
- [ ] Show task details on hover

**Estimated Time:** 3 hours
**Priority:** High
**Dependencies:** 5.4

#### 5.6 Create Calendar main component
- [ ] Create `src/components/Calendar/Calendar.svelte`
- [ ] Integrate CalendarHeader
- [ ] Integrate CalendarGrid
- [ ] Render CalendarEvent components for planned tasks
- [ ] Handle view state
- [ ] Handle date navigation

**Estimated Time:** 4 hours
**Priority:** High
**Dependencies:** 5.5

#### 5.7 Implement drag-and-drop
- [ ] Add drag start handler to CalendarEvent
- [ ] Add drag over handler to CalendarGrid cells
- [ ] Add drop handler to CalendarGrid cells
- [ ] Implement drag preview
- [ ] Calculate new scheduled time from drop position
- [ ] Call API to update task
- [ ] Update local state on success

**Estimated Time:** 5 hours
**Priority:** High
**Dependencies:** 5.6

#### 5.8 Implement unplanned tasks section
- [ ] Create unplanned tasks container
- [ ] Render TaskCard components for unplanned tasks
- [ ] Implement drag start from unplanned tasks
- [ ] Style unplanned tasks section
- [ ] Add pool filtering
- [ ] Add sort options

**Estimated Time:** 4 hours
**Priority:** High
**Dependencies:** 5.6

#### 5.9 Connect to API
- [ ] Load planned tasks on page load
- [ ] Load unplanned tasks on page load
- [ ] Handle task scheduling via drag-and-drop
- [ ] Handle task updates
- [ ] Handle errors

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
- [ ] Create `src/pages/DayPlanner.svelte`
- [ ] Set up page layout
- [ ] Import and place Header component
- [ ] Create day planner container

**Estimated Time:** 2 hours
**Priority:** High
**Dependencies:** 3.6

#### 6.2 Port day planner logic
- [ ] Analyze existing day-planner.js
- [ ] Identify core functionality
- [ ] Port time slot calculation
- [ ] Port task scheduling logic
- [ ] Port conflict detection

**Estimated Time:** 4 hours
**Priority:** High
**Dependencies:** 6.1

#### 6.3 Create DayPlanner components
- [ ] Create time slot grid
- [ ] Create task slot component
- [ ] Implement drag-and-drop for day planner
- [ ] Style to match existing appearance

**Estimated Time:** 5 hours
**Priority:** High
**Dependencies:** 6.2

#### 6.4 Connect to API and stores
- [ ] Load tasks for day planner
- [ ] Handle task scheduling
- [ ] Handle task updates
- [ ] Update stores on changes

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

### Phase 8: Documentation and Handoff

#### 8.1 Update development documentation
- [ ] Update README.md with new setup instructions
- [ ] Document Vite development workflow
- [ ] Document build and deploy process
- [ ] Add Svelte resource links

**Estimated Time:** 2 hours
**Priority:** Low
**Dependencies:** 7.5

#### 8.2 Create migration guide
- [ ] Document key changes from vanilla JS to Svelte
- [ ] Note any behavioral differences
- [ ] Document component architecture
- [ ] Document state management approach

**Estimated Time:** 2 hours
**Priority:** Low
**Dependencies:** 8.1

## Total Estimated Time

- **Minimum:** 20 days (full-time equivalent)
- **Realistic:** 25-30 days (part-time)
- **With testing/debugging:** 30-40 days

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
