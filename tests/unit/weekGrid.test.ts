import { describe, expect, it } from 'vitest';
import { hourRange, layoutDay, toMinutes } from '../../src/utils/weekGrid';

const c = (startTime: string, endTime: string | null, id = startTime) => ({ id, startTime, endTime });

describe('toMinutes', () => {
  it('HH:MM naar minuten', () => {
    expect(toMinutes('00:00')).toBe(0);
    expect(toMinutes('19:15')).toBe(1155);
  });
});

describe('layoutDay', () => {
  it('losse lessen krijgen de volle breedte, vroegste eerst', () => {
    const r = layoutDay([c('19:00', '20:00'), c('07:00', '08:00')]);
    expect(r.map((p) => [p.item.id, p.lane, p.lanes])).toEqual([
      ['07:00', 0, 1],
      ['19:00', 0, 1],
    ]);
  });

  it('overlappende lessen naast elkaar; een latere les hergebruikt een vrije kolom', () => {
    const r = layoutDay([c('18:00', '19:00', 'a'), c('18:30', '19:30', 'b'), c('19:00', '20:00', 'c'), c('21:00', '22:00', 'd')]);
    const by = Object.fromEntries(r.map((p) => [p.item.id, [p.lane, p.lanes]]));
    expect(by).toEqual({ a: [0, 2], b: [1, 2], c: [0, 2], d: [0, 1] });
  });

  it('zonder eindtijd duurt een les een uur', () => {
    const [p] = layoutDay([c('10:00', null)]);
    expect([p.startMin, p.endMin]).toEqual([600, 660]);
  });
});

describe('hourRange', () => {
  it('van het eerste tot het laatste uur, minstens zes uur; zonder lessen de standaard', () => {
    expect(hourRange([c('06:30', '07:30'), c('20:00', '21:00')])).toEqual([6, 21]);
    expect(hourRange([c('19:00', '20:00')])).toEqual([19, 24].map((h, i) => (i === 0 ? 18 : h)) as [number, number]);
    expect(hourRange([])).toEqual([7, 21]);
  });
});
