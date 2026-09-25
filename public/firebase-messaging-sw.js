/* eslint-disable no-undef */
/**
 * Service worker alleen voor pushmeldingen in de webapp (PWA / browser).
 *
 * Bewust klein: geen fetch-handler en geen cache. Zo kan deze worker nooit een oude versie van de
 * app laten zien (de reden dat src/main.tsx andere service workers opruimt). Hij doet twee dingen:
 * meldingen tonen als de app dicht is, en bij een tik op de melding de app openen.
 *
 * De Firebase-instellingen komen via de query-string mee (src/services/pushService.ts): een
 * service worker kan de build-variabelen van de app niet lezen. Het zijn publieke waarden.
 */

// Eerst onze eigen klik-afhandeling, vóór Firebase de zijne registreert: open of focus de app.
self.addEventListener('notificationclick', (event) => {
  event.stopImmediatePropagation();
  event.notification.close();
  const target = new URL('/', self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const open = windows.find((w) => new URL(w.url).origin === self.location.origin);
      if (open) {
        await open.focus();
        return;
      }
      await self.clients.openWindow(target);
    })()
  );
});

// Nieuwe versie van deze worker meteen actief maken.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

importScripts('https://www.gstatic.com/firebasejs/12.10.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.10.0/firebase-messaging-compat.js');

const params = new URL(self.location.href).searchParams;
const config = {
  apiKey: params.get('apiKey') || undefined,
  projectId: params.get('projectId') || undefined,
  messagingSenderId: params.get('messagingSenderId') || undefined,
  appId: params.get('appId') || undefined,
};

if (config.apiKey && config.projectId && config.messagingSenderId && config.appId) {
  firebase.initializeApp(config);
  // Meldingen met een `notification`-blok (zoals api/notify.mjs ze stuurt) toont Firebase zelf
  // wanneer de app op de achtergrond staat; hier hoeft verder niets.
  firebase.messaging();
}
