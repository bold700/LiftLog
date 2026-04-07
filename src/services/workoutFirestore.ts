/**
 * Workouts (schemas) in Firestore – voor trainers en sporters.
 * Collectie: workouts, document id = schema.id.
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
  type Timestamp,
} from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../firebase/config';
import type { Schema } from '../types';
import type { ProfileRole } from '../types';

const COLLECTION = 'workouts';

function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (!v || typeof v !== 'object') return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

/**
 * Firestore accepteert geen `undefined` in documenten.
 * We verwijderen `undefined` velden diep (maar laten niet-plain objects zoals Firestore FieldValue ongemoeid).
 */
function omitUndefinedDeep<T>(value: T): T {
  if (value === undefined) return undefined as unknown as T;
  if (Array.isArray(value)) {
    return value
      .map((x) => omitUndefinedDeep(x))
      .filter((x) => x !== undefined) as unknown as T;
  }
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (v === undefined) continue;
      const cleaned = omitUndefinedDeep(v);
      if (cleaned === undefined) continue;
      out[k] = cleaned;
    }
    return out as unknown as T;
  }
  return value;
}

function toSchema(data: Record<string, unknown>, id: string): Schema {
  const d = data as Record<string, unknown>;
  const toStr = (v: unknown) => (v == null ? null : String(v));
  const toDateStr = (v: unknown) =>
    v && typeof (v as Timestamp).toDate === 'function'
      ? (v as Timestamp).toDate().toISOString().slice(0, 10)
      : v != null ? String(v).slice(0, 10) : null;
  return {
    id,
    name: String(d.name ?? ''),
    trainerId: String(d.trainerId ?? ''),
    clientId: toStr(d.clientId),
    createdAt: typeof d.createdAt === 'string' ? d.createdAt : new Date().toISOString(),
    days: Array.isArray(d.days) ? (d.days as Schema['days']) : [],
    startDate: toDateStr(d.startDate) ?? null,
    endDate: toDateStr(d.endDate) ?? null,
    formule7: (d.formule7 as Schema['formule7']) ?? null,
    isFormule7Template: Boolean(d.isFormule7Template),
    formule7AssistMode:
      d.formule7AssistMode === 'manual' || d.formule7AssistMode === 'ai'
        ? d.formule7AssistMode
        : undefined,
  };
}

export async function getWorkoutsForUser(uid: string, role: ProfileRole): Promise<Schema[]> {
  if (!isFirebaseConfigured() || !db) return [];
  const field = role === 'trainer' || role === 'admin' ? 'trainerId' : 'clientId';
  const q = query(collection(db, COLLECTION), where(field, '==', uid));
  const snap = await getDocs(q);
  return snap.docs.map((d) => toSchema(d.data(), d.id)).sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1));
}

export async function saveWorkoutToFirestore(schema: Schema): Promise<void> {
  if (!isFirebaseConfigured() || !db) throw new Error('Firebase niet geconfigureerd');
  const ref = doc(db, COLLECTION, schema.id);
  const toStore = {
    ...schema,
    updatedAt: serverTimestamp(),
  };
  const cleaned = omitUndefinedDeep(toStore);
  await setDoc(ref, cleaned, { merge: true });
}

export async function deleteWorkoutFromFirestore(id: string): Promise<void> {
  if (!isFirebaseConfigured() || !db) throw new Error('Firebase niet geconfigureerd');
  await deleteDoc(doc(db, COLLECTION, id));
}
