/**
 * Groepsles-sessies. Firestore-collectie `sessions`.
 * Eén sessie = één workout-dag op een datum met de aanwezige deelnemers.
 */
import {
  collection,
  query,
  where,
  getDocs,
  getDoc,
  doc,
  setDoc,
  deleteDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../firebase/config';
import type { GroupSession } from '../types';

const COLLECTION = 'sessions';

function newId(): string {
  return `sess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function toSession(data: Record<string, unknown>, id: string): GroupSession {
  return {
    id,
    trainerId: String(data.trainerId ?? ''),
    schemaId: String(data.schemaId ?? ''),
    schemaName: String(data.schemaName ?? ''),
    dayIndex: typeof data.dayIndex === 'number' ? data.dayIndex : Number(data.dayIndex ?? 0),
    date: typeof data.date === 'string' ? data.date : new Date().toISOString().slice(0, 10),
    participantIds: Array.isArray(data.participantIds) ? data.participantIds.map((x) => String(x)) : [],
    createdAt: typeof data.createdAt === 'string' ? data.createdAt : new Date().toISOString(),
    updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : undefined,
  };
}

export async function createGroupSession(
  session: Omit<GroupSession, 'id' | 'createdAt'> & { id?: string }
): Promise<GroupSession> {
  if (!isFirebaseConfigured() || !db) throw new Error('Firebase niet geconfigureerd');
  const id = session.id ?? newId();
  const full: GroupSession = { ...session, id, createdAt: new Date().toISOString() };
  await setDoc(doc(db, COLLECTION, id), { ...full, updatedAt: serverTimestamp() }, { merge: true });
  return full;
}

export async function updateGroupSession(id: string, patch: Partial<GroupSession>): Promise<void> {
  if (!isFirebaseConfigured() || !db) throw new Error('Firebase niet geconfigureerd');
  await setDoc(doc(db, COLLECTION, id), { ...patch, updatedAt: serverTimestamp() }, { merge: true });
}

export async function getGroupSession(id: string): Promise<GroupSession | null> {
  if (!isFirebaseConfigured() || !db) return null;
  const snap = await getDoc(doc(db, COLLECTION, id));
  return snap.exists() ? toSession(snap.data(), snap.id) : null;
}

export async function getGroupSessionsForTrainer(trainerId: string): Promise<GroupSession[]> {
  if (!isFirebaseConfigured() || !db) return [];
  const q = query(collection(db, COLLECTION), where('trainerId', '==', trainerId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => toSession(d.data(), d.id)).sort((a, b) => (b.date > a.date ? 1 : -1));
}

export async function deleteGroupSession(id: string): Promise<void> {
  if (!isFirebaseConfigured() || !db) throw new Error('Firebase niet geconfigureerd');
  await deleteDoc(doc(db, COLLECTION, id));
}
