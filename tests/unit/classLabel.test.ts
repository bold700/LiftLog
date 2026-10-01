import { describe, expect, it } from 'vitest';
import { classLabel, shortPersonName } from '../../src/utils/classLabel';

describe('les in het rooster: wie heeft PT', () => {
  const pt = { title: 'Personal Training', privateFor: 'u1', sessionKind: '1on1' as const, trainerId: 't1' };
  it('staf ziet het lid en de trainer', () => {
    expect(classLabel(pt, { member: 'Emma Laureau', trainer: 'Kenny Timmer' })).toEqual({ title: 'Emma L', sub: 'PT – Kenny' });
  });
  it('het lid zelf ziet bij welke trainer', () => {
    expect(classLabel(pt, { trainer: 'Kenny Timmer' })).toEqual({ title: 'PT – Kenny', sub: null });
  });
  it('duo PT en een gewone groepsles', () => {
    expect(classLabel({ ...pt, sessionKind: 'duo' }, { member: 'Bas', trainer: 'Tim Hoes' })).toEqual({ title: 'Bas', sub: 'Duo PT – Tim' });
    expect(classLabel({ ...pt, privateFor: null, title: 'HIIT' }, { member: 'x' })).toEqual({ title: 'HIIT', sub: null });
  });
  it('korte naam', () => {
    expect(shortPersonName('Emma van der Laureau')).toBe('Emma L');
    expect(shortPersonName('Bas')).toBe('Bas');
  });
});
