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

### Automated Testing (Optional, future)
- Consider adding Playwright tests (already in project)
- Test critical user journeys
- Regression testing for existing functionality

## Rollback Plan

1. Keep original HTML and JS files until migration is complete
2. Maintain git history - can revert any commit
3. Have a `legacy/` directory with original files as backup
4. Document migration steps for easy reversal
5. Test rollback procedure before deploying to production
