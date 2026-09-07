/**
 * De brug tussen de MCP-gereedschapskist en de assistent in de app.
 *
 * Belangrijkste eis: de assistent erft exact dezelfde rechten als de AI-koppeling. Een sporter mag
 * hier dus net zo min bij andermans gegevens als daar. Dit test de brug zonder OpenAI aan te roepen.
 */
import { describe, it, expect } from 'vitest';
import { openToolbox } from '../../api/_lib/assistantTools.mjs';

const profiles = {
  sporter: { userId: 'u1', orgId: 'vanas', role: 'sporter', email: 'danny@x.nl', displayName: 'Danny', trainerId: 't1' },
  ander: { userId: 'u2', orgId: 'vanas', role: 'sporter', email: 'margot@x.nl', displayName: 'Margot', trainerId: 't2' },
  trainer: { userId: 't1', orgId: 'vanas', role: 'trainer', email: 'kenny@x.nl', displayName: 'Kenny', trainerId: null },
};

function fakeStore(orgId) {
  return {
    getProfile: async (id) => Object.values(profiles).find((p) => p.userId === id) ?? null,
    getAllProfiles: async () => Object.values(profiles).filter((p) => p.orgId === orgId),
    getSchemasForUser: async () => [],
    saveSchema: async (sc) => ({ ...sc, id: 'schema_nieuw', createdAt: new Date().toISOString() }),
    assignSchema: async () => {},
    createAccount: async (a) => ({ userId: 'nieuw', email: a.email, password: 'Geheim1' }),
    updateProfileFields: async () => {},
    getLogsForUser: async () => [],
    saveLog: async (l) => l,
    getNutritionForDay: async () => [],
    saveNutritionLog: async (n) => n,
    getMeasurements: async () => [],
    saveMeasurement: async (m) => m,
  };
}

const withToolbox = async (who, fn) => {
  const toolbox = await openToolbox({ profile: profiles[who] }, fakeStore(profiles[who].orgId));
  try {
    return await fn(toolbox);
  } finally {
    await toolbox.close();
  }
};

describe('gereedschapskist voor de assistent', () => {
  it('levert functiebeschrijvingen die OpenAI accepteert', async () => {
    await withToolbox('trainer', (toolbox) => {
      expect(toolbox.definitions.length).toBeGreaterThan(10);
      for (const def of toolbox.definitions) {
        expect(def.type).toBe('function');
        expect(def.name).toMatch(/^[a-z_]+$/);
        expect(def.strict).toBe(true);
        // Strikte modus van OpenAI: elk veld verplicht en geen losse velden erbij.
        expect(def.parameters.additionalProperties).toBe(false);
        expect(new Set(def.parameters.required)).toEqual(new Set(Object.keys(def.parameters.properties)));
      }
    });
  });

  it('geeft een sporter minder gereedschap dan een trainer', async () => {
    const namesOf = (t) => t.definitions.map((d) => d.name);
    const sporterTools = await withToolbox('sporter', async (t) => namesOf(t));
    const trainerTools = await withToolbox('trainer', async (t) => namesOf(t));

    for (const staffOnly of ['list_athletes', 'create_workout', 'create_account', 'assign_workout']) {
      expect(trainerTools).toContain(staffOnly);
      expect(sporterTools).not.toContain(staffOnly);
    }
  });

  it('een sporter komt via de assistent niet bij andermans gegevens', async () => {
    await withToolbox('sporter', async (toolbox) => {
      const r = await toolbox.call('get_profile', { athlete: 'margot' });
      expect(r.text).not.toMatch(/Margot/i);
      expect(r.text).toMatch(/Danny/);
    });
  });

  it('een trainer komt niet bij de sporter van een andere trainer', async () => {
    await withToolbox('trainer', async (toolbox) => {
      const r = await toolbox.call('get_profile', { athlete: 'margot' });
      expect(r.ok).toBe(false);
      expect(r.text).toMatch(/geen sporter/i);
    });
  });

  it('een trainer komt wel bij de eigen sporter', async () => {
    await withToolbox('trainer', async (toolbox) => {
      const r = await toolbox.call('get_profile', { athlete: 'danny' });
      expect(r.ok).toBe(true);
      expect(r.text).toMatch(/Danny/);
    });
  });

  it('velden die het model op null zet worden niet doorgegeven', async () => {
    await withToolbox('trainer', async (toolbox) => {
      // athlete: null moet gelezen worden als "weggelaten", dus over de trainer zelf.
      const r = await toolbox.call('get_profile', { athlete: null });
      expect(r.ok).toBe(true);
      expect(r.text).toMatch(/Kenny/);
    });
  });

  it('een onbekende functie geeft een nette fout in plaats van een crash', async () => {
    await withToolbox('sporter', async (toolbox) => {
      const r = await toolbox.call('bestaat_niet', {});
      expect(r.ok).toBe(false);
      expect(r.text.length).toBeGreaterThan(0);
    });
  });
});
