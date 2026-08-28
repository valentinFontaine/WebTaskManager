import React from 'react';
import ReactDOM from 'react-dom/client';
import DayPlannerPage from '../pages/DayPlanner.jsx';

// Import global CSS
import '../styles/global.css';
import '../styles/day-planner.css';

// Render the DayPlanner page
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<DayPlannerPage />);
