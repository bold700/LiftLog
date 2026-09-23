/**
 * Lessoorten van de actieve studio (Beheer → Lessoorten). Iedereen in de studio mag ze lezen
 * (het rooster toont ze), alleen trainers en beheerders schrijven; de regels dwingen dat af.
 */
import { collection, deleteDoc, doc, getDocs, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../firebase/config';
import { requireOrgId } from './orgContext';
import { callBooking } from './classService';
import type { ClassScheduleSlot, ClassType, SessionKind } from '../types';

const COLLECTION = 'classTypes';

const num = (v: unknown, fallback: number) => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
};
const toSessionKind = (v: unknown): SessionKind => (v === '1on1' || v === 'duo' || v === 'concept' ? v : 'group');

function toSchedule(v: unknown): ClassScheduleSlot[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((s): ClassScheduleSlot | null => {
      if (!s || typeof s !== 'object') return null;
      const weekday = num((s as Record<string, unknown>).weekday, NaN);
      const startTime = (s as Record<string, unknown>).startTime;
      const endTime = (s as Record<string, unknown>).endTime;
      if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) return null;
      if (typeof startTime !== 'string' || !/^\d{2}:\d{2}$/.test(startTime)) return null;
      if (typeof endTime !== 'string' || !/^\d{2}:\d{2}$/.test(endTime)) return null;
      return { weekday, startTime, endTime };
    })
    .filter((s): s is ClassScheduleSlot => s != null);
}

function toClassType(data: Record<string, unknown>, id: string): ClassType {
  return {
    id,
    orgId: typeof data.orgId === 'string' ? data.orgId : '',
    name: typeof data.name === 'string' ? data.name : '',
    capacity: data.capacity == null ? null : num(data.capacity, 0) || null,
    creditCost: num(data.creditCost, 1),
    defaultTrainerId: typeof data.defaultTrainerId === 'string' ? data.defaultTrainerId : null,
    schemaId: typeof data.schemaId === 'string' ? data.schemaId : null,
    schedule: toSchedule(data.schedule),
    room: typeof data.room === 'string' ? data.room : null,
    sessionKind: toSessionKind(data.sessionKind),
    description: typeof data.description === 'string' ? data.description : null,
    privateFor: typeof data.privateFor === 'string' && data.privateFor ? data.privateFor : null,
    createdAt: typeof data.createdAt === 'string' ? data.createdAt : '',
    updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : '',
  };
}

export async function getClassTypes(): Promise<ClassType[]> {
  if (!isFirebaseConfigured() || !db) return [];
  const snap = await getDocs(query(collection(db, COLLECTION), where('orgId', '==', requireOrgId())));
  return snap.docs
    .map((d) => toClassType(d.data(), d.id))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
}

export function newClassTypeId(): string {
  return `ct_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function saveClassType(
  input: Omit<ClassType, 'orgId' | 'createdAt' | 'updatedAt' | 'privateFor'> & { createdAt?: string }
): Promise<void> {
  if (!isFirebaseConfigured() || !db) throw new Error('Firebase niet geconfigureerd');
  await setDoc(
    doc(db, COLLECTION, input.id),
    {
      id: input.id,
      orgId: requireOrgId(),
      name: input.name,
      capacity: input.capacity,
      creditCost: input.creditCost,
      defaultTrainerId: input.defaultTrainerId,
      schemaId: input.schemaId,
      schedule: input.schedule,
      room: input.room,
      sessionKind: input.sessionKind,
      description: input.description,
      createdAt: input.createdAt || new Date().toISOString(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function deleteClassType(id: string): Promise<void> {
  if (!isFirebaseConfigured() || !db) return;
  await deleteDoc(doc(db, COLLECTION, id));
}

/** Een verouderde les die bleef staan omdat er al iemand op staat of op de wachtlijst. */
export interface StaleClass {
  id: string;
  title: string;
  date: string;
  startTime: string;
  bookedCount: number;
}

export interface GenerateResult {
  created: number;
  autoBooked: number;
  autoWaitlisted: number;
  autoSkippedNoCredits: number;
  /** Verouderde lessen (verschoven of weggehaald weekmoment) zonder inschrijvingen die weg zijn. */
  removed?: number;
  /** Geplande lessen waarop naam, eindtijd, ruimte, omschrijving of soort is bijgewerkt. */
  updated?: number;
  staleWithBookings?: StaleClass[];
}

/**
 * Rooster meteen laten kloppen met deze lessoort, in plaats van tot de volgende dagelijkse cron te
 * wachten: ontbrekende weekmomenten aanmaken, verschoven of weggehaalde momenten opruimen en
 * wijzigingen (naam, eindtijd, ruimte) doorzetten op wat al gepland staat. Aanroepen na elke opslag.
 */
export function generateClassOccurrencesNow(classTypeId: string): Promise<GenerateResult> {
  return callBooking({ action: 'generateClassOccurrences', classTypeId });
}

/**
 * Het rooster van de studio opruimen: toekomstige lessen van een verwijderde lessoort en van een
 * verplaatst of weggehaald weekmoment. Lessen met inschrijvingen blijven staan en komen terug,
 * zodat de trainer ze bewust afmeldt.
 */
export function pruneStaleClasses(): Promise<{ removed: number; staleWithBookings: StaleClass[] }> {
  return callBooking({ action: 'pruneStaleClasses' });
}
