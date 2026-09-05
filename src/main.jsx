import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

// Safely initialize Neutralino when tokens are ready
function initNeutralino() {
  if (typeof window === 'undefined' || !window.Neutralino) return;

  if (window.NL_TOKEN || sessionStorage.getItem('NL_TOKEN')) {
    try {
      window.Neutralino.init();
    } catch (err) {
      console.warn('Neutralino initialization failed:', err);
    }
  } else {
    let retries = 0;
    const interval = setInterval(() => {
      retries++;
      if (window.NL_TOKEN || sessionStorage.getItem('NL_TOKEN')) {
        clearInterval(interval);
        try {
          window.Neutralino.init();
        } catch (err) {
          console.warn('Neutralino initialization failed:', err);
        }
      } else if (retries > 25) {
        clearInterval(interval);
        try {
          window.Neutralino.init();
        } catch (err) {
          console.warn('Neutralino init timed out:', err);
        }
      }
    }, 50);
  }
}

initNeutralino();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
