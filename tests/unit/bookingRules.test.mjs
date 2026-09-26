import { describe, it, expect } from 'vitest';
import {
  freeCancelHoursOf,
  refundOnCancel,
  placeNewBooking,
  waitlistPriorityUntil,
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

  it('een vrije plek is tijdens de voorrang alleen voor de wachtlijst', () => {
    const now = Date.parse('2026-09-26T20:00:00Z');
    const cls = { capacity: 8, bookedCount: 7, waitlistCount: 2, waitlistPriorityUntil: '2026-09-26T20:30:00Z' };
    expect(placeNewBooking(cls, now)).toBe('waitlist');
    expect(placeNewBooking({ ...cls, waitlistPriorityUntil: '2026-09-26T19:59:00Z' }, now)).toBe('booked');
    expect(placeNewBooking({ ...cls, waitlistCount: 0 }, now)).toBe('booked');
    expect(placeNewBooking({ ...cls, bookedCount: 8, waitlistPriorityUntil: null }, now)).toBe('waitlist');
  });

  it('voorrang duurt een uur, maar nooit langer dan tot de start', () => {
    const now = Date.parse('2026-09-26T20:00:00Z');
    expect(waitlistPriorityUntil(now, Date.parse('2026-09-27T09:00:00Z'))).toBe('2026-09-26T21:00:00.000Z');
    expect(waitlistPriorityUntil(now, Date.parse('2026-09-26T20:20:00Z'))).toBe('2026-09-26T20:20:00.000Z');
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
