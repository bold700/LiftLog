/**
 * Workout-aanvragen: een sporter vraagt om een (nieuwe) workout. De trainer ziet
 * openstaande aanvragen in Beheer. Firestore-collectie `workoutRequests`.
 */
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  setDoc,
  deleteDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../firebase/config';

export interface WorkoutRequest {
  id: string;
  userId: string;
  displayName: string | null;
  email: string | null;
  trainerId: string | null;
  note: string;
  status: 'pending' | 'done';
  createdAt: string;
}

function newId(): string {
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function toRequest(data: Record<string, unknown>, id: string): WorkoutRequest {
  const s = (v: unknown) => (v == null ? null : String(v));
  return {
    id,
    userId: String(data.userId ?? ''),
    displayName: s(data.displayName),
    email: s(data.email),
    trainerId: s(data.trainerId),
    note: String(data.note ?? ''),
    status: data.status === 'done' ? 'done' : 'pending',
    createdAt: typeof data.createdAt === 'string' ? data.createdAt : new Date().toISOString(),
  };
}

const COLLECTION = 'workoutRequests';

export async function createWorkoutRequest(input: {
  userId: string;
  displayName: string | null;
  email: string | null;
  trainerId: string | null;
  note: string;
}): Promise<WorkoutRequest> {
  if (!isFirebaseConfigured() || !db) throw new Error('Firebase niet geconfigureerd');
  const id = newId();
  const full: WorkoutRequest = { ...input, id, status: 'pending', createdAt: new Date().toISOString() };
  await setDoc(doc(db, COLLECTION, id), { ...full, updatedAt: serverTimestamp() });
  return full;
}

/** Openstaande aanvraag van deze sporter (om dubbele te voorkomen / status te tonen). */
export async function getMyPendingRequest(userId: string): Promise<WorkoutRequest | null> {
  if (!isFirebaseConfigured() || !db) return null;
  const q = query(collection(db, COLLECTION), where('userId', '==', userId), where('status', '==', 'pending'));
  const snap = await getDocs(q);
  const rows = snap.docs.map((d) => toRequest(d.data(), d.id));
  return rows[0] ?? null;
}

/** Alle openstaande aanvragen (voor trainer/admin). */
export async function getPendingWorkoutRequests(): Promise<WorkoutRequest[]> {
  if (!isFirebaseConfigured() || !db) return [];
  const q = query(collection(db, COLLECTION), where('status', '==', 'pending'));
  const snap = await getDocs(q);
  return snap.docs.map((d) => toRequest(d.data(), d.id)).sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1));
}

export async function resolveWorkoutRequest(id: string): Promise<void> {
  if (!isFirebaseConfigured() || !db) return;
  await deleteDoc(doc(db, COLLECTION, id));
}
