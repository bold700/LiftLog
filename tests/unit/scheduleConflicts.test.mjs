import { describe, it, expect } from 'vitest';
import { allConflicts, blocksDoubleBooking, findConflicts, hoursOf, outsideAvailability, suggestionsFor } from '../../api/_lib/scheduleConflicts.mjs';
import { cleanAvailability, withinAvailability } from '../../api/_lib/availability.mjs';

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
    expect(s.times.slice(0, 4).map((t) => t.startTime)).toEqual(['08:00', '10:00', '07:30', '10:30']);
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

  it('beschikbaarheid: alleen tijden binnen de blokken van de trainer, aansluitende momenten eerst', () => {
    // Esther: maandag 06:00–12:00 en 16:00–21:00; PT om 11:00–12:00 en Yoga om 09:00–10:00 (Zaal 2).
    const avail = { 1: [{ from: '06:00', to: '12:00' }, { from: '16:00', to: '21:00' }] };
    const cand = ct('nieuw', 'esther', 'Zaal 3', [1, '09:30', '10:30']);
    const s = suggestionsFor(cand, cand.schedule[0], types, [], undefined, avail);
    const starts = s.times.map((t) => t.startTime);
    // Eerst aansluitend op Yoga (eindigt 10:00) of PT (begint 11:00): 10:00–11:00 sluit aan beide kanten aan.
    expect(s.times[0]).toMatchObject({ startTime: '10:00', endTime: '11:00', adjacent: true });
    expect(s.times.filter((t) => t.adjacent).map((t) => t.startTime).sort()).toEqual(['08:00', '10:00', '12:00'].filter((x) => starts.includes(x)).sort());
    // Nooit buiten de blokken (dus niet 12:00–16:00 of na 21:00).
    expect(s.times.every((t) => (t.startTime >= '06:00' && t.endTime <= '12:00') || (t.startTime >= '16:00' && t.endTime <= '21:00'))).toBe(true);
  });

  it('beschikbaarheid: donderdag vrij betekent geen voorstellen op donderdag', () => {
    const cand = ct('nieuw', 'kenny', 'Zaal 9', [4, '09:00', '10:00']);
    const s = suggestionsFor(cand, cand.schedule[0], [], [], undefined, { 4: [] });
    expect(s.times).toEqual([]);
    expect(outsideAvailability(cand, { 4: [] })).toEqual([0]);
    expect(outsideAvailability(cand, null)).toEqual([]);
  });

  it('beschikbaarheid invoeren: samenvoegen, sorteren en controleren', () => {
    const r = cleanAvailability({ 1: [{ from: '16:00', to: '21:00' }, { from: '06:00', to: '09:00' }, { from: '08:30', to: '12:00' }] });
    expect(r.value['1']).toEqual([{ from: '06:00', to: '12:00' }, { from: '16:00', to: '21:00' }]);
    expect(r.value['4']).toEqual([]);
    expect(cleanAvailability({ 1: [{ from: '10:00', to: '09:00' }] }).error).toMatch(/eindtijd/);
    expect(cleanAvailability({ 1: [{ from: '9', to: '10:00' }] }).error).toMatch(/uu:mm/);
    expect(withinAvailability(r.value, { weekday: 1, startTime: '11:00', endTime: '12:00' })).toBe(true);
    expect(withinAvailability(r.value, { weekday: 1, startTime: '11:30', endTime: '12:30' })).toBe(false);
  });
});
