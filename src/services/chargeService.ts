/**
 * Posten (Beheer → Facturatie). De server maakt ze aan bij koppelen en verlengen; hier lezen we
 * ze en zet staf ze op betaald of schrijft ze af. De regels laten alleen die velden toe.
 */
import { collection, doc, getDocs, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../firebase/config';
import { requireOrgId } from './orgContext';
import { callBooking } from './classService';
import { toVatRate } from './planService';
import type { Charge, VatRate } from '../types';

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
    vatRate: toVatRate(data.vatRate),
    invoiceNumber: str(data.invoiceNumber),
    invoiceIssuedAt: str(data.invoiceIssuedAt),
    invoiceSentAt: str(data.invoiceSentAt),
    invoiceSentTo: str(data.invoiceSentTo),
  };
}

/** Alle posten van de studio, nieuwste eerst (staf). */
export async function getChargesForOrg(): Promise<Charge[]> {
  if (!isFirebaseConfigured() || !db) return [];
  const snap = await getDocs(query(collection(db, COLLECTION), where('orgId', '==', requireOrgId())));
  return snap.docs.map((d) => toCharge(d.data(), d.id)).sort((a, b) => b.dueAt.localeCompare(a.dueAt));
}

/** Eigen posten van een lid in de actieve studio, nieuwste eerst (Profiel → Facturen). */
export async function getMyCharges(userId: string): Promise<Charge[]> {
  if (!isFirebaseConfigured() || !db) return [];
  const snap = await getDocs(query(collection(db, COLLECTION), where('orgId', '==', requireOrgId()), where('userId', '==', userId)));
  return snap.docs.map((d) => toCharge(d.data(), d.id)).sort((a, b) => b.dueAt.localeCompare(a.dueAt));
}

export interface InvoicePdf {
  invoiceNumber: string;
  fileName: string;
  file: File;
}

/**
 * Factuur-PDF ophalen bij de server. De server kent zo nodig eerst een factuurnummer toe; dat
 * nummer komt terug zodat de lijst het meteen kan tonen.
 */
export async function fetchInvoicePdf(chargeId: string): Promise<InvoicePdf> {
  const r = await callBooking<{ invoiceNumber: string; fileName: string; pdfBase64: string }>({ action: 'invoice', chargeId });
  const bytes = Uint8Array.from(atob(r.pdfBase64), (c) => c.charCodeAt(0));
  return { invoiceNumber: r.invoiceNumber, fileName: r.fileName, file: new File([bytes], r.fileName, { type: 'application/pdf' }) };
}

/** Factuur als download aanbieden. */
export async function downloadInvoicePdf(chargeId: string): Promise<{ invoiceNumber: string; fileName: string }> {
  const pdf = await fetchInvoicePdf(chargeId);
  const url = URL.createObjectURL(pdf.file);
  const a = document.createElement('a');
  a.href = url;
  a.download = pdf.fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return { invoiceNumber: pdf.invoiceNumber, fileName: pdf.fileName };
}

/** Kan dit apparaat een PDF delen via het deelmenu (WhatsApp, Mail, AirDrop…)? Op de telefoon wel, op de meeste desktops niet. */
export function canShareFiles(): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function') return false;
  try {
    return navigator.canShare({ files: [new File([new Uint8Array([37, 80, 68, 70])], 'x.pdf', { type: 'application/pdf' })] });
  } catch {
    return false;
  }
}

/**
 * Factuur delen via het deelmenu van het apparaat, met de PDF als bijlage; daar kiest de
 * gebruiker WhatsApp. Kan dat niet, dan wordt het een download. `shared` zegt wat het werd;
 * annuleren van het deelmenu telt als gedeeld (de gebruiker koos dat zelf).
 */
export async function shareInvoicePdf(chargeId: string, text: string): Promise<{ invoiceNumber: string; shared: boolean }> {
  const pdf = await fetchInvoicePdf(chargeId);
  if (canShareFiles() && navigator.canShare({ files: [pdf.file] })) {
    try {
      await navigator.share({ files: [pdf.file], title: pdf.fileName, text });
    } catch (e) {
      if ((e as { name?: string })?.name !== 'AbortError') throw e;
    }
    return { invoiceNumber: pdf.invoiceNumber, shared: true };
  }
  const url = URL.createObjectURL(pdf.file);
  const a = document.createElement('a');
  a.href = url;
  a.download = pdf.fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return { invoiceNumber: pdf.invoiceNumber, shared: false };
}

/** Openbare link naar de factuur (zonder inloggen te openen) plus een korte WhatsApp-tekst in de taal van het lid. */
export function getInvoiceLink(chargeId: string): Promise<{ invoiceNumber: string; url: string; text: string }> {
  return callBooking({ action: 'invoiceLink', chargeId });
}

/** Is versturen per mail ingericht op de server (Resend-sleutel en afzender in Vercel)? */
export function getMailStatus(): Promise<{ configured: boolean }> {
  return callBooking({ action: 'mailStatus' });
}

/** Factuur per mail naar het lid, met de PDF als bijlage (staf). */
export function sendInvoiceEmail(chargeId: string): Promise<{ invoiceNumber: string; sentTo: string; sentAt: string }> {
  return callBooking({ action: 'sendInvoice', chargeId });
}

/** Inclusief bedrag splitsen in exclusief en btw, afgerond op centen (dezelfde rekensom als de server). */
export function vatSplit(amountIncl: number, rate: VatRate): { incl: number; excl: number; vat: number; rate: VatRate } {
  const incl = Math.round((Number(amountIncl) || 0) * 100) / 100;
  const excl = Math.round((incl / (1 + rate / 100)) * 100) / 100;
  return { incl, excl, vat: Math.round((incl - excl) * 100) / 100, rate };
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
  const rows = [['Factuurnummer', 'Lid', 'Omschrijving', 'Periode', 'Vervaldatum', 'Bedrag', 'Excl. btw', 'Btw', 'Btw %', 'Status', 'Betaald op', 'Notitie']];
  for (const c of charges) {
    const v = vatSplit(c.amount, c.vatRate);
    rows.push([c.invoiceNumber ?? '', nameOf(c.userId), c.description, c.period ?? '', c.dueAt.slice(0, 10), c.amount.toFixed(2), v.excl.toFixed(2), v.vat.toFixed(2), String(v.rate), c.status, c.paidAt ? c.paidAt.slice(0, 10) : '', c.note]);
  }
  return rows.map((r) => r.map(esc).join(';')).join('\n');
}
