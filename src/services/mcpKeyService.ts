/**
 * Koppelsleutels voor AI-chats (ChatGPT, Claude, Gemini) via de LiftLog MCP-server.
 * De sleutel zelf wordt nooit opgeslagen in Firestore: alleen de SHA-256-hash als document-id
 * in `mcpKeys`, met de userId. De server herkent de gebruiker aan de hash.
 */
import { collection, deleteDoc, doc, getDocs, query, serverTimestamp, setDoc, where, type Timestamp } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../firebase/config';
import { apiOrigin } from '../utils/apiOrigin';

const COLLECTION = 'mcpKeys';
const LOCAL_URL_KEY = 'liftlog_mcp_url';

export interface McpKeyInfo {
  id: string;
  label: string;
  createdAt: string | null;
  lastUsedAt: string | null;
}

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

export function mcpUrlForKey(key: string): string {
  return `${publicOrigin()}/api/mcp/${key}`;
}

/** Maakt een nieuwe sleutel aan en geeft de koppel-URL terug. Toon die één keer; hij is niet terug te halen. */
export async function createMcpKey(userId: string, label = 'AI-chat'): Promise<{ id: string; url: string }> {
  if (!isFirebaseConfigured() || !db) throw new Error('Firebase niet geconfigureerd');
  const key = randomKey();
  const id = await sha256Hex(key);
  await setDoc(doc(db, COLLECTION, id), { userId, label, createdAt: serverTimestamp() });
  const url = mcpUrlForKey(key);
  try {
    localStorage.setItem(LOCAL_URL_KEY, JSON.stringify({ id, url }));
  } catch {
    /* geen localStorage */
  }
  return { id, url };
}

export async function listMcpKeys(userId: string): Promise<McpKeyInfo[]> {
  if (!isFirebaseConfigured() || !db) return [];
  const snap = await getDocs(query(collection(db, COLLECTION), where('userId', '==', userId)));
  const ts = (v: unknown) => (v && typeof (v as Timestamp).toDate === 'function' ? (v as Timestamp).toDate().toISOString() : null);
  return snap.docs
    .map((d) => ({ id: d.id, label: String(d.data().label ?? 'AI-chat'), createdAt: ts(d.data().createdAt), lastUsedAt: ts(d.data().lastUsedAt) }))
    .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
}

export async function revokeMcpKey(id: string): Promise<void> {
  if (!isFirebaseConfigured() || !db) return;
  await deleteDoc(doc(db, COLLECTION, id));
  const cached = getCachedMcpUrl();
  if (cached?.id === id) {
    try {
      localStorage.removeItem(LOCAL_URL_KEY);
    } catch {
      /* negeren */
    }
  }
}

/** De op dit apparaat eerder aangemaakte URL (zodat je hem opnieuw kunt kopiëren). */
export function getCachedMcpUrl(): { id: string; url: string } | null {
  try {
    const raw = localStorage.getItem(LOCAL_URL_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed.id === 'string' && typeof parsed.url === 'string' ? parsed : null;
  } catch {
    return null;
  }
}
