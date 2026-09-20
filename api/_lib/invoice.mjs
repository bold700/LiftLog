/**
 * Facturen: de rekensom los van Firestore en van de PDF, zodat hij te testen is.
 *
 * - Nummering: per studio één teller in `orgs/{orgId}.business.nextInvoiceNumber`, met een
 *   voorvoegsel dat de beheerder kiest ("VAS-2026-"). De server kent het nummer toe in dezelfde
 *   transactie als de post, zodat er nooit een gat of een dubbel nummer ontstaat.
 * - Btw: prijzen in de app zijn wat het lid betaalt (inclusief). Op de factuur wordt dat gesplitst.
 */

export const VAT_RATES = [0, 9, 21];
export const DEFAULT_VAT_RATE = 9;
/** Betaaltermijn in dagen: vervaldatum op de factuur, en wanneer een post "achterstallig" heet. */
export const PAYMENT_TERM_DAYS = 14;

/** Alleen 0, 9 of 21; al het andere wordt het standaardtarief. */
export function vatRateOf(raw) {
  const n = Number(raw);
  return VAT_RATES.includes(n) ? n : DEFAULT_VAT_RATE;
}

/** Inclusief bedrag splitsen in exclusief en btw, afgerond op centen (btw = incl − excl, zodat het optelt). */
export function vatSplit(amountIncl, rate) {
  const incl = Math.round((Number(amountIncl) || 0) * 100) / 100;
  const r = vatRateOf(rate);
  const excl = Math.round((incl / (1 + r / 100)) * 100) / 100;
  return { incl, excl, vat: Math.round((incl - excl) * 100) / 100, rate: r };
}

/** "VAS-2026-" + 142 → "VAS-2026-0142". */
export function formatInvoiceNumber(prefix, n) {
  return `${String(prefix ?? '')}${String(Math.max(1, Math.trunc(Number(n) || 1))).padStart(4, '0')}`;
}

/**
 * Teller uit het studiodocument. Zonder ingestelde bedrijfsgegevens: voorvoegsel is het jaar
 * ("2026-") en de teller begint bij 1.
 */
export function invoiceCounter(orgData, nowIso) {
  const b = orgData?.business && typeof orgData.business === 'object' ? orgData.business : {};
  const prefix = typeof b.invoicePrefix === 'string' && b.invoicePrefix.trim() ? b.invoicePrefix.trim() : `${String(nowIso).slice(0, 4)}-`;
  const next = Math.max(1, Math.trunc(Number(b.nextInvoiceNumber) || 1));
  return { prefix, next };
}

/** Bedrijfsgegevens in vaste vorm; ontbrekende velden worden lege strings, de naam valt terug op de studionaam. */
export function businessOf(orgData) {
  const b = orgData?.business && typeof orgData.business === 'object' ? orgData.business : {};
  const s = (v) => (typeof v === 'string' ? v.trim() : '');
  return {
    legalName: s(b.legalName) || s(orgData?.name),
    street: s(b.street),
    postcode: s(b.postcode),
    city: s(b.city),
    kvk: s(b.kvk),
    vatNumber: s(b.vatNumber),
    iban: s(b.iban),
    invoiceEmail: s(b.invoiceEmail),
    phone: s(b.phone),
  };
}

/** Vervaldatum: factuurdatum plus de betaaltermijn. */
export function dueDateOf(issuedIso) {
  const d = new Date(issuedIso);
  if (Number.isNaN(d.getTime())) return issuedIso;
  d.setUTCDate(d.getUTCDate() + PAYMENT_TERM_DAYS);
  return d.toISOString();
}

/**
 * Nummer toekennen binnen een Firestore-transactie. Lees het studiodocument vóór je schrijft
 * (Firestore eist alle reads eerst), geef die snapshot hier mee; deze functie schrijft de teller terug.
 */
export function reserveInvoiceNumber(tx, orgRef, orgSnap, nowIso) {
  const counter = invoiceCounter(orgSnap.exists ? orgSnap.data() : {}, nowIso);
  const number = formatInvoiceNumber(counter.prefix, counter.next);
  tx.set(
    orgRef,
    {
      business: {
        invoicePrefix: counter.prefix,
        nextInvoiceNumber: counter.next + 1,
      },
      updatedAt: nowIso,
    },
    { merge: true }
  );
  return number;
}
