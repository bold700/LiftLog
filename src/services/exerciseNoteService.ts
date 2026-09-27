/**
 * Oefeningenbibliotheek van de studio: per oefening regressie (makkelijker), progressie (zwaarder),
 * alternatieven per klacht en een coachtip. Firestore-collectie `exerciseNotes`, alleen voor staf
 * (firestore.rules). Eén keer vastleggen, daarna bij die oefening op te vragen in elke workout en les.
 */
import { collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, where } from 'firebase/firestore';
import { auth, db, isFirebaseConfigured } from '../firebase/config';
import { requireOrgId } from './orgContext';
import { exerciseKey } from '../utils/exerciseKey';

const COLLECTION = 'exerciseNotes';

export interface ExerciseAlternative {
  /** Voor wie of waarom, bijv. "Rug", "Knie", "Zwanger". */
  reason: string;
  /** Wat die persoon in plaats daarvan doet. */
  exercise: string;
}

export interface ExerciseNote {
  orgId: string;
  exerciseName: string;
  key: string;
  regressions: string[];
  progressions: string[];
  alternatives: ExerciseAlternative[];
  tip: string;
  updatedBy: string | null;
  updatedAt: string;
}

const str = (v: unknown) => (typeof v === 'string' ? v : '');
const list = (v: unknown) => (Array.isArray(v) ? v.map(str).filter((x) => x.trim()) : []);

function toNote(d: Record<string, unknown>): ExerciseNote {
  const alts = Array.isArray(d.alternatives) ? (d.alternatives as Record<string, unknown>[]) : [];
  return {
    orgId: str(d.orgId),
    exerciseName: str(d.exerciseName),
    key: str(d.key),
    regressions: list(d.regressions),
    progressions: list(d.progressions),
    alternatives: alts.map((a) => ({ reason: str(a.reason), exercise: str(a.exercise) })).filter((a) => a.exercise.trim()),
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
  const clean = (xs: string[]) => xs.map((x) => x.trim()).filter(Boolean);
  const note: ExerciseNote = {
    orgId,
    exerciseName: input.exerciseName.trim(),
    key: exerciseKey(input.exerciseName),
    regressions: clean(input.regressions),
    progressions: clean(input.progressions),
    alternatives: input.alternatives
      .map((a) => ({ reason: a.reason.trim(), exercise: a.exercise.trim() }))
      .filter((a) => a.exercise),
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
