/**
 * Studio's (organisaties). Collectie: `orgs`, document-id = orgId.
 *
 * Een studio is de grens waarbinnen alles zichtbaar is: profielen, schema's, logs, metingen.
 * Zie `orgContext.ts` voor de actieve studio en `firestore.rules` voor de afdwinging.
 */
import { doc, getDoc, setDoc, serverTimestamp, type Timestamp } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../firebase/config';
import { requireOrgId } from './orgContext';
import { callBooking } from './classService';
import type { Org, OrgBookingPolicy, OrgBranding, OrgBusiness, OrgPaymentsStatus } from '../types';

const COLLECTION = 'orgs';

function toOrg(data: Record<string, unknown>, id: string): Org {
  const ts = (v: unknown) =>
    v && typeof (v as Timestamp).toDate === 'function'
      ? (v as Timestamp).toDate().toISOString()
      : new Date().toISOString();
  return {
    id,
    name: typeof data.name === 'string' && data.name.trim() ? data.name.trim() : id,
    ownerId: typeof data.ownerId === 'string' ? data.ownerId : null,
    allowSelfSignup: data.allowSelfSignup === true,
    branding: toBranding(data.branding),
    business: toBusiness(data.business),
    payments: toPaymentsStatus(data.payments),
    bookingPolicy: toBookingPolicy(data.bookingPolicy),
    createdAt: ts(data.createdAt),
    updatedAt: ts(data.updatedAt),
  };
}

const HEX = /^#[0-9a-f]{6}$/i;

/** Alleen wat we kennen, alleen in de vorm die we verwachten; de rest van het document blijft buiten beeld. */
export function toBranding(raw: unknown): OrgBranding | null {
  if (!raw || typeof raw !== 'object') return null;
  const b = raw as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  const seed = str(b.seedColor);
  let lightScheme: Record<string, string> | null = null;
  if (b.lightScheme && typeof b.lightScheme === 'object') {
    lightScheme = {};
    for (const [k, v] of Object.entries(b.lightScheme as Record<string, unknown>)) {
      if (typeof v === 'string' && HEX.test(v.trim())) lightScheme[k] = v.trim().toUpperCase();
    }
    if (Object.keys(lightScheme).length === 0) lightScheme = null;
  }
  const out: OrgBranding = {
    logoUrl: str(b.logoUrl),
    logoPrintUrl: str(b.logoPrintUrl),
    seedColor: seed && HEX.test(seed) ? seed.toUpperCase() : null,
    lightScheme,
  };
  return Object.values(out).some((v) => v != null) ? out : null;
}

/** Betaalstatus in vaste vorm; zonder instelling telt "test" als modus en staat de rest op null. */
export function toPaymentsStatus(raw: unknown): OrgPaymentsStatus {
  const p = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  return {
    provider: 'mollie',
    mode: p.mode === 'live' ? 'live' : 'test',
    testKeyLast4: str(p.testKeyLast4),
    liveKeyLast4: str(p.liveKeyLast4),
    testConnectedAt: str(p.testConnectedAt),
    liveConnectedAt: str(p.liveConnectedAt),
    testOrganizationName: str(p.testOrganizationName),
    liveOrganizationName: str(p.liveOrganizationName),
  };
}

/**
 * Actieve modus wisselen (Test/Live). Geen geheim, dus een gewone client-write op het studiodoc,
 * net als de rest van de instellingen hier; de sleutels zelf staan los in orgSecrets.
 */
export async function setPaymentMode(orgId: string, mode: 'test' | 'live'): Promise<void> {
  if (!isFirebaseConfigured() || !db) throw new Error('Firebase niet geconfigureerd');
  await setDoc(doc(db, COLLECTION, orgId), { payments: { mode }, updatedAt: serverTimestamp() }, { merge: true });
}

/**
 * Mollie-sleutel koppelen. Gaat via de server: die verifieert de sleutel bij Mollie zelf en slaat
 * hem op in orgSecrets (nooit door de client te lezen). Geeft terug wat wél getoond mag worden.
 */
export function savePaymentKey(
  mode: 'test' | 'live',
  apiKey: string
): Promise<{ mode: 'test' | 'live'; last4: string; connectedAt: string; organizationName: string | null }> {
  return callBooking({ action: 'savePaymentKey', orgId: requireOrgId(), mode, apiKey });
}

/** Sleutel loskoppelen. */
export function removePaymentKey(mode: 'test' | 'live'): Promise<{ mode: 'test' | 'live' }> {
  return callBooking({ action: 'removePaymentKey', orgId: requireOrgId(), mode });
}

/** Bedrijfsgegevens in vaste vorm; null als er nog niets is ingevuld. */
export function toBusiness(raw: unknown): OrgBusiness | null {
  if (!raw || typeof raw !== 'object') return null;
  const b = raw as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const n = Number(b.nextInvoiceNumber);
  const out: OrgBusiness = {
    legalName: str(b.legalName),
    street: str(b.street),
    postcode: str(b.postcode),
    city: str(b.city),
    kvk: str(b.kvk),
    vatNumber: str(b.vatNumber),
    iban: str(b.iban),
    invoiceEmail: str(b.invoiceEmail),
    phone: str(b.phone),
    invoicePrefix: str(b.invoicePrefix),
    nextInvoiceNumber: Number.isFinite(n) && n >= 1 ? Math.trunc(n) : 1,
  };
  const filled = Object.entries(out).some(([k, v]) => k !== 'nextInvoiceNumber' && v !== '');
  return filled ? out : null;
}

/** Boekingsbeleid in vaste vorm; null als er nog niets is ingesteld (dan geldt het standaard aantal uur van de server). */
export function toBookingPolicy(raw: unknown): OrgBookingPolicy | null {
  if (!raw || typeof raw !== 'object') return null;
  const hours = Number((raw as Record<string, unknown>).freeCancelHours);
  return Number.isFinite(hours) && hours >= 0 ? { freeCancelHours: Math.trunc(hours) } : null;
}

/** Boekingsbeleid opslaan (Beheer → Huisstijl). Alleen een beheerder mag dit (Firestore-regels). */
export async function saveOrgBookingPolicy(orgId: string, policy: OrgBookingPolicy): Promise<void> {
  if (!isFirebaseConfigured() || !db) throw new Error('Firebase niet geconfigureerd');
  const id = orgId.trim();
  if (!id) throw new Error('Studio-id ontbreekt');
  await setDoc(
    doc(db, COLLECTION, id),
    { bookingPolicy: { freeCancelHours: Math.max(0, Math.trunc(policy.freeCancelHours)) }, updatedAt: serverTimestamp() },
    { merge: true }
  );
}

/** Bedrijfsgegevens opslaan (Beheer → Huisstijl). Alleen een beheerder mag dit (Firestore-regels). */
export async function saveOrgBusiness(orgId: string, business: OrgBusiness): Promise<void> {
  if (!isFirebaseConfigured() || !db) throw new Error('Firebase niet geconfigureerd');
  const id = orgId.trim();
  if (!id) throw new Error('Studio-id ontbreekt');
  const clean: OrgBusiness = {
    legalName: business.legalName.trim(),
    street: business.street.trim(),
    postcode: business.postcode.trim().toUpperCase(),
    city: business.city.trim(),
    kvk: business.kvk.trim(),
    vatNumber: business.vatNumber.trim().toUpperCase().replace(/\s+/g, ''),
    iban: business.iban.trim().toUpperCase(),
    invoiceEmail: business.invoiceEmail.trim(),
    phone: business.phone.trim(),
    invoicePrefix: business.invoicePrefix.trim(),
    nextInvoiceNumber: Math.max(1, Math.trunc(Number(business.nextInvoiceNumber) || 1)),
  };
  await setDoc(doc(db, COLLECTION, id), { business: clean, updatedAt: serverTimestamp() }, { merge: true });
}

/** Huisstijl opslaan. Alleen een beheerder van de studio mag dit (Firestore-regels). */
export async function saveOrgBranding(orgId: string, branding: OrgBranding | null): Promise<void> {
  if (!isFirebaseConfigured() || !db) throw new Error('Firebase niet geconfigureerd');
  const id = orgId.trim();
  if (!id) throw new Error('Studio-id ontbreekt');
  const clean = branding
    ? {
        logoUrl: branding.logoUrl ?? null,
        logoPrintUrl: branding.logoPrintUrl ?? null,
        seedColor: branding.seedColor ?? null,
        lightScheme: branding.lightScheme ?? null,
      }
    : null;
  await setDoc(doc(db, COLLECTION, id), { branding: clean, updatedAt: serverTimestamp() }, { merge: true });
}

export async function getOrg(orgId: string): Promise<Org | null> {
  if (!isFirebaseConfigured() || !db || !orgId) return null;
  const snap = await getDoc(doc(db, COLLECTION, orgId));
  return snap.exists() ? toOrg(snap.data(), snap.id) : null;
}

/**
 * Maakt of werkt een studio bij. Alleen een beheerder mag dit (Firestore-regels);
 * nieuwe studio's worden in de praktijk aangemaakt met het migratie-/beheerscript.
 */
export async function saveOrg(
  orgId: string,
  data: { name: string; ownerId?: string | null; allowSelfSignup?: boolean }
): Promise<void> {
  if (!isFirebaseConfigured() || !db) throw new Error('Firebase niet geconfigureerd');
  const id = orgId.trim();
  if (!id) throw new Error('Studio-id ontbreekt');
  await setDoc(
    doc(db, COLLECTION, id),
    {
      name: data.name.trim(),
      ownerId: data.ownerId ?? null,
      allowSelfSignup: data.allowSelfSignup === true,
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    },
    { merge: true }
  );
}
