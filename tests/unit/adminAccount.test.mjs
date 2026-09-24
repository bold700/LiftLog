/**
 * Het accountbeheer-endpoint (api/admin-account.mjs), actie 'updateCredentials'.
 *
 * Dit is een route die zonder het wachtwoord van de sporter zelf diens inloggegevens (e-mail/
 * wachtwoord) wijzigt — nodig voor "Bekijk als" op Profiel, waar een trainer het profiel van een
 * sporter volledig beheert alsof hij zelf als die sporter is ingelogd. Zonder strakke grenzen is dit
 * een manier om willekeurige accounts over te nemen, dus hier staat vooral: wie mag wiens
 * inloggegevens wijzigen.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const profiles = {
  trainerA: { orgId: 'vanas', orgIds: ['vanas'], role: 'trainer', displayName: 'Simone' },
  adminA: { orgId: 'vanas', orgIds: ['vanas'], role: 'admin', displayName: 'Kenny' },
  sporterA: { orgId: 'vanas', orgIds: ['vanas'], role: 'sporter', displayName: 'Bas', email: 'bas@example.com' },
  sporterB: { orgId: 'studiob', orgIds: ['studiob'], role: 'sporter', displayName: 'Iris', email: 'iris@example.com' },
  collegaA: { orgId: 'vanas', orgIds: ['vanas'], role: 'trainer', displayName: 'Rick' },
};

let currentUid = 'trainerA';
let updatedUsers = [];
let updateUserError = null;
let profileUpdates = [];

vi.mock('../../api/_lib/firebaseAdmin.mjs', () => ({
  getAdmin: () => ({
    auth: {
      verifyIdToken: async () => ({ uid: currentUid }),
      updateUser: async (uid, update) => {
        if (updateUserError) throw updateUserError;
        updatedUsers.push({ uid, update });
      },
      deleteUser: async () => {},
    },
    db: {
      collection: () => ({
        doc: (id) => ({
          id,
          get: async () => ({ exists: profiles[id] !== undefined, data: () => profiles[id] }),
          update: async (data) => {
            profileUpdates.push({ id, data });
            if (profiles[id]) Object.assign(profiles[id], data);
          },
          delete: async () => {},
        }),
        where: () => ({ get: async () => ({ docs: [] }) }),
        select: () => ({ get: async () => ({ docs: [] }) }),
        get: async () => ({ docs: [] }),
      }),
    },
  }),
}));

const { default: handler } = await import('../../api/admin-account.mjs');

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
  updatedUsers = [];
  updateUserError = null;
  profileUpdates = [];
  profiles.sporterA.email = 'bas@example.com';
});

describe('inloggegevens van een sporter wijzigen (updateCredentials)', () => {
  it('weigert zonder token', async () => {
    const res = await post({ action: 'updateCredentials', targetUid: 'sporterA', password: 'nieuwPw1' }, { token: '' });
    expect(res.statusCode).toBe(401);
  });

  it('weigert een sporter als afzender', async () => {
    const res = await post({ action: 'updateCredentials', targetUid: 'sporterA', password: 'nieuwPw1' }, { uid: 'sporterA' });
    expect(res.statusCode).toBe(403);
    expect(updatedUsers).toHaveLength(0);
  });

  it('weigert de eigen inloggegevens via deze route', async () => {
    const res = await post({ action: 'updateCredentials', targetUid: 'trainerA', password: 'nieuwPw1' }, { uid: 'trainerA' });
    expect(res.statusCode).toBe(400);
  });

  it('weigert een sporter uit een andere studio', async () => {
    const res = await post({ action: 'updateCredentials', targetUid: 'sporterB', password: 'nieuwPw1' }, { uid: 'trainerA' });
    expect(res.statusCode).toBe(403);
    expect(updatedUsers).toHaveLength(0);
  });

  it('weigert een collega-trainer als doelwit', async () => {
    const res = await post({ action: 'updateCredentials', targetUid: 'collegaA', password: 'nieuwPw1' }, { uid: 'trainerA' });
    expect(res.statusCode).toBe(404);
  });

  it('weigert een te kort wachtwoord', async () => {
    const res = await post({ action: 'updateCredentials', targetUid: 'sporterA', password: 'kort' }, { uid: 'trainerA' });
    expect(res.statusCode).toBe(400);
    expect(updatedUsers).toHaveLength(0);
  });

  it('weigert een ongeldig e-mailadres', async () => {
    const res = await post({ action: 'updateCredentials', targetUid: 'sporterA', email: 'niet-geldig' }, { uid: 'trainerA' });
    expect(res.statusCode).toBe(400);
    expect(updatedUsers).toHaveLength(0);
  });

  it('weigert als er niets is om te wijzigen', async () => {
    const res = await post({ action: 'updateCredentials', targetUid: 'sporterA' }, { uid: 'trainerA' });
    expect(res.statusCode).toBe(400);
  });

  it('een trainer wijzigt het wachtwoord van een sporter in de eigen studio', async () => {
    const res = await post({ action: 'updateCredentials', targetUid: 'sporterA', password: 'nieuwPw1' }, { uid: 'trainerA' });
    expect(res.statusCode).toBe(200);
    expect(updatedUsers).toEqual([{ uid: 'sporterA', update: { password: 'nieuwPw1' } }]);
  });

  it('een beheerder wijzigt e-mail én wachtwoord in één keer, en het profiel volgt', async () => {
    const res = await post(
      { action: 'updateCredentials', targetUid: 'sporterA', email: 'nieuw@example.com', password: 'nieuwPw1' },
      { uid: 'adminA' }
    );
    expect(res.statusCode).toBe(200);
    expect(updatedUsers).toEqual([{ uid: 'sporterA', update: { email: 'nieuw@example.com', password: 'nieuwPw1' } }]);
    expect(profileUpdates).toContainEqual({ id: 'sporterA', data: { email: 'nieuw@example.com' } });
    expect(profiles.sporterA.email).toBe('nieuw@example.com');
  });

  it('meldt een al bestaand e-mailadres netjes', async () => {
    updateUserError = Object.assign(new Error('exists'), { code: 'auth/email-already-exists' });
    const res = await post({ action: 'updateCredentials', targetUid: 'sporterA', email: 'bezet@example.com' }, { uid: 'trainerA' });
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/al bij een ander account in gebruik/);
  });
});
