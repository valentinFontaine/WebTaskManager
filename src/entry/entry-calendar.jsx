import React from 'react';
import ReactDOM from 'react-dom/client';
import CalendarPage from '../pages/Calendar.jsx';

// Import global CSS
import '../styles/global.css';
import '../styles/calendar.css';

// Render the Calendar page
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<CalendarPage />);
