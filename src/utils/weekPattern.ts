/**
 * Om de week: een vast moment valt in de even of de oneven weken (`weekParity` 0 of 1), geteld
 * vanaf maandag 5 januari 1970 (week 0). Zelfde rekensom als api/_lib/classSchedule.mjs.
 */

const DAY_MS = 86_400_000;
const EPOCH_MONDAY = Date.UTC(1970, 0, 5);
const mod2 = (n: number) => ((n % 2) + 2) % 2;

export interface WeekPattern {
  everyWeeks?: number | null;
  weekParity?: number | null;
}

/** Weeknummer (vanaf maandag) van een datum "YYYY-MM-DD". */
export function weekIndex(dateIso: string): number {
  const [y, m, d] = dateIso.split('-').map(Number);
  return Math.floor((Date.UTC(y, m - 1, d) - EPOCH_MONDAY) / (7 * DAY_MS));
}

export const isBiweekly = (p: WeekPattern | null | undefined): boolean => Number(p?.everyWeeks) === 2;

/** Valt dit moment (elke week, of om de week in zijn eigen week) in de week van deze datum? */
export function onPatternWeek(p: WeekPattern | null | undefined, dateIso: string): boolean {
  if (!isBiweekly(p)) return true;
  return mod2(weekIndex(dateIso)) === mod2(Number(p?.weekParity ?? 0));
}

/** Hoe zwaar een vast moment telt voor "x per week": elke week 1, om de week 0,5. */
export const weekWeight = (p: WeekPattern | null | undefined): number => (isBiweekly(p) ? 0.5 : 1);

/** "1,5" */
export const nlCount = (n: number): string => String(Math.round(n * 2) / 2).replace('.', ',');
