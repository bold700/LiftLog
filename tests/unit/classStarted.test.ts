/**
 * Een les die al begonnen is, kun je niet meer reserveren. Voorheen toonde de app om 18:00 nog
 * "Reserveren" bij een les van 07:00 en kwam de weigering pas na het bevestigen.
 */
import { describe, it, expect } from 'vitest';
import { classHasStarted, classHasEnded } from '../../src/services/classService';

const at = (date: string, time: string) => new Date(`${date}T${time}:00`).getTime();

describe('classHasStarted / classHasEnded', () => {
  const cls = { date: '2026-09-26', startTime: '07:00', endTime: '08:00' };

  it('voor de start: nog niet begonnen', () => {
    expect(classHasStarted(cls, at('2026-09-26', '06:59'))).toBe(false);
    expect(classHasEnded(cls, at('2026-09-26', '06:59'))).toBe(false);
  });

  it('tijdens de les: begonnen, niet voorbij', () => {
    expect(classHasStarted(cls, at('2026-09-26', '07:30'))).toBe(true);
    expect(classHasEnded(cls, at('2026-09-26', '07:30'))).toBe(false);
  });

  it('na de eindtijd: voorbij', () => {
    expect(classHasEnded(cls, at('2026-09-26', '18:00'))).toBe(true);
  });

  it('zonder eindtijd duurt een les een uur', () => {
    const open = { date: '2026-09-26', startTime: '07:00', endTime: null };
    expect(classHasEnded(open, at('2026-09-26', '07:59'))).toBe(false);
    expect(classHasEnded(open, at('2026-09-26', '08:00'))).toBe(true);
  });
});
