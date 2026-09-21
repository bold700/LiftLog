/**
 * Abonnementen: de rekensom achter plannen en lidmaatschappen (Beheer → Abonnementen).
 *
 * Een plan zegt wat iemand krijgt: zoveel credits per maand, of eenmalig een kaart die een
 * aantal maanden geldig is, of onbeperkt. Een lidmaatschap koppelt een lid aan een plan en weet
 * wanneer de volgende verlenging is. Verlengen doet de server hier, via het grootboek, zodat
 * saldo en herkomst nooit uit elkaar lopen. De zuivere functies staan bovenaan en worden getest.
 */

import { reserveInvoiceNumber, vatRateOf } from './invoice.mjs';

/** Zoveel maanden verder, op dezelfde dag van de maand (31 januari + 1 → 28/29 februari). */
export function addMonths(iso, months) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d.toISOString();
}

/** Eén verlengingsperiode verder, wat die periode ook is ("once" hoort hier niet bij). */
export function addPeriod(iso, period) {
  if (period === 'week') return new Date(new Date(iso).getTime() + 7 * 86_400_000).toISOString();
  if (period === 'fourWeeks') return new Date(new Date(iso).getTime() + 28 * 86_400_000).toISOString();
  return addMonths(iso, 1);
}

/**
 * Wat er bij een verlenging bij het saldo moet. Onbeperkt: niets. "Vervalt": het saldo wordt
 * precies het maandtegoed. "Meenemen": het tegoed komt erbij.
 */
export function renewalDelta(plan, balance) {
  if (plan.credits == null) return 0;
  const credits = Number(plan.credits) || 0;
  return plan.rollover === 'carry' ? credits : credits - (Number(balance) || 0);
}

/**
 * Wat er met één lidmaatschap moet gebeuren, zonder iets te schrijven. Geeft de stappen terug
 * zodat de aanroeper ze in één transactie kan toepassen en de test ze kan nalezen.
 *
 * - maandplan: per verstreken periode één verlenging (tot 24 om nooit vast te lopen);
 * - eenmalig plan met einddatum: na die datum vervalt het restant en stopt het lidmaatschap.
 */
export function planRenewals(membership, plan, balance, nowIso) {
  const steps = [];
  if (!membership || membership.status !== 'active' || !plan) return { steps, balance, membership };
  const now = new Date(nowIso).getTime();
  let next = { ...membership };
  let saldo = Number(balance) || 0;

  if (plan.period === 'once') {
    if (next.expiresAt && new Date(next.expiresAt).getTime() <= now) {
      if (saldo > 0) steps.push({ kind: 'expiry', delta: -saldo });
      saldo = 0;
      next = { ...next, status: 'expired', expiredAt: nowIso };
    }
    return { steps, balance: saldo, membership: next };
  }

  // Ruim genoeg om nooit vast te lopen, ook bij een weekplan dat een tijd niet is bijgewerkt
  // (2+ jaar aan weken) — de dagelijkse cron/renewDue houdt dit normaal al bij.
  let guard = 0;
  while (next.nextRenewalAt && new Date(next.nextRenewalAt).getTime() <= now && guard < 120) {
    const delta = renewalDelta(plan, saldo);
    steps.push({ kind: 'renewal', delta, periodStart: next.nextRenewalAt });
    saldo += delta;
    next = { ...next, nextRenewalAt: addPeriod(next.nextRenewalAt, plan.period), lastRenewedAt: nowIso };
    guard += 1;
  }
  return { steps, balance: saldo, membership: next };
}

/** Nieuw lidmaatschap voor een plan, vanaf vandaag. */
export function newMembership({ id, orgId, userId, plan, nowIso, byUserId }) {
  const once = plan.period === 'once';
  const months = Number(plan.validityMonths) || 0;
  return {
    id,
    orgId,
    userId,
    planId: plan.id,
    planName: plan.name,
    status: 'active',
    startedAt: nowIso,
    nextRenewalAt: once ? null : addPeriod(nowIso, plan.period),
    expiresAt: once && months > 0 ? addMonths(nowIso, months) : null,
    lastRenewedAt: nowIso,
    byUserId,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

/** Maandlabel voor een post: "2026-09". */
export function periodOf(iso) {
  return String(iso).slice(0, 7);
}

/**
 * Openstaande post voor een periode van een plan (Beheer → Facturatie). Gratis plannen krijgen
 * geen post. Betalen gebeurt (nog) buiten de app; staf zet de post op betaald. Het factuurnummer
 * komt van `reserveInvoiceNumber` in dezelfde transactie; het btw-tarief van het plan reist mee,
 * zodat een latere tariefwijziging oude facturen niet verandert.
 */
export function newCharge({ id, orgId, userId, plan, membershipId, periodStartIso, nowIso, invoiceNumber = null }) {
  const monthly = plan.period === 'month';
  const period = monthly ? periodOf(periodStartIso) : null;
  // Per week/4 weken herhaalt dezelfde omschrijving zich anders elke keer; de startdatum van de
  // periode maakt losse posten op Facturatie uit elkaar te houden, zoals de maandlabel dat doet.
  const recurringDate = plan.period === 'week' || plan.period === 'fourWeeks' ? String(periodStartIso).slice(0, 10) : null;
  return {
    id,
    orgId,
    userId,
    membershipId,
    planId: plan.id,
    planName: plan.name,
    description: monthly ? `${plan.name} · ${period}` : recurringDate ? `${plan.name} · ${recurringDate}` : plan.name,
    amount: Number(plan.price) || 0,
    period,
    issuedAt: nowIso,
    dueAt: periodStartIso,
    status: 'open',
    paidAt: null,
    paidBy: null,
    note: '',
    vatRate: vatRateOf(plan.vatRate),
    invoiceNumber,
    invoiceIssuedAt: invoiceNumber ? nowIso : null,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

const accountId = (orgId, userId) => `${orgId}__${userId}`;

/**
 * Eén lidmaatschap bijwerken in een transactie: verlengingen toepassen, saldo en grootboek
 * bijschrijven, lidmaatschap opslaan. Geeft terug hoeveel stappen er gezet zijn.
 */
export async function settleMembership(db, newId, membershipRef, nowIso) {
  return db.runTransaction(async (tx) => {
    const mSnap = await tx.get(membershipRef);
    if (!mSnap.exists) return { steps: 0 };
    const m = mSnap.data();
    if (m.status !== 'active') return { steps: 0 };
    const pSnap = await tx.get(db.collection('plans').doc(String(m.planId)));
    if (!pSnap.exists) return { steps: 0 };
    const plan = { id: pSnap.id, ...pSnap.data() };
    const accountRef = db.collection('creditAccounts').doc(accountId(m.orgId, m.userId));
    const aSnap = await tx.get(accountRef);
    const balance = Number(aSnap.exists ? aSnap.data().balance : 0) || 0;
    // Studiodocument voor de factuurteller: lezen vóór de eerste write (Firestore eist dat).
    const orgRef = db.collection('orgs').doc(m.orgId);
    const orgSnap = await tx.get(orgRef);

    const result = planRenewals(m, plan, balance, nowIso);
    if (result.steps.length === 0) return { steps: 0 };

    let counterSnap = orgSnap;
    for (const step of result.steps) {
      // Elke verlenging van een betaald plan is een post op Facturatie, met een eigen factuurnummer.
      if (step.kind === 'renewal' && (Number(plan.price) || 0) > 0) {
        const invoiceNumber = reserveInvoiceNumber(tx, orgRef, counterSnap, nowIso);
        counterSnap = bumpedCounter(counterSnap);
        const charge = newCharge({ id: newId('ch'), orgId: m.orgId, userId: m.userId, plan, membershipId: mSnap.id, periodStartIso: step.periodStart, nowIso, invoiceNumber });
        tx.set(db.collection('charges').doc(charge.id), charge);
      }
      if (step.delta === 0) continue;
      tx.set(db.collection('creditLedger').doc(newId('cl')), {
        orgId: m.orgId,
        userId: m.userId,
        delta: step.delta,
        reason: step.kind === 'expiry' ? 'expiry' : 'plan',
        planId: plan.id,
        note: step.kind === 'expiry' ? `${plan.name} verlopen` : `${plan.name} verlengd`,
        byUserId: 'system',
        createdAt: nowIso,
      });
    }
    tx.set(accountRef, { orgId: m.orgId, userId: m.userId, balance: result.balance, updatedAt: nowIso }, { merge: true });
    tx.set(membershipRef, { ...result.membership, updatedAt: nowIso }, { merge: true });
    return { steps: result.steps.length };
  });
}

/**
 * Meerdere nummers in één transactie: de teller in Firestore is pas na de commit bijgewerkt, dus
 * we schuiven hem hier in het geheugen door voor de volgende post.
 */
export function bumpedCounter(orgSnap) {
  const data = orgSnap.exists ? orgSnap.data() : {};
  const b = data.business && typeof data.business === 'object' ? data.business : {};
  const next = Math.max(1, Math.trunc(Number(b.nextInvoiceNumber) || 1)) + 1;
  const bumped = { ...data, business: { ...b, nextInvoiceNumber: next } };
  return { exists: true, data: () => bumped };
}

/** Actief lidmaatschap van iemand in een studio, of null. */
export async function activeMembership(db, orgId, userId) {
  const snap = await db
    .collection('memberships')
    .where('orgId', '==', orgId)
    .where('userId', '==', userId)
    .where('status', '==', 'active')
    .get();
  const d = snap.docs[0];
  return d ? { id: d.id, ...d.data() } : null;
}
