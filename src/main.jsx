import React from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import './styles.css';

const updateSW = registerSW({
  onNeedRefresh() {
    window.dispatchEvent(new CustomEvent('sw-update-available'));
  },
  onOfflineReady() {},
});

window.__swUpdate = () => updateSW(true);

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
