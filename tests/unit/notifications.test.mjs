import { describe, it, expect } from 'vitest';
import {
  birthdayProfiles,
  creditsLowAfterBooking,
  dayLabel,
  inactiveByTrainer,
  messages,
  notificationEnabled,
  validateBroadcast,
  weekdayOf,
} from '../../api/_lib/notifications.mjs';

/**
 * Waarom dit getest wordt: dit bepaalt wie welke melding krijgt. Een verjaardag die niet komt is
 * jammer; een "2 weken niet getraind" over iemand die gisteren nog trainde is pijnlijk.
 */

describe('notificationEnabled', () => {
  it('staat standaard aan, en alleen expliciet false zet hem uit', () => {
    expect(notificationEnabled(null, 'birthday')).toBe(true);
    expect(notificationEnabled({ notifications: {} }, 'birthday')).toBe(true);
    expect(notificationEnabled({ notifications: { birthday: false } }, 'birthday')).toBe(false);
    expect(notificationEnabled({ notifications: { birthday: false } }, 'creditsLow')).toBe(true);
  });
});

describe('teksten', () => {
  it('datum en tijd leesbaar', () => {
    expect(dayLabel('2026-09-26')).toBe('za 26 sep');
    expect(weekdayOf('2026-09-27')).toBe(0); // zondag
  });

  it('les geannuleerd, met en zonder credit terug', () => {
    const cls = { title: 'HIIT', date: '2026-09-26', startTime: '09:00' };
    expect(messages.bookingCancelledByStudio(cls, true).body).toBe(
      'Je plek bij HIIT (za 26 sep 9:00) is geannuleerd door de studio. Je credit staat weer op je saldo.'
    );
    expect(messages.bookingCancelledByStudio(cls, false).body).not.toContain('credit');
  });

  it('credits: 1 over en op', () => {
    expect(messages.creditsLow(1).title).toBe('Nog 1 credit over');
    expect(messages.creditsLow(0).title).toBe('Je credits zijn op');
  });

  it('alleen waarschuwen als de boeking echt credits kostte', () => {
    expect(creditsLowAfterBooking(1, 1)).toBe(true);
    expect(creditsLowAfterBooking(1, 0)).toBe(true);
    expect(creditsLowAfterBooking(1, 2)).toBe(false);
    expect(creditsLowAfterBooking(0, 0)).toBe(false); // gratis / onbeperkt / wachtlijst
  });

  it('verjaardag met voornaam en studionaam', () => {
    expect(messages.birthday('Bas de Vries', 'Van As')).toEqual({
      title: 'Gefeliciteerd, Bas!',
      body: 'Een hele fijne verjaardag gewenst van Van As.',
    });
  });

  it('inactief: één naam of een samenvatting', () => {
    expect(messages.inactiveSummary(['Bas']).title).toBe('Bas trainde 2 weken niet');
    const many = messages.inactiveSummary(['A', 'B', 'C', 'D', 'E', 'F', 'G']);
    expect(many.title).toBe('7 sporters trainden 2 weken niet');
    expect(many.body).toBe('A, B, C, D, E en 2 anderen. Even een berichtje sturen?');
  });
});

describe('birthdayProfiles', () => {
  const p = (userId, birthDate) => ({ userId, birthDate });
  it('vindt wie vandaag jarig is', () => {
    const list = birthdayProfiles([p('a', '1990-09-25'), p('b', '1988-09-26'), p('c', null)], '2026-09-25');
    expect(list.map((x) => x.userId)).toEqual(['a']);
  });
  it('29 februari viert in een gewoon jaar op 28 februari', () => {
    expect(birthdayProfiles([p('a', '2000-02-29')], '2026-02-28').map((x) => x.userId)).toEqual(['a']);
    expect(birthdayProfiles([p('a', '2000-02-29')], '2028-02-28')).toEqual([]);
    expect(birthdayProfiles([p('a', '2000-02-29')], '2028-02-29').map((x) => x.userId)).toEqual(['a']);
  });
});

describe('inactiveByTrainer', () => {
  const since = '2026-09-11T00:00:00.000Z';
  const sporter = (userId, extra = {}) => ({ userId, role: 'sporter', trainerId: 'kenny', displayName: userId, createdAt: '2026-01-01T00:00:00.000Z', ...extra });

  it('meldt alleen sporters zonder activiteit, per trainer, op naam gesorteerd', () => {
    const map = inactiveByTrainer(
      [sporter('Sumit'), sporter('Bas'), sporter('Richard'), sporter('Margot', { trainerId: 'esther' })],
      new Set(['Richard']),
      since
    );
    expect(map.get('kenny')).toEqual(['Bas', 'Sumit']);
    expect(map.get('esther')).toEqual(['Margot']);
  });

  it('nieuwe leden en sporters zonder trainer tellen niet mee', () => {
    const map = inactiveByTrainer(
      [sporter('Nieuw', { createdAt: '2026-09-20T10:00:00.000Z' }), sporter('Los', { trainerId: null }), { userId: 't', role: 'trainer' }],
      new Set(),
      since
    );
    expect(map.size).toBe(0);
  });
});

describe('validateBroadcast', () => {
  const ok = { title: 'Andere zaal', body: 'Morgen in zaal 2.', audience: { type: 'all' }, scheduledFor: null };
  it('een goed bericht', () => {
    expect(validateBroadcast(ok, '2026-09-26')).toBeNull();
    expect(validateBroadcast({ ...ok, scheduledFor: '2026-09-26' }, '2026-09-26')).toBeNull();
  });
  it('te lange titel, lege tekst, onbekende doelgroep of geen lid gekozen', () => {
    expect(validateBroadcast({ ...ok, title: 'x'.repeat(61) }, '2026-09-26')).toMatch(/titel/);
    expect(validateBroadcast({ ...ok, body: '' }, '2026-09-26')).toMatch(/bericht/);
    expect(validateBroadcast({ ...ok, audience: { type: 'iedereen' } }, '2026-09-26')).toMatch(/naar wie/);
    expect(validateBroadcast({ ...ok, audience: { type: 'member', id: null } }, '2026-09-26')).toMatch(/naar wie/);
  });
  it('een geplande datum moet vanaf morgen zijn', () => {
    expect(validateBroadcast({ ...ok, scheduledFor: '2026-09-25' }, '2026-09-26')).toMatch(/vanaf morgen/);
  });
});
