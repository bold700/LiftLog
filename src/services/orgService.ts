/**
 * Studio's (organisaties). Collectie: `orgs`, document-id = orgId.
 *
 * Een studio is de grens waarbinnen alles zichtbaar is: profielen, schema's, logs, metingen.
 * Zie `orgContext.ts` voor de actieve studio en `firestore.rules` voor de afdwinging.
 */
import { doc, getDoc, setDoc, serverTimestamp, type Timestamp } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../firebase/config';
import type { Org, OrgBranding } from '../types';

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
    branding: toBranding(data.branding),
    createdAt: ts(data.createdAt),
    updatedAt: ts(data.updatedAt),
  };
}

const HEX = /^#[0-9a-f]{6}$/i;

/** Alleen wat we kennen, alleen in de vorm die we verwachten; de rest van het document blijft buiten beeld. */
export function toBranding(raw: unknown): OrgBranding | null {
  if (!raw || typeof raw !== 'object') return null;
  const b = raw as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  const seed = str(b.seedColor);
  let lightScheme: Record<string, string> | null = null;
  if (b.lightScheme && typeof b.lightScheme === 'object') {
    lightScheme = {};
    for (const [k, v] of Object.entries(b.lightScheme as Record<string, unknown>)) {
      if (typeof v === 'string' && HEX.test(v.trim())) lightScheme[k] = v.trim().toUpperCase();
    }
    if (Object.keys(lightScheme).length === 0) lightScheme = null;
  }
  const out: OrgBranding = {
    logoUrl: str(b.logoUrl),
    seedColor: seed && HEX.test(seed) ? seed.toUpperCase() : null,
    lightScheme,
  };
  return Object.values(out).some((v) => v != null) ? out : null;
}

/** Huisstijl opslaan. Alleen een beheerder van de studio mag dit (Firestore-regels). */
export async function saveOrgBranding(orgId: string, branding: OrgBranding | null): Promise<void> {
  if (!isFirebaseConfigured() || !db) throw new Error('Firebase niet geconfigureerd');
  const id = orgId.trim();
  if (!id) throw new Error('Studio-id ontbreekt');
  const clean = branding
    ? {
        logoUrl: branding.logoUrl ?? null,
        seedColor: branding.seedColor ?? null,
        lightScheme: branding.lightScheme ?? null,
      }
    : null;
  await setDoc(doc(db, COLLECTION, id), { branding: clean, updatedAt: serverTimestamp() }, { merge: true });
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
