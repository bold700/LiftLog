import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { initLiveUpdates } from './native/liveUpdate'

// Zorg ervoor dat de document title correct is
if (typeof document !== 'undefined') {
  document.title = 'Van As Personal Training Logs';
}

// Service Worker handling - unregister alle oude service workers en clear cache
// Dit voorkomt dat oude versies worden geladen
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  // Wacht tot DOM volledig geladen is
  window.addEventListener('load', () => {
    // Unregister alle service workers, behalve die voor pushmeldingen (public/firebase-messaging-sw.js):
    // die cachet niets, en zonder hem komen er in de webapp geen meldingen binnen.
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      registrations.forEach((registration) => {
        const script = (registration.active ?? registration.waiting ?? registration.installing)?.scriptURL ?? '';
        if (script.includes('/firebase-messaging-sw.js')) return;
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

// iPhone/Android-app: nieuwe web-versies ophalen zonder App Store (doet niets in de browser).
void initLiveUpdates().catch((e) => console.warn('[live update]', e));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

