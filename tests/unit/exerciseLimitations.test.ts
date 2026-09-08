import { describe, expect, it } from 'vitest';
import { checkExerciseAgainstLimitations, describeLimitation } from '../../src/utils/exerciseLimitations';
import type { Limitation } from '../../src/types';

const lim = (
  area: Limitation['area'],
  severity: Limitation['severity'] = 'vermijden',
  note?: string,
  alternative?: string
): Limitation => ({
  id: `${area}-${severity}`,
  area,
  severity,
  note: note ?? null,
  alternative: alternative ?? null,
  createdAt: '2026-09-01T00:00:00Z',
});

describe('checkExerciseAgainstLimitations', () => {
  it('waarschuwt bij een oefening die het klachtgebied belast', () => {
    const check = checkExerciseAgainstLimitations('cable shoulder press', [lim('schouder')]);
    expect(check.level).toBe('vermijden');
    expect(check.hits.map((h) => h.area)).toEqual(['schouder']);
  });
  it('geeft "let-op" als de bijzonderheid minder streng is', () => {
    expect(checkExerciseAgainstLimitations('cable shoulder press', [lim('schouder', 'let-op')]).level).toBe('let-op');
  });
  it('zwaarste niveau wint bij meerdere treffers', () => {
    // Barbell shrug belast traps (nek) en schouders.
    const check = checkExerciseAgainstLimitations('barbell shrug', [lim('schouder', 'let-op'), lim('nek', 'vermijden')]);
    expect(check.level).toBe('vermijden');
    expect(check.hits.map((h) => h.area)).toEqual(['nek', 'schouder']);
    expect(check.hits[0].severity).toBe('vermijden');
  });
  it('laat oefeningen die het gebied niet raken met rust', () => {
    expect(checkExerciseAgainstLimitations('barbell full squat', [lim('schouder')]).level).toBe('ok');
    expect(checkExerciseAgainstLimitations('cable shoulder press', []).level).toBe('ok');
    expect(checkExerciseAgainstLimitations('cable shoulder press', null).level).toBe('ok');
  });
  it('onbekende oefeningnaam geeft geen waarschuwing', () => {
    expect(checkExerciseAgainstLimitations('Eigen oefening van de trainer', [lim('schouder')]).level).toBe('ok');
  });
  it('knieklacht raakt een squat', () => {
    expect(checkExerciseAgainstLimitations('barbell full squat', [lim('knie')]).level).toBe('vermijden');
  });
});

describe('alternatief van de trainer', () => {
  it('geeft terug wat de trainer bij de bijzonderheid heeft genoteerd', () => {
    const check = checkExerciseAgainstLimitations('cable shoulder press', [
      lim('schouder', 'vermijden', 'links', 'floor press met dumbbells'),
    ]);
    expect(check.alternatives).toEqual(['floor press met dumbbells']);
  });
  it('niets genoteerd → geen alternatief (liever niets dan een gok)', () => {
    expect(checkExerciseAgainstLimitations('cable shoulder press', [lim('schouder')]).alternatives).toEqual([]);
  });
});

describe('describeLimitation', () => {
  it('leest als een zin voor de trainer', () => {
    expect(describeLimitation(lim('schouder', 'vermijden', 'links'))).toBe('Schouder (links) – vermijden');
    expect(describeLimitation(lim('knie', 'let-op'))).toBe('Knie – let op');
  });
});
