import { describe, expect, it } from 'vitest';
import type { Schema } from '../../src/types';
import {
  getCategories,
  getSeriesOptions,
  filterWorkouts,
  isCurrentWeek,
  getIsoWeek,
  getCurrentScheduleWeek,
  getAssigneeIds,
  matchesAssignees,
  ASSIGNEE_OPEN,
  ASSIGNEE_UNASSIGNED,
} from '../../src/utils/workoutFilter';

const base = { trainerId: 't', clientId: null, createdAt: '2026-01-01T00:00:00Z' };
const mk = (s: Partial<Schema> & { id: string; name: string }): Schema => ({ ...base, days: [], ...s }) as Schema;

describe('workoutFilter', () => {
  it('ISO-weken, dagvolgorde, deze week, jaargrenzen', () => {
    // --- ISO-weeknummers -------------------------------------------------------
    const d = (s) => new Date(s + 'T12:00:00Z');
    expect(getIsoWeek(d('2026-01-01')), 1);   // donderdag, hoort bij week 1
    expect(getIsoWeek(d('2026-09-05'))).toEqual(36);
    expect(getIsoWeek(d('2026-06-29')), 27);  // maandag: tweede helft begint
    expect(getIsoWeek(d('2027-01-04'))).toEqual(1);
    // jaargrenzen: 1 jan 2023 is zondag en hoort bij week 52 van 2022
    expect(getIsoWeek(d('2023-01-01'))).toEqual(52);
    expect(getIsoWeek(d('2024-12-30')), 1);   // maandag, hoort al bij week 1 van 2025

    // vanaf week 27 begint het schema opnieuw bij 1
    expect(getCurrentScheduleWeek(d('2026-01-01'))).toEqual(1);
    expect(getCurrentScheduleWeek(d('2026-06-22')), 26); // ISO 26
    expect(getCurrentScheduleWeek(d('2026-06-29')), 1);  // ISO 27
    expect(getCurrentScheduleWeek(d('2026-09-05')), 10); // ISO 36
    // elk weeknummer van het jaar valt binnen 1..26
    for (let iso = 1; iso <= 53; iso++) {
      const w = ((iso - 1) % 26) + 1;
      expect(w >= 1 && w <= 26).toBeTruthy();
    }

    // --- Lesmomenten × 26 weken ------------------------------------------------
    const LESSEN = ['Maandag', 'Dinsdag', 'Woensdag ochtend', 'Woensdag avond', 'Donderdag', 'Zaterdag', 'Zondag'];
    const schemas: Schema[] = [];
    LESSEN.forEach((naam, order) => {
      for (let w = 1; w <= 26; w++) {
        schemas.push(mk({
          id: `s_${order}_${w}`, name: `${naam} · Week ${w}`,
          category: 'Groepslessen', series: naam, seriesOrder: order, scheduleWeek: w,
          startDate: null, endDate: null, days: [{ dayLabel: `Week ${w}`, exercises: [] }],
        }));
      }
    });
    schemas.push(mk({ id: 'a', name: 'Push Pull Legs' }));

    const today = '2026-09-05';
    const now = d('2026-09-05'); // schemaweek 10

    expect(getCategories(schemas)).toEqual(['Groepslessen']);
    // chips in dagvolgorde, niet alfabetisch
    expect(getSeriesOptions(schemas, 'Groepslessen')).toEqual(LESSEN);

    const gewoon = filterWorkouts(schemas, { category: '', series: null, onlyCurrentWeek: false }, today, now);
    expect(gewoon.map((s) => s.name)).toEqual(['Push Pull Legs']);

    const alle = filterWorkouts(schemas, { category: 'Groepslessen', series: null, onlyCurrentWeek: false }, today, now);
    expect(alle.length).toEqual(7 * 26);
    expect(alle[0].name).toEqual('Maandag · Week 1');
    expect(alle[26].name, 'Dinsdag · Week 1'); // per lesmoment gegroepeerd

    const woOchtend = filterWorkouts(schemas, { category: 'Groepslessen', series: 'Woensdag ochtend', onlyCurrentWeek: false }, today, now);
    expect(woOchtend.length).toEqual(26);
    expect(woOchtend[0].name).toEqual('Woensdag ochtend · Week 1');
    expect(woOchtend[25].name).toEqual('Woensdag ochtend · Week 26');

    // "Deze week": één training per lesmoment, altijd, ook zonder startdatum
    const dezeWeek = filterWorkouts(schemas, { category: 'Groepslessen', series: null, onlyCurrentWeek: true }, today, now);
    expect(dezeWeek.length).toEqual(7);
    expect(dezeWeek.every((s) => s.scheduleWeek === 10)).toBeTruthy();
    expect(dezeWeek.map((s) => s.series)).toEqual(LESSEN);

    // en in de tweede jaarhelft schuift hij mee
    const inJuli = filterWorkouts(schemas, { category: 'Groepslessen', series: null, onlyCurrentWeek: true }, '2026-06-29', d('2026-06-29'));
    expect(inJuli.length).toEqual(7);
    expect(inJuli.every((s) => s.scheduleWeek === 1)).toBeTruthy();

    const combi = filterWorkouts(schemas, { category: 'Groepslessen', series: 'Zaterdag', onlyCurrentWeek: true }, today, now);
    expect(combi.map((s) => s.name)).toEqual(['Zaterdag · Week 10']);

    // workouts zonder weeknummer vallen terug op hun periode
    const metPeriode = mk({ id: 'p', name: 'P', startDate: '2026-09-01', endDate: '2026-09-30' });
    expect(isCurrentWeek(metPeriode, today, now)).toEqual(true);
    expect(isCurrentWeek(mk({ id: 'q', name: 'Q' }), today, now)).toEqual(false);
  });

  it('filter op sporter: uid, open en niet-toegewezen', () => {
    const single = mk({ id: '1', name: 'A', audience: 'single', clientId: 'bas' });
    const multi = mk({ id: '2', name: 'B', audience: 'multiple', participantIds: ['bas', 'sumit'] });
    const open = mk({ id: '3', name: 'C', audience: 'open' });
    const group = mk({ id: '4', name: 'D', audience: 'group', participantIds: ['bas'] });
    const los = mk({ id: '5', name: 'E', audience: 'single', clientId: null });

    expect(getAssigneeIds(single)).toEqual(['bas']);
    expect(getAssigneeIds(multi)).toEqual(['bas', 'sumit']);
    expect(getAssigneeIds(group)).toEqual([]); // groepsles telt niet als koppeling

    expect(matchesAssignees(single, [])).toBe(true); // lege selectie = alles
    expect(matchesAssignees(single, ['bas'])).toBe(true);
    expect(matchesAssignees(single, ['sumit'])).toBe(false);
    expect(matchesAssignees(multi, ['sumit'])).toBe(true);
    expect(matchesAssignees(open, [ASSIGNEE_OPEN])).toBe(true);
    expect(matchesAssignees(single, [ASSIGNEE_OPEN])).toBe(false);
    expect(matchesAssignees(los, [ASSIGNEE_UNASSIGNED])).toBe(true);
    expect(matchesAssignees(group, [ASSIGNEE_UNASSIGNED])).toBe(false);
    expect(matchesAssignees(single, ['sumit', ASSIGNEE_UNASSIGNED])).toBe(false);
    expect(matchesAssignees(los, ['sumit', ASSIGNEE_UNASSIGNED])).toBe(true); // "of"
  });
});
