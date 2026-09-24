/**
 * Kalenderfeed (.ics) als abonneerbare agenda in Google Agenda, Outlook of Apple Agenda.
 * Twee soorten, zelfde opzet: 'sporter' geeft de lessen waar je voor geboekt staat (PT,
 * groepslessen, SGT, kickbox), 'trainer' geeft de lessen die je zelf geeft (op je naam staan als
 * trainer). De sleutel zelf wordt nooit opgeslagen in Firestore: alleen de SHA-256-hash als
 * document-id in `calendarFeedTokens`, met de userId en het soort. De server (api/booking.mjs)
 * herkent het lid aan de hash wanneer de agenda-app de URL zelf ophaalt — inloggen kan die niet.
 */
import { collection, deleteDoc, doc, getDocs, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../firebase/config';
import { apiOrigin } from '../utils/apiOrigin';

export type CalendarFeedKind = 'sporter' | 'trainer';

const COLLECTION = 'calendarFeedTokens';
const LOCAL_URL_KEY: Record<CalendarFeedKind, string> = {
  sporter: 'liftlog_calendar_feed_url',
  trainer: 'liftlog_calendar_feed_url_trainer',
};

function randomKey(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  // base64url zonder padding: veilig in een URL.
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Publieke basis-URL van de backend (webversie: eigen origin; native app: VITE_APP_API_ORIGIN). */
function publicOrigin(): string {
  const explicit = apiOrigin();
  if (explicit) return explicit;
  return typeof window !== 'undefined' ? window.location.origin : '';
}

export function calendarFeedUrlForKey(key: string): string {
  return `${publicOrigin()}/kalender/${key}`;
}

/**
 * Verwijdert eerdere feed-sleutels van dit lid van hetzelfde soort, zodat oude links na
 * "vernieuwen" niet blijven werken. Een token zonder `kind` (van vóór dit onderscheid bestond)
 * telt als 'sporter'.
 */
async function revokeAllForUser(userId: string, kind: CalendarFeedKind): Promise<void> {
  if (!isFirebaseConfigured() || !db) return;
  const snap = await getDocs(query(collection(db, COLLECTION), where('userId', '==', userId)));
  const toDelete = snap.docs.filter((d) => ((d.data().kind as CalendarFeedKind | undefined) ?? 'sporter') === kind);
  await Promise.all(toDelete.map((d) => deleteDoc(d.ref)));
}

/** Maakt een nieuwe kalender-URL aan (en trekt oudere van hetzelfde soort in). Toon 'm meteen; hij is niet terug te halen. */
export async function createCalendarFeedUrl(userId: string, kind: CalendarFeedKind = 'sporter'): Promise<string> {
  if (!isFirebaseConfigured() || !db) throw new Error('Firebase niet geconfigureerd');
  await revokeAllForUser(userId, kind);
  const key = randomKey();
  const id = await sha256Hex(key);
  await setDoc(doc(db, COLLECTION, id), { userId, kind, createdAt: serverTimestamp() });
  const url = calendarFeedUrlForKey(key);
  try {
    localStorage.setItem(LOCAL_URL_KEY[kind], url);
  } catch {
    /* geen localStorage */
  }
  return url;
}

/** De op dit apparaat eerder aangemaakte URL (zodat je hem opnieuw kunt kopiëren zonder te vernieuwen). */
export function getCachedCalendarFeedUrl(kind: CalendarFeedKind = 'sporter'): string | null {
  try {
    return localStorage.getItem(LOCAL_URL_KEY[kind]);
  } catch {
    return null;
  }
}
