import { describe, expect, it } from 'vitest';
import type { Measurement } from '../../src/services/measurementService';
import type { BodyScan } from '../../src/utils/bodyScan';
import { bodyComposition, deltaTone, latestWeight, measurementSource, measurementWhen, weightTone } from '../../src/utils/bodySummary';

let n = 0;
const m = (date: string, extra: Partial<Measurement> = {}): Measurement =>
  ({
    id: `m${n++}`,
    userId: 'u',
    loggedBy: 'u',
    trainerId: null,
    date,
    weightKg: null,
    bodyFatPct: null,
    bodyFatMethod: null,
    bodyScan: null,
    note: '',
    createdAt: '',
    ...extra,
  }) as Measurement;

const scan = (values: Partial<BodyScan['values']>, measuredAt: string | null = null): BodyScan =>
  ({ source: 'bodyanalyse', measuredAt, ageYears: null, heightCm: null, values, ranges: {}, segments: {} }) as unknown as BodyScan;

describe('latestWeight', () => {
  it('laatste gewicht met verschil t.o.v. de weging ervoor, metingen zonder gewicht overgeslagen', () => {
    const r = latestWeight([m('2026-08-02', { weightKg: 83.6 }), m('2026-08-10'), m('2026-08-16', { weightKg: 82.4 })]);
    expect(r).toMatchObject({ weightKg: 82.4, deltaKg: -1.2 });
    expect(latestWeight([m('2026-08-02', { weightKg: 80 })])?.deltaKg).toBeNull();
    expect(latestWeight([m('2026-08-02')])).toBeNull();
  });
});

describe('measurementSource', () => {
  it('scan, plooien of handmatig', () => {
    expect(measurementSource(m('2026-08-02', { bodyScan: scan({}) }))).toBe('scan');
    expect(measurementSource(m('2026-08-02', { bodyFatMethod: 'durnin-womersley' }))).toBe('plooien');
    expect(measurementSource(m('2026-08-02', { weightKg: 80 }))).toBe('handmatig');
  });
});

describe('bodyComposition', () => {
  it('uit de laatste scan, met verschil t.o.v. de scan ervoor', () => {
    const rows = bodyComposition(
      [
        m('2026-08-02', { bodyScan: scan({ skeletalMuscleKg: 38.2, bodyFatPct: 17.4, visceralFatLevel: 7 }) }),
        m('2026-08-09', { weightKg: 83 }),
        m('2026-08-16', { bodyScan: scan({ skeletalMuscleKg: 38.6, bodyFatPct: 16.8, bodyWaterKg: 44.7, visceralFatLevel: 6 }) }),
      ],
      180
    );
    expect(rows.map((r) => [r.label, r.value, r.delta])).toEqual([
      ['Skeletspiermassa', '38,6 kg', '+0,4'],
      ['Vetpercentage', '16,8 %', '−0,6'],
      ['Lichaamswater', '44,7 kg', null],
      ['Visceraal vet', 'Niveau 6', '−1'],
    ]);
    expect(rows[0].fill).toBeCloseTo(38.6 / 60);
    // Meer spier, minder vet en minder visceraal vet: allemaal goed nieuws; water zonder vergelijking neutraal.
    expect(rows.map((r) => r.tone)).toEqual(['good', 'good', 'neutral', 'good']);
  });

  it('zonder scan: vetpercentage, vetvrije massa en BMI uit gewone metingen', () => {
    const rows = bodyComposition(
      [m('2026-08-02', { weightKg: 84, bodyFatPct: 20 }), m('2026-08-16', { weightKg: 82, bodyFatPct: 18 })],
      180
    );
    expect(rows.map((r) => [r.label, r.value, r.delta])).toEqual([
      ['Vetpercentage', '18 %', '−2'],
      ['Vetvrije massa', '67,2 kg', '0'],
      ['BMI', '25,3', null],
    ]);
  });

  it('leeg zonder gegevens', () => {
    expect(bodyComposition([m('2026-08-02')], null)).toEqual([]);
  });
});

describe('measurementWhen', () => {
  const now = new Date(2026, 8, 22);
  it('dag en maand, weekdag en tijd van de scan waar gevraagd, jaar alleen als het anders is', () => {
    const withScan = m('2026-08-16', { bodyScan: scan({}, '2026-08-16 07:04') });
    expect(measurementWhen(withScan, {}, now)).toBe('16 aug 07:04');
    expect(measurementWhen(withScan, { weekday: true }, now)).toBe('zo 16 aug 07:04');
    expect(measurementWhen(withScan, { time: false }, now)).toBe('16 aug');
    expect(measurementWhen(m('2025-12-30'), {}, now)).toBe('30 dec 2025');
  });
});

describe('kleur van een verandering', () => {
  it('meer vet is slecht, meer spier is goed, water is neutraal', () => {
    expect(deltaTone(18, 17, 'down')).toBe('bad');
    expect(deltaTone(39, 38, 'up')).toBe('good');
    expect(deltaTone(45, 44, null)).toBe('neutral');
    expect(deltaTone(17, 17, 'down')).toBe('neutral');
  });

  it('gewicht: richting het doel is goed, ervan af slecht, zonder doel neutraal', () => {
    expect(weightTone(82, 83, 78)).toBe('good');
    expect(weightTone(84, 83, 78)).toBe('bad');
    // Wie wil aankomen: omhoog is goed.
    expect(weightTone(71, 70, 75)).toBe('good');
    expect(weightTone(82, 83, null)).toBe('neutral');
  });
});
