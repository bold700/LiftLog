/**
 * Weekplanning van een persoonlijk schema: welke dag van het schema hoort bij welke dag van de
 * week. Een sporter met 2 of 3 keer per week heeft vaste momenten (PT-moment of vaste les in de
 * studio); de andere trainingsdagen doet hij thuis of zelf. De trainer koppelt elke schemadag aan
 * een weekdag (`SchemaDay.weekday`, 0 = maandag); het systeem stelt een verdeling voor.
 */
import type { ClassType, Schema, StandingBooking } from '../types';

export const WEEKDAY_NAMES = ['Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag', 'Zaterdag', 'Zondag'];
export const WEEKDAY_SHORT = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'];

/** Vast moment van een sporter in de studio: elke week op deze dag en tijd. */
export interface FixedMoment {
  /** 0 = maandag … 6 = zondag. */
  weekday: number;
  startTime: string;
  /** "PT" voor een persoonlijk moment, anders de naam van de les. */
  label: string;
  pt: boolean;
}

/** Weekdag met maandag = 0 voor een Date. */
export const weekdayOfDate = (d: Date) => (d.getDay() + 6) % 7;

/** Actieve vaste momenten (PT en vaste lessen), op volgorde van de week. */
export function fixedMomentsOf(standings: StandingBooking[], types: ClassType[]): FixedMoment[] {
  const byId = new Map(types.map((t) => [t.id, t]));
  return standings
    .filter((s) => s.active)
    .map((s) => {
      const t = byId.get(s.classTypeId);
      const pt = !!t?.privateFor;
      return { weekday: (s.weekday + 6) % 7, startTime: s.startTime, label: pt ? 'PT' : (t?.name ?? 'Les'), pt };
    })
    .sort((a, b) => a.weekday - b.weekday || a.startTime.localeCompare(b.startTime));
}

/** "PT 18:00" of "Bootcamp 09:00". */
export const momentText = (m: FixedMoment) => `${m.label} ${m.startTime}`;

/** Wat er op een weekdag gebeurt: het vaste moment in de studio, of thuis/zelf. */
export function weekdayText(weekday: number, moments: FixedMoment[]): string {
  const here = moments.filter((m) => m.weekday === weekday);
  return here.length ? here.map(momentText).join(' + ') : 'thuis / zelf';
}

/**
 * Voorstel: de schemadagen op volgorde over de vaste momenten (één per weekdag). Meer dagen dan
 * momenten: de rest krijgt een dag ertussen, met zoveel mogelijk rust tussen twee trainingen.
 */
export function suggestWeekdays(dayCount: number, moments: FixedMoment[]): (number | null)[] {
  const fixed = [...new Set(moments.map((m) => m.weekday))].sort((a, b) => a - b).slice(0, dayCount);
  const taken = new Set(fixed);
  const extra: number[] = [];
  while (fixed.length + extra.length < dayCount && taken.size < 7) {
    // De vrije dag met de grootste afstand tot de dichtstbijzijnde training (de week loopt rond).
    let best = -1;
    let bestGap = -1;
    for (let d = 0; d < 7; d++) {
      if (taken.has(d)) continue;
      const gap = taken.size ? Math.min(...[...taken].map((t) => Math.min(Math.abs(d - t), 7 - Math.abs(d - t)))) : 7 - d;
      if (gap > bestGap) {
        best = d;
        bestGap = gap;
      }
    }
    taken.add(best);
    extra.push(best);
  }
  const all = [...fixed, ...extra].sort((a, b) => a - b);
  return Array.from({ length: dayCount }, (_, i) => all[i] ?? null);
}

/** Heeft dit schema een weekplanning? */
export const hasWeekPlan = (schema: Pick<Schema, 'days'>) => schema.days.some((d) => typeof d.weekday === 'number');

/** De schemadag die op deze weekdag staat, of null. */
export function dayIndexForWeekday(schema: Pick<Schema, 'days'>, weekday: number): number | null {
  const i = schema.days.findIndex((d) => d.weekday === weekday);
  return i >= 0 ? i : null;
}

/** De schemadag van vandaag, anders de eerstvolgende in de week. Null zonder weekplanning. */
export function nextPlannedDayIndex(schema: Pick<Schema, 'days'>, today: Date = new Date()): number | null {
  if (!hasWeekPlan(schema)) return null;
  const wd = weekdayOfDate(today);
  for (let step = 0; step < 7; step++) {
    const i = dayIndexForWeekday(schema, (wd + step) % 7);
    if (i != null) return i;
  }
  return null;
}

/** Dagen op volgorde van de week (maandag eerst); dagen zonder vaste dag achteraan. */
export function weekPlanOrder(schema: Pick<Schema, 'days'>): number[] {
  const key = (i: number) => (typeof schema.days[i].weekday === 'number' ? (schema.days[i].weekday as number) : 7);
  return schema.days.map((_, i) => i).sort((a, b) => key(a) - key(b) || a - b);
}
