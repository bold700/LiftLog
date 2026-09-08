/**
 * Check-ins na een training (Firestore-collectie `checkins`): hoe voelde het (1–5) en waar moet de
 * trainer op letten. Eigen check-ins of via je trainer/beheerder (zelfde regels als `logs`).
 */
import { collection, query, where, getDocs, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../firebase/config';
import type { SessionCheckin } from '../types';

const COLLECTION = 'checkins';

function newId(): string {
  return `checkin_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function toCheckin(data: Record<string, unknown>, id: string): SessionCheckin {
  const str = (v: unknown) => (v == null || v === '' ? null : String(v));
  const feelingRaw = Number(data.feeling);
  const feeling = (feelingRaw >= 1 && feelingRaw <= 5 ? Math.round(feelingRaw) : 3) as SessionCheckin['feeling'];
  return {
    id,
    userId: String(data.userId ?? ''),
    loggedBy: String(data.loggedBy ?? ''),
    trainerId: str(data.trainerId),
    schemaId: str(data.schemaId),
    schemaDayIndex: typeof data.schemaDayIndex === 'number' ? data.schemaDayIndex : null,
    dayLabel: str(data.dayLabel),
    feeling,
    note: str(data.note),
    date: typeof data.date === 'string' ? data.date : new Date().toISOString(),
    createdAt: typeof data.createdAt === 'string' ? data.createdAt : new Date().toISOString(),
  };
}

export async function saveCheckin(
  checkin: Omit<SessionCheckin, 'id' | 'createdAt'> & { id?: string }
): Promise<SessionCheckin> {
  if (!isFirebaseConfigured() || !db) throw new Error('Firebase niet geconfigureerd');
  const id = checkin.id ?? newId();
  const full: SessionCheckin = { ...checkin, id, createdAt: new Date().toISOString() };
  const clean: Record<string, unknown> = { updatedAt: serverTimestamp() };
  for (const [k, v] of Object.entries(full)) if (v !== undefined) clean[k] = v;
  await setDoc(doc(db, COLLECTION, id), clean, { merge: true });
  return full;
}

/** Alle check-ins van een sporter, nieuwste eerst. */
export async function getCheckinsForUser(userId: string): Promise<SessionCheckin[]> {
  if (!isFirebaseConfigured() || !db) return [];
  const snap = await getDocs(query(collection(db, COLLECTION), where('userId', '==', userId)));
  return snap.docs.map((d) => toCheckin(d.data(), d.id)).sort((a, b) => b.date.localeCompare(a.date));
}
