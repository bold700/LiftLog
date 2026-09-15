import { describe, expect, it } from 'vitest';
import { gifIdForExerciseName, gifUrlForExerciseName, gifUrlForId } from '../../src/utils/exerciseGif';
import { resolveExercise, gifUrlForId as serverGifUrlForId } from '../../api/_lib/exerciseGifIndex.mjs';

describe('oefening → GIF', () => {
  it('vindt dataset-id op (genormaliseerde) naam en via de uitzonderingenlijst', () => {
    expect(gifIdForExerciseName('Barbell Back Squat')).toBe('0043');
    expect(gifIdForExerciseName('  barbell BACK squat ')).toBe('0043');
    expect(gifIdForExerciseName('Leg Extension Machine')).toBe('0585');
    expect(gifIdForExerciseName('Hyperextension Machine (Back Extension)')).toBe('0489');
  });
  it('geen fuzzy matching: onbekende naam geeft null', () => {
    expect(gifIdForExerciseName('Onbekende oefening')).toBeNull();
    expect(gifUrlForExerciseName('')).toBeNull();
  });
  it('URL wijst naar de 720p-GIF in Firebase Storage', () => {
    expect(gifUrlForId('0043')).toMatch(/exercises%2F720%2F0043\.gif\?alt=media$/);
    expect(gifUrlForExerciseName('Barbell Back Squat')).toBe(gifUrlForId('0043'));
  });
  it('client en server geven voor de app-catalogusnamen dezelfde GIF', () => {
    for (const name of ['Barbell Back Squat', 'Lat Pulldown', 'TRX Row', 'Bulgarian Split Squat', 'Seated Row Machine', 'Cable Glute Kickback']) {
      const server = resolveExercise(name);
      expect(server, name).not.toBeNull();
      expect(gifUrlForExerciseName(name), name).toBe(serverGifUrlForId(server.id));
    }
  });
});
