import { describe, expect, it } from 'vitest';
import { classLine, cleanPlanExercises, matchClasses } from '../../api/_lib/classPlanInput.mjs';

const day = [
  { id: 'a', date: '2026-10-07', startTime: '07:00', endTime: '08:00', title: 'Bootcamp' },
  { id: 'b', date: '2026-10-07', startTime: '12:30', endTime: '13:30', title: 'Small Group Training' },
  { id: 'c', date: '2026-10-07', startTime: '19:00', endTime: '20:00', title: 'Bootcamp' },
  { id: 'd', date: '2026-10-07', startTime: '18:00', endTime: '19:00', title: 'Personal Training', privateFor: 'u1' },
  { id: 'e', date: '2026-10-07', startTime: '20:00', endTime: '21:00', title: 'Yoga', cancelledAt: '2026-10-01' },
];
const ids = (list) => list.map((c) => c.id);

describe('training uit de chat in een les zetten', () => {
  it('kiest de les op dagdeel, tijd of naam; PT en afgelaste lessen alleen als je ze noemt', () => {
    expect(ids(matchClasses(day, {}))).toEqual(['a', 'b', 'c']);
    expect(ids(matchClasses(day, { time: 'avond' }))).toEqual(['c']);
    expect(ids(matchClasses(day, { time: 'woensdagochtend' }))).toEqual(['a']);
    expect(ids(matchClasses(day, { time: 'middag' }))).toEqual(['b']);
    expect(ids(matchClasses(day, { time: '19:00' }))).toEqual(['c']);
    expect(ids(matchClasses(day, { time: '19u' }))).toEqual(['c']);
    expect(ids(matchClasses(day, { time: '12:45' }))).toEqual(['b']);
    expect(ids(matchClasses(day, { lesson: 'bootcamp' }))).toEqual(['a', 'c']);
    expect(ids(matchClasses(day, { lesson: 'bootcamp', time: 'avond' }))).toEqual(['c']);
    expect(ids(matchClasses(day, { lesson: 'personal' }))).toEqual(['d']);
    expect(ids(matchClasses(day, { lesson: 'yoga' }))).toEqual([]);
  });

  it('maakt de oefeningen netjes: naam verplicht, hele getallen, tijd in de aanwijzing', () => {
    expect(
      cleanPlanExercises([
        { name: ' Goblet  squat ', sets: 3, reps: 12, notes: 'rustig zakken' },
        { name: 'Plank', sets: 3, notes: '40 sec' },
        { name: '', sets: 3, reps: 10 },
        { name: 'Burpees', sets: 2.6, reps: -4 },
      ])
    ).toEqual([
      { name: 'Goblet squat', sets: 3, reps: 12, notes: 'rustig zakken' },
      { name: 'Plank', sets: 3, reps: 0, notes: '40 sec' },
      { name: 'Burpees', sets: 3, reps: 0, notes: '' },
    ]);
  });

  it('beschrijft de les leesbaar', () => {
    expect(classLine(day[2])).toBe('woensdag 7 oktober 19:00–20:00 · Bootcamp');
  });
});
