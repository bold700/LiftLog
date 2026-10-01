/**
 * Factuurritme van de studio (Beheer → Instellingen, alleen de eigenaar): elke 4 weken of elke
 * maand vanaf een startdatum. Wie halverwege instapt, krijgt een eerste factuur en credits op maat
 * tot de eerstvolgende factuurdatum. Zelfde rekensom als de server (api/_lib/billingCycle.mjs);
 * de app gebruikt dit om vooraf te tonen wat Opslaan doet.
 */
import type { OrgBilling } from '../types';

const DAY_MS = 86_400_000;

const dayStart = (date: string) => Date.parse(`${date}T00:00:00Z`);
const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

function addMonthsDay(date: string, months: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(d, last));
  return isoDay(first.getTime());
}

/** De lopende periode op een dag: { start, end } (end = eerstvolgende factuurdatum). */
export function cycleAt(billing: OrgBilling, today: string): { start: string; end: string } {
  if (billing.period === 'fourWeeks') {
    const anchor = dayStart(billing.anchorDate);
    const k = Math.floor((dayStart(today) - anchor) / (28 * DAY_MS));
    const start = anchor + k * 28 * DAY_MS;
    return { start: isoDay(start), end: isoDay(start + 28 * DAY_MS) };
  }
  const [ay, am] = billing.anchorDate.split('-').map(Number);
  const [ty, tm] = today.split('-').map(Number);
  let n = (ty - ay) * 12 + (tm - am);
  while (addMonthsDay(billing.anchorDate, n) > today) n -= 1;
  while (addMonthsDay(billing.anchorDate, n + 1) <= today) n += 1;
  return { start: addMonthsDay(billing.anchorDate, n), end: addMonthsDay(billing.anchorDate, n + 1) };
}

export interface FirstPeriod {
  from: string;
  until: string;
  days: number;
  totalDays: number;
  full: boolean;
  amount: number;
  credits: number | null;
  nextRenewalAt: string;
}

/** Eerste periode van een nieuw abonnement, of null als het ritme van de studio er niet voor geldt. */
export function firstPeriod(
  plan: { period: string; price: number; credits: number | null },
  billing: OrgBilling | null | undefined,
  today: string
): FirstPeriod | null {
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
