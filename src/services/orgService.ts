/**
 * Studio's (organisaties). Collectie: `orgs`, document-id = orgId.
 *
 * Een studio is de grens waarbinnen alles zichtbaar is: profielen, schema's, logs, metingen.
 * Zie `orgContext.ts` voor de actieve studio en `firestore.rules` voor de afdwinging.
 */
import { doc, getDoc, setDoc, serverTimestamp, type Timestamp } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../firebase/config';
import type { Org } from '../types';

const COLLECTION = 'orgs';

function toOrg(data: Record<string, unknown>, id: string): Org {
  const ts = (v: unknown) =>
    v && typeof (v as Timestamp).toDate === 'function'
      ? (v as Timestamp).toDate().toISOString()
      : new Date().toISOString();
  return {
    id,
    name: typeof data.name === 'string' && data.name.trim() ? data.name.trim() : id,
    ownerId: typeof data.ownerId === 'string' ? data.ownerId : null,
    allowSelfSignup: data.allowSelfSignup === true,
    createdAt: ts(data.createdAt),
    updatedAt: ts(data.updatedAt),
  };
}

export async function getOrg(orgId: string): Promise<Org | null> {
  if (!isFirebaseConfigured() || !db || !orgId) return null;
  const snap = await getDoc(doc(db, COLLECTION, orgId));
  return snap.exists() ? toOrg(snap.data(), snap.id) : null;
}

/**
 * Maakt of werkt een studio bij. Alleen een beheerder mag dit (Firestore-regels);
 * nieuwe studio's worden in de praktijk aangemaakt met het migratie-/beheerscript.
 */
export async function saveOrg(
  orgId: string,
  data: { name: string; ownerId?: string | null; allowSelfSignup?: boolean }
): Promise<void> {
  if (!isFirebaseConfigured() || !db) throw new Error('Firebase niet geconfigureerd');
  const id = orgId.trim();
  if (!id) throw new Error('Studio-id ontbreekt');
  await setDoc(
    doc(db, COLLECTION, id),
    {
      name: data.name.trim(),
      ownerId: data.ownerId ?? null,
      allowSelfSignup: data.allowSelfSignup === true,
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    },
    { merge: true }
  );
}
