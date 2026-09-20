import { describe, expect, it } from 'vitest';
import { addMonths, newMembership, planRenewals, renewalDelta } from '../../api/_lib/subscriptions.mjs';

const month = (extra = {}) => ({ id: 'p1', name: 'Maand 8', period: 'month', credits: 8, rollover: 'expire', ...extra });

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

  it('een nieuw lidmaatschap weet zijn volgende verlenging of einddatum', () => {
    const now = '2026-09-20T12:00:00.000Z';
    const maand = newMembership({ id: 'm1', orgId: 'vanas', userId: 'u1', plan: month(), nowIso: now, byUserId: 'admin' });
    expect(maand.nextRenewalAt).toBe('2026-10-20T12:00:00.000Z');
    expect(maand.expiresAt).toBeNull();
    const kaart = newMembership({ id: 'm2', orgId: 'vanas', userId: 'u1', plan: { id: 'p2', name: 'Kaart', period: 'once', credits: 10, validityMonths: 6 }, nowIso: now, byUserId: 'admin' });
    expect(kaart.nextRenewalAt).toBeNull();
    expect(kaart.expiresAt).toBe('2027-03-20T12:00:00.000Z');
  });
});
