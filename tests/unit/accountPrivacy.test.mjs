/**
 * Het eigen account verwijderen en toestemming voor gezondheidsgegevens intrekken
 * (api/admin-account.mjs, acties 'delete-self' en 'withdraw-health-consent').
 *
 * Waarom dit getest wordt: Apple en Google eisen dat een gebruiker zijn account in de app kan
 * verwijderen, en de AVG eist dat er dan echt niets van hem achterblijft behalve wat de studio
 * wettelijk moet bewaren. Een boeking die blijft staan houdt ook een plek in de les bezet.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';

let store = {};
let currentUid = 'bas';
let deletedAuthUsers = [];

function matches(data, field, op, value) {
  if (op === '==') return data[field] === value;
  if (op === 'array-contains') return Array.isArray(data[field]) && data[field].includes(value);
  throw new Error(`operator ${op} niet ondersteund in de test`);
}

function docRef(col, id) {
  const key = `${col}/${id}`;
  return {
    id,
    key,
    get: async () => ({ id, exists: key in store, data: () => store[key] }),
    update: async (data) => {
      if (!(key in store)) throw new Error('bestaat niet');
      store[key] = { ...store[key], ...data };
    },
    set: async (data, opts) => {
      store[key] = opts?.merge ? { ...(store[key] ?? {}), ...data } : data;
    },
    delete: async () => {
      delete store[key];
    },
  };
}

function query(col, filters = [], max = Infinity) {
  return {
    where: (f, op, v) => query(col, [...filters, [f, op, v]], max),
    limit: (n) => query(col, filters, n),
    select: () => query(col, filters, max),
    get: async () => {
      const docs = Object.keys(store)
        .filter((k) => k.startsWith(`${col}/`))
        .map((k) => ({ id: k.slice(col.length + 1), data: () => store[k], ref: docRef(col, k.slice(col.length + 1)) }))
        .filter((d) => filters.every(([f, op, v]) => matches(d.data(), f, op, v)))
        .slice(0, max);
      return { docs, empty: docs.length === 0, size: docs.length };
    },
  };
}

const db = {
  collection: (col) => ({ ...query(col), doc: (id) => docRef(col, id) }),
  runTransaction: async (fn) => fn({ get: (ref) => ref.get(), set: (ref, data) => ref.set(data) }),
  batch: () => {
    const ops = [];
    return {
      delete: (ref) => ops.push(() => ref.delete()),
      set: (ref, data, opts) => ops.push(() => ref.set(data, opts)),
      commit: async () => {
        for (const op of ops) await op();
      },
    };
  },
};

vi.mock('../../api/_lib/firebaseAdmin.mjs', () => ({
  getAdmin: () => ({
    auth: {
      verifyIdToken: async () => ({ uid: currentUid }),
      deleteUser: async (uid) => {
        deletedAuthUsers.push(uid);
      },
      getUser: async (uid) => ({ uid, email: `${uid}@example.com`, metadata: { creationTime: 'Mon, 01 Jan 2024 00:00:00 GMT' } }),
    },
    db,
  }),
}));

const { default: handler } = await import('../../api/admin-account.mjs');
const { amsterdamDate } = await import('../../api/_lib/classReminders.mjs');

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
      this.body = JSON.parse(payload);
    },
  };
}

async function call(action, uid = 'bas') {
  currentUid = uid;
  const res = makeRes();
  await handler({ method: 'POST', headers: { authorization: 'Bearer x' }, body: { action } }, res);
  return res;
}

const tomorrow = amsterdamDate(new Date(), 1);
const lastWeek = amsterdamDate(new Date(), -7);

beforeEach(() => {
  deletedAuthUsers = [];
  store = {
    'profiles/bas': { role: 'sporter', orgId: 'vanas', restingHrBpm: 58, limitations: [{ area: 'knee' }] },
    'profiles/kenny': { role: 'admin', orgId: 'vanas' },
    'orgs/vanas': { ownerId: 'kenny', name: 'Van As' },
    'logs/l1': { userId: 'bas' },
    'measurements/m1': { userId: 'bas', weightKg: 80 },
    'measurements/m2': { userId: 'iris', weightKg: 60 },
    'pushTokens/t1': { userId: 'bas' },
    'calendarFeedTokens/c1': { userId: 'bas' },
    'mcpKeys/k1': { userId: 'bas' },
    'standingBookings/s1': { userId: 'bas', classTypeId: 'hiit' },
    'messages/msg1': { participants: ['bas', 'kenny'], text: 'hoi' },
    'messages/msg2': { participants: ['iris', 'kenny'], text: 'hallo' },
    'classes/future': { date: tomorrow, bookedCount: 5, waitlistCount: 1 },
    'classes/past': { date: lastWeek, bookedCount: 4, waitlistCount: 0 },
    'bookings/b1': { userId: 'bas', classId: 'future', status: 'booked' },
    'bookings/b2': { userId: 'bas', classId: 'past', status: 'booked' },
    'charges/ch1': { userId: 'bas', amount: 45 },
    'leaderboardPublic/bas': { displayLabel: 'Bas' },
  };
});

describe('eigen account verwijderen', () => {
  it('ruimt alles op wat aan de persoon hangt, en laat de administratie van de studio staan', async () => {
    const res = await call('delete-self');
    expect(res.statusCode).toBe(200);
    expect(deletedAuthUsers).toEqual(['bas']);
    for (const key of [
      'profiles/bas',
      'logs/l1',
      'measurements/m1',
      'pushTokens/t1',
      'calendarFeedTokens/c1',
      'mcpKeys/k1',
      'standingBookings/s1',
      'messages/msg1',
      'leaderboardPublic/bas',
    ]) {
      expect(store[key], key).toBeUndefined();
    }
    // Van een ander blijft alles staan.
    expect(store['measurements/m2']).toBeDefined();
    expect(store['messages/msg2']).toBeDefined();
    // Facturen/betalingen blijven voor de administratie van de studio.
    expect(store['charges/ch1']).toBeDefined();
  });

  it('meldt komende lessen af en geeft de plek vrij; lessen uit het verleden blijven zoals ze waren', async () => {
    await call('delete-self');
    expect(store['bookings/b1'].status).toBe('cancelled');
    expect(store['classes/future'].bookedCount).toBe(4);
    expect(store['bookings/b2'].status).toBe('booked');
    expect(store['classes/past'].bookedCount).toBe(4);
  });

  it('de eigenaar van een studio kan zijn account niet zomaar verwijderen', async () => {
    const res = await call('delete-self', 'kenny');
    expect(res.statusCode).toBe(409);
    expect(res.body.error).toMatch(/eigenaar/);
    expect(deletedAuthUsers).toEqual([]);
    expect(store['profiles/kenny']).toBeDefined();
  });
});

describe('toestemming voor gezondheidsgegevens intrekken', () => {
  it('verwijdert metingen, rusthartslag en blessures, en legt de keuze vast', async () => {
    const res = await call('withdraw-health-consent');
    expect(res.statusCode).toBe(200);
    expect(res.body.measurementsRemoved).toBe(1);
    expect(store['measurements/m1']).toBeUndefined();
    expect(store['measurements/m2']).toBeDefined();
    expect(store['profiles/bas'].restingHrBpm).toBeNull();
    expect(store['profiles/bas'].limitations).toEqual([]);
    expect(store['profiles/bas'].healthConsent).toMatchObject({ given: false, version: 2 });
    // Trainingen en het account zelf blijven.
    expect(store['logs/l1']).toBeDefined();
    expect(deletedAuthUsers).toEqual([]);
  });
});

describe('mijn gegevens downloaden', () => {
  it('geeft alles van de persoon zelf, en niets van een ander of geheime sleutels', async () => {
    store['workouts/w1'] = { clientId: 'bas', name: 'Kracht' };
    store['workouts/w2'] = { clientId: 'iris', name: 'Van Iris' };
    const res = await call('export-self');
    expect(res.statusCode).toBe(200);
    const data = res.body.data;
    expect(data.account.email).toBe('bas@example.com');
    expect(data.profile.restingHrBpm).toBe(58);
    expect(data.measurements.map((m) => m.id)).toEqual(['m1']);
    expect(data.logs).toHaveLength(1);
    expect(data.bookings).toHaveLength(2);
    expect(data.charges).toHaveLength(1);
    expect(data.workouts.map((w) => w.id)).toEqual(['w1']);
    expect(data.messages.map((m) => m.id)).toEqual(['msg1']);
    // Geheime koppelsleutels en pushtokens horen niet in de export.
    expect(data.pushTokens).toBeUndefined();
    expect(data.mcpKeys).toBeUndefined();
    expect(data.calendarFeedTokens).toBeUndefined();
    // Downloaden verandert niets.
    expect(store['profiles/bas']).toBeDefined();
    expect(deletedAuthUsers).toEqual([]);
  });
});

describe('versie van de toestemmingstekst', () => {
  it('is in de app en op de server gelijk, anders vraagt de app na intrekken meteen opnieuw', () => {
    const version = (file) => Number(/HEALTH_CONSENT_VERSION = (\d+);/.exec(readFileSync(new URL(file, import.meta.url), 'utf8'))?.[1]);
    expect(version('../../src/services/privacyService.ts')).toBe(version('../../api/admin-account.mjs'));
  });
});

describe('ranglijst uit', () => {
  it('app en server zijn het eens of de ranglijst aan staat', () => {
    const flag = (file) => /LEADERBOARD_ENABLED = (true|false);/.exec(readFileSync(new URL(file, import.meta.url), 'utf8'))?.[1];
    expect(flag('../../src/config/features.ts')).toBe(flag('../../api/_lib/leaderboardCleanup.mjs'));
  });
});
