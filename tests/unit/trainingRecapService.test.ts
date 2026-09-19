import { describe, it, expect, vi, afterEach } from 'vitest';
import { generateTrainingRecap } from '../../src/services/trainingRecapService';

const training = {
  sporterName: 'Bas',
  dayLabel: 'Vrijdag - PT Defensie Full Body',
  exercises: [{ name: 'Barbell Row', weight: 40, sets: 3, reps: 10 }],
};

afterEach(() => vi.unstubAllGlobals());

describe('generateTrainingRecap', () => {
  it('geeft de twee teksten terug', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ handover: 'Ging goed met Bas.', toSporter: 'Sterk!' }),
    }));
    await expect(generateTrainingRecap(training)).resolves.toEqual({
      handover: 'Ging goed met Bas.',
      toSporter: 'Sterk!',
    });
  });

  it('gebruikt de melding van de server als die er is', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ error: 'Daglimiet bereikt.' }),
    }));
    await expect(generateTrainingRecap(training)).rejects.toThrow('Daglimiet bereikt.');
  });

  it('noemt de foutcode als de server niets zegt, anders valt er niets uit te zoeken', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 504,
      json: async () => { throw new Error('geen JSON'); },
    }));
    await expect(generateTrainingRecap(training)).rejects.toThrow('foutcode 504');
  });

  it('kapt af als het te lang duurt, in plaats van eeuwig te blijven draaien', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('afgebroken', 'AbortError')));
    await expect(generateTrainingRecap(training)).rejects.toThrow(/te lang/);
  });

  it('zegt het als er geen verbinding is', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(generateTrainingRecap(training)).rejects.toThrow(/Geen verbinding/);
  });
});
