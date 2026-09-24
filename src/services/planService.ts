/**
 * Abonnementen en lidmaatschappen (Beheer → Abonnementen).
 *
 * Plannen schrijft de staf zelf (regels dwingen dat af). Lidmaatschappen schrijft alleen de
 * server: koppelen en verlengen raken het creditsaldo en het grootboek, en dat moet in één
 * transactie. Vandaar dat die acties via `callBooking` lopen.
 */
import { collection, deleteDoc, doc, getDocs, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../firebase/config';
import { requireOrgId } from './orgContext';
import { callBooking } from './classService';
import { DEFAULT_VAT_RATE, VAT_RATES, type Membership, type Plan, type VatRate } from '../types';

const PLANS = 'plans';
const MEMBERSHIPS = 'memberships';

const num = (v: unknown, fallback: number) => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
};
const str = (v: unknown) => (typeof v === 'string' ? v : null);

/** Alleen 0, 9 of 21; een plan van vóór de btw-instelling telt als het standaardtarief. */
export function toVatRate(raw: unknown): VatRate {
  const n = Number(raw);
  return (VAT_RATES as readonly number[]).includes(n) ? (n as VatRate) : DEFAULT_VAT_RATE;
}

function toPlan(data: Record<string, unknown>, id: string): Plan {
  return {
    id,
    orgId: str(data.orgId) ?? '',
    name: str(data.name) ?? '',
    price: num(data.price, 0),
    period: data.period === 'once' || data.period === 'week' || data.period === 'fourWeeks' ? data.period : 'month',
    credits: data.credits == null ? null : num(data.credits, 0),
    validityMonths: data.validityMonths == null ? null : num(data.validityMonths, 0) || null,
    rollover: data.rollover === 'carry' ? 'carry' : 'expire',
    availableTo: data.availableTo === 'invite' ? 'invite' : 'all',
    status: data.status === 'paused' ? 'paused' : 'active',
    vatRate: toVatRate(data.vatRate),
    createdAt: str(data.createdAt) ?? '',
    updatedAt: str(data.updatedAt) ?? '',
  };
}

function toMembership(data: Record<string, unknown>, id: string): Membership {
  const status = data.status === 'cancelled' || data.status === 'expired' ? data.status : 'active';
  return {
    id,
    orgId: str(data.orgId) ?? '',
    userId: str(data.userId) ?? '',
    planId: str(data.planId) ?? '',
    planName: str(data.planName) ?? '',
    status,
    startedAt: str(data.startedAt) ?? '',
    nextRenewalAt: str(data.nextRenewalAt),
    expiresAt: str(data.expiresAt),
    lastRenewedAt: str(data.lastRenewedAt),
  };
}

export async function getPlans(): Promise<Plan[]> {
  if (!isFirebaseConfigured() || !db) return [];
  const snap = await getDocs(query(collection(db, PLANS), where('orgId', '==', requireOrgId())));
  return snap.docs.map((d) => toPlan(d.data(), d.id)).sort((a, b) => a.price - b.price || a.name.localeCompare(b.name));
}

export function newPlanId(): string {
  return `pl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function savePlan(input: Omit<Plan, 'orgId' | 'createdAt' | 'updatedAt'> & { createdAt?: string }): Promise<void> {
  if (!isFirebaseConfigured() || !db) throw new Error('Firebase niet geconfigureerd');
  await setDoc(
    doc(db, PLANS, input.id),
    {
      id: input.id,
      orgId: requireOrgId(),
      name: input.name,
      price: input.price,
      period: input.period,
      credits: input.credits,
      validityMonths: input.validityMonths,
      rollover: input.rollover,
      availableTo: input.availableTo,
      status: input.status,
      vatRate: input.vatRate,
      createdAt: input.createdAt || new Date().toISOString(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function deletePlan(id: string): Promise<void> {
  if (!isFirebaseConfigured() || !db) return;
  await deleteDoc(doc(db, PLANS, id));
}

/** Actieve lidmaatschappen van de studio, per userId (voor Beheer). */
export async function getActiveMembershipsForOrg(): Promise<Record<string, Membership>> {
  if (!isFirebaseConfigured() || !db) return {};
  const snap = await getDocs(query(collection(db, MEMBERSHIPS), where('orgId', '==', requireOrgId()), where('status', '==', 'active')));
  const out: Record<string, Membership> = {};
  for (const d of snap.docs) {
    const m = toMembership(d.data(), d.id);
    out[m.userId] = m;
  }
  return out;
}

/** Eigen actieve lidmaatschap in de actieve studio, of null (voor Profiel). */
export async function getMyMembership(userId: string): Promise<Membership | null> {
  if (!isFirebaseConfigured() || !db) return null;
  const snap = await getDocs(
    query(collection(db, MEMBERSHIPS), where('orgId', '==', requireOrgId()), where('userId', '==', userId), where('status', '==', 'active'))
  );
  const d = snap.docs[0];
  return d ? toMembership(d.data(), d.id) : null;
}

// --- Via de server -----------------------------------------------------------------

export function assignPlan(userId: string, planId: string): Promise<{ membershipId: string; balance: number }> {
  return callBooking({ action: 'assign', userId, planId });
}

export function unassignPlan(userId: string): Promise<{ stopped: boolean }> {
  return callBooking({ action: 'unassign', userId });
}

/** Openstaande verlengingen verwerken; idempotent. Beheer roept dit aan bij het openen. */
export function renewDue(): Promise<{ memberships: number; steps: number }> {
  return callBooking({ action: 'renewDue', orgId: requireOrgId() });
}

/**
 * Zelf een betaald abonnement of strippenkaart kopen. Geeft een Mollie-checkout-URL terug waar de
 * browser naartoe moet; het abonnement/de credits worden pas geactiveerd zodra de betaling lukt
 * (server-side, via de Mollie-webhook) — niet meteen na deze aanroep.
 */
export function purchasePlan(planId: string): Promise<{ checkoutUrl: string }> {
  return callBooking({ action: 'purchasePlan', planId });
}
