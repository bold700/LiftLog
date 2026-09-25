import { describe, it, expect } from 'vitest';
import { amsterdamDate, buildClassReminders } from '../../api/_lib/classReminders.mjs';

/**
 * Waarom dit getest wordt: een herinnering voor een afgelaste les, of eentje naar iemand op de
 * wachtlijst, zet mensen voor niets in de auto. En twee meldingen voor twee lessen is er één te veel.
 */

describe('amsterdamDate', () => {
  it('rekent in Nederlandse tijd, niet in UTC', () => {
    // 23:30 UTC op 30 juni = 01:30 op 1 juli in Amsterdam (zomertijd).
    const now = new Date('2026-06-30T23:30:00Z');
    expect(amsterdamDate(now, 0)).toBe('2026-07-01');
    expect(amsterdamDate(now, 1)).toBe('2026-07-02');
  });

  it('gaat netjes over een maandgrens', () => {
    expect(amsterdamDate(new Date('2026-01-31T16:00:00Z'), 1)).toBe('2026-02-01');
  });
});

const hiit = { id: 'c1', title: 'HIIT', startTime: '09:00', room: 'Zaal 1', cancelledAt: null };
const yoga = { id: 'c2', title: 'Yoga', startTime: '18:30', room: null, cancelledAt: null };
const afgelast = { id: 'c3', title: 'Boks', startTime: '10:00', cancelledAt: '2026-09-25T10:00:00Z' };

describe('buildClassReminders', () => {
  it('één les: titel met les en tijd, ruimte in de tekst', () => {
    const r = buildClassReminders([hiit], [{ id: 'b1', classId: 'c1', userId: 'bas', status: 'booked' }]);
    expect(r).toEqual([
      { userId: 'bas', bookingIds: ['b1'], title: 'Morgen: HIIT om 9:00', body: 'In Zaal 1. Kun je niet? Meld je op tijd af in de app.' },
    ]);
  });

  it('twee lessen voor dezelfde persoon: één melding, op volgorde van tijd', () => {
    const r = buildClassReminders(
      [yoga, hiit],
      [
        { id: 'b2', classId: 'c2', userId: 'bas', status: 'booked' },
        { id: 'b1', classId: 'c1', userId: 'bas', status: 'booked' },
      ]
    );
    expect(r).toHaveLength(1);
    expect(r[0].title).toBe('Morgen 2 lessen');
    expect(r[0].body).toBe('HIIT 9:00 · Yoga 18:30. Kun je niet? Meld je op tijd af in de app.');
    expect(r[0].bookingIds.sort()).toEqual(['b1', 'b2']);
  });

  it('wachtlijst en afgemeld krijgen niets', () => {
    const r = buildClassReminders(
      [hiit],
      [
        { id: 'b1', classId: 'c1', userId: 'wacht', status: 'waitlist' },
        { id: 'b2', classId: 'c1', userId: 'af', status: 'cancelled' },
      ]
    );
    expect(r).toEqual([]);
  });

  it('afgelaste les: geen herinnering', () => {
    expect(buildClassReminders([afgelast], [{ id: 'b1', classId: 'c3', userId: 'bas', status: 'booked' }])).toEqual([]);
  });

  it('al herinnerd (bijv. de taak liep twee keer): niet nog eens', () => {
    expect(
      buildClassReminders([hiit], [{ id: 'b1', classId: 'c1', userId: 'bas', status: 'booked', reminderSentAt: '2026-09-25T16:00:00Z' }])
    ).toEqual([]);
  });

  it('les zonder ruimte: alleen de afmeldtekst', () => {
    const r = buildClassReminders([yoga], [{ id: 'b1', classId: 'c2', userId: 'bas', status: 'booked' }]);
    expect(r[0].title).toBe('Morgen: Yoga om 18:30');
    expect(r[0].body).toBe('Kun je niet? Meld je op tijd af in de app.');
  });
});
