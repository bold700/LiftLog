/**
 * Facturatieperiode van de studio. De eigenaar kiest hoe de studio factureert: elke 4 weken of
 * elke maand, vanaf een startdatum (`orgs/{orgId}.billing = { period, anchorDate }`). Iedereen loopt
 * dan op hetzelfde ritme: wie halverwege instapt, krijgt een eerste factuur en credits op maat tot
 * de eerstvolgende factuurdatum; daarna een gewone periode, tegelijk met de rest.
 *
 * Zonder instelling (of voor een abonnement met een andere periode, zoals per week of een
 * strippenkaart) loopt de periode zoals voorheen vanaf de dag dat het lid begint.
 *
 * Pure functies; zelfde rekensom als src/utils/billingCycle.ts (de app toont er vooraf wat Opslaan doet).
 */

const DAY_MS = 86_400_000;
export const BILLING_PERIODS = ['fourWeeks', 'month'];

/** De instelling van de studio, of null als er (nog) niets geldigs staat. */
export function billingOf(org) {
  const b = org?.billing;
  if (!b || typeof b !== 'object') return null;
  if (!BILLING_PERIODS.includes(b.period)) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(b.anchorDate ?? ''))) return null;
  return { period: b.period, anchorDate: String(b.anchorDate) };
}

const dayStart = (date) => Date.parse(`${date}T00:00:00Z`);
const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);

/** Zoveel maanden na een datum, op dezelfde dag (31 jan + 1 → 28/29 feb). */
function addMonthsDay(date, months) {
  const [y, m, d] = date.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(d, last));
  return isoDay(first.getTime());
}

/** De lopende periode op een dag ("YYYY-MM-DD"): { start, end } (end = eerstvolgende factuurdatum). */
export function cycleAt(billing, today) {
  if (billing.period === 'fourWeeks') {
    const anchor = dayStart(billing.anchorDate);
    const k = Math.floor((dayStart(today) - anchor) / (28 * DAY_MS));
    const start = anchor + k * 28 * DAY_MS;
    return { start: isoDay(start), end: isoDay(start + 28 * DAY_MS) };
  }
  // Per maand: de laatste "dag X" van de maand op of vóór vandaag, vanaf de startdatum geteld.
  const [ay, am] = billing.anchorDate.split('-').map(Number);
  const [ty, tm] = today.split('-').map(Number);
  let n = (ty - ay) * 12 + (tm - am);
  while (addMonthsDay(billing.anchorDate, n) > today) n -= 1;
  while (addMonthsDay(billing.anchorDate, n + 1) <= today) n += 1;
  return { start: addMonthsDay(billing.anchorDate, n), end: addMonthsDay(billing.anchorDate, n + 1) };
}

/**
 * Eerste periode van een nieuw lidmaatschap. Geeft null als de studio-instelling niet geldt voor
 * dit abonnement (geen instelling, gratis, strippenkaart of een andere periode): dan zoals vroeger.
 * Anders: tot de eerstvolgende factuurdatum, met prijs en credits naar rato van de dagen
 * (vandaag telt mee). Begin je op een factuurdatum, dan is het gewoon een hele periode.
 */
export function firstPeriod(plan, billing, today) {
  if (!billing || !plan || plan.period !== billing.period) return null;
  const { start, end } = cycleAt(billing, today);
  const totalDays = Math.round((dayStart(end) - dayStart(start)) / DAY_MS);
  const days = Math.round((dayStart(end) - dayStart(today)) / DAY_MS);
  const fraction = totalDays > 0 ? days / totalDays : 1;
  const price = Number(plan.price) || 0;
  const credits = plan.credits == null ? null : Math.round((Number(plan.credits) || 0) * fraction);
  return {
    from: today,
    until: end,
    days,
    totalDays,
    full: days >= totalDays,
    amount: Math.round(price * fraction * 100) / 100,
    credits,
    nextRenewalAt: `${end}T00:00:00.000Z`,
  };
}
