/**
 * Reserveren met credits (api/booking.mjs).
 *
 * Dit is de plek waar geld en plekken samenkomen, en waar een fout direct pijn doet: een sporter
 * die reserveert zonder saldo, twee mensen op dezelfde laatste plek, of een credit die kwijtraakt
 * bij afmelden. Daarom draait deze test de hele transactie af op een nagebootste Firestore.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

/** Bevat na elke test de volledige inhoud van de nagebootste database. */
let store;

/** Nabootsing van de Admin SDK: documenten, queries met gelijkheidsfilters, en transacties. */
function makeDb() {
  const data = new Map(Object.entries(store));

  const increments = [];
  const isIncrement = (v) => v && typeof v === 'object' && v.__increment !== undefined;

  const applyValue = (existing, value) => {
    const out = { ...(existing ?? {}) };
    for (const [k, v] of Object.entries(value)) {
      if (isIncrement(v)) out[k] = (Number(out[k]) || 0) + v.__increment;
      else if (v && typeof v === 'object' && v.__serverTimestamp) out[k] = '2026-09-07T00:00:00.000Z';
      else out[k] = v;
    }
    return out;
  };

  function makeQuery(name, filters) {
    return {
      __isQuery: true,
      where: (field, _op, value) => makeQuery(name, [...filters, [field, value]]),
      get: async () => {
        const docs = [...data.entries()]
          .filter(([path]) => path.startsWith(`${name}/`))
          .map(([path, v]) => ({ id: path.slice(name.length + 1), ref: { __path: path }, data: () => v }))
          .filter((d) => filters.every(([f, val]) => d.data()[f] === val));
        return { docs, empty: docs.length === 0 };
      },
    };
  }

  const collection = (name) => ({
    ...makeQuery(name, []),
    doc: (id) => ({
      __path: `${name}/${id}`,
      get: async () => {
        const v = data.get(`${name}/${id}`);
        return { exists: v !== undefined, id, data: () => v };
      },
      set: async (value, opts) => {
        const path = `${name}/${id}`;
        data.set(path, opts?.merge ? applyValue(data.get(path), value) : applyValue(null, value));
      },
      delete: async () => data.delete(`${name}/${id}`),
    }),
  });

  return {
    _data: data,
    _increments: increments,
    collection,
    /** Eén poging, geen herhaling: genoeg om de logica te testen. */
    runTransaction: async (fn) => {
      const tx = {
        get: async (refOrQuery) => {
          if (refOrQuery.__isQuery) return refOrQuery.get();
          const v = data.get(refOrQuery.__path);
          return { exists: v !== undefined, data: () => v };
        },
        set: (ref, value, opts) => {
          const path = ref.__path;
          data.set(path, opts?.merge ? applyValue(data.get(path), value) : applyValue(null, value));
        },
      };
      const result = await fn(tx);
      store = Object.fromEntries(data);
      return result;
    },
  };
}

let currentUid = 'sporter1';

vi.mock('firebase-admin/firestore', () => ({
  FieldValue: {
    increment: (n) => ({ __increment: n }),
    serverTimestamp: () => ({ __serverTimestamp: true }),
  },
}));

vi.mock('../../api/_lib/firebaseAdmin.mjs', () => ({
  getAdmin: () => ({
    auth: { verifyIdToken: async () => ({ uid: currentUid }) },
    db: makeDb(),
  }),
}));

const { default: handler } = await import('../../api/booking.mjs');

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

const post = async (body, uid = 'sporter1') => {
  currentUid = uid;
  const res = makeRes();
  await handler({ method: 'POST', headers: { authorization: 'Bearer x' }, body }, res);
  return res;
};

/** Een les morgen, zodat annuleren ruim binnen de termijn valt. */
const morgen = () => new Date(Date.now() + 36 * 3_600_000).toISOString().slice(0, 10);

beforeEach(() => {
  store = {
    'profiles/sporter1': { userId: 'sporter1', orgId: 'vanas', orgIds: ['vanas'], role: 'sporter' },
    'profiles/sporter2': { userId: 'sporter2', orgId: 'vanas', orgIds: ['vanas'], role: 'sporter' },
    'profiles/trainer1': { userId: 'trainer1', orgId: 'vanas', orgIds: ['vanas'], role: 'trainer' },
    'profiles/sporterB': { userId: 'sporterB', orgId: 'studiob', orgIds: ['studiob'], role: 'sporter' },
    'classes/c1': {
      orgId: 'vanas', title: 'Small Group', date: morgen(), startTime: '09:00',
      trainerId: 'trainer1', capacity: 1, creditCost: 1, bookedCount: 0, waitlistCount: 0,
    },
    'creditAccounts/vanas__sporter1': { orgId: 'vanas', userId: 'sporter1', balance: 3 },
    'creditAccounts/vanas__sporter2': { orgId: 'vanas', userId: 'sporter2', balance: 3 },
  };
});

describe('reserveren', () => {
  it('schrijft een credit af en zet de plek bezet', async () => {
    const res = await post({ action: 'book', classId: 'c1' });
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('booked');
    expect(res.body.balance).toBe(2);
    expect(store['creditAccounts/vanas__sporter1'].balance).toBe(2);
    expect(store['classes/c1'].bookedCount).toBe(1);
  });

  it('legt elke afschrijving vast in het grootboek', async () => {
    await post({ action: 'book', classId: 'c1' });
    const ledger = Object.entries(store).filter(([k]) => k.startsWith('creditLedger/'));
    expect(ledger).toHaveLength(1);
    expect(ledger[0][1]).toMatchObject({ userId: 'sporter1', delta: -1, reason: 'booking' });
  });

  it('zet de tweede persoon op de wachtlijst, zonder credit af te schrijven', async () => {
    await post({ action: 'book', classId: 'c1' }, 'sporter1');
    const res = await post({ action: 'book', classId: 'c1' }, 'sporter2');

    expect(res.body.status).toBe('waitlist');
    expect(store['creditAccounts/vanas__sporter2'].balance).toBe(3);
    expect(store['classes/c1'].bookedCount).toBe(1);
    expect(store['classes/c1'].waitlistCount).toBe(1);
  });

  it('weigert reserveren zonder saldo', async () => {
    store['creditAccounts/vanas__sporter1'].balance = 0;
    const res = await post({ action: 'book', classId: 'c1' });

    expect(res.statusCode).toBe(409);
    expect(res.body.error).toMatch(/geen credits/i);
    expect(store['classes/c1'].bookedCount).toBe(0);
  });

  it('weigert twee keer inschrijven voor dezelfde les', async () => {
    await post({ action: 'book', classId: 'c1' });
    const res = await post({ action: 'book', classId: 'c1' });

    expect(res.statusCode).toBe(409);
    expect(res.body.error).toMatch(/al ingeschreven/i);
    expect(store['creditAccounts/vanas__sporter1'].balance).toBe(2);
  });

  it('weigert een les van een andere studio', async () => {
    const res = await post({ action: 'book', classId: 'c1' }, 'sporterB');
    expect(res.statusCode).toBe(409);
    expect(res.body.error).toMatch(/jouw studio/i);
  });

  it('weigert een les die al geweest is', async () => {
    store['classes/c1'].date = '2020-01-01';
    const res = await post({ action: 'book', classId: 'c1' });
    expect(res.statusCode).toBe(409);
    expect(res.body.error).toMatch(/al geweest/i);
  });

  it('weigert een afgelaste les', async () => {
    store['classes/c1'].cancelledAt = '2026-09-06T10:00:00.000Z';
    const res = await post({ action: 'book', classId: 'c1' });
    expect(res.statusCode).toBe(409);
    expect(res.body.error).toMatch(/afgelast/i);
  });
});

describe('afmelden', () => {
  it('geeft de credit terug als het ruim op tijd is', async () => {
    const booked = await post({ action: 'book', classId: 'c1' });
    const res = await post({ action: 'cancel', bookingId: booked.body.bookingId });

    expect(res.body.refunded).toBe(true);
    expect(store['creditAccounts/vanas__sporter1'].balance).toBe(3);
    expect(store['classes/c1'].bookedCount).toBe(0);
  });

  it('houdt de credit in als het te laat is', async () => {
    // Les over twee uur: binnen de annuleertermijn van twaalf uur.
    const straks = new Date(Date.now() + 2 * 3_600_000);
    store['classes/c1'].date = straks.toISOString().slice(0, 10);
    store['classes/c1'].startTime = straks.toTimeString().slice(0, 5);

    const booked = await post({ action: 'book', classId: 'c1' });
    const res = await post({ action: 'cancel', bookingId: booked.body.bookingId });

    expect(res.body.refunded).toBe(false);
    expect(store['creditAccounts/vanas__sporter1'].balance).toBe(2);
    // De plek komt wel gewoon vrij.
    expect(store['classes/c1'].bookedCount).toBe(0);
  });

  it('laat de eerste van de wachtlijst doorschuiven en schrijft dan pas zijn credit af', async () => {
    const eerste = await post({ action: 'book', classId: 'c1' }, 'sporter1');
    await post({ action: 'book', classId: 'c1' }, 'sporter2');

    await post({ action: 'cancel', bookingId: eerste.body.bookingId }, 'sporter1');

    const bookings = Object.entries(store).filter(([k]) => k.startsWith('bookings/'));
    const doorgeschoven = bookings.find(([, b]) => b.userId === 'sporter2');
    expect(doorgeschoven[1].status).toBe('booked');
    expect(store['creditAccounts/vanas__sporter2'].balance).toBe(2);
    expect(store['classes/c1'].bookedCount).toBe(1);
    expect(store['classes/c1'].waitlistCount).toBe(0);
  });

  it('laat de plek vrij als de wachtlijst geen saldo heeft', async () => {
    const eerste = await post({ action: 'book', classId: 'c1' }, 'sporter1');
    await post({ action: 'book', classId: 'c1' }, 'sporter2');
    store['creditAccounts/vanas__sporter2'].balance = 0;

    await post({ action: 'cancel', bookingId: eerste.body.bookingId }, 'sporter1');

    expect(store['classes/c1'].bookedCount).toBe(0);
    const bookings = Object.values(store).filter((v) => v.classId === 'c1' && v.userId === 'sporter2');
    expect(bookings[0].status).toBe('waitlist');
  });

  it('laat een sporter niet de reservering van een ander afzeggen', async () => {
    const booked = await post({ action: 'book', classId: 'c1' }, 'sporter1');
    const res = await post({ action: 'cancel', bookingId: booked.body.bookingId }, 'sporter2');

    expect(res.statusCode).toBe(409);
    expect(res.body.error).toMatch(/alleen je eigen/i);
  });

  it('laat een trainer wel voor een sporter afmelden', async () => {
    const booked = await post({ action: 'book', classId: 'c1' }, 'sporter1');
    const res = await post({ action: 'cancel', bookingId: booked.body.bookingId }, 'trainer1');
    expect(res.statusCode).toBe(200);
  });
});

describe('credits toekennen', () => {
  it('een trainer kent credits toe en dat komt in het grootboek', async () => {
    const res = await post({ action: 'grant', userId: 'sporter1', amount: 10, note: 'strippenkaart' }, 'trainer1');

    expect(res.body.balance).toBe(13);
    const ledger = Object.values(store).filter((v) => v.reason === 'manual');
    expect(ledger[0]).toMatchObject({ userId: 'sporter1', delta: 10, byUserId: 'trainer1' });
  });

  it('een sporter kan zichzelf geen credits geven', async () => {
    const res = await post({ action: 'grant', userId: 'sporter1', amount: 10 }, 'sporter1');
    expect(res.statusCode).toBe(403);
    expect(store['creditAccounts/vanas__sporter1'].balance).toBe(3);
  });

  it('kent geen credits toe aan iemand uit een andere studio', async () => {
    const res = await post({ action: 'grant', userId: 'sporterB', amount: 10 }, 'trainer1');
    expect(res.statusCode).toBe(403);
  });

  it('laat het saldo niet onder nul zakken', async () => {
    const res = await post({ action: 'grant', userId: 'sporter1', amount: -10 }, 'trainer1');
    expect(res.statusCode).toBe(409);
    expect(store['creditAccounts/vanas__sporter1'].balance).toBe(3);
  });

  it('weigert onzinnige aantallen', async () => {
    for (const amount of [0, 2.5, 5000, -5000]) {
      const res = await post({ action: 'grant', userId: 'sporter1', amount }, 'trainer1');
      expect(res.statusCode).toBe(400);
    }
    expect(store['creditAccounts/vanas__sporter1'].balance).toBe(3);
  });
});
