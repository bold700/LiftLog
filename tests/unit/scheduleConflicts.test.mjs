import { describe, it, expect } from 'vitest';
import { allConflicts, blocksDoubleBooking, findConflicts, hoursOf, suggestionsFor } from '../../api/_lib/scheduleConflicts.mjs';

const ct = (id, trainer, room, ...slots) => ({
  id,
  name: id,
  defaultTrainerId: trainer,
  room,
  schedule: slots.map(([weekday, startTime, endTime]) => ({ weekday, startTime, endTime })),
});

describe('scheduleConflicts', () => {
  const bootcamp = ct('bootcamp', 'simone', 'Zaal 1', [1, '09:00', '10:00']);
  const types = [bootcamp, ct('yoga', 'esther', 'Zaal 2', [1, '09:00', '10:00']), ct('pt', 'esther', null, [1, '11:00', '12:00'])];

  it('zelfde ruimte op een overlappend moment botst, ook met andere hoofdletters', () => {
    const c = findConflicts(ct('nieuw', 'kenny', 'zaal 1 ', [1, '09:30', '10:30']), types);
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ slotIndex: 0, sameRoom: true, sameTrainer: false, other: { id: 'bootcamp' } });
  });

  it('zelfde trainer botst, ook in een andere ruimte', () => {
    const c = findConflicts(ct('nieuw', 'esther', 'Zaal 3', [1, '11:30', '12:30']), types);
    expect(c.map((x) => x.other.id)).toEqual(['pt']);
    expect(c[0].sameTrainer).toBe(true);
  });

  it('aansluitend, andere dag, andere trainer en ruimte, of zichzelf: geen botsing', () => {
    expect(findConflicts(ct('nieuw', 'simone', 'Zaal 1', [1, '10:00', '11:00']), types)).toEqual([]);
    expect(findConflicts(ct('nieuw', 'simone', 'Zaal 1', [2, '09:00', '10:00']), types)).toEqual([]);
    expect(findConflicts(ct('nieuw', 'kenny', 'Zaal 3', [1, '09:00', '10:00']), types)).toEqual([]);
    expect(findConflicts(bootcamp, types)).toEqual([]);
  });

  it('stelt een vrije ruimte op hetzelfde tijdstip voor, en vrije tijden dichtbij', () => {
    const cand = ct('nieuw', 'kenny', 'Zaal 1', [1, '09:00', '10:00']);
    const s = suggestionsFor(cand, cand.schedule[0], types, ['Zaal 1', 'Zaal 2', 'Zaal 3']);
    expect(s.rooms).toEqual(['Zaal 3']);
    expect(s.times.every((t) => t.endTime <= '09:00' || t.startTime >= '10:00')).toBe(true);
    // Dichtstbijzijnde eerst; bij gelijke afstand het vroegste tijdstip.
    expect(s.times.map((t) => t.startTime)).toEqual(['08:00', '10:00', '07:30', '10:30']);
  });

  it('geen andere ruimte voorstellen als de trainer zelf al bezet is; tijden binnen de openingstijden', () => {
    const cand = ct('nieuw', 'esther', 'Zaal 3', [1, '09:00', '10:00']);
    const s = suggestionsFor(cand, cand.schedule[0], types, ['Zaal 3', 'Zaal 4'], { firstStart: '08:00', lastStart: '10:00' });
    expect(s.rooms).toEqual([]);
    expect(s.times.map((t) => t.startTime)).toEqual(['08:00', '10:00']);
  });

  it('overzicht: elk botsend paar één keer', () => {
    const all = allConflicts([...types, ct('extra', 'simone', 'Zaal 2', [1, '09:30', '10:30'])]);
    expect(all.map((c) => [c.a.id, c.b.id])).toEqual([
      ['bootcamp', 'extra'],
      ['yoga', 'extra'],
    ]);
  });

  it('instelling staat standaard aan; openingstijden met terugval', () => {
    expect(blocksDoubleBooking({})).toBe(true);
    expect(blocksDoubleBooking({ scheduling: { blockDoubleBooking: false } })).toBe(false);
    expect(hoursOf({})).toEqual({ firstStart: '06:00', lastStart: '21:00' });
    expect(hoursOf({ scheduling: { hours: { firstStart: '07:00', lastStart: 'x' } } })).toEqual({ firstStart: '07:00', lastStart: '21:00' });
  });
});
