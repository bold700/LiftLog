/**
 * Pushnotificaties: aanmelden en afmelden.
 *
 * Waarom dit er moet zijn: zonder meldingen moet een sporter zelf bedenken de app te openen, en
 * dat is precies waar trainingsapps hun gebruik verliezen. Een nieuw schema, een bericht van je
 * trainer en de herinnering aan je training zijn de drie momenten die er echt toe doen.
 *
 * Werkt op twee manieren, afhankelijk van waar de app draait:
 *  - In de echte app (iOS/Android via Capacitor): het toestel levert het token aan.
 *  - In de browser (PWA): Firebase Cloud Messaging via een service worker.
 *
 * Het token wordt opgeslagen in `pushTokens`, met het document-id gelijk aan het token zelf.
 * Zo kan hetzelfde toestel niet twee keer in de lijst komen.
 */
import { Capacitor } from '@capacitor/core';
import { deleteDoc, doc, getDocs, query, serverTimestamp, setDoc, where, collection } from 'firebase/firestore';
import { auth, db, isFirebaseConfigured } from '../firebase/config';
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
 * Vraagt toestemming en meldt dit toestel aan voor meldingen.
 * Geeft `false` terug als de gebruiker weigert of als meldingen hier niet kunnen.
 */
export async function enablePush(userId: string): Promise<boolean> {
  if (Capacitor.isNativePlatform()) return enableNativePush(userId);
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

async function enableWebPush(userId: string): Promise<boolean> {
  const vapidKey = (import.meta.env?.VITE_FIREBASE_VAPID_KEY as string | undefined)?.trim();
  if (!vapidKey) return false;
  if (typeof Notification === 'undefined' || !('serviceWorker' in navigator)) return false;

  const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  if (permission !== 'granted') return false;

  try {
    const { getMessaging, getToken, isSupported } = await import('firebase/messaging');
    if (!(await isSupported())) return false;
    const registration = await navigator.serviceWorker.ready;
    const token = await getToken(getMessaging(), { vapidKey, serviceWorkerRegistration: registration });
    if (!token) return false;
    await storeToken(userId, token);
    return true;
  } catch {
    return false;
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
