import { describe, expect, it } from 'vitest';
import { busyByDate, canRescheduleClass, isOffered, rescheduleOptions } from '../../api/_lib/reschedule.mjs';

// 2026-10-05 is een maandag, 2026-10-08 een donderdag.
const MON = '2026-10-05';
const THU = '2026-10-08';

describe('verzetten na afmelden: vrije momenten', () => {
  it('biedt aansluitende momenten eerst aan, binnen de beschikbaarheid', () => {
    const availability = { 1: [{ from: '16:00', to: '21:00' }], 4: [] };
    const busy = busyByDate(
      [
        { date: MON, startTime: '18:00', endTime: '19:00', trainerId: 't1' },
        { date: MON, startTime: '10:00', endTime: '11:00', trainerId: 'other', room: 'Zaal 2' },
      ],
      { trainerId: 't1', room: 'Zaal 1' }
    );
    const r = rescheduleOptions({ dates: [MON, THU], duration: 60, availability, busy });
    expect(r.adjacent.map((t) => t.startTime)).toEqual(['17:00', '19:00']);
    const mon = r.days.find((d) => d.date === MON);
    expect(mon.times.map((t) => t.startTime)).toEqual(['16:00', '16:30', '17:00', '19:00', '19:30', '20:00']);
    // Donderdag vrij: geen momenten, geen lege dag in de lijst.
    expect(r.days.some((d) => d.date === THU)).toBe(false);
  });

  it('zonder beschikbaarheid gelden de openingstijden; bezette ruimte telt mee, niet als aansluitend', () => {
    const busy = busyByDate([{ date: MON, startTime: '07:00', endTime: '08:00', trainerId: 'x', room: 'zaal 1 ' }], { trainerId: 't1', room: 'Zaal 1' });
    const r = rescheduleOptions({ dates: [MON], duration: 60, busy, hours: { firstStart: '06:00', lastStart: '09:00' } });
    expect(r.days[0].times.map((t) => t.startTime)).toEqual(['06:00', '08:00', '08:30', '09:00']);
    expect(r.adjacent).toEqual([]);
  });

  it('slaat het afgemelde moment, te vroege momenten en afgelaste lessen over', () => {
    const busy = busyByDate([{ date: MON, startTime: '17:00', endTime: '18:00', trainerId: 't1', cancelledAt: 'x' }], { trainerId: 't1' });
    const r = rescheduleOptions({
      dates: [MON],
      duration: 60,
      availability: { 1: [{ from: '16:00', to: '18:30' }] },
      busy,
      exclude: { date: MON, startTime: '17:00' },
      tooSoon: (d, t) => t < '16:30',
    });
    expect(r.days[0].times.map((t) => t.startTime)).toEqual(['16:30', '17:30']);
    expect(isOffered(r, MON, '17:30')).toBe(true);
    expect(isOffered(r, MON, '17:00')).toBe(false);
  });

  it('alleen een persoonlijk PT-moment met trainer is te verzetten', () => {
    expect(canRescheduleClass({ trainerId: 't1', privateFor: 'u1' }, 'u1')).toBe(true);
    expect(canRescheduleClass({ trainerId: 't1', privateFor: null }, 'u1')).toBe(false);
    expect(canRescheduleClass({ trainerId: null, privateFor: 'u1' }, 'u1')).toBe(false);
    expect(canRescheduleClass({ trainerId: 't1', privateFor: 'u1', privateForGroup: 'g1' }, 'u1')).toBe(false);
  });
});
