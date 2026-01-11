import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// Zorg ervoor dat de document title correct is
if (typeof document !== 'undefined') {
  document.title = 'Van As Personal Training Logs';
}

// Service Worker handling - unregister alle oude service workers en clear cache
// Dit voorkomt dat oude versies worden geladen
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  // Wacht tot DOM volledig geladen is
  window.addEventListener('load', () => {
    // Unregister alle service workers
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      registrations.forEach((registration) => {
        registration.unregister().then((success) => {
          console.log('Service worker unregistered:', success);
        });
      });
    });
    
    // Clear alle caches
    if ('caches' in window) {
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            console.log('Clearing cache:', cacheName);
            return caches.delete(cacheName);
          })
        );
      }).then(() => {
        console.log('All caches cleared');
      });
    }
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

