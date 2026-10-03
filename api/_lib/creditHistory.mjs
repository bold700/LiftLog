/**
 * Creditgeschiedenis: waar is elke credit gebleven? Uit het grootboek (creditLedger) per regel wat
 * er gebeurde, bij welke les, wie het deed, hoe het afliep (aanwezig, niet gekomen, te laat
 * afgemeld) en het saldo daarna. Zo is er achteraf geen discussie: "credit ingezet op 28 sep voor
 * Bootcamp di 30 sep 19:00, niet gekomen".
 *
 * Puur (geen Firestore), zodat het getest kan worden; het ophalen staat in api/booking.mjs
 * (`creditHistory`). Alleen credits; het tegoed van groepen (euro's) staat er niet in.
 */

const KINDS = new Set(['booking', 'refund', 'manual', 'plan', 'expiry', 'merge']);

const byTime = (a, b) => String(a.createdAt).localeCompare(String(b.createdAt)) || String(a.id).localeCompare(String(b.id));

/**
 * Hoe liep een boeking af? Per les en lid lopen we de regels op tijd af: een terugboeking ("refund")
 * hoort bij de oudste boeking die nog niet terugbetaald is. Wat overblijft, krijgt de afloop van de
 * boeking zelf: aanwezig, niet gekomen, te laat afgemeld (geen credit terug), nog niet geweest of
 * niet ingevuld.
 */
function bookingOutcomes(entries, bookings, classes, now) {
  const outcome = {};
  const perKey = {};
  for (const e of [...entries].sort(byTime)) {
    if (!e.classId || (e.reason !== 'booking' && e.reason !== 'refund')) continue;
    (perKey[`${e.userId}|${e.classId}`] ??= []).push(e);
  }
  const bookingsByKey = {};
  for (const b of bookings) (bookingsByKey[`${b.userId}|${b.classId}`] ??= []).push(b);

  for (const [key, list] of Object.entries(perKey)) {
    const open = [];
    for (const e of list) {
      if (e.reason === 'booking') open.push(e);
      else if (open.length) outcome[open.shift().id] = 'refunded';
    }
    if (!open.length) continue;
    const docs = bookingsByKey[key] ?? [];
    const active = docs.find((b) => b.status === 'booked' || b.status === 'attended');
    const [, classId] = key.split('|');
    const cls = classes[classId];
    let result;
    if (active) {
      if (active.attendance === 'present' || active.status === 'attended') result = 'present';
      else if (active.attendance === 'absent') result = 'absent';
      else if (cls?.startsAt != null && cls.startsAt > now) result = 'upcoming';
      else result = 'unmarked';
    } else if (docs.some((b) => b.status === 'cancelled')) {
      result = 'late_cancel';
    } else {
      result = 'unknown';
    }
    for (const e of open) outcome[e.id] = result;
  }
  return outcome;
}

/**
 * @param {object} p
 * @param {Array<{id:string,userId:string,delta:number,reason:string,classId?:string,note?:string,byUserId?:string,createdAt:string}>} p.entries
 *   Alle grootboekregels van de betrokken leden (niet alleen de getoonde periode: het lopende saldo
 *   en het koppelen van afmeldingen hebben de hele geschiedenis nodig).
 * @param {Record<string, number>} p.balances Huidig saldo per lid.
 * @param {Record<string, {title?:string,date?:string,startTime?:string,cancelledAt?:string|null,startsAt?:number|null}>} p.classes
 * @param {Array<{userId:string,classId:string,status:string,attendance?:string|null}>} p.bookings
 * @param {Record<string, string>} p.names
 * @param {number} p.now
 * @returns {{ rows: object[], openings: Record<string, number> }}
 *   `rows` nieuwste eerst, met `balanceAfter`; `openings` het saldo vóór de eerste regel per lid
 *   (bijv. overgenomen uit een vorig systeem zonder geschiedenis), alleen als dat niet 0 is.
 */
export function creditHistoryRows({ entries, balances, classes, bookings, names, now }) {
  const credits = entries.filter((e) => !e.groupId && e.unit !== 'eur');
  const outcomes = bookingOutcomes(credits, bookings, classes, now);

  // Lopend saldo: vanaf het huidige saldo terugrekenen, nieuwste regel eerst.
  const sorted = [...credits].sort(byTime).reverse();
  const running = { ...balances };
  const rows = sorted.map((e) => {
    const delta = Number(e.delta) || 0;
    const balanceAfter = Number(running[e.userId] ?? 0) || 0;
    running[e.userId] = balanceAfter - delta;
    const cls = e.classId ? classes[e.classId] : null;
    const kind = KINDS.has(e.reason) ? e.reason : 'other';
    const by = e.byUserId ?? null;
    return {
      id: e.id,
      userId: e.userId,
      userName: names[e.userId] ?? 'Oud account',
      at: e.createdAt,
      delta,
      balanceAfter,
      kind,
      note: e.note ? String(e.note) : null,
      by: by === 'system' || !by ? 'system' : by === e.userId ? 'self' : 'staff',
      byName: by && by !== 'system' ? names[by] ?? 'Oud account' : null,
      class: cls
        ? { id: e.classId, title: String(cls.title ?? 'Les'), date: cls.date ?? null, startTime: cls.startTime ?? null, cancelled: !!cls.cancelledAt }
        : null,
      outcome: kind === 'booking' ? outcomes[e.id] ?? null : null,
    };
  });

  const openings = {};
  for (const [userId, rest] of Object.entries(running)) {
    const r = Math.round(rest * 100) / 100;
    if (r !== 0 && credits.some((e) => e.userId === userId)) openings[userId] = r;
  }
  return { rows, openings };
}

/** Totalen over regels: toegekend, ingezet voor lessen, terug na afmelden, verlopen, met de hand afgeschreven, en hoe vaak niet gekomen. */
export function creditTotals(rows) {
  const t = { granted: 0, used: 0, refunded: 0, expired: 0, deducted: 0, noShows: 0 };
  for (const r of rows) {
    if (r.kind === 'booking') {
      t.used += -r.delta;
      if (r.outcome === 'absent') t.noShows += 1;
    } else if (r.kind === 'refund') t.refunded += r.delta;
    else if (r.kind === 'expiry') t.expired += -r.delta;
    else if (r.delta > 0) t.granted += r.delta;
    else t.deducted += -r.delta;
  }
  return t;
}
