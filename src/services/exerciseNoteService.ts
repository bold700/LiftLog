/**
 * Oefeningenbibliotheek van de studio: per oefening regressie (makkelijker), progressie (zwaarder),
 * alternatieven per klacht en een coachtip. Firestore-collectie `exerciseNotes`, alleen voor staf
 * (firestore.rules). Eén keer vastleggen, daarna bij die oefening op te vragen in elke workout en les.
 */
import { collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, where } from 'firebase/firestore';
import { auth, db, isFirebaseConfigured } from '../firebase/config';
import { requireOrgId } from './orgContext';
import { exerciseKey } from '../utils/exerciseKey';
import type { ExerciseRef } from '../data/exerciseProgressions';
import { apiUrl } from '../utils/apiOrigin';
import { authHeaders } from '../utils/authHeaders';

const COLLECTION = 'exerciseNotes';

export interface ExerciseAlternative extends ExerciseRef {
  /** Voor wie of waarom, bijv. "Rug", "Knie", "Zwanger". */
  reason: string;
}

export interface ExerciseNote {
  orgId: string;
  exerciseName: string;
  key: string;
  /** Oefeningen uit de database (met gifje), elk met een korte aanwijzing. */
  regressions: ExerciseRef[];
  progressions: ExerciseRef[];
  alternatives: ExerciseAlternative[];
  tip: string;
  updatedBy: string | null;
  updatedAt: string;
}

const str = (v: unknown) => (typeof v === 'string' ? v : '');

/** Een regel uit Firestore of van de AI: een object { exercise, note } of (oud) losse tekst. */
function toRef(v: unknown): ExerciseRef {
  if (typeof v === 'string') return { exercise: v.trim(), note: '' };
  const o = (v ?? {}) as Record<string, unknown>;
  return { exercise: str(o.exercise).trim(), note: str(o.note).trim() };
}
const hasRef = (r: ExerciseRef) => !!(r.exercise || r.note);
export const refList = (v: unknown): ExerciseRef[] => (Array.isArray(v) ? v.map(toRef).filter(hasRef) : []);
export const altList = (v: unknown): ExerciseAlternative[] =>
  (Array.isArray(v) ? (v as Record<string, unknown>[]) : [])
    .map((a) => ({ reason: str(a?.reason).trim(), ...toRef(a) }))
    .filter(hasRef);

function toNote(d: Record<string, unknown>): ExerciseNote {
  return {
    orgId: str(d.orgId),
    exerciseName: str(d.exerciseName),
    key: str(d.key),
    regressions: refList(d.regressions),
    progressions: refList(d.progressions),
    alternatives: altList(d.alternatives),
    tip: str(d.tip),
    updatedBy: d.updatedBy ? str(d.updatedBy) : null,
    updatedAt: str(d.updatedAt),
  };
}

const noteId = (orgId: string, name: string) => `${orgId}__${exerciseKey(name)}`;

/** Is er voor deze oefening iets vastgelegd? */
export function noteHasContent(n: ExerciseNote | null | undefined): boolean {
  return !!n && (n.regressions.length > 0 || n.progressions.length > 0 || n.alternatives.length > 0 || !!n.tip.trim());
}

export async function getExerciseNote(exerciseName: string): Promise<ExerciseNote | null> {
  if (!isFirebaseConfigured() || !db || !exerciseKey(exerciseName)) return null;
  const snap = await getDoc(doc(db, COLLECTION, noteId(requireOrgId(), exerciseName)));
  return snap.exists() ? toNote(snap.data()) : null;
}

/** De hele bibliotheek van de studio, op naam. */
export async function getExerciseNotes(): Promise<ExerciseNote[]> {
  if (!isFirebaseConfigured() || !db) return [];
  const snap = await getDocs(query(collection(db, COLLECTION), where('orgId', '==', requireOrgId())));
  return snap.docs.map((d) => toNote(d.data())).sort((a, b) => a.exerciseName.localeCompare(b.exerciseName, 'nl'));
}

export async function saveExerciseNote(
  input: Pick<ExerciseNote, 'exerciseName' | 'regressions' | 'progressions' | 'alternatives' | 'tip'>
): Promise<ExerciseNote> {
  if (!isFirebaseConfigured() || !db) throw new Error('Firebase niet geconfigureerd');
  const orgId = requireOrgId();
  const note: ExerciseNote = {
    orgId,
    exerciseName: input.exerciseName.trim(),
    key: exerciseKey(input.exerciseName),
    regressions: refList(input.regressions),
    progressions: refList(input.progressions),
    alternatives: altList(input.alternatives),
    tip: input.tip.trim(),
    updatedBy: auth?.currentUser?.uid ?? null,
    updatedAt: new Date().toISOString(),
  };
  await setDoc(doc(db, COLLECTION, noteId(orgId, note.exerciseName)), note);
  return note;
}

export async function deleteExerciseNote(exerciseName: string): Promise<void> {
  if (!isFirebaseConfigured() || !db) return;
  await deleteDoc(doc(db, COLLECTION, noteId(requireOrgId(), exerciseName)));
}

/**
 * Slim voorstel (AI) voor een oefening, eventueel voor één klacht. Via /api/generate-workout
 * (mode "exercise_advice"), alleen voor staf.
 */
export async function suggestExerciseAdvice(
  exerciseName: string,
  complaint?: string
): Promise<Pick<ExerciseNote, 'regressions' | 'progressions' | 'alternatives'>> {
  const response = await fetch(apiUrl('/api/generate-workout'), {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ prompt: exerciseName, mode: 'exercise_advice', complaint: complaint ?? '' }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof payload?.error === 'string' ? payload.error : 'Voorstel ophalen mislukt.');
  const a = payload?.advice ?? {};
  return { regressions: refList(a.regressions), progressions: refList(a.progressions), alternatives: altList(a.alternatives) };
}
