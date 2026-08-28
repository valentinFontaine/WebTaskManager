import React from 'react';
import ReactDOM from 'react-dom/client';
import IndexPage from '../pages/Index.jsx';

// Import global CSS
import '../styles/global.css';
import '../styles/main.css';

// Render the Index page
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<IndexPage />);
