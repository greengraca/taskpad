import React from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import './styles.css';

const updateSW = registerSW({
  onRegisteredSW(_swUrl, registration) {
    if (registration) {
      setInterval(() => registration.update(), 60 * 1000);
    }
  },
  onNeedRefresh() {
    fetch('/version.json?t=' + Date.now())
      .then(r => r.json())
      .then(data => {
        window.dispatchEvent(new CustomEvent('sw-update-available', { detail: { version: data.version } }));
      })
      .catch(() => {
        window.dispatchEvent(new CustomEvent('sw-update-available', { detail: {} }));
      });
  },
  onOfflineReady() {},
});

window.__swUpdate = () => {
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });
  updateSW(true);
};

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
