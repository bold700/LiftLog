/**
 * Eén account, meerdere studio's (api/admin-account.mjs): uitnodigen, accepteren, rol per studio,
 * en de grenzen daaromheen. Een beheerder van de ene studio mag nooit via de andere binnenkomen.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

let store;
let currentUid;
const authUsers = { 'iris@example.com': 'irisB', 'bas@example.com': 'basA' };

function reset() {
  store = {
    profiles: {
      adminA: { orgId: 'vanas', orgIds: ['vanas'], role: 'admin', displayName: 'Kenny' },
      trainerA: { orgId: 'vanas', orgIds: ['vanas'], role: 'trainer', displayName: 'Simone' },
      basA: { orgId: 'vanas', orgIds: ['vanas'], role: 'sporter', displayName: 'Bas' },
      adminB: { orgId: 'studiob', orgIds: ['studiob'], role: 'admin', displayName: 'Bea' },
      irisB: { orgId: 'studiob', orgIds: ['studiob'], role: 'admin', displayName: 'Iris' },
    },
    orgs: { vanas: { name: 'Van As PT' }, studiob: { name: 'Studio B' } },
    orgInvites: {},
    rateLimits: {},
    pushTokens: {},
  };
}

const col = (name) => (store[name] ??= {});
function docRef(name, id) {
  return {
    id,
    _col: name,
    get: async () => ({ exists: col(name)[id] !== undefined, id, data: () => col(name)[id] }),
    set: async (data) => {
      col(name)[id] = { ...data };
    },
    update: async (data) => applyUpdate(name, id, data),
    delete: async () => {
      delete col(name)[id];
    },
  };
}
function applyUpdate(name, id, data) {
  const cur = col(name)[id];
  if (!cur) throw new Error('not found');
  for (const [k, v] of Object.entries(data)) {
    const isDelete = v && typeof v === 'object' && v.__delete;
    if (k.includes('.')) {
      const [a, b] = k.split('.');
      cur[a] = { ...(cur[a] ?? {}) };
      if (isDelete) delete cur[a][b];
      else cur[a][b] = v;
    } else if (isDelete) delete cur[k];
    else cur[k] = v;
  }
}
function query(name, filters = []) {
  return {
    where: (field, _op, value) => query(name, [...filters, [field, value]]),
    get: async () => ({
      docs: Object.entries(col(name))
        .filter(([, d]) => filters.every(([f, v]) => d[f] === v))
        .map(([id, d]) => ({ id, data: () => d })),
      empty: false,
    }),
  };
}

vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { serverTimestamp: () => 'ts', delete: () => ({ __delete: true }) },
}));
vi.mock('../../api/_lib/pushSend.mjs', () => ({ sendPushToUser: async () => 1 }));
vi.mock('../../api/_lib/firebaseAdmin.mjs', () => ({
  getAdmin: () => ({
    auth: {
      verifyIdToken: async () => ({ uid: currentUid }),
      getUserByEmail: async (email) => {
        if (!authUsers[email]) throw Object.assign(new Error('nope'), { code: 'auth/user-not-found' });
        return { uid: authUsers[email] };
      },
      deleteUser: async () => {},
    },
    db: {
      collection: (name) => ({ doc: (id) => docRef(name, id), ...query(name) }),
      runTransaction: async (fn) =>
        fn({
          get: (ref) => ref.get(),
          set: (ref, data) => ref.set(data),
          update: (ref, data) => ref.update(data),
        }),
    },
  }),
}));

const { default: handler } = await import('../../api/admin-account.mjs');

async function post(uid, body) {
  currentUid = uid;
  const res = {
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
  await handler({ method: 'POST', headers: { authorization: 'Bearer x' }, body }, res);
  return res;
}

beforeEach(reset);

describe('uitnodigen bij een tweede studio', () => {
  it('geen account: de app maakt gewoon een nieuw account aan', async () => {
    const res = await post('adminA', { action: 'invite', email: 'nieuw@example.com', role: 'sporter', actingOrgId: 'vanas' });
    expect(res.body).toEqual({ status: 'no-account' });
  });

  it('al lid van deze studio', async () => {
    const res = await post('adminA', { action: 'invite', email: 'bas@example.com', role: 'sporter', actingOrgId: 'vanas' });
    expect(res.body.status).toBe('already-member');
  });

  it('bestaand account elders: uitnodiging, nog geen lid', async () => {
    const res = await post('adminA', { action: 'invite', email: 'Iris@Example.com', role: 'sporter', actingOrgId: 'vanas' });
    expect(res.body.status).toBe('invited');
    expect(store.orgInvites['vanas__irisB']).toMatchObject({ orgId: 'vanas', uid: 'irisB', role: 'sporter', status: 'pending' });
    expect(store.profiles.irisB.orgIds).toEqual(['studiob']);
  });

  it('een trainer mag een sporter uitnodigen, maar geen trainer', async () => {
    expect((await post('trainerA', { action: 'invite', email: 'iris@example.com', role: 'sporter', actingOrgId: 'vanas' })).body.status).toBe('invited');
    expect((await post('trainerA', { action: 'invite', email: 'iris@example.com', role: 'trainer', actingOrgId: 'vanas' })).statusCode).toBe(403);
  });

  it('een sporter mag niemand uitnodigen', async () => {
    expect((await post('basA', { action: 'invite', email: 'iris@example.com', role: 'sporter', actingOrgId: 'vanas' })).statusCode).toBe(403);
  });

  it('accepteren: lid van beide, met een eigen rol per studio', async () => {
    await post('adminA', { action: 'invite', email: 'iris@example.com', role: 'sporter', actingOrgId: 'vanas' });
    expect((await post('irisB', { action: 'myInvites' })).body.invites).toEqual([
      { id: 'vanas__irisB', orgId: 'vanas', orgName: 'Van As PT', role: 'sporter', invitedByName: 'Kenny' },
    ]);
    const res = await post('irisB', { action: 'acceptInvite', inviteId: 'vanas__irisB' });
    expect(res.body).toEqual({ ok: true, orgId: 'vanas' });
    // Beheerder bij B blijft beheerder bij B, en is sporter bij Van As: niet via `role` beheerder daar.
    expect(store.profiles.irisB.orgIds).toEqual(['studiob', 'vanas']);
    expect(store.profiles.irisB.orgRoles).toEqual({ studiob: 'admin', vanas: 'sporter' });
    expect(store.orgInvites['vanas__irisB'].status).toBe('accepted');
  });

  it('weigeren: geen lid', async () => {
    await post('adminA', { action: 'invite', email: 'iris@example.com', role: 'sporter', actingOrgId: 'vanas' });
    await post('irisB', { action: 'declineInvite', inviteId: 'vanas__irisB' });
    expect(store.profiles.irisB.orgIds).toEqual(['studiob']);
    expect(store.orgInvites['vanas__irisB'].status).toBe('declined');
  });

  it('iemand anders kan jouw uitnodiging niet accepteren', async () => {
    await post('adminA', { action: 'invite', email: 'iris@example.com', role: 'admin', actingOrgId: 'vanas' });
    const res = await post('adminB', { action: 'acceptInvite', inviteId: 'vanas__irisB' });
    expect(res.statusCode).toBe(404);
    expect(store.profiles.adminB.orgIds).toEqual(['studiob']);
  });
});

describe('rol per studio (setRole) en uit de studio halen (delete)', () => {
  beforeEach(async () => {
    await post('adminA', { action: 'invite', email: 'iris@example.com', role: 'sporter', actingOrgId: 'vanas' });
    await post('irisB', { action: 'acceptInvite', inviteId: 'vanas__irisB' });
  });

  it('beheerder B handelt als sporter bij Van As: mag daar geen rollen zetten', async () => {
    const res = await post('irisB', { action: 'setRole', targetUid: 'basA', role: 'admin', actingOrgId: 'vanas' });
    expect(res.statusCode).toBe(403);
    expect(store.profiles.basA.role).toBe('sporter');
  });

  it('beheerder Van As maakt Iris trainer bij Van As; bij B blijft ze beheerder', async () => {
    const res = await post('adminA', { action: 'setRole', targetUid: 'irisB', role: 'trainer', actingOrgId: 'vanas' });
    expect(res.statusCode).toBe(200);
    expect(store.profiles.irisB.orgRoles).toEqual({ studiob: 'admin', vanas: 'trainer' });
    expect(store.profiles.irisB.role).toBe('admin');
  });

  it('beheerder van een andere studio komt niet aan een lid', async () => {
    const res = await post('adminB', { action: 'setRole', targetUid: 'basA', role: 'admin', actingOrgId: 'studiob' });
    expect(res.statusCode).toBe(404);
  });

  it('verwijderen van een lid van twee studio\'s: alleen uit deze studio', async () => {
    const res = await post('adminA', { action: 'delete', targetUid: 'irisB', actingOrgId: 'vanas' });
    expect(res.body).toMatchObject({ ok: true, removedFromOrg: 'vanas' });
    expect(store.profiles.irisB.orgIds).toEqual(['studiob']);
    expect(store.profiles.irisB.orgRoles).toEqual({ studiob: 'admin' });
  });

  it('beheerder van een andere studio kan een account niet verwijderen', async () => {
    const res = await post('adminB', { action: 'delete', targetUid: 'basA', actingOrgId: 'studiob' });
    expect(res.statusCode).toBe(404);
    expect(store.profiles.basA).toBeDefined();
  });
});
