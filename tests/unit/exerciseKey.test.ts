import { describe, expect, it } from 'vitest';
import { exerciseKey } from '../../src/utils/exerciseKey';

describe('oefeningenbibliotheek: sleutel', () => {
  it('maakt varianten van dezelfde naam gelijk', () => {
    expect(exerciseKey('Hip Thrust')).toBe('hip-thrust');
    expect(exerciseKey('  hip-thrust ')).toBe('hip-thrust');
    expect(exerciseKey('Hip thrust')).toBe('hip-thrust');
  });
  it('haalt accenten en haakjes weg', () => {
    expect(exerciseKey('Skullcrusher (EZ-bar / Barbell)')).toBe('skullcrusher-ez-bar-barbell');
    expect(exerciseKey('Crème Squat')).toBe('creme-squat');
  });
  it('geeft een lege sleutel voor een lege naam', () => {
    expect(exerciseKey('  ')).toBe('');
  });
});
