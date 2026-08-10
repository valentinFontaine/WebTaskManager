# React Build System Specification

## ADDED Requirements

### Requirement: Vite with React plugin
The system SHALL use Vite with @vitejs/plugin-react as the build toolchain.

#### Scenario: Vite configuration exists
- **WHEN** examining the project structure
- **THEN** a vite.config.js file SHALL exist in the project root

#### Scenario: React plugin is configured
- **WHEN** examining vite.config.js
- **THEN** it SHALL import and use @vitejs/plugin-react

### Requirement: Package dependencies
The system SHALL have the required React and build dependencies in package.json.

#### Scenario: React dependencies present
- **WHEN** examining package.json
- **THEN** it SHALL include react and react-dom as dependencies

#### Scenario: Vite and plugin dependencies present
- **WHEN** examining package.json
- **THEN** it SHALL include vite and @vitejs/plugin-react as devDependencies

#### Scenario: Package.json scripts defined
- **WHEN** examining package.json
- **THEN** it SHALL define scripts for dev, build, and preview

### Requirement: Multi-page build configuration
The system SHALL support building multiple entry points for different pages.

#### Scenario: Index page entry point
- **WHEN** examining vite.config.js
- **THEN** it SHALL configure an entry point for index.html

#### Scenario: Calendar page entry point
- **WHEN** examining vite.config.js
- **THEN** it SHALL configure an entry point for calendar-planner.html

#### Scenario: DayPlanner page entry point
- **WHEN** examining vite.config.js
- **THEN** it SHALL configure an entry point for day-planner.html

### Requirement: Output directory structure
The system SHALL output built files to the dist/ directory with the correct structure.

#### Scenario: Build outputs to dist
- **WHEN** running npm run build
- **THEN** compiled files SHALL be output to the dist/ directory

#### Scenario: Asset files in dist/assets
- **WHEN** build completes
- **THEN** JavaScript and CSS files SHALL be placed in dist/assets/

#### Scenario: HTML files in dist root
- **WHEN** build completes
- **THEN** index.html, calendar-planner.html, and day-planner.html SHALL be in dist/ root

### Requirement: Build output file naming
The system SHALL use consistent file naming for built assets.

#### Scenario: Entry file naming
- **WHEN** examining vite.config.js rollupOptions
- **THEN** entryFileNames SHALL be configured as 'assets/[name].js'

#### Scenario: Chunk file naming
- **WHEN** examining vite.config.js rollupOptions
- **THEN** chunkFileNames SHALL be configured as 'assets/[name]-[hash].js'

#### Scenario: Asset file naming
- **WHEN** examining vite.config.js rollupOptions
- **THEN** assetFileNames SHALL be configured as 'assets/[name]-[hash].[ext]'

### Requirement: Development server with proxy
The system SHALL have a development server that proxies API requests to the FastAPI backend.

#### Scenario: Proxy configuration exists
- **WHEN** examining vite.config.js
- **THEN** it SHALL have a server.proxy configuration

#### Scenario: API proxy to backend
- **WHEN** examining proxy configuration
- **THEN** requests to /api SHALL be proxied to http://localhost:8000

#### Scenario: Dev server runs on port 5173
- **WHEN** running npm run dev
- **THEN** the development server SHALL start on port 5173

### Requirement: Production build compatibility
The system SHALL produce a production build that works with the FastAPI backend.

#### Scenario: Production build connects to backend
- **WHEN** running the production build with FastAPI server
- **THEN** API requests SHALL be made to the correct backend endpoints

#### Scenario: Static files served by FastAPI
- **WHEN** running the production build with FastAPI server
- **THEN** FastAPI SHALL serve static files from the dist/ directory

### Requirement: Environment-aware configuration
The system SHALL have configuration that adapts to development and production environments.

#### Scenario: Development mode configuration
- **WHEN** running in development mode (npm run dev)
- **THEN** the system SHALL use the dev server with proxy

#### Scenario: Production mode configuration
- **WHEN** building for production (npm run build)
- **THEN** the system SHALL produce optimized, minified files

### Requirement: React fast refresh
The system SHALL support React Fast Refresh for hot module replacement during development.

#### Scenario: Fast Refresh enabled
- **WHEN** examining vite.config.js
- **THEN** React Fast Refresh SHALL be enabled via the plugin configuration

#### Scenario: Hot reload works
- **WHEN** making changes to React components during development
- **THEN** the changes SHALL be reflected in the browser without full page reload

### Requirement: CSS handling
The system SHALL handle CSS files correctly in both development and production.

#### Scenario: CSS imports work
- **WHEN** a component imports a CSS file
- **THEN** the styles SHALL be applied correctly

#### Scenario: Global CSS included
- **WHEN** examining the entry points
- **THEN** global CSS files SHALL be imported at the appropriate level

### Requirement: Source directory structure
The system SHALL have a source directory with the correct structure.

#### Scenario: src directory exists
- **WHEN** examining the project structure
- **THEN** a src/ directory SHALL exist

#### Scenario: Pages subdirectory exists
- **WHEN** examining the project structure
- **THEN** a src/pages/ directory SHALL exist containing page components

#### Scenario: Components subdirectory exists
- **WHEN** examining the project structure
- **THEN** a src/components/ directory SHALL exist containing reusable components

#### Scenario: Contexts subdirectory exists
- **WHEN** examining the project structure
- **THEN** a src/contexts/ directory SHALL exist containing React contexts

#### Scenario: Hooks subdirectory exists
- **WHEN** examining the project structure
- **THEN** a src/hooks/ directory SHALL exist containing custom hooks

#### Scenario: Lib subdirectory exists
- **WHEN** examining the project structure
- **THEN** a src/lib/ directory SHALL exist containing utility functions

#### Scenario: Styles subdirectory exists
- **WHEN** examining the project structure
- **THEN** a src/styles/ directory SHALL exist containing CSS files

#### Scenario: Entry subdirectory exists
- **WHEN** examining the project structure
- **THEN** a src/entry/ directory SHALL exist containing entry point files for each page
