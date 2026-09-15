/**
 * Het meldingen-endpoint (api/notify.mjs).
 *
 * Dit is een route die namens een gebruiker iets naar het toestel van iemand anders stuurt. Zonder
 * strakke grenzen wordt zoiets een manier om willekeurige mensen berichten te sturen. Daarom staat
 * hier vooral: wie mag wie een melding sturen, en wat kan de afzender zelf bepalen.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const profiles = {
  adminA: { orgId: 'vanas', role: 'admin', displayName: 'Kenny', trainerId: null },
  trainerA: { orgId: 'vanas', role: 'trainer', displayName: 'Simone', trainerId: null },
  sporterA: { orgId: 'vanas', role: 'sporter', displayName: 'Bas', trainerId: 'trainerA' },
  vreemdeA: { orgId: 'vanas', role: 'sporter', displayName: 'Margot', trainerId: 'iemandAnders' },
  sporterB: { orgId: 'studiob', role: 'sporter', displayName: 'Iris', trainerId: 'trainerB' },
  legacy: { role: 'sporter', displayName: 'Oud', trainerId: 'trainerA' },
};

let currentUid = 'trainerA';
let sentPayloads = [];
let deletedTokens = [];

vi.mock('../../api/_lib/firebaseAdmin.mjs', () => ({
  getAdmin: () => ({
    auth: { verifyIdToken: async () => ({ uid: currentUid }) },
    db: {
      collection: (name) => ({
        doc: (id) => ({
          get: async () => ({ exists: profiles[id] !== undefined, data: () => profiles[id] }),
          delete: async () => {
            deletedTokens.push(id);
          },
        }),
        // pushTokens: iedereen heeft één toestel, met het token als document-id.
        where: (_f, _op, userId) => ({
          get: async () => ({
            docs: name === 'pushTokens' ? [{ id: `tok_${userId}` }] : [],
          }),
        }),
      }),
    },
  }),
}));

vi.mock('firebase-admin/messaging', () => ({
  getMessaging: () => ({
    sendEachForMulticast: async (payload) => {
      sentPayloads.push(payload);
      return { successCount: payload.tokens.length, responses: payload.tokens.map(() => ({ error: null })) };
    },
  }),
}));

const { default: handler } = await import('../../api/notify.mjs');

function makeRes() {
  return {
    statusCode: 0,
    body: null,
    setHeader() {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    end(payload) {
      this.body = payload ? JSON.parse(payload) : null;
    },
  };
}

const post = async (body, { uid = 'trainerA', token = 'geldig' } = {}) => {
  currentUid = uid;
  const res = makeRes();
  await handler({ method: 'POST', headers: token ? { authorization: `Bearer ${token}` } : {}, body }, res);
  return res;
};

beforeEach(() => {
  sentPayloads = [];
  deletedTokens = [];
});

describe('meldingen versturen', () => {
  it('weigert zonder token', async () => {
    const res = await post({ kind: 'message', recipientId: 'sporterA' }, { token: '' });
    expect(res.statusCode).toBe(401);
  });

  it('weigert een onbekend soort melding', async () => {
    const res = await post({ kind: 'van-alles', recipientId: 'sporterA' });
    expect(res.statusCode).toBe(400);
    expect(sentPayloads).toHaveLength(0);
  });

  it('trainer meldt aan zijn eigen sporter', async () => {
    const res = await post({ kind: 'message', recipientId: 'sporterA' }, { uid: 'trainerA' });
    expect(res.statusCode).toBe(200);
    expect(res.body.sent).toBe(1);
    expect(sentPayloads[0].notification.title).toBe('Bericht van Simone');
  });

  it('trainer meldt NIET aan de sporter van een ander', async () => {
    const res = await post({ kind: 'message', recipientId: 'vreemdeA' }, { uid: 'trainerA' });
    expect(res.statusCode).toBe(403);
    expect(sentPayloads).toHaveLength(0);
  });

  it('sporter meldt alleen aan de eigen trainer', async () => {
    const ok = await post({ kind: 'checkin', recipientId: 'trainerA' }, { uid: 'sporterA' });
    expect(ok.statusCode).toBe(200);

    const nietOk = await post({ kind: 'message', recipientId: 'vreemdeA' }, { uid: 'sporterA' });
    expect(nietOk.statusCode).toBe(403);
  });

  it('meldt nooit over de studiogrens heen', async () => {
    const res = await post({ kind: 'message', recipientId: 'sporterB' }, { uid: 'adminA' });
    expect(res.statusCode).toBe(403);
    expect(sentPayloads).toHaveLength(0);
  });

  it('een beheerder mag iedereen in de eigen studio melden', async () => {
    const res = await post({ kind: 'message', recipientId: 'vreemdeA' }, { uid: 'adminA' });
    expect(res.statusCode).toBe(200);
  });

  it('profielen zonder orgId horen bij de standaardstudio', async () => {
    const res = await post({ kind: 'message', recipientId: 'legacy' }, { uid: 'trainerA' });
    expect(res.statusCode).toBe(200);
  });

  it('de afzender bepaalt de titel niet, alleen een korte voorvertoning', async () => {
    await post(
      { kind: 'message', recipientId: 'sporterA', preview: 'x'.repeat(500), title: 'Van je bank' },
      { uid: 'trainerA' }
    );
    const notification = sentPayloads[0].notification;
    // De titel komt uit onze eigen lijst, niet uit de aanvraag.
    expect(notification.title).toBe('Bericht van Simone');
    expect(notification.body.length).toBeLessThanOrEqual(120);
  });

  it('haalt regeleindes uit de voorvertoning', async () => {
    await post({ kind: 'message', recipientId: 'sporterA', preview: 'regel een\n\nregel twee' }, { uid: 'trainerA' });
    expect(sentPayloads[0].notification.body).toBe('regel een regel twee');
  });
});
