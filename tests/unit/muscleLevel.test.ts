/**
 * Kleur van een spiergroep op de lichaamsillustratie. De legenda loopt van "Minder" (licht) naar
 * "Meer" (donker); een eerdere versie gaf de meest getrainde spiergroep juist de lichtste tint.
 */
import { describe, it, expect } from 'vitest';
import { levelForFrequency } from '../../src/utils/muscleLevel';

describe('levelForFrequency', () => {
  const sorted = [11, 6, 5, 4, 3];

  it('meest getraind is het hoogste level, minst getraind het laagste', () => {
    expect(levelForFrequency(11, sorted)).toBe(5);
    expect(levelForFrequency(3, sorted)).toBe(1);
  });

  it('loopt af van meer naar minder', () => {
    const levels = sorted.map((f) => levelForFrequency(f, sorted));
    expect([...levels].sort((a, b) => b - a)).toEqual(levels);
  });

  it('één getrainde spiergroep telt als "meer"; niet getraind is geen kleur', () => {
    expect(levelForFrequency(2, [2])).toBe(5);
    expect(levelForFrequency(0, sorted)).toBe(0);
  });
});
