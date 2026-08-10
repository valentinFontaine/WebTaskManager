# Migrate Frontend to React Framework

## Why

The previous attempt to migrate from vanilla JavaScript to Svelte 5 failed due to compiler bugs that prevented any page from loading successfully. Svelte 5's compiler generated broken code (undefined variables, missing function references) that could not be resolved. The model was not comfortable with the Svelte framework, making it difficult to complete the migration.

React is a more mature, widely-adopted framework with better tooling support and extensive documentation. It offers:
- Strong community support and ecosystem
- Mature compiler and build tools
- Better compatibility with existing patterns
- Easier debugging and error messages
- More resources available for troubleshooting

## What Changes

- Replace vanilla JavaScript frontend with React components
- Add React, React DOM, and @vitejs/plugin-react dependencies
- Convert existing JS classes to React functional components
- Replace Svelte stores with React Context API for shared state
- Update build configuration from Svelte to React
- Maintain multi-page architecture (not SPA)
- Replace TUI Calendar with React-compatible alternative

## Capabilities

### New Capabilities
- `react-frontend`: React-based frontend components replacing vanilla JS
- `react-state-management`: React Context API for shared state across pages
- `react-build-system`: Vite + React plugin build configuration

### Modified Capabilities
<!-- No existing specs to modify -->

## Impact

- **Frontend**: Complete rewrite of HTML and JS files as React components
- **Backend**: No changes required - FastAPI endpoints remain identical
- **Dependencies**: Replace Svelte with React and related dev dependencies
- **Build process**: Update Vite config for React instead of Svelte
- **File structure**: Reorganize frontend into React component-based structure
- **TUI Calendar**: Will be replaced with React-compatible calendar library
- **Testing**: Update Playwright tests for React component behavior
