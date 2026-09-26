/**
 * Inactieve accounts automatisch verwijderen (api/_lib/accountRetention.mjs).
 *
 * Waarom dit getest wordt: verwijderen is definitief. Een fout hier gooit het account van een lid
 * weg dat gewoon nog traint. Dus: pas na een waarschuwing, nooit bij een lopend abonnement of een
 * komende les, nooit bij trainers of de eigenaar, en alleen als de studio het zelf aanzette.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { retentionDecision, retentionSettings, runAccountRetention, WARNING_DAYS } from '../../api/_lib/accountRetention.mjs';
import { amsterdamDate } from '../../api/_lib/classReminders.mjs';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-09-26T16:00:00Z');
const daysAgo = (n) => new Date(NOW.getTime() - n * DAY).toUTCString();

describe('de instelling van een studio', () => {
  it('staat standaard uit en accepteert alleen een redelijke termijn', () => {
    expect(retentionSettings({})).toBeNull();
    expect(retentionSettings({ accountRetention: { enabled: false, months: 24 } })).toBeNull();
    expect(retentionSettings({ accountRetention: { enabled: true, months: 1 } })).toBeNull();
    expect(retentionSettings({ accountRetention: { enabled: true, months: 500 } })).toBeNull();
    expect(retentionSettings({ accountRetention: { enabled: true, months: 12 } })).toEqual({ months: 12 });
  });
});

describe('wat er met één lid gebeurt', () => {
  const months = 12;
  const nowMs = NOW.getTime();

  it('recent actief: niets', () => {
    expect(retentionDecision({ lastActiveMs: nowMs - 100 * DAY, nowMs, months }).action).toBe('keep');
  });

  it('bijna een jaar weg: waarschuwen, met minstens 30 dagen de tijd', () => {
    const d = retentionDecision({ lastActiveMs: nowMs - 340 * DAY, nowMs, months });
    expect(d.action).toBe('warn');
    expect(Date.parse(d.deleteOn) - nowMs).toBeGreaterThanOrEqual(WARNING_DAYS * DAY - 1);
  });

  it('al jaren weg maar nooit gewaarschuwd: eerst waarschuwen, niet meteen verwijderen', () => {
    const d = retentionDecision({ lastActiveMs: nowMs - 1000 * DAY, nowMs, months });
    expect(d.action).toBe('warn');
    expect(Date.parse(d.deleteOn) - nowMs).toBe(WARNING_DAYS * DAY);
  });

  it('gewaarschuwd, nog geen 30 dagen verder: wachten', () => {
    expect(retentionDecision({ lastActiveMs: nowMs - 1000 * DAY, warnedAtMs: nowMs - 10 * DAY, nowMs, months }).action).toBe('keep');
  });

  it('gewaarschuwd en 30 dagen later nog steeds weg: verwijderen', () => {
    expect(retentionDecision({ lastActiveMs: nowMs - 1000 * DAY, warnedAtMs: nowMs - 31 * DAY, nowMs, months }).action).toBe('delete');
  });

  it('na de waarschuwing ingelogd: waarschuwing vervalt', () => {
    expect(retentionDecision({ lastActiveMs: nowMs - 2 * DAY, warnedAtMs: nowMs - 20 * DAY, nowMs, months }).action).toBe('reset');
  });

  it('een oude waarschuwing (instelling stond een tijd uit): opnieuw waarschuwen, niet verwijderen', () => {
    expect(retentionDecision({ lastActiveMs: nowMs - 1000 * DAY, warnedAtMs: nowMs - 200 * DAY, nowMs, months }).action).toBe('warn');
  });
});

// --- De dagelijkse ronde met een database in het geheugen ------------------------------------

let store;
let authUsers;
let deletedAuth;
let notified;

function docRef(col, id) {
  const key = `${col}/${id}`;
  return {
    id,
    get: async () => ({ id, exists: key in store, data: () => store[key] }),
    update: async (data) => {
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
    get: async () => {
      const docs = Object.keys(store)
        .filter((k) => k.startsWith(`${col}/`))
        .map((k) => {
          const id = k.slice(col.length + 1);
          return { id, data: () => store[k], ref: docRef(col, id) };
        })
        .filter((d) =>
          filters.every(([f, op, v]) => (op === '==' ? d.data()[f] === v : Array.isArray(d.data()[f]) && d.data()[f].includes(v)))
        )
        .slice(0, max);
      return { docs, empty: docs.length === 0, size: docs.length };
    },
  };
}

const db = {
  collection: (col) => ({ ...query(col), doc: (id) => docRef(col, id) }),
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

const auth = {
  getUsers: async (ids) => ({ users: ids.map(({ uid }) => authUsers[uid]).filter(Boolean) }),
  deleteUser: async (uid) => {
    deletedAuth.push(uid);
    delete authUsers[uid];
  },
};

const user = (uid, lastDaysAgo) => ({ uid, email: `${uid}@example.com`, metadata: { lastSignInTime: daysAgo(lastDaysAgo), creationTime: daysAgo(2000) } });

const run = () =>
  runAccountRetention({
    db,
    auth,
    now: NOW,
    notify: async (uid, msg) => {
      notified.push({ uid, ...msg });
    },
  });

beforeEach(() => {
  deletedAuth = [];
  notified = [];
  store = {
    'orgs/vanas': { name: 'Van As', ownerId: 'eigenaar', accountRetention: { enabled: true, months: 12 } },
    'orgs/studiob': { name: 'Studio B', ownerId: 'eigenaarB' },
    'profiles/actief': { role: 'sporter', orgId: 'vanas' },
    'profiles/weg': { role: 'sporter', orgId: 'vanas' },
    'profiles/gewaarschuwd': { role: 'sporter', orgId: 'vanas', retentionWarning: { warnedAt: new Date(NOW.getTime() - 31 * DAY).toISOString() } },
    'profiles/abonnee': { role: 'sporter', orgId: 'vanas', retentionWarning: { warnedAt: new Date(NOW.getTime() - 31 * DAY).toISOString() } },
    'profiles/geboekt': { role: 'sporter', orgId: 'vanas', retentionWarning: { warnedAt: new Date(NOW.getTime() - 31 * DAY).toISOString() } },
    'profiles/trainer': { role: 'trainer', orgId: 'vanas' },
    'profiles/eigenaar': { role: 'sporter', orgId: 'vanas' },
    'profiles/tweestudios': { role: 'sporter', orgId: 'vanas', orgIds: ['vanas', 'studiob'] },
    'profiles/studioB': { role: 'sporter', orgId: 'studiob' },
    'logs/l1': { userId: 'gewaarschuwd' },
    'charges/c1': { userId: 'gewaarschuwd', amount: 45 },
    'memberships/m1': { userId: 'abonnee', status: 'active' },
    'classes/morgen': { date: amsterdamDate(NOW, 1), bookedCount: 3 },
    'bookings/b1': { userId: 'geboekt', classId: 'morgen', status: 'booked' },
  };
  authUsers = {
    actief: user('actief', 5),
    weg: user('weg', 400),
    gewaarschuwd: user('gewaarschuwd', 400),
    abonnee: user('abonnee', 400),
    geboekt: user('geboekt', 400),
    trainer: user('trainer', 900),
    eigenaar: user('eigenaar', 900),
    tweestudios: user('tweestudios', 900),
    studioB: user('studioB', 900),
  };
});

describe('de dagelijkse ronde', () => {
  it('doet niets bij een studio die het niet aanzette', async () => {
    store['orgs/vanas'].accountRetention = { enabled: false, months: 12 };
    const report = await run();
    expect(report.studios).toBe(0);
    expect(deletedAuth).toEqual([]);
    expect(notified).toEqual([]);
  });

  it('waarschuwt wie lang weg is, en verwijdert wie na de waarschuwing niet terugkwam', async () => {
    const report = await run();
    expect(notified.map((n) => n.uid)).toEqual(['weg']);
    expect(notified[0].body).toMatch(/Van As/);
    expect(store['profiles/weg'].retentionWarning.warnedAt).toBe(NOW.toISOString());

    expect(deletedAuth).toEqual(['gewaarschuwd']);
    expect(store['profiles/gewaarschuwd']).toBeUndefined();
    expect(store['logs/l1']).toBeUndefined();
    // Facturen blijven voor de administratie van de studio.
    expect(store['charges/c1']).toBeDefined();
    expect(report).toMatchObject({ warned: 1, deleted: 1 });
  });

  it('laat staan: actieve leden, abonnees, wie een les heeft geboekt, trainers, de eigenaar, leden van twee studio\'s', async () => {
    await run();
    for (const uid of ['actief', 'abonnee', 'geboekt', 'trainer', 'eigenaar', 'tweestudios', 'studioB']) {
      expect(store[`profiles/${uid}`], uid).toBeDefined();
      expect(deletedAuth).not.toContain(uid);
    }
    // Een lopend abonnement of een komende les telt als in gebruik: de waarschuwing vervalt.
    expect(store['profiles/abonnee'].retentionWarning).toBeNull();
    expect(store['profiles/geboekt'].retentionWarning).toBeNull();
  });

  it('wie na de waarschuwing inlogde, blijft en de waarschuwing vervalt', async () => {
    authUsers.gewaarschuwd = user('gewaarschuwd', 1);
    await run();
    expect(deletedAuth).not.toContain('gewaarschuwd');
    expect(store['profiles/gewaarschuwd'].retentionWarning).toBeNull();
  });
});
