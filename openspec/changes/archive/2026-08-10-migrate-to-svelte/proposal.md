# Migrate Frontend to Svelte Framework

## Summary

Migrate the TaskWarrior Web UI frontend from vanilla JavaScript to Svelte framework. This migration will modernize the codebase, improve maintainability, reduce bundle size, and establish a foundation for future features like the interactive Gantt diagram while preserving all existing functionality.

## Problem

The current frontend uses vanilla JavaScript with manual DOM manipulation, which presents several challenges:

- **Maintenance difficulty**: Manual DOM updates and event listener management are error-prone and hard to maintain
- **No component system**: Reusable UI elements (TaskCard, TaskEditor) are implemented as classes with manual DOM manipulation rather than true components
- **Scalability issues**: Adding complex interactive features (like Gantt) will be increasingly difficult with the current approach
- **No reactivity**: State changes require manual re-rendering of DOM elements
- **Separate concerns poorly**: HTML, CSS, and JavaScript are split across multiple files making changes harder to track
- **Large bundle size**: Current approach loads all JavaScript even when not needed
- **Multi-page complexity**: Managing shared state across index.html, calendar-planner.html, and day-planner.html is awkward

## Solution

Adopt Svelte as the frontend framework. Svelte offers:

- **True reactivity**: Automatic UI updates when state changes - no virtual DOM overhead
- **Component-based architecture**: Encapsulated, reusable components with their own state and logic
- **Tiny bundle size**: Compiles to efficient vanilla JavaScript (~4KB runtime vs 35-40KB for React/Vue)
- **Gradual migration**: Can migrate one page at a time without disrupting existing functionality
- **Natural multi-page support**: Unlike React/Vue which push toward SPAs, Svelte naturally supports multi-page apps
- **Easy learning curve**: Syntax is closest to vanilla JS of all modern frameworks
- **Built-in state management**: Stores provide simple, effective state sharing across components
- **First-class SVG support**: Perfect for building custom visualizations like Gantt charts
- **No build complexity**: Simple Vite-based toolchain

## Impact

- **Frontend**: Complete rewrite of HTML and JS files as Svelte components
- **Backend**: No changes required - FastAPI endpoints remain identical
- **Dependencies**: Add Svelte, Vite, and related dev dependencies
- **Build process**: Add build step to compile Svelte components to JavaScript
- **File structure**: Reorganize frontend into component-based structure
- **TUI Calendar**: Will be replaced with a more integrated solution (Svelte-native or custom)
- **Testing**: Update existing Playwright tests and add comprehensive test coverage for all migrated components

## Non-Goals

- Do not modify backend (FastAPI) code or API contracts
- Do not add Gantt functionality in this change (future change)
- Do not convert to a Single Page Application (SPA) - maintain current multi-page structure
- Do not change existing visual design or user experience
- Do not add new features beyond what currently exists
- Keep the migration scope focused on technology upgrade, not feature addition
- Maintain and enhance existing Playwright test suite throughout migration

## Success Criteria

- All existing pages (index, calendar-planner, day-planner) work with identical functionality
- All task operations (view, add, edit, delete, start, stop, filter) work correctly
- Frontend connects to existing FastAPI endpoints without modification
- Bundle size is reduced compared to current implementation
- Code is more maintainable and easier to extend
- TUI Calendar is replaced with a Svelte-compatible alternative
- All existing Playwright tests pass
- New Playwright tests added for migrated functionality
- Test coverage maintained or improved
