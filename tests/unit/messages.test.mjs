/**
 * Berichten: de logica die aan beide kanten van een gesprek hetzelfde moet uitpakken.
 *
 * De `threadId` wordt uit twee uid's afgeleid in plaats van ergens opgeslagen. Als die afleiding
 * niet symmetrisch is, ziet elke kant een ander gesprek en lijkt het alsof berichten verdwijnen.
 */
import { describe, it, expect } from 'vitest';
import { threadIdFor, describeCheckin } from '../../src/services/messageService';

describe('gesprekken', () => {
  it('geeft aan beide kanten hetzelfde gespreks-id', () => {
    expect(threadIdFor('trainer1', 'sporter2')).toBe(threadIdFor('sporter2', 'trainer1'));
  });

  it('houdt gesprekken van verschillende mensen uit elkaar', () => {
    const a = threadIdFor('trainer1', 'sporter2');
    const b = threadIdFor('trainer1', 'sporter3');
    expect(a).not.toBe(b);
  });

  it('gebruikt beide uid’s in het id, zodat het niet per ongeluk botst', () => {
    const id = threadIdFor('abc', 'xyz');
    expect(id).toContain('abc');
    expect(id).toContain('xyz');
  });
});

describe('check-in samenvatten', () => {
  it('zet de ingevulde waarden op een rij', () => {
    expect(describeCheckin({ weightKg: 84.2, feeling: 4, sessions: 3 })).toBe('84.2 kg · 3× getraind · gevoel 4/5');
  });

  it('laat weg wat niet is ingevuld', () => {
    expect(describeCheckin({ weightKg: null, feeling: 3, sessions: null })).toBe('gevoel 3/5');
    expect(describeCheckin({ weightKg: 80, feeling: null, sessions: null })).toBe('80 kg');
  });

  it('geeft een lege samenvatting als er niets is ingevuld', () => {
    expect(describeCheckin({ weightKg: null, feeling: null, sessions: null })).toBe('');
  });
});
