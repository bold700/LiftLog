/**
 * Vertaling van de QR-meting van de BodyAnalyse-weegschaal (api/_lib/bodyAnalyseQr.mjs).
 * De voorbeeldlijst is de meting van 23-09-2026 23:45, nagebouwd uit het rapport dat de
 * QR-pagina tekent (dezelfde volgorde als hello.js: createReport).
 */
import { describe, it, expect } from 'vitest';
import { bodyAnalyseKeyFromInput, bodyScanFromCodeValue, codeValueList } from '../../api/_lib/bodyAnalyseQr.mjs';
import { sanitizeBodyScan } from '../../api/_lib/bodyScan.mjs';

const SAMPLE = [
  '0', 'guest', 'M', '37', '176.0cm', '23:45 2026-09-23',
  '43.8', '38.2', '46.7', // lichaamswater + normaal
  '11.9', '10.2', '12.5', // eiwit
  '4.0', '3.5', '4.3', // mineralen
  '10.8', '8.2', '16.4', // vetmassa
  '70.6', '57.9', '78.4', // gewicht
  '33.9', '29.2', '35.6', // skeletspiermassa
  '59.8', // vetvrije massa
  '22.7', '18.5', '23.0', // BMI
  '15.3', '10.0', '20.0', // vetpercentage
  '0.8', '0.8', '0.9', // taille-heup
  '12.8', '8.6', '16.7', // onderhuids vet
  '6', // visceraal vet
  '3.2', '0.8', '3.1', '0.8', '9.7', '1.4', '9.8', '1.4', '26.3', '5.5', // segmenten: arm L, arm R, been L, been R, romp
  '68.1', '-0.2', '-0.2', '0.0', '1661', '80', '35', // gewichtsregulatie t/m lichaamsleeftijd
  '8', // lichaamstype: Standard type
];

describe('bodyAnalyseKeyFromInput', () => {
  it('haalt de sleutel uit de QR-link, en accepteert een losse sleutel', () => {
    expect(bodyAnalyseKeyFromInput('http://119.23.70.228/tcy/index.html?lang=en&key=6BC1A6B5B572CADDD614E4D8DE487065')).toBe('6bc1a6b5b572caddd614e4d8de487065');
    expect(bodyAnalyseKeyFromInput('  6bc1a6b5b572caddd614e4d8de487065 ')).toBe('6bc1a6b5b572caddd614e4d8de487065');
  });
  it('weigert andere sites en rare sleutels', () => {
    expect(bodyAnalyseKeyFromInput('https://example.com/?key=6bc1a6b5b572caddd614e4d8de487065')).toBeNull();
    expect(bodyAnalyseKeyFromInput('http://119.23.70.228/tcy/index.html?key=abc')).toBeNull();
    expect(bodyAnalyseKeyFromInput('')).toBeNull();
  });
});

describe('codeValueList', () => {
  it('leest de lijst uit het antwoord van de fabrikant (JSON-tekst in codeValue)', () => {
    expect(codeValueList({ data: { codeValue: JSON.stringify(SAMPLE) } })).toEqual(SAMPLE);
    expect(codeValueList({ data: { codeValue: SAMPLE } })).toEqual(SAMPLE);
  });
  it('geeft null bij een leeg of kapot antwoord', () => {
    expect(codeValueList({ data: { codeValue: 'niet json' } })).toBeNull();
    expect(codeValueList({ data: {} })).toBeNull();
    expect(codeValueList({ data: { codeValue: '["1","2"]' } })).toBeNull();
  });
});

describe('bodyScanFromCodeValue', () => {
  const scan = bodyScanFromCodeValue(SAMPLE);

  it('zet elke waarde op de juiste plek, net als het rapport', () => {
    expect(scan.values).toEqual({
      bodyWaterKg: 43.8,
      proteinKg: 11.9,
      mineralKg: 4.0,
      fatMassKg: 10.8,
      weightKg: 70.6,
      skeletalMuscleKg: 33.9,
      fatFreeMassKg: 59.8,
      bmi: 22.7,
      bodyFatPct: 15.3,
      waistHipRatio: 0.8,
      subcutaneousFat: 12.8,
      visceralFatLevel: 6,
      targetWeightKg: 68.1,
      weightControlKg: -0.2,
      fatControlKg: -0.2,
      muscleControlKg: 0,
      basalMetabolismKcal: 1661,
      healthScore: 80,
      bodyAge: 35,
    });
  });

  it('neemt de normaalwaardes van het apparaat mee', () => {
    expect(scan.ranges).toEqual({
      bodyWaterKg: [38.2, 46.7],
      proteinKg: [10.2, 12.5],
      mineralKg: [3.5, 4.3],
      fatMassKg: [8.2, 16.4],
      weightKg: [57.9, 78.4],
      skeletalMuscleKg: [29.2, 35.6],
      bmi: [18.5, 23.0],
      bodyFatPct: [10.0, 20.0],
      waistHipRatio: [0.8, 0.9],
      subcutaneousFat: [8.6, 16.7],
      visceralFatLevel: [1, 9],
    });
  });

  it('verwisselt links, rechts en romp niet', () => {
    expect(scan.segments).toEqual({
      armLeft: { muscleKg: 3.2, fatKg: 0.8 },
      armRight: { muscleKg: 3.1, fatKg: 0.8 },
      trunk: { muscleKg: 26.3, fatKg: 5.5 },
      legLeft: { muscleKg: 9.7, fatKg: 1.4 },
      legRight: { muscleKg: 9.8, fatKg: 1.4 },
    });
  });

  it('kent leeftijd, lengte, tijdstip en lichaamstype', () => {
    expect(scan).toMatchObject({ source: 'bodyanalyse', ageYears: 37, heightCm: 176, measuredAt: '23:45 2026-09-23', bodyType: 'Standard type' });
  });

  it('past in de opschoning die de app al kent', () => {
    const clean = sanitizeBodyScan(scan);
    expect(clean.values.weightKg).toBe(70.6);
    expect(clean.ranges.weightKg).toEqual([57.9, 78.4]);
    expect(clean.segments.trunk).toEqual({ muscleKg: 26.3, fatKg: 5.5 });
    expect(clean.ageYears).toBe(37);
  });

  it('geeft null zonder meting', () => {
    expect(bodyScanFromCodeValue([])).toBeNull();
    expect(bodyScanFromCodeValue(Array(56).fill(''))).toBeNull();
  });
});
