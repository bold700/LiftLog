/**
 * Cloud-logs per persoon per oefening. Firestore-collectie `logs`.
 * Basis voor groepsles-loggen en per-klant "vorige keer" / progressie.
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
import type { ExerciseLog } from '../types';

const COLLECTION = 'logs';

function newId(): string {
  return `log_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function toLog(data: Record<string, unknown>, id: string): ExerciseLog {
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : v != null && v !== '' ? Number(v) : null);
  const str = (v: unknown) => (v == null ? null : String(v));
  return {
    id,
    userId: String(data.userId ?? ''),
    loggedBy: String(data.loggedBy ?? ''),
    trainerId: str(data.trainerId),
    exerciseName: String(data.exerciseName ?? ''),
    exerciseId: str(data.exerciseId),
    weight: num(data.weight),
    sets: num(data.sets),
    reps: num(data.reps),
    notes: str(data.notes),
    date: typeof data.date === 'string' ? data.date : new Date().toISOString(),
    schemaId: str(data.schemaId),
    schemaDayIndex:
      typeof data.schemaDayIndex === 'number' ? data.schemaDayIndex : data.schemaDayIndex != null ? Number(data.schemaDayIndex) : null,
    sessionId: str(data.sessionId),
    createdAt: typeof data.createdAt === 'string' ? data.createdAt : new Date().toISOString(),
  };
}

/** Sla een log op. Vult id/createdAt aan als die ontbreken. Geeft de opgeslagen log terug. */
export async function saveExerciseLog(
  log: Omit<ExerciseLog, 'id' | 'createdAt'> & { id?: string; createdAt?: string }
): Promise<ExerciseLog> {
  if (!isFirebaseConfigured() || !db) throw new Error('Firebase niet geconfigureerd');
  const id = log.id ?? newId();
  const full: ExerciseLog = {
    ...log,
    id,
    createdAt: log.createdAt ?? new Date().toISOString(),
  };
  // Firestore accepteert geen undefined
  const clean: Record<string, unknown> = { updatedAt: serverTimestamp() };
  for (const [k, v] of Object.entries(full)) {
    if (v !== undefined) clean[k] = v;
  }
  await setDoc(doc(db, COLLECTION, id), clean, { merge: true });
  return full;
}

export async function deleteExerciseLog(id: string): Promise<void> {
  if (!isFirebaseConfigured() || !db) throw new Error('Firebase niet geconfigureerd');
  await deleteDoc(doc(db, COLLECTION, id));
}

/** Alle logs voor een groepssessie. */
export async function getLogsForSession(sessionId: string): Promise<ExerciseLog[]> {
  if (!isFirebaseConfigured() || !db) return [];
  const q = query(collection(db, COLLECTION), where('sessionId', '==', sessionId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => toLog(d.data(), d.id));
}

/** Alle logs van een persoon (nieuwste eerst). Voor het in één keer opbouwen van "vorige keer". */
export async function getLogsForUser(userId: string): Promise<ExerciseLog[]> {
  if (!isFirebaseConfigured() || !db) return [];
  const q = query(collection(db, COLLECTION), where('userId', '==', userId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => toLog(d.data(), d.id)).sort((a, b) => (b.date > a.date ? 1 : -1));
}

/** Alle logs van een persoon voor één oefening (nieuwste eerst). */
export async function getLogsForUserExercise(userId: string, exerciseName: string): Promise<ExerciseLog[]> {
  if (!isFirebaseConfigured() || !db) return [];
  // Alleen equality-filters → geen composite index nodig; sorteren doen we client-side.
  const q = query(
    collection(db, COLLECTION),
    where('userId', '==', userId),
    where('exerciseName', '==', exerciseName)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => toLog(d.data(), d.id)).sort((a, b) => (b.date > a.date ? 1 : -1));
}

/** De meest recente log van een persoon voor één oefening, exclusief een optionele sessie (bv. de huidige). */
export async function getLastLogForUserExercise(
  userId: string,
  exerciseName: string,
  excludeSessionId?: string
): Promise<ExerciseLog | null> {
  const logs = await getLogsForUserExercise(userId, exerciseName);
  const filtered = excludeSessionId ? logs.filter((l) => l.sessionId !== excludeSessionId) : logs;
  return filtered[0] ?? null;
}
