# Frontend Migration Design: Vanilla JS to React

## Architecture Overview

The migration maintains the same overall architecture but upgrades the frontend layer from vanilla JavaScript to React components:

```
TaskWarrior CLI (subprocess)
    ↓
FastAPI Backend (unchanged)
    ↓
API Endpoints (unchanged)
    ↓
React Components (new) ←─► Static Files
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
│   │   ├── Index.jsx         # Replaces index.html + main.js
│   │   ├── Calendar.jsx      # Replaces calendar-planner.html + calendar-planner.js
│   │   └── DayPlanner.jsx    # Replaces day-planner.html + day-planner.js
│   │
│   ├── components/           # Reusable UI components
│   │   ├── TaskCard.jsx      # Replaces task-card.js + task-card-templates.html
│   │   ├── TaskEditor.jsx    # Replaces task-editor.js + task-editor-templates.html
│   │   ├── TaskFilter.jsx
│   │   ├── Header.jsx
│   │   └── ...
│   │
│   ├── contexts/             # React Context for shared state
│   │   ├── TasksContext.jsx  # Task data and operations
│   │   ├── ProjectsContext.jsx
│   │   ├── FiltersContext.jsx
│   │   └── UIContext.jsx     # UI state (loading, notifications)
│   │
│   ├── hooks/                # Custom React hooks
│   │   ├── useTasks.js       # Hook for task operations
│   │   ├── useProjects.js
│   │   └── useFilters.js
│   │
│   ├── lib/                  # Utility functions
│   │   ├── api.js            # API client (fetch wrappers)
│   │   ├── dateUtils.js      # Date formatting and manipulation
│   │   └── taskUtils.js      # Task-related helper functions
│   │
│   ├── styles/               # CSS files (can keep existing or module-based)
│   │   ├── global.css
│   │   ├── components.css
│   │   └── ...
│   │
│   └── entry/                # Entry points for each page
│       ├── entry-index.js
│       ├── entry-calendar.js
│       └── entry-dayplanner.js
│
├── vite.config.js            # Vite configuration with React plugin
├── package.json
├── index.html                # Entry HTML for Vite (mount point)
├── calendar-planner.html     # Entry HTML for calendar page
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

### Existing Classes/Modules → React Components

| Current Class/Module | New React Component | Location |
|---------------------|---------------------|----------|
| TaskWarriorUI (main.js) | Index.jsx + contexts | src/pages/Index.jsx, src/contexts/ |
| TaskCardManager + task-card.js | TaskCard.jsx | src/components/TaskCard.jsx |
| TaskEditor (task-editor.js) | TaskEditor.jsx | src/components/TaskEditor.jsx |
| Calendar logic (calendar-planner.js) | Calendar.jsx | src/pages/Calendar.jsx |
| Day planner logic (day-planner.js) | DayPlanner.jsx | src/pages/DayPlanner.jsx |

### State Management Strategy

**From Svelte Stores to React Context:**

- Svelte writable stores → React Context with useReducer or useState
- Svelte derived stores → useMemo computed values
- Store subscriptions → useContext hooks

Example migration:
```javascript
// Svelte (stores/tasks.js)
import { writable } from 'svelte/store';
export const tasks = writable([]);

// React (contexts/TasksContext.jsx)
import { createContext, useState, useContext } from 'react';
const TasksContext = createContext();
export function TasksProvider({ children }) {
  const [tasks, setTasks] = useState([]);
  return (
    <TasksContext.Provider value={{ tasks, setTasks }}>
      {children}
    </TasksContext.Provider>
  );
}
export function useTasks() { return useContext(TasksContext); }
```

## Technology Stack

### Dependencies
```json
{
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.2.1",
    "vite": "^5.0.0"
  }
}
```

### Calendar Library
Replace TUI Calendar with one of:
- `react-big-calendar` - Popular, feature-rich calendar
- `react-calendar` - Simpler, more customizable
- Custom implementation using CSS Grid

**Recommendation**: Start with `react-big-calendar` for calendar-planner and day-planner pages, as it supports both month and day views.

## Migration Phases

### Phase 1: Setup & Infrastructure
- Create new project structure
- Install React dependencies
- Configure Vite with React plugin
- Set up base entry points
- Configure shared state contexts

### Phase 2: Core Components
- Migrate TaskCard component
- Migrate TaskEditor component
- Migrate TaskFilter component
- Migrate Header component

### Phase 3: Page Components
- Migrate Index page
- Migrate Calendar page
- Migrate DayPlanner page

### Phase 4: Calendar Replacement
- Evaluate and select calendar library
- Migrate calendar-specific logic
- Implement drag-and-drop for tasks
- Test calendar views

### Phase 5: Testing & Polish
- Update Playwright tests
- Fix any remaining issues
- Performance optimization
- Code cleanup

## Data Flow

```
API Response → Context/State → Components → Render
     ↑
     └── User Actions → Event Handlers → API Calls
```

## Component Communication

- **Props**: Parent to child data passing
- **Context**: Cross-component state sharing (tasks, filters, projects, UI)
- **Custom Hooks**: Shared logic encapsulation (useTasks, useFilters, etc.)
- **Events**: Native DOM events for user interactions

## File Naming Conventions

- Components: PascalCase (`TaskCard.jsx`, `TaskEditor.jsx`)
- Hooks: `use` prefix (`useTasks.js`, `useProjects.js`)
- Contexts: PascalCase (`TasksContext.jsx`, `UIContext.jsx`)
- Utils: camelCase (`api.js`, `dateUtils.js`)
- CSS: kebab-case (`task-card.css`, `calendar-view.css`)

## Styling Approach

Options (choose one):
1. **Keep existing CSS**: Continue using current CSS files with className props
2. **CSS Modules**: Scoped CSS with `.module.css` files
3. **Styled Components**: CSS-in-JS library
4. **Tailwind CSS**: Utility-first CSS framework

**Recommendation**: Keep existing CSS initially for faster migration, then refactor to CSS Modules in a future change.
