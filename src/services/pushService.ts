/**
 * Pushnotificaties: aanmelden en afmelden.
 *
 * Waarom dit er moet zijn: zonder meldingen moet een sporter zelf bedenken de app te openen, en
 * dat is precies waar trainingsapps hun gebruik verliezen. Een nieuw schema, een bericht van je
 * trainer en de herinnering aan je training zijn de drie momenten die er echt toe doen.
 *
 * Werkt op twee manieren, afhankelijk van waar de app draait:
 *  - In de echte app (iOS/Android via Capacitor): het toestel levert het token aan.
 *  - In de browser (PWA): Firebase Cloud Messaging via public/firebase-messaging-sw.js. Nodig:
 *    VITE_FIREBASE_VAPID_KEY in Vercel, en op een iPhone moet de app op het beginscherm staan.
 *
 * Het token wordt opgeslagen in `pushTokens`, met het document-id gelijk aan het token zelf.
 * Zo kan hetzelfde toestel niet twee keer in de lijst komen.
 */
import { Capacitor } from '@capacitor/core';
import { deleteDoc, doc, getDocs, query, serverTimestamp, setDoc, where, collection } from 'firebase/firestore';
import { auth, db, firebaseApp, firebaseConfig, isFirebaseConfigured } from '../firebase/config';
import { requireOrgId } from './orgContext';
import { apiUrl } from '../utils/apiOrigin';

const COLLECTION = 'pushTokens';

/** Onthoudt het laatst geregistreerde token, zodat we bij uitloggen weten wat we moeten opruimen. */
const STORAGE_KEY = 'liftlog.pushToken';

export type PushPlatform = 'ios' | 'android' | 'web';

function currentPlatform(): PushPlatform {
  const p = Capacitor.getPlatform();
  return p === 'ios' || p === 'android' ? p : 'web';
}

/** Slaat het token op bij deze gebruiker. Idempotent: hetzelfde token overschrijft zichzelf. */
async function storeToken(userId: string, token: string): Promise<void> {
  if (!isFirebaseConfigured() || !db) return;
  await setDoc(
    doc(db, COLLECTION, token),
    {
      token,
      userId,
      orgId: requireOrgId(),
      platform: currentPlatform(),
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    },
    { merge: true }
  );
  try {
    localStorage.setItem(STORAGE_KEY, token);
  } catch {
    /* privémodus: dan ruimen we bij uitloggen op via de query hieronder */
  }
}

/**
 * Uitkomst van aanmelden. Iets anders dan `ok` legt de kaart in gewone taal uit, want "werkt niet"
 * helpt niemand: op een iPhone moet de app bijvoorbeeld eerst op het beginscherm staan.
 */
export type PushEnableResult = 'ok' | 'denied' | 'unsupported' | 'ios-home-screen' | 'not-configured' | 'failed';

/** Uitkomst plus, bij `failed`, de technische foutcode: die maakt een volgend probleem snel vindbaar. */
export interface PushEnableOutcome {
  status: PushEnableResult;
  detail?: string;
}

/** Korte, leesbare foutcode uit een (Firebase-)fout, bijv. "installations/request-failed". */
function describeError(e: unknown): string {
  if (e && typeof e === 'object') {
    const code = (e as { code?: unknown }).code;
    const message = (e as { message?: unknown }).message;
    const parts = [typeof code === 'string' ? code : '', typeof message === 'string' ? message : ''].filter(Boolean);
    if (parts.length) return parts.join(' – ').slice(0, 200);
  }
  return String(e).slice(0, 200);
}

/** iPhone/iPad in Safari, maar niet vanaf het beginscherm geopend: daar laat Apple geen webpush toe. */
export function needsHomeScreenForPush(): boolean {
  if (Capacitor.isNativePlatform() || typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  const iOS = /iPhone|iPad|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
  if (!iOS) return false;
  const standalone =
    (typeof window !== 'undefined' && window.matchMedia?.('(display-mode: standalone)').matches) ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return !standalone;
}

/**
 * Vraagt toestemming en meldt dit toestel aan voor meldingen.
 */
export async function enablePush(userId: string): Promise<PushEnableOutcome> {
  if (Capacitor.isNativePlatform()) return { status: (await enableNativePush(userId)) ? 'ok' : 'denied' };
  return enableWebPush(userId);
}

async function enableNativePush(userId: string): Promise<boolean> {
  // Alleen laden in de echte app: in de browser bestaat de plugin niet.
  const { PushNotifications } = await import('@capacitor/push-notifications');

  let status = await PushNotifications.checkPermissions();
  if (status.receive === 'prompt' || status.receive === 'prompt-with-rationale') {
    status = await PushNotifications.requestPermissions();
  }
  if (status.receive !== 'granted') return false;

  const token = await new Promise<string | null>((resolve) => {
    const timer = setTimeout(() => resolve(null), 10000);
    void PushNotifications.addListener('registration', (t) => {
      clearTimeout(timer);
      resolve(t.value);
    });
    void PushNotifications.addListener('registrationError', () => {
      clearTimeout(timer);
      resolve(null);
    });
    void PushNotifications.register();
  });

  if (!token) return false;
  await storeToken(userId, token);
  return true;
}

/** Scope van de push-worker: los van de pagina's, zodat hij nooit de app zelf bedient of cachet. */
const PUSH_SW_SCOPE = '/firebase-cloud-messaging-push-scope';

/**
 * Registreert public/firebase-messaging-sw.js, met de Firebase-instellingen in de query-string
 * (een service worker kan de build-variabelen niet lezen). Deze worker toont meldingen als de app
 * dicht is; src/main.tsx laat hem daarom staan bij het opruimen van oude workers.
 */
async function registerPushWorker(): Promise<ServiceWorkerRegistration> {
  const cfg = firebaseConfig;
  const params = new URLSearchParams({
    apiKey: cfg?.apiKey ?? '',
    projectId: cfg?.projectId ?? '',
    messagingSenderId: cfg?.messagingSenderId ?? '',
    appId: cfg?.appId ?? '',
  });
  return navigator.serviceWorker.register(`/firebase-messaging-sw.js?${params}`, { scope: PUSH_SW_SCOPE });
}

async function enableWebPush(userId: string): Promise<PushEnableOutcome> {
  if (needsHomeScreenForPush()) return { status: 'ios-home-screen' };
  if (typeof Notification === 'undefined' || !('serviceWorker' in navigator)) return { status: 'unsupported' };
  const vapidKey = (import.meta.env?.VITE_FIREBASE_VAPID_KEY as string | undefined)?.trim();
  if (!vapidKey || !firebaseApp || !firebaseConfig?.messagingSenderId || !firebaseConfig.appId) return { status: 'not-configured' };

  const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  if (permission !== 'granted') return { status: 'denied' };

  try {
    const { getMessaging, getToken, isSupported } = await import('firebase/messaging');
    if (!(await isSupported())) return { status: 'unsupported' };
    const registration = await registerPushWorker();
    const token = await getToken(getMessaging(firebaseApp), { vapidKey, serviceWorkerRegistration: registration });
    if (!token) return { status: 'failed', detail: 'Geen token ontvangen van Firebase.' };
    await storeToken(userId, token);
    return { status: 'ok' };
  } catch (e) {
    // Niet als "niet ondersteund" verbergen: een geblokkeerde API-sleutel of een verkeerde
    // VAPID-sleutel ziet er dan precies zo uit als een oude browser.
    console.warn('[push] aanmelden mislukt', e);
    return { status: 'failed', detail: describeError(e) };
  }
}

/** Meldt dit toestel af. Ruimt ook oude tokens van deze gebruiker op die hier niet meer werken. */
export async function disablePush(userId: string): Promise<void> {
  if (!isFirebaseConfigured() || !db) return;
  let token: string | null = null;
  try {
    token = localStorage.getItem(STORAGE_KEY);
  } catch {
    /* niets */
  }
  if (token) {
    await deleteDoc(doc(db, COLLECTION, token)).catch(() => {});
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* niets */
    }
    return;
  }
  // Geen token onthouden: dan alles van deze gebruiker weghalen.
  const snap = await getDocs(query(collection(db, COLLECTION), where('userId', '==', userId)));
  await Promise.all(snap.docs.map((d) => deleteDoc(d.ref).catch(() => {})));
}

/** Staan meldingen aan op dit toestel? */
export async function isPushEnabled(): Promise<boolean> {
  if (Capacitor.isNativePlatform()) {
    const { PushNotifications } = await import('@capacitor/push-notifications');
    return (await PushNotifications.checkPermissions()).receive === 'granted';
  }
  if (typeof Notification === 'undefined') return false;
  if (Notification.permission !== 'granted') return false;
  try {
    return localStorage.getItem(STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}

/** Gebeurtenissen waarvoor een melding bestaat. De teksten staan op de server, niet hier. */
export type PushKind = 'message' | 'workout' | 'checkin';

/**
 * Stuurt een melding naar iemand anders (via de server, want dat vraagt de Admin SDK).
 *
 * Bewust zonder foutafhandeling naar buiten: een melding die niet aankomt mag nooit de actie
 * eromheen laten mislukken. Een bericht dat verstuurd is, is verstuurd.
 */
export async function notifyUser(kind: PushKind, recipientId: string, preview?: string): Promise<void> {
  try {
    const user = auth?.currentUser;
    if (!user) return;
    const token = await user.getIdToken();
    await fetch(apiUrl('/api/notify'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ kind, recipientId, preview }),
    });
  } catch {
    /* melding overslaan is niet erg; de actie zelf is al gelukt */
  }
}

/**
 * Meldingen terwijl de app open staat. Dan toont het toestel (web) er zelf geen, dus geven we
 * de tekst door aan de app, die hem als melding onderin laat zien. Geeft een opruimfunctie terug.
 */
export function onForegroundPush(handler: (title: string, body: string) => void): () => void {
  let stop: (() => void) | null = null;
  let cancelled = false;
  void (async () => {
    try {
      if (Capacitor.isNativePlatform()) {
        const { PushNotifications } = await import('@capacitor/push-notifications');
        const sub = await PushNotifications.addListener('pushNotificationReceived', (n) => handler(n.title ?? '', n.body ?? ''));
        stop = () => void sub.remove();
      } else {
        if (typeof Notification === 'undefined' || Notification.permission !== 'granted' || !firebaseApp) return;
        const { getMessaging, onMessage, isSupported } = await import('firebase/messaging');
        if (!(await isSupported())) return;
        stop = onMessage(getMessaging(firebaseApp), (payload) =>
          handler(payload.notification?.title ?? '', payload.notification?.body ?? '')
        );
      }
      if (cancelled) stop?.();
    } catch {
      /* geen meldingen op de voorgrond; de rest van de app werkt gewoon */
    }
  })();
  return () => {
    cancelled = true;
    stop?.();
  };
}
