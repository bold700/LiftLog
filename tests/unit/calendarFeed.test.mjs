import { describe, expect, it } from 'vitest';
import { amsterdamToUtc, buildIcsFeed, hashFeedToken } from '../../api/_lib/calendarFeed.mjs';

describe('hashFeedToken', () => {
  it('geeft een stabiele SHA-256-hex terug', () => {
    const hash = hashFeedToken('geheime-sleutel');
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashFeedToken('geheime-sleutel')).toBe(hash);
    expect(hashFeedToken('andere-sleutel')).not.toBe(hash);
  });
});

describe('amsterdamToUtc', () => {
  it('trekt in de winter (CET) één uur af', () => {
    // 10 januari 09:00 lokale tijd in Amsterdam is 08:00 UTC (CET = UTC+1).
    const utc = amsterdamToUtc('2026-01-10', '09:00');
    expect(utc.toISOString()).toBe('2026-01-10T08:00:00.000Z');
  });

  it('trekt in de zomer (CEST) twee uur af', () => {
    // 10 juli 09:00 lokale tijd in Amsterdam is 07:00 UTC (CEST = UTC+2).
    const utc = amsterdamToUtc('2026-07-10', '09:00');
    expect(utc.toISOString()).toBe('2026-07-10T07:00:00.000Z');
  });
});

describe('buildIcsFeed', () => {
  const baseClass = {
    id: 'class_1',
    title: 'Kickboksen',
    date: '2026-07-10',
    startTime: '18:00',
    endTime: '19:00',
    room: 'Zaal 1',
    description: 'Neem bokshandschoenen mee',
    sessionKind: 'group',
    cancelledAt: null,
    bookingStatus: 'booked',
  };

  it('bouwt een geldig VCALENDAR-blok met start/eind in UTC', () => {
    const ics = buildIcsFeed({ classes: [baseClass], calendarName: 'Mijn lessen' });
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('END:VCALENDAR');
    expect(ics).toContain('BEGIN:VEVENT');
    expect(ics).toContain('UID:class_1@liftlog.app');
    expect(ics).toContain('DTSTART:20260710T160000Z');
    expect(ics).toContain('DTEND:20260710T170000Z');
    expect(ics).toContain('SUMMARY:Kickboksen');
    expect(ics).toContain('LOCATION:Zaal 1');
    expect(ics).toContain('STATUS:CONFIRMED');
    // RFC 5545: regels eindigen op CRLF.
    expect(ics.includes('\r\n')).toBe(true);
  });

  it('zet een wachtlijst-les op TENTATIVE met een duidelijke titel', () => {
    const ics = buildIcsFeed({ classes: [{ ...baseClass, bookingStatus: 'waitlist' }], calendarName: 'Mijn lessen' });
    expect(ics).toContain('SUMMARY:Kickboksen (wachtlijst)');
    expect(ics).toContain('STATUS:TENTATIVE');
  });

  it('zet een afgelaste les op CANCELLED', () => {
    const ics = buildIcsFeed({ classes: [{ ...baseClass, cancelledAt: '2026-07-01T00:00:00.000Z' }], calendarName: 'Mijn lessen' });
    expect(ics).toContain('STATUS:CANCELLED');
  });

  it('valt terug op een uur duur zonder endTime', () => {
    const ics = buildIcsFeed({ classes: [{ ...baseClass, endTime: null }], calendarName: 'Mijn lessen' });
    expect(ics).toContain('DTSTART:20260710T160000Z');
    expect(ics).toContain('DTEND:20260710T170000Z');
  });

  it('ontsnapt komma\'s, puntkomma\'s en regeleindes in tekstvelden', () => {
    const ics = buildIcsFeed({
      classes: [{ ...baseClass, title: 'Les; met, komma', description: 'regel een\nregel twee' }],
      calendarName: 'Mijn lessen',
    });
    expect(ics).toContain('SUMMARY:Les\\; met\\, komma');
    expect(ics).toContain('regel een\\nregel twee');
  });

  it('geeft een leeg maar geldig kalenderblok terug zonder lessen', () => {
    const ics = buildIcsFeed({ classes: [], calendarName: 'Mijn lessen' });
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('END:VCALENDAR');
    expect(ics).not.toContain('BEGIN:VEVENT');
  });

  it('vouwt lange regels volgens RFC 5545 (max 75 octets per regel)', () => {
    const longDescription = 'x'.repeat(200);
    const ics = buildIcsFeed({ classes: [{ ...baseClass, description: longDescription }], calendarName: 'Mijn lessen' });
    for (const line of ics.split('\r\n')) {
      if (line.startsWith(' ')) continue; // vervolgregel van een gevouwen regel
      expect(Buffer.byteLength(line, 'utf8')).toBeLessThanOrEqual(75);
    }
  });
});
