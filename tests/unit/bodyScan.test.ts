import { describe, expect, it } from 'vitest';
import {
  BODY_SCAN_KEYS,
  BODY_SCAN_SEGMENT_KEYS,
  bodyScanFromDraft,
  draftFromBodyScan,
  draftHasValues,
  emptyBodyScanDraft,
  formatScanValue,
  measuredDate,
  parseBodyScan,
  parseMeasuredAt,
  rangeBarPosition,
  rangeStatus,
  summarizeBodyScan,
} from '../../src/utils/bodyScan';
// De server schoont het AI-antwoord op met dezelfde sleutels; deze test bewaakt dat de lijsten gelijk blijven.
import * as server from '../../api/_lib/bodyScan.mjs';

/** Wat het vision-model teruggeeft voor de eerste meting op de BodyAnalyse-weegschaal (scherm, 2025-06-07). */
const aiAnswer = {
  source: 'bodyanalyse',
  measuredAt: '2025-06-07 10:14',
  ageYears: 41,
  heightCm: 175,
  values: {
    weightKg: 102.1,
    skeletalMuscleKg: 38.7,
    fatMassKg: 34.2,
    fatFreeMassKg: 67.9,
    bodyWaterKg: 49.8,
    proteinKg: 13.5,
    mineralKg: 4.6,
    bmi: 33.3,
    bodyFatPct: 33.5,
    waistHipRatio: 1.0,
    visceralFatLevel: 13,
    subcutaneousFat: 30.0,
    targetWeightKg: 67.4,
    weightControlKg: -22.2,
    fatControlKg: -22.2,
    muscleControlKg: 0,
    basalMetabolismKcal: 1836,
    healthScore: 68,
    bodyAge: 33,
  },
  ranges: {
    weightKg: [57.3, 77.5],
    skeletalMuscleKg: [28.8, 35.2],
    fatMassKg: [8.1, 16.2],
    bmi: [18.5, 23.0],
    bodyFatPct: [10.0, 20.0],
    waistHipRatio: [0.8, 0.9],
    visceralFatLevel: [1.0, 9.0],
  },
  segments: {
    armLeft: { muscleKg: 3.4, fatKg: 2.1 },
    armRight: { muscleKg: 3.6, fatKg: 2.0 },
    trunk: { muscleKg: 30.4, fatKg: 17.7 },
    legLeft: { muscleKg: 10.7, fatKg: 4.7 },
    legRight: { muscleKg: 10.6, fatKg: 4.8 },
  },
};

describe('parseBodyScan', () => {
  it('neemt waarden, normaalwaardes en segmenten over uit een AI-antwoord', () => {
    const scan = parseBodyScan(aiAnswer)!;
    expect(scan.source).toBe('bodyanalyse');
    expect(scan.measuredAt).toBe('2025-06-07 10:14');
    expect(scan.ageYears).toBe(41);
    expect(scan.heightCm).toBe(175);
    expect(scan.values.weightKg).toBe(102.1);
    expect(scan.values.visceralFatLevel).toBe(13);
    expect(scan.ranges.weightKg).toEqual({ min: 57.3, max: 77.5 });
    expect(scan.ranges.proteinKg).toBeUndefined();
    expect(scan.segments.trunk).toEqual({ muscleKg: 30.4, fatKg: 17.7 });
  });
  it('accepteert komma’s, tekstgetallen en normaalwaardes als "a~b" of {min,max}', () => {
    const scan = parseBodyScan({
      values: { weightKg: '68,7', bodyFatPct: '11.9' },
      ranges: { weightKg: '57.9~78.3', bodyFatPct: { min: 10, max: 20 } },
    })!;
    expect(scan.values.weightKg).toBe(68.7);
    expect(scan.values.bodyFatPct).toBe(11.9);
    expect(scan.ranges.weightKg).toEqual({ min: 57.9, max: 78.3 });
    expect(scan.ranges.bodyFatPct).toEqual({ min: 10, max: 20 });
  });
  it('gooit onmogelijke waarden (leesfouten) en onbekende sleutels weg', () => {
    const scan = parseBodyScan({ values: { weightKg: 1021, bodyFatPct: 33.5, bmi: 'abc', onzin: 5 }, ranges: { bmi: [23, 18.5] } })!;
    expect(scan.values.weightKg).toBeNull();
    expect(scan.values.bodyFatPct).toBe(33.5);
    expect(scan.values.bmi).toBeNull();
    expect(scan.ranges.bmi).toBeUndefined();
    expect('onzin' in scan.values).toBe(false);
  });
  it('rondt af op het aantal decimalen van het veld', () => {
    const scan = parseBodyScan({ values: { weightKg: 102.14, mineralKg: 3.834, visceralFatLevel: 12.6 } })!;
    expect(scan.values.weightKg).toBe(102.1);
    expect(scan.values.mineralKg).toBe(3.83);
    expect(scan.values.visceralFatLevel).toBe(13);
  });
  it('geeft null zonder enige waarde', () => {
    expect(parseBodyScan(null)).toBeNull();
    expect(parseBodyScan({})).toBeNull();
    expect(parseBodyScan({ values: { weightKg: null }, ranges: { weightKg: [1, 2] } })).toBeNull();
  });
});

describe('parseMeasuredAt', () => {
  it('leest de notaties van het scherm, de uitdraai en InBody', () => {
    expect(parseMeasuredAt('2025/06/07 10:15:31 AM')).toBe('2025-06-07 10:15');
    expect(parseMeasuredAt('10:14 2025-06-07')).toBe('2025-06-07 10:14');
    expect(parseMeasuredAt('2026-08-09')).toBe('2026-08-09');
    expect(parseMeasuredAt('gisteren')).toBeNull();
    expect(parseMeasuredAt(null)).toBeNull();
  });
  it('geeft alleen de datum voor het meetformulier', () => {
    expect(measuredDate({ measuredAt: '2025-06-07 10:14' })).toBe('2025-06-07');
    expect(measuredDate({ measuredAt: null })).toBeNull();
  });
});

describe('rangeStatus en rangeBarPosition', () => {
  const range = { min: 57.3, max: 77.5 };
  it('deelt in als laag, normaal of hoog', () => {
    expect(rangeStatus(50, range)).toBe('laag');
    expect(rangeStatus(57.3, range)).toBe('normaal');
    expect(rangeStatus(77.5, range)).toBe('normaal');
    expect(rangeStatus(102.1, range)).toBe('hoog');
    expect(rangeStatus(null, range)).toBeNull();
    expect(rangeStatus(60, null)).toBeNull();
  });
  it('zet de normaalzone op een vaste plek van de balk en knipt daarbuiten af', () => {
    expect(rangeBarPosition(57.3, range)).toBeCloseTo(0.25, 5);
    expect(rangeBarPosition(77.5, range)).toBeCloseTo(0.5, 5);
    expect(rangeBarPosition(300, range)).toBe(0.98);
    expect(rangeBarPosition(-100, range)).toBe(0.02);
  });
});

describe('formulier-concept', () => {
  it('gaat verliesvrij heen en terug tussen scan en concept', () => {
    const scan = parseBodyScan(aiAnswer)!;
    const draft = draftFromBodyScan(scan);
    expect(draft.values.weightKg).toBe('102.1');
    expect(draft.segments.legRight.fatKg).toBe('4.8');
    expect(draftHasValues(draft)).toBe(true);
    expect(bodyScanFromDraft(draft)).toEqual(scan);
  });
  it('een leeg concept heeft geen waarden en levert geen scan op', () => {
    const draft = emptyBodyScanDraft();
    expect(draftHasValues(draft)).toBe(false);
    expect(bodyScanFromDraft(draft)).toBeNull();
  });
  it('bewerkte tekst met komma wordt een getal', () => {
    const draft = emptyBodyScanDraft();
    draft.values.skeletalMuscleKg = '39,0';
    expect(bodyScanFromDraft(draft)?.values.skeletalMuscleKg).toBe(39);
  });
});

describe('weergave', () => {
  it('formatteert met komma en het juiste aantal decimalen', () => {
    expect(formatScanValue('weightKg', 102.1)).toBe('102,1');
    expect(formatScanValue('mineralKg', 3.83)).toBe('3,83');
    expect(formatScanValue('bodyAge', 33)).toBe('33');
    expect(formatScanValue('bodyAge', null)).toBe('—');
  });
  it('vat een scan samen voor de historielijst', () => {
    expect(summarizeBodyScan(parseBodyScan(aiAnswer)!)).toBe('Bodyscan · spier 38,7 kg · visceraal 13 · lichaamsleeftijd 33');
  });
});

describe('server', () => {
  it('kent dezelfde sleutels als de app', () => {
    expect([...server.BODY_SCAN_KEYS]).toEqual([...BODY_SCAN_KEYS]);
    expect([...server.BODY_SCAN_SEGMENT_KEYS]).toEqual([...BODY_SCAN_SEGMENT_KEYS]);
  });
  it('schoont het AI-antwoord op tot iets wat de app kan parsen', () => {
    const cleaned = server.sanitizeBodyScan({ ...aiAnswer, values: { ...aiAnswer.values, verzonnen: 1, bmi: 'x' } });
    expect(cleaned.values.verzonnen).toBeUndefined();
    expect(cleaned.values.bmi).toBeUndefined();
    expect(cleaned.ranges.weightKg).toEqual([57.3, 77.5]);
    const scan = parseBodyScan(cleaned)!;
    expect(scan.values.weightKg).toBe(102.1);
    expect(scan.values.bmi).toBeNull();
    expect(scan.segments.armLeft).toEqual({ muscleKg: 3.4, fatKg: 2.1 });
  });
  it('geeft null zonder waarden', () => {
    expect(server.sanitizeBodyScan({ values: {} })).toBeNull();
    expect(server.sanitizeBodyScan('tekst')).toBeNull();
  });
});
