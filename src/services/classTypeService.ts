/**
 * Lessoorten van de actieve studio (Beheer → Lessoorten). Iedereen in de studio mag ze lezen
 * (het rooster toont ze), alleen trainers en beheerders schrijven; de regels dwingen dat af.
 */
import { collection, deleteDoc, doc, getDocs, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../firebase/config';
import { requireOrgId } from './orgContext';
import type { ClassType } from '../types';

const COLLECTION = 'classTypes';

const num = (v: unknown, fallback: number) => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
};

function toClassType(data: Record<string, unknown>, id: string): ClassType {
  return {
    id,
    orgId: typeof data.orgId === 'string' ? data.orgId : '',
    name: typeof data.name === 'string' ? data.name : '',
    durationMin: num(data.durationMin, 60),
    capacity: data.capacity == null ? null : num(data.capacity, 0) || null,
    creditCost: num(data.creditCost, 1),
    defaultTrainerId: typeof data.defaultTrainerId === 'string' ? data.defaultTrainerId : null,
    schemaId: typeof data.schemaId === 'string' ? data.schemaId : null,
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

export async function saveClassType(input: Omit<ClassType, 'orgId' | 'createdAt' | 'updatedAt'> & { createdAt?: string }): Promise<void> {
  if (!isFirebaseConfigured() || !db) throw new Error('Firebase niet geconfigureerd');
  await setDoc(
    doc(db, COLLECTION, input.id),
    {
      id: input.id,
      orgId: requireOrgId(),
      name: input.name,
      durationMin: input.durationMin,
      capacity: input.capacity,
      creditCost: input.creditCost,
      defaultTrainerId: input.defaultTrainerId,
      schemaId: input.schemaId,
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
