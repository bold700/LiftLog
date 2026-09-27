import { describe, it, expect } from 'vitest';
import {
  freeCancelHoursOf,
  refundOnCancel,
  placeNewBooking,
  chooseForFreeSpot,
  heldForSomeoneElse,
  holdExpired,
  waitlistPosition,
  BOOKING_GRACE_MINUTES,
} from '../../api/_lib/bookingRules.mjs';

describe('boekingsregels', () => {
  it('0 uur is een geldige studio-instelling; zonder instelling de standaard', () => {
    expect(freeCancelHoursOf({ freeCancelHours: 0 }, 12)).toBe(0);
    expect(freeCancelHoursOf({ freeCancelHours: 24 }, 12)).toBe(24);
    expect(freeCancelHoursOf(null, 12)).toBe(12);
    expect(freeCancelHoursOf({ freeCancelHours: -3 }, 12)).toBe(12);
  });

  it('te laat is te laat, behalve binnen de bedenktijd of bij een afgelaste les', () => {
    const base = { spent: 1, classCancelled: false, hoursLeft: 5, freeCancelHours: 24 };
    expect(refundOnCancel({ ...base, minutesSinceBooked: 180 })).toBe(false);
    expect(refundOnCancel({ ...base, minutesSinceBooked: BOOKING_GRACE_MINUTES - 1 })).toBe(true);
    expect(refundOnCancel({ ...base, minutesSinceBooked: 180, classCancelled: true })).toBe(true);
    expect(refundOnCancel({ ...base, minutesSinceBooked: 180, hoursLeft: 30 })).toBe(true);
    // Bedenktijd geldt niet meer als de les al begonnen is.
    expect(refundOnCancel({ ...base, minutesSinceBooked: 10, hoursLeft: -0.1 })).toBe(false);
    expect(refundOnCancel({ ...base, spent: 0, minutesSinceBooked: 10 })).toBe(false);
  });

  it('een nieuwe boeking krijgt een plek als die er is, anders de wachtlijst', () => {
    expect(placeNewBooking({ capacity: 8, bookedCount: 7 })).toBe('booked');
    expect(placeNewBooking({ capacity: 8, bookedCount: 8 })).toBe('waitlist');
  });

  it('vrije plek: eerste die kan betalen schuift door; eerste zonder credits krijgt een vastgehouden plek', () => {
    const a = { id: 'a', createdAt: '2026-09-26T10:00:00Z', balance: 0, cost: 1 };
    const b = { id: 'b', createdAt: '2026-09-26T11:00:00Z', balance: 3, cost: 1 };
    expect(chooseForFreeSpot([b, a])).toMatchObject({ kind: 'hold', candidate: { id: 'a' } });
    // Kans al gehad en nog steeds geen credits: overslaan.
    expect(chooseForFreeSpot([b, { ...a, offerExpired: true }])).toMatchObject({ kind: 'promote', candidate: { id: 'b' } });
    // Kans gehad maar nu wel credits: gewoon doorschuiven.
    expect(chooseForFreeSpot([b, { ...a, offerExpired: true, balance: 1 }])).toMatchObject({ kind: 'promote', candidate: { id: 'a' } });
    expect(chooseForFreeSpot([{ ...a, offerExpired: true }])).toBeNull();
  });

  it('vastgehouden plek: alleen voor die persoon, tot hij verloopt', () => {
    const now = Date.parse('2026-09-26T20:00:00Z');
    const cls = { holdUserId: 'u2', holdUntil: '2026-09-26T20:30:00Z' };
    expect(heldForSomeoneElse(cls, 'u3', now)).toBe(true);
    expect(heldForSomeoneElse(cls, 'u2', now)).toBe(false);
    expect(holdExpired(cls, now)).toBe(false);
    expect(holdExpired(cls, Date.parse('2026-09-26T20:31:00Z'))).toBe(true);
    expect(heldForSomeoneElse({}, 'u3', now)).toBe(false);
  });

  it('positie op de wachtlijst op volgorde van aanmelden', () => {
    const entries = [
      { id: 'b', createdAt: '2026-09-26T11:00:00Z' },
      { id: 'a', createdAt: '2026-09-26T10:00:00Z' },
      { id: 'c', createdAt: '2026-09-26T12:00:00Z' },
    ];
    expect(waitlistPosition(entries, 'a')).toBe(1);
    expect(waitlistPosition(entries, 'c')).toBe(3);
    expect(waitlistPosition(entries, 'x')).toBeNull();
  });
});
