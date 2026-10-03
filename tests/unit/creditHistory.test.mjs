import { describe, it, expect } from 'vitest';
import { creditHistoryRows, creditTotals } from '../../api/_lib/creditHistory.mjs';

const NOW = Date.parse('2026-10-03T12:00:00Z');
const past = Date.parse('2026-09-30T17:00:00Z');
const future = Date.parse('2026-10-06T17:00:00Z');
const classes = {
  c1: { title: 'Bootcamp', date: '2026-09-30', startTime: '19:00', startsAt: past },
  c2: { title: 'Kettlebell', date: '2026-09-30', startTime: '20:00', startsAt: past },
  c3: { title: 'Bootcamp', date: '2026-10-06', startTime: '19:00', startsAt: future },
  c4: { title: 'Yoga', date: '2026-09-29', startTime: '09:00', startsAt: past },
  c5: { title: 'Circuit', date: '2026-09-29', startTime: '10:00', startsAt: past, cancelledAt: '2026-09-28T08:00:00Z' },
};
const e = (id, createdAt, delta, reason, extra = {}) => ({ id, userId: 'anna', createdAt, delta, reason, byUserId: 'anna', ...extra });

describe('creditHistoryRows', () => {
  const entries = [
    e('l0', '2026-09-01T10:00:00Z', 10, 'plan', { note: '10-rittenkaart gestart', byUserId: 'simone' }),
    e('l1', '2026-09-28T12:00:00Z', -1, 'booking', { classId: 'c1' }),
    e('l2', '2026-09-28T12:05:00Z', -1, 'booking', { classId: 'c2' }),
    e('l3', '2026-09-28T13:00:00Z', -1, 'booking', { classId: 'c3' }),
    e('l4', '2026-09-27T09:00:00Z', -1, 'booking', { classId: 'c4' }),
    e('l5', '2026-09-27T09:10:00Z', -1, 'booking', { classId: 'c5' }),
    e('l6', '2026-09-28T08:00:00Z', 1, 'refund', { classId: 'c5', byUserId: 'simone' }),
    e('l7', '2026-09-29T08:00:00Z', 2, 'manual', { note: 'Compensatie', byUserId: 'simone' }),
    e('g1', '2026-09-29T08:00:00Z', -12.5, 'booking', { classId: 'c1', groupId: 'g', unit: 'eur' }),
  ];
  const bookings = [
    { userId: 'anna', classId: 'c1', status: 'booked', attendance: 'absent' },
    { userId: 'anna', classId: 'c2', status: 'booked', attendance: 'present' },
    { userId: 'anna', classId: 'c3', status: 'booked', attendance: null },
    { userId: 'anna', classId: 'c4', status: 'cancelled', attendance: null },
    { userId: 'anna', classId: 'c5', status: 'cancelled', attendance: null },
  ];
  const names = { anna: 'Anna', simone: 'Simone' };
  const { rows, openings } = creditHistoryRows({ entries, balances: { anna: 8 }, classes, bookings, names, now: NOW });
  const row = (id) => rows.find((r) => r.id === id);

  it('nieuwste eerst, zonder groepstegoed (euro)', () => {
    expect(rows.map((r) => r.id)).toEqual(['l7', 'l3', 'l2', 'l1', 'l6', 'l5', 'l4', 'l0']);
  });

  it('lopend saldo terug vanaf het huidige saldo', () => {
    expect(row('l7').balanceAfter).toBe(8);
    expect(row('l3').balanceAfter).toBe(6);
    expect(row('l0').balanceAfter).toBe(10);
    expect(openings).toEqual({});
  });

  it('afloop per les: niet gekomen, aanwezig, komt nog, te laat afgemeld, terug na afmelden', () => {
    expect(row('l1')).toMatchObject({ outcome: 'absent', class: { title: 'Bootcamp', date: '2026-09-30', startTime: '19:00' } });
    expect(row('l2').outcome).toBe('present');
    expect(row('l3').outcome).toBe('upcoming');
    expect(row('l4').outcome).toBe('late_cancel');
    expect(row('l5').outcome).toBe('refunded');
    expect(row('l6')).toMatchObject({ kind: 'refund', class: { cancelled: true }, by: 'staff', byName: 'Simone' });
  });

  it('wie het deed: zelf, staf of automatisch', () => {
    expect(row('l1').by).toBe('self');
    expect(row('l7')).toMatchObject({ by: 'staff', byName: 'Simone', note: 'Compensatie' });
    const sys = creditHistoryRows({ entries: [e('x', '2026-09-01T00:00:00Z', -2, 'expiry', { byUserId: 'system' })], balances: { anna: 0 }, classes, bookings: [], names, now: NOW });
    expect(sys.rows[0]).toMatchObject({ by: 'system', byName: null, kind: 'expiry' });
  });

  it('beginsaldo als er meer saldo is dan de geschiedenis verklaart (bijv. overgenomen)', () => {
    const r = creditHistoryRows({ entries: [e('a', '2026-09-28T12:00:00Z', -1, 'booking', { classId: 'c3' })], balances: { anna: 4 }, classes, bookings, names, now: NOW });
    expect(r.openings).toEqual({ anna: 5 });
  });

  it('opnieuw geboekt na afmelden: eerste boeking terug, tweede telt', () => {
    const r = creditHistoryRows({
      entries: [
        e('b1', '2026-09-26T10:00:00Z', -1, 'booking', { classId: 'c2' }),
        e('r1', '2026-09-26T11:00:00Z', 1, 'refund', { classId: 'c2' }),
        e('b2', '2026-09-27T10:00:00Z', -1, 'booking', { classId: 'c2' }),
      ],
      balances: { anna: 0 },
      classes,
      bookings: [
        { userId: 'anna', classId: 'c2', status: 'cancelled' },
        { userId: 'anna', classId: 'c2', status: 'booked', attendance: 'present' },
      ],
      names,
      now: NOW,
    });
    expect(r.rows.find((x) => x.id === 'b1').outcome).toBe('refunded');
    expect(r.rows.find((x) => x.id === 'b2').outcome).toBe('present');
  });
});

describe('creditTotals', () => {
  it('telt toegekend, ingezet, terug, verlopen, afgeschreven en niet gekomen', () => {
    const t = creditTotals([
      { kind: 'plan', delta: 10 },
      { kind: 'manual', delta: 2 },
      { kind: 'manual', delta: -1 },
      { kind: 'booking', delta: -1, outcome: 'absent' },
      { kind: 'booking', delta: -1, outcome: 'present' },
      { kind: 'refund', delta: 1 },
      { kind: 'expiry', delta: -3 },
    ]);
    expect(t).toEqual({ granted: 12, used: 2, refunded: 1, expired: 3, deducted: 1, noShows: 1 });
  });
});
