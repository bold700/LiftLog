import { describe, expect, it } from 'vitest';
import { addMonths, addPeriod, newCharge, newMembership, periodOf, planRenewals, renewalDelta } from '../../api/_lib/subscriptions.mjs';

const month = (extra = {}) => ({ id: 'p1', name: 'Maand 8', period: 'month', credits: 8, rollover: 'expire', ...extra });
const week = (extra = {}) => ({ id: 'p3', name: 'Week 2', period: 'week', credits: 2, rollover: 'expire', ...extra });

describe('abonnementen', () => {
  it('telt maanden op zonder over het maandeinde te schieten', () => {
    expect(addMonths('2026-01-31T10:00:00.000Z', 1)).toBe('2026-02-28T10:00:00.000Z');
    expect(addMonths('2026-03-15T10:00:00.000Z', 6)).toBe('2026-09-15T10:00:00.000Z');
  });

  it('bij "vervalt" wordt het saldo precies het maandtegoed, bij "meenemen" komt het erbij', () => {
    expect(renewalDelta(month(), 3)).toBe(5);
    expect(renewalDelta(month({ rollover: 'carry' }), 3)).toBe(8);
    expect(renewalDelta(month({ credits: null }), 3)).toBe(0);
  });

  it('verlengt een maandplan per verstreken periode en schuift de volgende datum op', () => {
    const m = { status: 'active', nextRenewalAt: '2026-08-01T00:00:00.000Z' };
    const r = planRenewals(m, month({ rollover: 'carry' }), 2, '2026-09-20T12:00:00.000Z');
    expect(r.steps.map((s) => s.delta)).toEqual([8, 8]);
    expect(r.balance).toBe(18);
    expect(r.membership.nextRenewalAt).toBe('2026-10-01T00:00:00.000Z');
  });

  it('doet niets als de verlenging nog niet aan de beurt is', () => {
    const m = { status: 'active', nextRenewalAt: '2026-10-01T00:00:00.000Z' };
    const r = planRenewals(m, month(), 5, '2026-09-20T12:00:00.000Z');
    expect(r.steps).toEqual([]);
    expect(r.balance).toBe(5);
  });

  it('laat een verlopen strippenkaart vervallen, inclusief het restant', () => {
    const once = { id: 'p2', name: '10-rittenkaart', period: 'once', credits: 10, validityMonths: 6 };
    const m = { status: 'active', nextRenewalAt: null, expiresAt: '2026-09-01T00:00:00.000Z' };
    const r = planRenewals(m, once, 3, '2026-09-20T12:00:00.000Z');
    expect(r.steps).toEqual([{ kind: 'expiry', delta: -3 }]);
    expect(r.balance).toBe(0);
    expect(r.membership.status).toBe('expired');
  });

  it('een post voor een maandplan draagt de maand, een kaart niet', () => {
    const now = '2026-09-20T12:00:00.000Z';
    const m = newCharge({ id: 'ch1', orgId: 'vanas', userId: 'u1', plan: { ...month(), price: 139 }, membershipId: 'm1', periodStartIso: '2026-10-01T00:00:00.000Z', nowIso: now });
    expect(m.period).toBe('2026-10');
    expect(m.description).toBe('Maand 8 · 2026-10');
    expect(m.amount).toBe(139);
    expect(m.status).toBe('open');
    const k = newCharge({ id: 'ch2', orgId: 'vanas', userId: 'u1', plan: { id: 'p2', name: 'Kaart', period: 'once', price: 120 }, membershipId: 'm2', periodStartIso: now, nowIso: now });
    expect(k.period).toBeNull();
    expect(k.description).toBe('Kaart');
    expect(periodOf('2026-02-28T10:00:00.000Z')).toBe('2026-02');
  });

  it('een nieuw lidmaatschap weet zijn volgende verlenging of einddatum', () => {
    const now = '2026-09-20T12:00:00.000Z';
    const maand = newMembership({ id: 'm1', orgId: 'vanas', userId: 'u1', plan: month(), nowIso: now, byUserId: 'admin' });
    expect(maand.nextRenewalAt).toBe('2026-10-20T12:00:00.000Z');
    expect(maand.expiresAt).toBeNull();
    const kaart = newMembership({ id: 'm2', orgId: 'vanas', userId: 'u1', plan: { id: 'p2', name: 'Kaart', period: 'once', credits: 10, validityMonths: 6 }, nowIso: now, byUserId: 'admin' });
    expect(kaart.nextRenewalAt).toBeNull();
    expect(kaart.expiresAt).toBe('2027-03-20T12:00:00.000Z');
  });

  it('telt een week of vier weken op zonder de maand erbij te halen', () => {
    expect(addPeriod('2026-09-20T12:00:00.000Z', 'week')).toBe('2026-09-27T12:00:00.000Z');
    expect(addPeriod('2026-09-20T12:00:00.000Z', 'fourWeeks')).toBe('2026-10-18T12:00:00.000Z');
    expect(addPeriod('2026-01-31T10:00:00.000Z', 'month')).toBe(addMonths('2026-01-31T10:00:00.000Z', 1));
  });

  it('verlengt een weekplan per verstreken week, niet per maand', () => {
    const m = { status: 'active', nextRenewalAt: '2026-09-06T00:00:00.000Z' };
    const r = planRenewals(m, week({ rollover: 'carry' }), 0, '2026-09-20T12:00:00.000Z');
    // 06, 13, 20 sep: drie verstreken weekmomenten.
    expect(r.steps.map((s) => s.delta)).toEqual([2, 2, 2]);
    expect(r.membership.nextRenewalAt).toBe('2026-09-27T00:00:00.000Z');
  });

  it('een nieuw weeklidmaatschap verlengt over precies 7 dagen', () => {
    const now = '2026-09-20T12:00:00.000Z';
    const lid = newMembership({ id: 'm3', orgId: 'vanas', userId: 'u1', plan: week(), nowIso: now, byUserId: 'admin' });
    expect(lid.nextRenewalAt).toBe('2026-09-27T12:00:00.000Z');
  });

  it('een post voor een weekplan draagt de startdatum in de omschrijving, geen maandlabel', () => {
    const c = newCharge({ id: 'ch3', orgId: 'vanas', userId: 'u1', plan: { ...week(), price: 30 }, membershipId: 'm3', periodStartIso: '2026-09-27T12:00:00.000Z', nowIso: '2026-09-20T12:00:00.000Z' });
    expect(c.period).toBeNull();
    expect(c.description).toBe('Week 2 · 2026-09-27');
  });
});
