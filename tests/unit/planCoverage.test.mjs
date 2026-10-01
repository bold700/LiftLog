import { describe, expect, it } from 'vitest';
import * as server from '../../api/_lib/planCoverage.mjs';
import * as app from '../../src/utils/planCoverage.ts';

const cases = [
  { plan: { name: 'Personal Training - 3x per week', credits: 12, period: 'fourWeeks' }, covers: 'pt', perWeek: 3 },
  { plan: { name: 'Personal Training - 2x per wek', credits: 8, period: 'fourWeeks' }, covers: 'pt', perWeek: 2 },
  { plan: { name: 'Small Group Training - 2x per week', credits: 2, period: 'month' }, covers: 'group', perWeek: 2 },
  { plan: { name: 'Strippenkaart', credits: 10, period: 'once' }, covers: 'all', perWeek: null },
  { plan: { name: 'Duo', credits: 8, period: 'month' }, covers: 'pt', perWeek: 2 },
  { plan: { name: 'Onbeperkt', credits: null, period: 'month' }, covers: 'all', perWeek: null },
  { plan: { name: 'Small Group', credits: 3, period: 'week', covers: 'all', perWeek: null }, covers: 'all', perWeek: null },
  { plan: { name: 'Iets', credits: 4, period: 'week', covers: 'pt', perWeek: 1 }, covers: 'pt', perWeek: 1 },
];

describe('abonnement: geldt voor en keer per week', () => {
  for (const lib of [server, app]) {
    it(`leidt af uit naam en credits, of neemt de instelling over (${lib === server ? 'server' : 'app'})`, () => {
      for (const c of cases) {
        expect(lib.coversOf(c.plan), c.plan.name).toBe(c.covers);
        expect(lib.perWeekOf(c.plan), c.plan.name).toBe(c.perWeek);
      }
    });
    it(`PT-abonnement geldt voor 1-op-1 en duo, groep voor groep en concept (${lib === server ? 'server' : 'app'})`, () => {
      const pt = { name: 'x', covers: 'pt' };
      const group = { name: 'x', covers: 'group' };
      expect(lib.planCoversKind(pt, '1on1')).toBe(true);
      expect(lib.planCoversKind(pt, 'duo')).toBe(true);
      expect(lib.planCoversKind(pt, 'group')).toBe(false);
      expect(lib.planCoversKind(group, 'concept')).toBe(true);
      expect(lib.planCoversKind(group, '1on1')).toBe(false);
      expect(lib.planCoversKind({ name: 'x', covers: 'all' }, '1on1')).toBe(true);
    });
  }
});
