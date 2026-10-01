import { describe, expect, it } from 'vitest';
import { billingOf, cycleAt, firstPeriod } from '../../api/_lib/billingCycle.mjs';
import { cycleAt as cycleAtClient, firstPeriod as firstPeriodClient } from '../../src/utils/billingCycle';

const fourWeeks = { period: 'fourWeeks', anchorDate: '2026-10-05' };
const monthly = { period: 'month', anchorDate: '2026-01-31' };
const plan = { period: 'fourWeeks', price: 80, credits: 8 };

describe('factuurritme van de studio', () => {
  it('leest alleen een geldige instelling', () => {
    expect(billingOf({ billing: fourWeeks })).toEqual(fourWeeks);
    expect(billingOf({ billing: { period: 'week', anchorDate: '2026-10-05' } })).toBeNull();
    expect(billingOf({ billing: { period: 'month' } })).toBeNull();
    expect(billingOf(null)).toBeNull();
  });

  it('per 4 weken: de periode rond een dag, ook vóór de startdatum', () => {
    expect(cycleAt(fourWeeks, '2026-10-05')).toEqual({ start: '2026-10-05', end: '2026-11-02' });
    expect(cycleAt(fourWeeks, '2026-10-19')).toEqual({ start: '2026-10-05', end: '2026-11-02' });
    expect(cycleAt(fourWeeks, '2026-11-02')).toEqual({ start: '2026-11-02', end: '2026-11-30' });
    expect(cycleAt(fourWeeks, '2026-10-01')).toEqual({ start: '2026-09-07', end: '2026-10-05' });
  });

  it('per maand: op de dag van de startdatum, korte maanden afgekapt', () => {
    expect(cycleAt(monthly, '2026-02-15')).toEqual({ start: '2026-01-31', end: '2026-02-28' });
    expect(cycleAt(monthly, '2026-03-01')).toEqual({ start: '2026-02-28', end: '2026-03-31' });
    expect(cycleAt({ period: 'month', anchorDate: '2026-10-01' }, '2026-10-17')).toEqual({ start: '2026-10-01', end: '2026-11-01' });
  });

  it('halverwege instappen: eerste factuur en credits naar rato tot de factuurdatum', () => {
    // 19 okt: nog 14 van de 28 dagen → de helft.
    expect(firstPeriod(plan, fourWeeks, '2026-10-19')).toMatchObject({
      from: '2026-10-19', until: '2026-11-02', days: 14, totalDays: 28, full: false, amount: 40, credits: 4, nextRenewalAt: '2026-11-02T00:00:00.000Z',
    });
    // Op de factuurdatum zelf: een hele periode.
    expect(firstPeriod(plan, fourWeeks, '2026-11-02')).toMatchObject({ full: true, amount: 80, credits: 8, until: '2026-11-30' });
    // Onbeperkt: geen credits, wel een prijs naar rato.
    expect(firstPeriod({ ...plan, credits: null }, fourWeeks, '2026-10-26')).toMatchObject({ days: 7, amount: 20, credits: null });
  });

  it('geldt niet voor een ander soort abonnement of zonder instelling', () => {
    expect(firstPeriod({ ...plan, period: 'once' }, fourWeeks, '2026-10-19')).toBeNull();
    expect(firstPeriod({ ...plan, period: 'month' }, fourWeeks, '2026-10-19')).toBeNull();
    expect(firstPeriod(plan, null, '2026-10-19')).toBeNull();
  });

  it('de app rekent hetzelfde als de server', () => {
    for (const day of ['2026-10-01', '2026-10-19', '2026-11-02', '2027-02-27']) {
      expect(cycleAtClient(fourWeeks, day)).toEqual(cycleAt(fourWeeks, day));
      expect(cycleAtClient(monthly, day)).toEqual(cycleAt(monthly, day));
      expect(firstPeriodClient(plan, fourWeeks, day)).toEqual(firstPeriod(plan, fourWeeks, day));
    }
  });
});
