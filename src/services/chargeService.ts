/**
 * Posten (Beheer → Facturatie). De server maakt ze aan bij koppelen en verlengen; hier lezen we
 * ze en zet staf ze op betaald of schrijft ze af. De regels laten alleen die velden toe.
 */
import { collection, doc, getDocs, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../firebase/config';
import { requireOrgId } from './orgContext';
import type { Charge } from '../types';

const COLLECTION = 'charges';
const str = (v: unknown) => (typeof v === 'string' ? v : null);

function toCharge(data: Record<string, unknown>, id: string): Charge {
  const n = typeof data.amount === 'number' ? data.amount : Number(data.amount);
  return {
    id,
    orgId: str(data.orgId) ?? '',
    userId: str(data.userId) ?? '',
    membershipId: str(data.membershipId) ?? '',
    planId: str(data.planId) ?? '',
    planName: str(data.planName) ?? '',
    description: str(data.description) ?? str(data.planName) ?? '',
    amount: Number.isFinite(n) ? n : 0,
    period: str(data.period),
    issuedAt: str(data.issuedAt) ?? '',
    dueAt: str(data.dueAt) ?? str(data.issuedAt) ?? '',
    status: data.status === 'paid' || data.status === 'void' ? data.status : 'open',
    paidAt: str(data.paidAt),
    note: str(data.note) ?? '',
  };
}

/** Alle posten van de studio, nieuwste eerst (staf). */
export async function getChargesForOrg(): Promise<Charge[]> {
  if (!isFirebaseConfigured() || !db) return [];
  const snap = await getDocs(query(collection(db, COLLECTION), where('orgId', '==', requireOrgId())));
  return snap.docs.map((d) => toCharge(d.data(), d.id)).sort((a, b) => b.dueAt.localeCompare(a.dueAt));
}

export async function markChargePaid(id: string, byUserId: string, note?: string): Promise<void> {
  if (!isFirebaseConfigured() || !db) throw new Error('Firebase niet geconfigureerd');
  await updateDoc(doc(db, COLLECTION, id), { status: 'paid', paidAt: new Date().toISOString(), paidBy: byUserId, ...(note != null ? { note } : {}), updatedAt: serverTimestamp() });
}

export async function writeOffCharge(id: string, byUserId: string, note?: string): Promise<void> {
  if (!isFirebaseConfigured() || !db) throw new Error('Firebase niet geconfigureerd');
  await updateDoc(doc(db, COLLECTION, id), { status: 'void', paidAt: null, paidBy: byUserId, ...(note != null ? { note } : {}), updatedAt: serverTimestamp() });
}

export async function reopenCharge(id: string, byUserId: string): Promise<void> {
  if (!isFirebaseConfigured() || !db) throw new Error('Firebase niet geconfigureerd');
  await updateDoc(doc(db, COLLECTION, id), { status: 'open', paidAt: null, paidBy: byUserId, updatedAt: serverTimestamp() });
}

export async function saveChargeNote(id: string, note: string): Promise<void> {
  if (!isFirebaseConfigured() || !db) throw new Error('Firebase niet geconfigureerd');
  await updateDoc(doc(db, COLLECTION, id), { note, updatedAt: serverTimestamp() });
}

/** Na hoeveel dagen open een post "achterstallig" heet. */
export const OVERDUE_DAYS = 14;

export function isOverdue(c: Charge, now = Date.now()): boolean {
  return c.status === 'open' && new Date(c.dueAt).getTime() < now - OVERDUE_DAYS * 24 * 3600 * 1000;
}

/** CSV van de posten, voor de boekhouding. */
export function chargesToCsv(charges: Charge[], nameOf: (userId: string) => string): string {
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = [['Lid', 'Omschrijving', 'Periode', 'Vervaldatum', 'Bedrag', 'Status', 'Betaald op', 'Notitie']];
  for (const c of charges) rows.push([nameOf(c.userId), c.description, c.period ?? '', c.dueAt.slice(0, 10), c.amount.toFixed(2), c.status, c.paidAt ? c.paidAt.slice(0, 10) : '', c.note]);
  return rows.map((r) => r.map(esc).join(';')).join('\n');
}
