# Frontend Migration Design: Vanilla JS to Svelte

## Architecture Overview

The migration maintains the same overall architecture but upgrades the frontend layer from vanilla JavaScript to Svelte components:

```
TaskWarrior CLI (subprocess)
    ↓
FastAPI Backend (unchanged)
    ↓
API Endpoints (unchanged)
    ↓
Svelte Components (new) ←─► Static Files
    ↓
Browser
```

## Project Structure

### Current Structure
```
.
├── index.html
├── calendar-planner.html
├── day-planner.html
├── main.js
├── calendar-planner.js
├── day-planner.js
├── task-card.js
├── task-card-templates.html
├── task-editor.js
├── task-editor-templates.html
└── *.css files
```

### New Structure
```
.
├── public/                    # Static files served directly
│   └── (images, favicon, etc.)
│
├── src/
│   ├── pages/                # Page-level components
│   │   ├── Index.svelte      # Replaces index.html + main.js
│   │   ├── Calendar.svelte   # Replaces calendar-planner.html + calendar-planner.js
│   │   └── DayPlanner.svelte # Replaces day-planner.html + day-planner.js
│   │
│   ├── components/           # Reusable UI components
│   │   ├── TaskCard.svelte   # Replaces task-card.js + task-card-templates.html
│   │   ├── TaskEditor.svelte # Replaces task-editor.js + task-editor-templates.html
│   │   ├── TaskFilter.svelte
│   │   ├── Header.svelte
│   │   └── ...
│   │
│   ├── stores/               # Svelte stores for shared state
│   │   ├── tasks.js          # Task data and operations
│   │   ├── projects.js       # Project data
│   │   ├── filters.js        # Filter state
│   │   └── ui.js             # UI state (loading, notifications)
│   │
│   ├── lib/                  # Utility functions
│   │   ├── api.js            # API client (fetch wrappers)
│   │   ├── dateUtils.js      # Date formatting and manipulation
│   │   └── taskUtils.js      # Task-related helper functions
│   │
│   ├── App.svelte            # Root component for each page
│   └── main.js              # Entry point for Vite
│
├── vite.config.js            # Vite configuration
├── package.json
├── index.html                # Entry HTML for Vite (mount point)
├── calendar.html             # Entry HTML for calendar page
└── day-planner.html          # Entry HTML for day planner page
```

### Output Structure (after build)
```
.
├── dist/
│   ├── assets/               # Compiled JS, CSS, and assets
│   ├── index.html
│   ├── calendar-planner.html
│   └── day-planner.html
└── (all other backend files unchanged)
```

## Component Mapping

### Existing Classes → Svelte Components

| Current Class/Module | New Svelte Component | Location |
|---------------------|---------------------|----------|
| TaskWarriorUI (main.js) | Index.svelte + stores | src/pages/Index.svelte, src/stores/ |
| TaskCardManager + task-card.js | TaskCard.svelte | src/components/TaskCard.svelte |
| TaskEditor (task-editor.js) | TaskEditor.svelte | src/components/TaskEditor.svelte |
| Calendar logic (calendar-planner.js) | Calendar.svelte | src/pages/Calendar.svelte |
| Day planner logic (day-planner.js) | DayPlanner.svelte | src/pages/DayPlanner.svelte |

### Shared State Migration

Current state is stored in class instance properties:
```javascript
// Current: in TaskWarriorUI class
this.tasks = [];
this.currentFilters = { project: null, tags: [] };
this.currentContext = '';
this.projects = new Set();
```

New state management using Svelte stores:
```javascript
// src/stores/tasks.js
import { writable } from 'svelte/store';

export const tasks = writable([]);
export const projects = writable(new Set());

// src/stores/filters.js
import { writable } from 'svelte/store';

export const currentFilters = writable({ project: null, tags: [] });
export const currentContext = writable('');
```

## Calendar Replacement Strategy

Current: Using Toast UI Calendar library loaded from CDN in calendar-planner.html

**Decision: Replace with custom Svelte calendar or lightweight library**

Options:
1. **Custom Svelte calendar** (Recommended)
   - Build using Svelte's native capabilities
   - Full control over appearance and behavior
   - Perfect integration with Svelte state
   - No external dependencies
   - Can be built incrementally

2. **svelte-fullcalendar** wrapper
   - Wrapper around FullCalendar library
   - Proven calendar functionality
   - Some dependency overhead

3. **svelte-calendar**
   - Lightweight Svelte calendar library
   - Simple API
   - May need customization for drag-and-drop

**Recommendation: Option 1 - Custom Svelte calendar**

Rationale:
- We already have custom task card rendering and logic
- Drag-and-drop can be implemented with Svelte's event system
- Full control over task rendering in calendar cells
- No external dependencies to manage
- Better integration with our existing Task model
- Future Gantt will also benefit from custom SVG/rendering experience

### Custom Calendar Component Structure

```
src/components/Calendar/
├── Calendar.svelte          # Main calendar container
├── CalendarWeek.svelte      # Week view
├── CalendarDay.svelte       # Day view  
├── CalendarMonth.svelte     # Month view
├── CalendarHeader.svelte    # Navigation controls
├── CalendarGrid.svelte      # Time grid
├── CalendarEvent.svelte     # Individual task/event
└── calendarUtils.js         # Date calculations, slot generation
```

## API Client

Create a centralized API client to replace direct fetch calls:

```javascript
// src/lib/api.js
const BASE_URL = ''; // Same origin as FastAPI

export async function fetchTasks() {
    const response = await fetch('/api/tasks');
    const data = await response.json();
    if (data.success) {
        return data.tasks;
    }
    throw new Error(data.error || 'Failed to fetch tasks');
}

export async function fetchProjects() {
    const response = await fetch('/api/projects');
    const data = await response.json();
    if (data.success) {
        return data.projects;
    }
    throw new Error(data.error || 'Failed to fetch projects');
}

export async function modifyTask(taskId, updates) {
    const response = await fetch(`/api/task/${taskId}/modify`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
    });
    return await response.json();
}

// ... other endpoints
```

This provides:
- Consistent error handling
- Single place to change API URLs if needed
- Type-safe request/response handling (can add TypeScript later)
- Easy to mock for testing

## Build Configuration

### Vite Configuration

```javascript
// vite.config.js
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
    plugins: [svelte()],
    build: {
        // Output to dist directory
        outDir: 'dist',
        // Generate separate bundles for each page
        rollupOptions: {
            input: {
                index: './index.html',
                calendar: './calendar.html',
                dayPlanner: './day-planner.html'
            },
            output: {
                // Keep file names matching original for compatibility
                entryFileNames: 'assets/[name].js',
                chunkFileNames: 'assets/[name]-[hash].js',
                assetFileNames: 'assets/[name]-[hash].[ext]'
            }
        }
    },
    server: {
        // Proxy API requests to backend during development
        proxy: {
            '/api': {
                target: 'http://localhost:8000',
                changeOrigin: true
            }
        }
    }
});
```

### Multiple Entry Points

Each page has its own entry HTML file:

**index.html:**
```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>TaskWarrior Web UI</title>
</head>
<body>
    <div id="svelte-app"></div>
    <script type="module" src="/src/pages/Index.svelte"></script>
</body>
</html>
```

**calendar-planner.html:**
```html
<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Planificateur Calendrier</title>
</head>
<body>
    <div id="svelte-app"></div>
    <script type="module" src="/src/pages/Calendar.svelte"></script>
</body>
</html>
```

**day-planner.html:**
```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Day Planner</title>
</head>
<body>
    <div id="svelte-app"></div>
    <script type="module" src="/src/pages/DayPlanner.svelte"></script>
</body>
</html>
```

## Styling Strategy

### Option 1: CSS Modules (Recommended)
- Convert existing CSS to module files
- Each component gets its own `.module.css`
- Scoped styles prevent conflicts

```
src/components/TaskCard/
├── TaskCard.svelte
└── TaskCard.module.css
```

### Option 2: CSS-in-JS (Svelte native)
- Use Svelte's `<style>` tags in components
- Automatically scoped to component
- No build-time CSS processing needed

```svelte
<script>
  // component logic
</script>

<div class="task-card">
  <!-- content -->
</div>

<style>
  .task-card {
    /* styles here are scoped */
  }
</style>
```

### Option 3: Global CSS with BEM
- Keep existing CSS approach
- Use BEM naming conventions
- Import global styles in each entry point

**Recommendation: Option 2 (CSS-in-JS)** for most components, with global CSS for shared styles like variables, mixins, and utility classes.

## Migration Strategy

### Phase 1: Setup and Infrastructure (1-2 days)
1. Create package.json with Svelte and Vite dependencies
2. Set up Vite configuration for multi-page app
3. Create basic project structure (src/, public/)
4. Configure build scripts
5. Set up development server with proxy to FastAPI
6. Verify basic Svelte page renders

### Phase 2: Shared Utilities and Stores (2-3 days)
1. Create API client (src/lib/api.js)
2. Create Svelte stores for shared state (tasks, projects, filters)
3. Port utility functions from existing code
4. Create basic type definitions (can use JSDoc)

### Phase 3: Shared Components (3-5 days)
1. Create TaskCard.svelte from task-card.js
2. Create TaskEditor.svelte from task-editor.js
3. Create Header.svelte and other shared UI elements
4. Create TaskFilter.svelte from filter logic

### Phase 4: Main Index Page (3-5 days)
1. Create Index.svelte replacing index.html + main.js
2. Port TaskWarriorUI class logic to Svelte reactivity
3. Connect to stores and API client
4. Test all functionality (task listing, filtering, adding, editing)

### Phase 5: Calendar Page (5-7 days)
1. Create Calendar.svelte replacing calendar-planner.html + calendar-planner.js
2. Build custom Svelte calendar component
3. Implement drag-and-drop functionality
4. Connect to TaskCard component
5. Test all calendar-specific features

### Phase 6: Day Planner Page (3-5 days)
1. Create DayPlanner.svelte replacing day-planner.html + day-planner.js
2. Port existing day planner logic
3. Connect to shared components
4. Test all functionality

### Phase 7: Build and Deployment (1-2 days)
1. Configure production build
2. Set up build output to correct directory
3. Test production build locally
4. Create deployment scripts
5. Document build process

## Risk Assessment

### Low Risk
- Static HTML to Svelte component conversion
- CSS migration (styles remain the same)
- API client creation (wraps existing fetch calls)
- Basic reactivity (Svelte handles automatically)

### Medium Risk
- Calendar drag-and-drop implementation (custom vs library)
- TaskEditor modal behavior (complex state management)
- Filter logic porting (ensure same behavior)
- Build configuration for multi-page app

### High Risk
- Data reactivity edge cases (ensuring UI updates correctly)
- Task dependency rendering in calendar (complex logic)
- Performance with large task lists (Svelte is efficient but need to verify)

### Mitigation Strategies
- **For medium/high risk items**: Create proof-of-concept before full migration
- **For calendar**: Start with read-only calendar, then add drag-and-drop
- **For TaskEditor**: Keep existing modal structure, just reimplement in Svelte
- **For filtering**: Write comprehensive tests for filter logic

## Testing Strategy

### Manual Testing Checklist
- [ ] All pages load without errors
- [ ] Task list displays correctly
- [ ] Task creation works
- [ ] Task editing works
- [ ] Task deletion works
- [ ] Task start/stop works
- [ ] Filtering by project works
- [ ] Filtering by tags works
- [ ] Filtering by context works
- [ ] Filtering by date works
- [ ] Calendar view displays tasks correctly
- [ ] Calendar navigation works
- [ ] Day planner view works
- [ ] All existing UI elements are present and functional

### Automated Testing with Playwright

**Existing Infrastructure:**
- Playwright is already configured in the project (`playwright.config.js`)
- Existing test file: `tests/task-manager.spec.js` with 3 test cases
- Current config uses Flask server (`python3 app.py` on port 5000)
- HTML reporter configured

**Testing Strategy for Svelte Migration:**

#### 1. Test Environment Setup
The existing Playwright configuration needs minor updates to work with Svelte:

```javascript
// playwright.config.js updates needed:
module.exports = defineConfig({
  testDir: './tests',
  // Update baseURL to match new dev server
  baseURL: 'http://localhost:5173', // Vite default port
  
  webServer: {
    // Start Vite dev server instead of Flask
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
  },
  
  // Keep existing projects and settings
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
```

For production testing (built files with FastAPI):
```javascript
// Separate config or mode for production testing
webServer: {
  command: 'python3 app_fastapi.py', // or whatever starts FastAPI
  url: 'http://localhost:8000',
  reuseExistingServer: !process.env.CI,
}
```

#### 2. Test Organization

```
tests/
├── e2e/                      # End-to-end tests
│   ├── index.spec.js         # Tests for main index page
│   ├── calendar.spec.js      # Tests for calendar page
│   └── day-planner.spec.js   # Tests for day planner page
│
├── components/               # Component-level tests
│   ├── task-card.spec.js     # Tests for TaskCard component
│   ├── task-editor.spec.js   # Tests for TaskEditor component
│   └── calendar.spec.js       # Tests for Calendar components
│
├── fixtures/                 # Test fixtures and helpers
│   ├── test-data.js          # Sample task data for tests
│   ├── mock-api.js           # API mocking utilities
│   └── test-utils.js         # Common test utilities
│
├── setup/                   # Test setup files
│   └── global-setup.js       # Global test setup (server start, etc.)
│
└── task-manager.spec.js      # Existing tests (to be refactored)
```

#### 3. Test Types and Coverage

| Test Type | Scope | Tools | Example Tests |
|-----------|-------|-------|---------------|
| **E2E Tests** | Full user journeys | Playwright | Task creation flow, filtering, calendar drag-and-drop |
| **Page Tests** | Individual page functionality | Playwright | Index page loads tasks, calendar renders correctly |
| **Component Tests** | Isolated component behavior | Playwright | TaskCard displays data, TaskEditor form validation |
| **Visual Tests** | Visual regression | Playwright screenshots | Screenshot comparison for critical pages |
| **API Integration Tests** | Frontend ↔ Backend | Playwright | Verify API calls return correct data |

#### 4. Test Implementation Patterns

**Page Object Pattern for Svelte:**
```javascript
// tests/fixtures/page-objects/IndexPage.js
export class IndexPage {
  constructor(page) {
    this.page = page;
    this.addTaskButton = page.locator('#add-task-btn');
    this.taskCards = page.locator('.task-card');
    this.filterInput = page.locator('#filter-project');
    this.contextButtons = page.locator('.context-option');
  }
  
  async load() {
    await this.page.goto('/');
    await this.page.waitForLoadState('networkidle');
  }
  
  async addTask(description, project) {
    await this.addTaskButton.click();
    await this.page.fill('#task-description', description);
    if (project) {
      await this.page.fill('#task-project', project);
    }
    await this.page.click('button[type="submit"]');
    await this.page.waitForTimeout(500); // Wait for save
  }
  
  async getTaskCount() {
    return await this.taskCards.count();
  }
}
```

**Test Example:**
```javascript
// tests/e2e/index.spec.js
import { test, expect } from '@playwright/test';
import { IndexPage } from '../fixtures/page-objects/IndexPage';

test.describe('Index Page', () => {
  test('should load and display tasks', async ({ page }) => {
    const indexPage = new IndexPage(page);
    await indexPage.load();
    
    await expect(page).toHaveTitle('TaskWarrior Web UI');
    await expect(indexPage.taskCards).toHaveCountGreaterThan(0);
  });
  
  test('should add a new task', async ({ page }) => {
    const indexPage = new IndexPage(page);
    await indexPage.load();
    
    const initialCount = await indexPage.getTaskCount();
    await indexPage.addTask('Test task', 'TestProject');
    
    expect(await indexPage.getTaskCount()).toBe(initialCount + 1);
  });
});
```

#### 5. Component Testing Approach

For testing Svelte components in isolation:

**Option A: Mount components directly** (using `@playwright/experimental-ct-svelte`)
```javascript
import { test, expect } from '@playwright/experimental-ct-svelte';
import TaskCard from '../../src/components/TaskCard.svelte';

test('TaskCard renders correctly', async ({ mount }) => {
  const task = { uuid: '1', description: 'Test', project: 'Proj', status: 'pending' };
  const component = await mount(TaskCard, { props: { task } });
  
  await expect(component).toContainText('Test');
  await expect(component).toContainText('Proj');
});
```

**Option B: Test through page interaction** (more realistic)
- Render full page in Playwright
- Use data-testid attributes for stable selectors
- Test component behavior as user would experience it

**Recommendation: Use Option B** for now, as it:
- Tests the actual rendered output
- Includes CSS and styling
- Tests integration with parent components
- More closely matches user experience

#### 6. Testing for Svelte-Specific Features

**Testing Reactivity:**
```javascript
test('TaskCard updates when task data changes', async ({ page }) => {
  // Load page with task
  await page.goto('/');
  
  // Modify task via API or direct state change
  await page.evaluate(() => {
    // Trigger state change that should update UI
    window.updateTaskStatus('task-uuid', 'completed');
  });
  
  // Verify UI updated
  await expect(page.locator('.task-card.completed')).toBeVisible();
});
```

**Testing Stores:**
```javascript
test('Filters update across components', async ({ page }) => {
  await page.goto('/');
  
  // Set filter in one component
  await page.fill('#filter-project', 'MyProject');
  
  // Verify other components update
  const taskCards = await page.$$('.task-card');
  for (const card of taskCards) {
    const project = await card.$eval('.project-badge', el => el.textContent);
    expect(project).toContain('MyProject');
  }
});
```

#### 7. Test Data Management

**Test Data Factory:**
```javascript
// tests/fixtures/test-data.js
export function createTestTask(overrides = {}) {
  return {
    uuid: `test-${Date.now()}`,
    description: `Test task ${Date.now()}`,
    project: 'TestProject',
    status: 'pending',
    tags: ['test'],
    due: null,
    scheduled: null,
    urgency: 10,
    ...overrides
  };
}

export function createTestTasks(count) {
  return Array.from({ length: count }, (_, i) => 
    createTestTask({ description: `Task ${i + 1}` })
  );
}
```

**Mock API for Testing:**
```javascript
// tests/fixtures/mock-api.js
export function mockFetchTasks(tasks) {
  return async (url) => {
    if (url === '/api/tasks') {
      return {
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true, tasks })
      };
    }
    throw new Error(`Unexpected URL: ${url}`);
  };
}
```

#### 8. Test Suites by Page

**Index Page Tests (`tests/e2e/index.spec.js`):**
- Page loads successfully
- Tasks display in list
- Task filtering works (project, tags, context, date)
- Add task modal opens and submits
- Edit task modal opens with correct data
- Delete task removes from list
- Start/stop task updates status
- Context switching filters tasks
- Loading states display correctly
- Error messages display correctly
- Empty state displays when no tasks

**Calendar Page Tests (`tests/e2e/calendar.spec.js`):**
- Page loads successfully
- Calendar grid renders correctly
- Tasks display in calendar at correct positions
- Navigation (prev/next) works
- View switching (week/day/month) works
- Unplanned tasks section displays
- Drag from unplanned to calendar works
- Drag between calendar cells works
- Task details show on hover
- Pool filtering works
- Sort options work

**Day Planner Page Tests (`tests/e2e/day-planner.spec.js`):**
- Page loads successfully
- Day view displays correctly
- Tasks display in time slots
- Drag-and-drop scheduling works
- Conflict detection works
- Time slot display is correct

**Component Tests:**
- TaskCard renders all task fields
- TaskCard action buttons work
- TaskEditor form validation works
- TaskEditor saves and cancels correctly
- CalendarEvent drag-and-drop works
- CalendarGrid renders time slots correctly
- Notification displays and dismisses
- Loading spinner displays and hides

#### 9. Visual Regression Testing

Add visual regression testing to catch unintended UI changes:

```javascript
// tests/visual/index.spec.js
import { test, expect } from '@playwright/test';

test.describe('Visual Regression', () => {
  test('Index page visual regression', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    
    // Take screenshot and compare to baseline
    expect(await page.screenshot()).toMatchSnapshot('index-page.png', {
      threshold: 0.2, // Allow 20% pixel difference
    });
  });
});
```

Configure in `playwright.config.js`:
```javascript
module.exports = defineConfig({
  // ...
  use: {
    // ...
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
});
```

#### 10. CI/CD Integration

**.github/workflows/test.yml:**
```yaml
name: Playwright Tests

on:
  push:
    branches: [ master, feat/* ]
  pull_request:
    branches: [ master ]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v4
    
    - name: Set up Python
      uses: actions/setup-python@v4
      with:
        python-version: '3.12'
    
    - name: Install Python dependencies
      run: |
        python -m venv venv
        source venv/bin/activate
        pip install -r requirements.txt
    
    - name: Set up Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '20'
    
    - name: Install Node dependencies
      run: |
        npm ci
        npx playwright install --with-deps
    
    - name: Run Playwright tests
      run: npx playwright test
    
    - name: Upload test results
      if: always()
      uses: actions/upload-artifact@v3
      with:
        name: playwright-report
        path: playwright-report/
```

#### 11. Test Execution Strategy

**During Development:**
```bash
# Run all tests
npm test

# Run with UI mode (great for debugging)
npm run test:ui

# Run specific test file
npx playwright test tests/e2e/index.spec.js

# Run specific test
npx playwright test tests/e2e/index.spec.js -g "should add a new task"

# Run in headed mode for debugging
npm run test:headed
```

**Before Commit:**
- Run all tests locally
- Fix any failures
- Update snapshots if visual changes are intentional

**In CI:**
- Run all tests on push to feature branches
- Run all tests on pull requests
- Only merge if all tests pass

#### 12. Test Maintenance

- **Update tests when functionality changes** - tests should be living documentation
- **Add tests for new features** - every new component gets tests
- **Refactor tests when code structure changes** - keep tests maintainable
- **Review test coverage regularly** - identify and fill gaps
- **Update snapshots when UI changes intentionally** - use `npx playwright test --update-snapshots`

## Rollback Plan

1. Keep original HTML and JS files until migration is complete
2. Maintain git history - can revert any commit
3. Have a `legacy/` directory with original files as backup
4. Document migration steps for easy reversal
5. Test rollback procedure before deploying to production
