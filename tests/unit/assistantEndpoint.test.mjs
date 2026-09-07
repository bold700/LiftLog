/**
 * Het assistent-endpoint (api/assistant.mjs), met een nagebootste OpenAI en Firebase.
 *
 * Wat hier misgaat kost een deploy: het formaat van de Responses-API met functieaanroepen is
 * precies, en een fout erin merk je pas in productie. Deze test rijdt de hele lus af — vraag,
 * functieaanroep, resultaat terug, antwoord — zonder één externe aanroep.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const profiles = {
  t1: { userId: 't1', orgId: 'vanas', role: 'trainer', email: 'kenny@x.nl', displayName: 'Kenny', trainerId: null },
  u1: { userId: 'u1', orgId: 'vanas', role: 'sporter', email: 'danny@x.nl', displayName: 'Danny', trainerId: 't1' },
};

/** Firebase Admin: token → uid, plus net genoeg Firestore voor het opzoeken van de studionaam. */
let currentUid = 't1';
vi.mock('../../api/_lib/firebaseAdmin.mjs', () => ({
  getAdmin: () => ({
    auth: { verifyIdToken: async () => ({ uid: currentUid }) },
    db: {
      collection: () => ({
        doc: () => ({ get: async () => ({ exists: true, data: () => ({ name: 'Van As Personal Training' }) }) }),
      }),
    },
  }),
}));

/** Gegevenslaag: geen Firestore, alleen de profielen hierboven. */
vi.mock('../../api/_lib/liftlogData.mjs', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    createStore: () => ({
      getProfile: async (id) => profiles[id] ?? null,
      getAllProfiles: async () => Object.values(profiles),
      getSchemasForUser: async () => [],
      saveSchema: async (sc) => ({ ...sc, id: 'schema_1', createdAt: '2026-09-07T00:00:00.000Z' }),
      assignSchema: async () => {},
      createAccount: async (a) => ({ userId: 'nieuw', email: a.email, password: 'Geheim1' }),
      updateProfileFields: async () => {},
      getLogsForUser: async () => [],
      saveLog: async (l) => l,
      getNutritionForDay: async () => [],
      saveNutritionLog: async (n) => n,
      getMeasurements: async () => [],
      saveMeasurement: async (m) => m,
    }),
  };
});

const { default: handler } = await import('../../api/assistant.mjs');

/** Minimale res die het antwoord opvangt in plaats van het over het netwerk te sturen. */
function makeRes() {
  const res = {
    statusCode: 0,
    body: null,
    headers: {},
    setHeader(k, v) {
      this.headers[k] = v;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    end(payload) {
      this.body = payload ? JSON.parse(payload) : null;
    },
  };
  return res;
}

const makeReq = (body, token = 'geldig-token') => ({
  method: 'POST',
  headers: { authorization: `Bearer ${token}` },
  body,
});

/** Antwoorden die de nagebootste OpenAI achtereenvolgens teruggeeft. */
let openAiQueue = [];
let openAiCalls = [];

beforeEach(() => {
  currentUid = 't1';
  openAiCalls = [];
  openAiQueue = [];
  process.env.OPENAI_API_KEY = 'test-sleutel';
  vi.stubGlobal('fetch', async (url, init) => {
    openAiCalls.push({ url, body: JSON.parse(init.body) });
    const next = openAiQueue.shift() ?? { output: [], output_text: 'Klaar.' };
    return { ok: true, status: 200, json: async () => next, text: async () => '' };
  });
});

describe('assistent-endpoint', () => {
  it('weigert een aanvraag zonder token', async () => {
    const res = makeRes();
    await handler({ method: 'POST', headers: {}, body: { messages: [{ role: 'user', content: 'hoi' }] } }, res);
    expect(res.statusCode).toBe(401);
  });

  it('weigert een lege vraag', async () => {
    const res = makeRes();
    await handler(makeReq({ messages: [] }), res);
    expect(res.statusCode).toBe(400);
  });

  it('geeft een antwoord terug zonder functieaanroep', async () => {
    openAiQueue = [{ output: [{ type: 'message', content: [{ type: 'output_text', text: 'Vandaag is het rustdag.' }] }] }];
    const res = makeRes();
    await handler(makeReq({ messages: [{ role: 'user', content: 'Wat is mijn training vandaag?' }] }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.reply).toBe('Vandaag is het rustdag.');
    expect(res.body.steps).toEqual([]);
  });

  it('stuurt de gereedschapskist mee in het juiste formaat', async () => {
    openAiQueue = [{ output_text: 'Klaar.' }];
    const res = makeRes();
    await handler(makeReq({ messages: [{ role: 'user', content: 'hoi' }] }), res);

    const sent = openAiCalls[0].body;
    expect(sent.model).toBeTruthy();
    expect(sent.instructions).toContain('Van As Personal Training');
    expect(sent.tools.length).toBeGreaterThan(10);
    for (const tool of sent.tools) {
      expect(tool.type).toBe('function');
      expect(tool.parameters.additionalProperties).toBe(false);
    }
    // De vraag van de gebruiker gaat als input mee.
    expect(sent.input[0].content[0].text).toBe('hoi');
  });

  it('voert een functieaanroep uit en geeft het resultaat terug aan het model', async () => {
    openAiQueue = [
      {
        output: [
          { type: 'function_call', name: 'get_profile', call_id: 'call_1', arguments: JSON.stringify({ athlete: 'danny' }) },
        ],
      },
      { output: [{ type: 'message', content: [{ type: 'output_text', text: 'Danny weegt nog niets gelogd.' }] }] },
    ];
    const res = makeRes();
    await handler(makeReq({ messages: [{ role: 'user', content: 'Hoe gaat het met Danny?' }] }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.steps).toEqual([{ tool: 'get_profile', ok: true }]);
    expect(res.body.reply).toBe('Danny weegt nog niets gelogd.');

    // De tweede aanroep bevat het resultaat van de functie, gekoppeld aan de juiste call_id.
    const second = openAiCalls[1].body.input;
    const output = second.find((i) => i.type === 'function_call_output');
    expect(output.call_id).toBe('call_1');
    expect(output.output).toContain('Danny');
  });

  it('een sporter krijgt geen gereedschap voor andermans gegevens', async () => {
    currentUid = 'u1';
    openAiQueue = [{ output_text: 'Klaar.' }];
    const res = makeRes();
    await handler(makeReq({ messages: [{ role: 'user', content: 'hoi' }] }), res);

    const names = openAiCalls[0].body.tools.map((t) => t.name);
    expect(names).not.toContain('list_athletes');
    expect(names).not.toContain('create_account');
    expect(names).toContain('get_todays_workout');
  });

  it('stopt netjes als het model in een lus blijft hangen', async () => {
    // Elke ronde weer een functieaanroep: het endpoint moet er zelf een eind aan maken.
    openAiQueue = Array.from({ length: 10 }, () => ({
      output: [{ type: 'function_call', name: 'get_profile', call_id: 'c', arguments: '{}' }],
    }));
    const res = makeRes();
    await handler(makeReq({ messages: [{ role: 'user', content: 'blijf bezig' }] }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.reply).toMatch(/kleinere stappen/i);
    // In de laatste ronde mag het model geen functies meer aangeboden krijgen.
    expect(openAiCalls.at(-1).body.tools).toEqual([]);
  });

  it('geeft een nette fout als OpenAI eruit ligt', async () => {
    vi.stubGlobal('fetch', async () => ({ ok: false, status: 500, text: async () => 'boom', json: async () => ({}) }));
    const res = makeRes();
    await handler(makeReq({ messages: [{ role: 'user', content: 'hoi' }] }), res);

    expect(res.statusCode).toBe(502);
    expect(res.body.error).toMatch(/niet bereikbaar/i);
  });
});
