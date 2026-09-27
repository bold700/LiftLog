/**
 * Lesplanning: welke training er in een les gegeven wordt, met een notitie voor de trainer.
 * Firestore-collectie `classPlans`, document-id = les-id. Alleen trainers en beheerders mogen hem
 * lezen en schrijven (firestore.rules): sporters zien vooraf niet welke training er komt.
 *
 * De oefeningen van de gekozen dag worden als momentopname bewaard. Zo ziet elke trainer wat er
 * gegeven wordt, ook als de workout van een collega is.
 */
import { collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, where } from 'firebase/firestore';
import { auth, db, isFirebaseConfigured } from '../firebase/config';
import { requireOrgId } from './orgContext';
import type { Schema } from '../types';

const CLASS_PLANS = 'classPlans';

export interface ClassPlanExercise {
  name: string;
  sets: number;
  reps: number;
  notes: string;
}

export interface ClassPlan {
  classId: string;
  orgId: string;
  /** Datum van de les (YYYY-MM-DD), om de planning per week op te halen. */
  date: string;
  schemaId: string | null;
  schemaName: string | null;
  dayIndex: number | null;
  dayLabel: string | null;
  exercises: ClassPlanExercise[];
  /** Vrije notitie: aandachtspunten, "buik maakt niet uit wat je wilt", wie wat anders doet. */
  note: string;
  updatedBy: string | null;
  updatedAt: string;
}

const str = (v: unknown) => (typeof v === 'string' ? v : '');
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

function toPlan(data: Record<string, unknown>, id: string): ClassPlan {
  const exercises = Array.isArray(data.exercises) ? (data.exercises as Record<string, unknown>[]) : [];
  return {
    classId: str(data.classId) || id,
    orgId: str(data.orgId),
    date: str(data.date),
    schemaId: data.schemaId ? str(data.schemaId) : null,
    schemaName: data.schemaName ? str(data.schemaName) : null,
    dayIndex: typeof data.dayIndex === 'number' ? data.dayIndex : null,
    dayLabel: data.dayLabel ? str(data.dayLabel) : null,
    exercises: exercises.map((e) => ({ name: str(e.name), sets: num(e.sets), reps: num(e.reps), notes: str(e.notes) })),
    note: str(data.note),
    updatedBy: data.updatedBy ? str(data.updatedBy) : null,
    updatedAt: str(data.updatedAt),
  };
}

/** De oefeningen van een dag uit een workout, als momentopname voor de planning. */
export function exercisesOfDay(schema: Schema, dayIndex: number): ClassPlanExercise[] {
  const day = schema.days[dayIndex];
  if (!day) return [];
  return day.exercises.map((e) => ({ name: e.exerciseName, sets: e.setsTarget, reps: e.repsTarget, notes: e.notes ?? '' }));
}

/** Alle planningen van de studio vanaf een datum, per les-id. */
export async function getClassPlans(fromDate: string): Promise<Record<string, ClassPlan>> {
  if (!isFirebaseConfigured() || !db) return {};
  const snap = await getDocs(query(collection(db, CLASS_PLANS), where('orgId', '==', requireOrgId())));
  const out: Record<string, ClassPlan> = {};
  for (const d of snap.docs) {
    const plan = toPlan(d.data(), d.id);
    if (plan.date >= fromDate) out[plan.classId] = plan;
  }
  return out;
}

/** De planning van één les, of null als die nog niet gepland is. */
export async function getClassPlan(classId: string): Promise<ClassPlan | null> {
  if (!isFirebaseConfigured() || !db) return null;
  const snap = await getDoc(doc(db, CLASS_PLANS, classId));
  return snap.exists() ? toPlan(snap.data(), snap.id) : null;
}

export async function saveClassPlan(input: Omit<ClassPlan, 'orgId' | 'updatedBy' | 'updatedAt'>): Promise<ClassPlan> {
  if (!isFirebaseConfigured() || !db) throw new Error('Firebase niet geconfigureerd');
  const plan: ClassPlan = {
    ...input,
    orgId: requireOrgId(),
    updatedBy: auth?.currentUser?.uid ?? null,
    updatedAt: new Date().toISOString(),
  };
  await setDoc(doc(db, CLASS_PLANS, input.classId), plan);
  return plan;
}

export async function deleteClassPlan(classId: string): Promise<void> {
  if (!isFirebaseConfigured() || !db) return;
  await deleteDoc(doc(db, CLASS_PLANS, classId));
}
