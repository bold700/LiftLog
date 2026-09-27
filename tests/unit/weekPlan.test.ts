import { describe, expect, it } from 'vitest';
import { dayIndexForWeekday, fixedMomentsOf, nextPlannedDayIndex, suggestWeekdays, weekdayText } from '../../src/utils/weekPlan';
import type { ClassType, StandingBooking } from '../../src/types';

const standing = (over: Partial<StandingBooking>): StandingBooking => ({
  id: 's',
  orgId: 'o1',
  userId: 'u1',
  classTypeId: 'pt',
  weekday: 2,
  startTime: '18:00',
  active: true,
  startDate: null,
  pausedFrom: null,
  pausedUntil: null,
  lastOutcome: null,
  lastOutcomeDate: null,
  createdAt: '',
  updatedAt: '',
  ...over,
});
const type = (id: string, name: string, privateFor: string | null) => ({ id, name, privateFor }) as ClassType;

describe('weekplanning van een persoonlijk schema', () => {
  const types = [type('pt', 'PT Anna', 'u1'), type('boot', 'Bootcamp', null)];

  it('zet vaste momenten om naar maandag = 0 en laat uitgezette weg', () => {
    const moments = fixedMomentsOf(
      [
        standing({ id: 'a', classTypeId: 'boot', weekday: 4, startTime: '09:00' }),
        standing({ id: 'b', classTypeId: 'pt', weekday: 2 }),
        standing({ id: 'c', classTypeId: 'boot', weekday: 0, active: false }),
      ],
      types
    );
    expect(moments).toEqual([
      { weekday: 1, startTime: '18:00', label: 'PT', pt: true },
      { weekday: 3, startTime: '09:00', label: 'Bootcamp', pt: false },
    ]);
    expect(weekdayText(1, moments)).toBe('PT 18:00');
    expect(weekdayText(5, moments)).toBe('thuis / zelf');
  });

  it('verdeelt de dagen over de vaste momenten, extra dagen met rust ertussen', () => {
    const moments = fixedMomentsOf([standing({ weekday: 1 }), standing({ id: 'x', classTypeId: 'boot', weekday: 4 })], types);
    // Ma en do in de studio; een derde dag komt zo ver mogelijk van beide.
    expect(suggestWeekdays(2, moments)).toEqual([0, 3]);
    const three = suggestWeekdays(3, moments);
    expect(three.slice(0, 1)).toEqual([0]);
    expect(new Set(three).size).toBe(3);
    expect(three).toContain(3);
    // Meer momenten dan dagen: de eerste momenten van de week.
    expect(suggestWeekdays(1, moments)).toEqual([0]);
    // Zonder vaste momenten toch een verdeling.
    expect(suggestWeekdays(2, []).every((d) => d != null)).toBe(true);
  });

  it('vindt de dag van vandaag of de eerstvolgende', () => {
    const schema = {
      days: [
        { dayLabel: 'A', exercises: [], weekday: 1 },
        { dayLabel: 'B', exercises: [], weekday: 4 },
      ],
    };
    expect(dayIndexForWeekday(schema, 4)).toBe(1);
    // 2026-09-29 is een dinsdag (weekdag 1).
    expect(nextPlannedDayIndex(schema, new Date('2026-09-29T10:00:00'))).toBe(0);
    // Woensdag: de eerstvolgende is vrijdag (dag B).
    expect(nextPlannedDayIndex(schema, new Date('2026-09-30T10:00:00'))).toBe(1);
    // Zaterdag: de week loopt rond naar dinsdag.
    expect(nextPlannedDayIndex(schema, new Date('2026-10-03T10:00:00'))).toBe(0);
    expect(nextPlannedDayIndex({ days: [{ dayLabel: 'A', exercises: [] }] })).toBeNull();
  });
});

describe('PT-moment voorbereiden', () => {
  it('stelt de workout van het lid voor, op de dag van de weekplanning', async () => {
    const { autoPlanForClass, orderForClass } = await import('../../src/utils/classPlanSuggest');
    const mk = (id: string, clientId: string | null, weekdays: (number | null)[], audience: 'single' | 'group' = 'single') =>
      ({
        id,
        name: id,
        trainerId: 't',
        clientId,
        audience,
        createdAt: '',
        days: weekdays.map((w, i) => ({ dayLabel: `Dag ${i + 1}`, exercises: [], weekday: w })),
      }) as import('../../src/types').Schema;
    const anna = mk('anna', 'u1', [1, 3]);
    const other = mk('bas', 'u2', [1]);
    const group = mk('groep', null, [null], 'group');
    // 2026-10-01 is een donderdag (weekdag 3).
    const cls = { date: '2026-10-01', privateFor: 'u1' };
    expect(autoPlanForClass([anna, other, group], cls)).toEqual({ schema: anna, dayIndex: 1 });
    expect(orderForClass([other, group, anna], cls)[0]).toEqual({ schema: anna, suggested: true });
    // Geen PT-moment: geen voorstel.
    expect(autoPlanForClass([anna], { date: '2026-10-01' })).toBeNull();
    // Twee workouts van het lid en geen weekplanning: de trainer kiest zelf.
    expect(autoPlanForClass([mk('a1', 'u1', [null]), mk('a2', 'u1', [null])], cls)).toBeNull();
  });
});
