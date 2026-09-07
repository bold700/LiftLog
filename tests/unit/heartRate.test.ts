import { describe, expect, it } from 'vitest';
import { heartRateZones, maxHeartRate } from '../../src/utils/heartRate';

describe('maxHeartRate', () => {
  it('220 min leeftijd', () => {
    expect(maxHeartRate(34)).toBe(186);
    expect(maxHeartRate(34.6)).toBe(185);
  });
  it('null bij onzinnige leeftijd', () => {
    expect(maxHeartRate(0)).toBeNull();
    expect(maxHeartRate(-5)).toBeNull();
    expect(maxHeartRate(120)).toBeNull();
    expect(maxHeartRate(Number.NaN)).toBeNull();
  });
});

describe('heartRateZones', () => {
  it('zonder rusthartslag: percentage van max', () => {
    const z = heartRateZones(34, null);
    expect(z?.method).toBe('percent-max');
    expect(z?.maxHr).toBe(186);
    expect(z?.zones).toHaveLength(5);
    expect(z?.zones[0]).toMatchObject({ zone: 1, lowBpm: 93, highBpm: 112 });
    expect(z?.zones[4]).toMatchObject({ zone: 5, lowBpm: 167, highBpm: 186 });
  });
  it('met rusthartslag: Karvonen (rust + reserve × %)', () => {
    const z = heartRateZones(34, 62);
    expect(z?.method).toBe('karvonen');
    expect(z?.restingHr).toBe(62);
    // reserve = 124; zone 2 = 62 + 124 × 0,6 … 0,7
    expect(z?.zones[1]).toMatchObject({ zone: 2, lowBpm: 136, highBpm: 149 });
  });
  it('zones sluiten op elkaar aan', () => {
    const z = heartRateZones(45, 55)!;
    for (let i = 1; i < z.zones.length; i++) expect(z.zones[i].lowBpm).toBe(z.zones[i - 1].highBpm);
  });
  it('onbruikbare rusthartslag valt terug op percentage van max', () => {
    expect(heartRateZones(34, 10)?.method).toBe('percent-max');
    expect(heartRateZones(34, 200)?.method).toBe('percent-max');
  });
  it('null zonder leeftijd', () => {
    expect(heartRateZones(null, 60)).toBeNull();
    expect(heartRateZones(undefined, 60)).toBeNull();
  });
});
