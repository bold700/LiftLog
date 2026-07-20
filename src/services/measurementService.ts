/**
 * Lichaamsmetingen (gewicht, vetpercentage) per account. Firestore-collectie `measurements`.
 * Zelfde patroon als de andere logs: trainer kan meekijken/loggen per sporter.
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

export interface Measurement {
  id: string;
  userId: string;
  loggedBy: string;
  trainerId: string | null;
  date: string; // YYYY-MM-DD
  weightKg: number | null;
  bodyFatPct: number | null;
  /** Omtrekmaten in cm (optioneel). */
  chestCm: number | null;
  waistCm: number | null;
  bellyCm: number | null;
  hipCm: number | null;
  glutesCm: number | null;
  thighLeftCm: number | null;
  thighRightCm: number | null;
  armCm: number | null;
  note: string;
  createdAt: string;
}

/** Omtrekvelden (key + label) voor de UI. */
export const CIRCUMFERENCE_FIELDS = [
  { key: 'chestCm', label: 'Borst' },
  { key: 'waistCm', label: 'Taille' },
  { key: 'bellyCm', label: 'Buik' },
  { key: 'hipCm', label: 'Heup' },
  { key: 'glutesCm', label: 'Billen' },
  { key: 'thighLeftCm', label: 'Bovenbeen L' },
  { key: 'thighRightCm', label: 'Bovenbeen R' },
  { key: 'armCm', label: 'Arm' },
] as const;

export type CircumferenceKey = (typeof CIRCUMFERENCE_FIELDS)[number]['key'];

const COLLECTION = 'measurements';

function newId(): string {
  return `meas_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function num(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function toMeasurement(data: Record<string, unknown>, id: string): Measurement {
  return {
    id,
    userId: String(data.userId ?? ''),
    loggedBy: String(data.loggedBy ?? ''),
    trainerId: data.trainerId != null ? String(data.trainerId) : null,
    date: String(data.date ?? ''),
    weightKg: num(data.weightKg),
    bodyFatPct: num(data.bodyFatPct),
    chestCm: num(data.chestCm),
    waistCm: num(data.waistCm),
    bellyCm: num(data.bellyCm),
    hipCm: num(data.hipCm),
    glutesCm: num(data.glutesCm),
    thighLeftCm: num(data.thighLeftCm),
    thighRightCm: num(data.thighRightCm),
    armCm: num(data.armCm),
    note: String(data.note ?? ''),
    createdAt: typeof data.createdAt === 'string' ? data.createdAt : new Date().toISOString(),
  };
}

export async function saveMeasurement(
  input: Omit<Measurement, 'id' | 'createdAt'> & { id?: string; createdAt?: string }
): Promise<Measurement> {
  if (!isFirebaseConfigured() || !db) throw new Error('Firebase niet geconfigureerd');
  const id = input.id ?? newId();
  const full: Measurement = { ...input, id, createdAt: input.createdAt ?? new Date().toISOString() };
  await setDoc(doc(db, COLLECTION, id), { ...full, updatedAt: serverTimestamp() }, { merge: true });
  return full;
}

export async function deleteMeasurement(id: string): Promise<void> {
  if (!isFirebaseConfigured() || !db) return;
  await deleteDoc(doc(db, COLLECTION, id));
}

/** Alle metingen van een persoon, oud → nieuw (handig voor grafieken). */
export async function getMeasurementsForUser(userId: string): Promise<Measurement[]> {
  if (!isFirebaseConfigured() || !db) return [];
  const q = query(collection(db, COLLECTION), where('userId', '==', userId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => toMeasurement(d.data(), d.id)).sort((a, b) => (a.date > b.date ? 1 : -1));
}

/** Laatste bekende gewicht (kg), of null. */
export function latestWeight(measurements: Measurement[]): number | null {
  for (let i = measurements.length - 1; i >= 0; i--) {
    if (measurements[i].weightKg != null) return measurements[i].weightKg;
  }
  return null;
}
