import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './theme/globals.css';
// Configure Monaco editor workers and languages (side-effect import)
import './components/editor/monacoLoader';

// Initialize theme before render to avoid a flash of the wrong theme.
try {
  const saved = localStorage.getItem('smartspace-theme');
  const theme = saved === 'light' || saved === 'dark' ? saved : 'dark';
  document.documentElement.setAttribute('data-theme', theme);
} catch {
  document.documentElement.setAttribute('data-theme', 'dark');
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
