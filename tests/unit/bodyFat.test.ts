import { describe, expect, it } from 'vitest';
import { ageOnDate, bmi, bodyFatDurninWomersley, fatFreeMassKg, toSkinfoldSex, DW_MIN_AGE } from '../../src/utils/bodyFat';
// De server (MCP) rekent met een eigen kopie van dezelfde formule; deze test bewaakt dat die niet uit elkaar lopen.
import * as server from '../../api/_lib/bodyFat.mjs';

const man34 = { bicepsMm: 8, tricepsMm: 12, subscapularMm: 15, suprailiacMm: 18, sex: 'man' as const, ageYears: 34 };

describe('bodyFatDurninWomersley', () => {
  it('rekent een realistisch percentage uit (man, 34 jaar, som 53 mm)', () => {
    const r = bodyFatDurninWomersley(man34);
    expect(r?.sumMm).toBe(53);
    // dichtheid = 1,1422 − 0,0544·log10(53) = 1,0484 → Siri: 495/1,0484 − 450 = 22,1
    expect(r?.pct).toBe(22.1);
    expect(r?.method).toBe('durnin-womersley');
  });
  it('gebruikt per geslacht en leeftijd een andere tabelrij', () => {
    const jong = bodyFatDurninWomersley({ ...man34, ageYears: 19 })!.pct;
    const oud = bodyFatDurninWomersley({ ...man34, ageYears: 55 })!.pct;
    const vrouw = bodyFatDurninWomersley({ ...man34, sex: 'vrouw' })!.pct;
    expect(jong).not.toBe(oud);
    expect(vrouw).toBeGreaterThan(bodyFatDurninWomersley(man34)!.pct);
  });
  it('null bij ontbrekende plooi of te jonge leeftijd', () => {
    expect(bodyFatDurninWomersley({ ...man34, bicepsMm: 0 })).toBeNull();
    expect(bodyFatDurninWomersley({ ...man34, ageYears: DW_MIN_AGE - 1 })).toBeNull();
  });
  it('geeft op de server hetzelfde resultaat als in de app', () => {
    for (const input of [man34, { ...man34, sex: 'vrouw' as const, ageYears: 27 }, { ...man34, ageYears: 61, suprailiacMm: 30 }]) {
      expect(server.bodyFatDurninWomersley(input)?.pct).toBe(bodyFatDurninWomersley(input)?.pct);
    }
    expect(server.DW_MIN_AGE).toBe(DW_MIN_AGE);
  });
});

describe('ageOnDate', () => {
  it('telt hele jaren, vóór en na de verjaardag', () => {
    expect(ageOnDate('1990-06-15', '2026-06-14')).toBe(35);
    expect(ageOnDate('1990-06-15', '2026-06-15')).toBe(36);
    expect(server.ageOnDate('1990-06-15', '2026-06-14')).toBe(35);
  });
  it('null bij ontbrekende of ongeldige datum', () => {
    expect(ageOnDate(null, '2026-01-01')).toBeNull();
    expect(ageOnDate('geen datum', '2026-01-01')).toBeNull();
  });
});

describe('overige maten', () => {
  it('toSkinfoldSex kent alleen man/vrouw', () => {
    expect(toSkinfoldSex('man')).toBe('man');
    expect(toSkinfoldSex('anders')).toBeNull();
    expect(toSkinfoldSex(null)).toBeNull();
  });
  it('fatFreeMassKg en bmi', () => {
    expect(fatFreeMassKg(80, 20)).toBe(64);
    expect(fatFreeMassKg(80, 100)).toBeNull();
    expect(bmi(80, 180)).toBe(24.7);
    expect(bmi(80, null)).toBeNull();
  });
});
