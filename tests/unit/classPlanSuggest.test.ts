import { describe, expect, it } from 'vitest';
import { orderForClass, scheduleWeekOf, suggestionScore, weekdayMonFirst } from '../../src/utils/classPlanSuggest';
import type { Schema } from '../../src/types';

const schema = (id: string, extra: Partial<Schema> = {}): Schema =>
  ({ id, name: id, trainerId: 't', clientId: null, createdAt: '', days: [], ...extra }) as Schema;

describe('lesplanning: voorstel', () => {
  // Zondag 4 oktober 2026 valt in ISO-week 40, dus schemaweek 14.
  const zondag = { date: '2026-10-04' };

  it('rekent weekdag en schemaweek uit', () => {
    expect(weekdayMonFirst('2026-10-04')).toBe(6);
    expect(weekdayMonFirst('2026-09-28')).toBe(0);
    expect(scheduleWeekOf('2026-10-04')).toBe(14);
  });

  it('stelt de groepsles van die week en die dag voor', () => {
    const lijst = [
      schema('Andere week', { scheduleWeek: 13, seriesOrder: 6 }),
      schema('Week 14 woensdag', { scheduleWeek: 14, seriesOrder: 2 }),
      schema('Week 14 zondag', { scheduleWeek: 14, seriesOrder: 6 }),
      schema('Losse workout'),
    ];
    const volgorde = orderForClass(lijst, zondag);
    expect(volgorde.map((o) => o.schema.id)).toEqual(['Week 14 zondag', 'Week 14 woensdag', 'Andere week', 'Losse workout']);
    expect(volgorde.filter((o) => o.suggested).map((o) => o.schema.id)).toEqual(['Week 14 zondag', 'Week 14 woensdag']);
  });

  it('de workout van de lessoort gaat voor', () => {
    expect(suggestionScore(schema('Lessoort'), { ...zondag, schemaId: 'Lessoort' })).toBe(3);
    expect(
      orderForClass([schema('Week 14', { scheduleWeek: 14 }), schema('Lessoort')], { ...zondag, schemaId: 'Lessoort' })[0].schema
        .id
    ).toBe('Lessoort');
  });
});
