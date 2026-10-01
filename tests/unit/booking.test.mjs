/**
 * Reserveren met credits (api/booking.mjs).
 *
 * Dit is de plek waar geld en plekken samenkomen, en waar een fout direct pijn doet: een sporter
 * die reserveert zonder saldo, twee mensen op dezelfde laatste plek, of een credit die kwijtraakt
 * bij afmelden. Daarom draait deze test de hele transactie af op een nagebootste Firestore.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { classIdForOccurrence, occurrencesForSchedule } from '../../api/_lib/classSchedule.mjs';
import { hashFeedToken } from '../../api/_lib/calendarFeed.mjs';
import { amsterdamDate } from '../../api/_lib/classReminders.mjs';

/** Bevat na elke test de volledige inhoud van de nagebootste database. */
let store;

/** Nabootsing van de Admin SDK: documenten, queries met gelijkheidsfilters, en transacties. */
function makeDb() {
  const data = new Map(Object.entries(store));

  const increments = [];
  const isIncrement = (v) => v && typeof v === 'object' && v.__increment !== undefined;
  const isDelete = (v) => v && typeof v === 'object' && v.__delete === true;
  const isServerTimestamp = (v) => v && typeof v === 'object' && v.__serverTimestamp;
  const isPlainObject = (v) => v && typeof v === 'object' && !Array.isArray(v) && !isIncrement(v) && !isDelete(v) && !isServerTimestamp(v);

  /**
   * Zoals echte Firestore: set(..., {merge: true}) vervangt een nested map-veld niet in zijn
   * geheel, maar voegt de opgegeven velden erin samen (net als bij een plat veld). Zonder dit zou
   * bijvoorbeeld een testsleutel opslaan een eerder opgeslagen livesleutel wegvegen.
   */
  const applyValue = (existing, value) => {
    const out = { ...(existing ?? {}) };
    for (const [k, v] of Object.entries(value)) {
      if (isIncrement(v)) out[k] = (Number(out[k]) || 0) + v.__increment;
      else if (isDelete(v)) delete out[k];
      else if (isServerTimestamp(v)) out[k] = '2026-09-07T00:00:00.000Z';
      else if (isPlainObject(v)) out[k] = applyValue(out[k], v);
      else out[k] = v;
    }
    return out;
  };

  function makeQuery(name, filters) {
    return {
      __isQuery: true,
      where: (field, op, value) => makeQuery(name, [...filters, [field, op, value]]),
      get: async () => {
        const docs = [...data.entries()]
          .filter(([path]) => path.startsWith(`${name}/`))
          .map(([path, v]) => ({ id: path.slice(name.length + 1), ref: { __path: path }, data: () => v }))
          .filter((d) =>
            filters.every(([f, op, val]) => {
              const v = d.data()[f];
              if (op === 'in') return val.includes(v);
              if (op === 'array-contains') return Array.isArray(v) && v.includes(val);
              if (op === '>=') return v >= val;
              if (op === '<=') return v <= val;
              return v === val;
            })
          );
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
        store = Object.fromEntries(data);
      },
      delete: async () => {
        data.delete(`${name}/${id}`);
        store = Object.fromEntries(data);
      },
    }),
  });

  return {
    _data: data,
    _increments: increments,
    collection,
    getAll: async (...refs) =>
      refs.map((ref) => {
        const v = data.get(ref.__path);
        return { exists: v !== undefined, id: ref.__path.slice(ref.__path.lastIndexOf('/') + 1), data: () => v };
      }),
    batch: () => {
      const ops = [];
      return {
        set: (ref, value, opts) => ops.push(['set', ref, value, opts]),
        update: (ref, value) => ops.push(['update', ref, value]),
        delete: (ref) => ops.push(['delete', ref]),
        commit: async () => {
          for (const [kind, ref, value, opts] of ops) {
            if (kind === 'delete') data.delete(ref.__path);
            else if (kind === 'update' || opts?.merge) data.set(ref.__path, applyValue(data.get(ref.__path), value));
            else data.set(ref.__path, applyValue(null, value));
          }
          store = Object.fromEntries(data);
        },
      };
    },
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
    delete: () => ({ __delete: true }),
  },
}));

/** Verstuurde pushmeldingen (lesherinneringen), per aanroep van sendEachForMulticast. */
let sentPushes = [];
vi.mock('firebase-admin/messaging', () => ({
  getMessaging: () => ({
    sendEachForMulticast: async (payload) => {
      sentPushes.push(payload);
      return { successCount: payload.tokens.length, responses: payload.tokens.map(() => ({ success: true })) };
    },
  }),
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

/** Voor niet-JSON GET-antwoorden (kalenderfeed, factuur): ruwe tekst i.p.v. JSON.parse. */
function makeRawRes() {
  return {
    statusCode: 0,
    headers: {},
    body: null,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    end(payload) {
      this.body = payload;
    },
  };
}

const getFeed = async (token) => {
  const res = makeRawRes();
  await handler({ method: 'GET', headers: {}, query: { feed: token } }, res);
  return res;
};

/** Een les morgen, zodat annuleren ruim binnen de termijn valt. */
const morgen = () => new Date(Date.now() + 36 * 3_600_000).toISOString().slice(0, 10);
/** Datum en begintijd zoals een les ze opslaat: Nederlandse tijd, waar de tests ook draaien. */
const amsterdamWallClock = (d) => {
  const [date, time] = d.toLocaleString('sv-SE', { timeZone: 'Europe/Amsterdam' }).split(' ');
  return { date, startTime: time.slice(0, 5) };
};

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

  it('laat staf altijd gratis reserveren, ook zonder credits', async () => {
    const res = await post({ action: 'book', classId: 'c1' }, 'trainer1');
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('booked');
    expect(store['classes/c1'].bookedCount).toBe(1);
    // Geen creditAccount voor trainer1: geen saldo aangemaakt en geen boeking in het grootboek.
    expect(store['creditAccounts/vanas__trainer1']).toBeUndefined();
    const ledger = Object.entries(store).filter(([k]) => k.startsWith('creditLedger/'));
    expect(ledger).toHaveLength(0);
  });

  it('zet staf op de wachtlijst als de les vol zit, net als een sporter', async () => {
    await post({ action: 'book', classId: 'c1' }, 'sporter1');
    const res = await post({ action: 'book', classId: 'c1' }, 'trainer1');
    expect(res.body.status).toBe('waitlist');
    expect(store['classes/c1'].bookedCount).toBe(1);
    expect(store['classes/c1'].waitlistCount).toBe(1);
  });

  it('laat staf een andere sporter inschrijven; de credit gaat van die sporter af', async () => {
    const res = await post({ action: 'book', classId: 'c1', userId: 'sporter1' }, 'trainer1');
    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('booked');
    expect(store['creditAccounts/vanas__sporter1'].balance).toBe(2);
    const ledger = Object.values(store).filter((v) => v.reason === 'booking');
    expect(ledger[0]).toMatchObject({ userId: 'sporter1', byUserId: 'trainer1', delta: -1 });
  });

  it('weigert een sporter die een andere sporter probeert in te schrijven', async () => {
    const res = await post({ action: 'book', classId: 'c1', userId: 'sporter2' }, 'sporter1');
    expect(res.statusCode).toBe(403);
    expect(store['classes/c1'].bookedCount).toBe(0);
  });

  it('weigert een sporter uit een andere studio toe te voegen', async () => {
    const res = await post({ action: 'book', classId: 'c1', userId: 'sporterB' }, 'trainer1');
    expect(res.statusCode).toBe(403);
  });

  it('weigert zonder saldo, ook als staf de sporter toevoegt', async () => {
    store['creditAccounts/vanas__sporter1'].balance = 0;
    const res = await post({ action: 'book', classId: 'c1', userId: 'sporter1' }, 'trainer1');
    expect(res.statusCode).toBe(409);
    expect(res.body.error).toMatch(/geen credits/i);
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

  /** Boeking die al langer dan de bedenktijd van een uur bestaat. */
  const ageBooking = (bookingId, minutes = 90) => {
    store[`bookings/${bookingId}`].createdAt = new Date(Date.now() - minutes * 60_000).toISOString();
  };

  it('houdt de credit in als het te laat is', async () => {
    // Les over twee uur: binnen de annuleertermijn van twaalf uur.
    Object.assign(store['classes/c1'], amsterdamWallClock(new Date(Date.now() + 2 * 3_600_000)));

    const booked = await post({ action: 'book', classId: 'c1' });
    ageBooking(booked.body.bookingId);
    const res = await post({ action: 'cancel', bookingId: booked.body.bookingId });

    expect(res.body.refunded).toBe(false);
    expect(store['creditAccounts/vanas__sporter1'].balance).toBe(2);
    // De plek komt wel gewoon vrij.
    expect(store['classes/c1'].bookedCount).toBe(0);
  });

  it('geeft binnen een uur na het boeken altijd de credit terug (bedenktijd), ook als het te laat is', async () => {
    Object.assign(store['classes/c1'], amsterdamWallClock(new Date(Date.now() + 2 * 3_600_000)));
    const booked = await post({ action: 'book', classId: 'c1' });
    ageBooking(booked.body.bookingId, 30);
    const res = await post({ action: 'cancel', bookingId: booked.body.bookingId });
    expect(res.body.refunded).toBe(true);
    expect(store['creditAccounts/vanas__sporter1'].balance).toBe(3);
  });

  const addSporter3 = (balance = 3) => {
    store['profiles/sporter3'] = { userId: 'sporter3', orgId: 'vanas', orgIds: ['vanas'], role: 'sporter' };
    store['creditAccounts/vanas__sporter3'] = { orgId: 'vanas', userId: 'sporter3', balance };
  };
  const bookingOf = (userId) => Object.values(store).find((v) => v.classId === 'c1' && v.userId === userId && v.status);

  it('de eerste van de wachtlijst schuift meteen door en betaalt dan pas zijn credit', async () => {
    const eerste = await post({ action: 'book', classId: 'c1' }, 'sporter1');
    await post({ action: 'book', classId: 'c1' }, 'sporter2');

    const res = await post({ action: 'cancel', bookingId: eerste.body.bookingId }, 'sporter1');

    expect(res.body.promotedUserId).toBe('sporter2');
    expect(bookingOf('sporter2')).toMatchObject({ status: 'booked', creditsSpent: 1 });
    expect(bookingOf('sporter2').promotedAt).toBeTruthy();
    expect(store['creditAccounts/vanas__sporter2'].balance).toBe(2);
    expect(store['classes/c1'].bookedCount).toBe(1);
    expect(store['classes/c1'].waitlistCount).toBe(0);
  });

  it('doorgeschoven maar wil niet: binnen een uur gratis afmelden, dan schuift de volgende door', async () => {
    addSporter3();
    // Les over twee uur: binnen het late venster, dus alleen de bedenktijd maakt het gratis.
    Object.assign(store['classes/c1'], amsterdamWallClock(new Date(Date.now() + 2 * 3_600_000)));
    const eerste = await post({ action: 'book', classId: 'c1' }, 'sporter1');
    const tweede = await post({ action: 'book', classId: 'c1' }, 'sporter2');
    store[`bookings/${tweede.body.bookingId}`].createdAt = '2026-09-01T10:00:00.000Z';
    const derde = await post({ action: 'book', classId: 'c1' }, 'sporter3');
    store[`bookings/${derde.body.bookingId}`].createdAt = '2026-09-01T11:00:00.000Z';

    await post({ action: 'cancel', bookingId: eerste.body.bookingId }, 'sporter1');
    expect(bookingOf('sporter2').status).toBe('booked');

    const res = await post({ action: 'cancel', bookingId: tweede.body.bookingId }, 'sporter2');
    expect(res.body.refunded).toBe(true);
    expect(store['creditAccounts/vanas__sporter2'].balance).toBe(3);
    expect(res.body.promotedUserId).toBe('sporter3');
    expect(bookingOf('sporter3').status).toBe('booked');
    expect(store['creditAccounts/vanas__sporter3'].balance).toBe(2);
    expect(store['classes/c1'].bookedCount).toBe(1);
    expect(store['classes/c1'].waitlistCount).toBe(0);
  });

  /** sporter1 geboekt; sporter2 (eerst) en sporter3 (daarna) op de wachtlijst. */
  const fullWithTwoWaiting = async () => {
    addSporter3();
    const eerste = await post({ action: 'book', classId: 'c1' }, 'sporter1');
    const tweede = await post({ action: 'book', classId: 'c1' }, 'sporter2');
    store[`bookings/${tweede.body.bookingId}`].createdAt = '2026-09-01T10:00:00.000Z';
    const derde = await post({ action: 'book', classId: 'c1' }, 'sporter3');
    store[`bookings/${derde.body.bookingId}`].createdAt = '2026-09-01T11:00:00.000Z';
    return { eerste, tweede, derde };
  };

  it('eerste op de wachtlijst zonder credits: de plek wordt een uur voor die persoon vastgehouden', async () => {
    const { eerste } = await fullWithTwoWaiting();
    store['creditAccounts/vanas__sporter2'].balance = 0;

    const res = await post({ action: 'cancel', bookingId: eerste.body.bookingId }, 'sporter1');
    expect(res.body.promotedUserId).toBeNull();
    expect(store['classes/c1'].holdUserId).toBe('sporter2');
    expect(Date.parse(store['classes/c1'].holdUntil)).toBeGreaterThan(Date.now() + 50 * 60_000);
    expect(store['classes/c1'].bookedCount).toBe(0);
    expect(bookingOf('sporter2').status).toBe('waitlist');
    expect(bookingOf('sporter3').status).toBe('waitlist');

    // De volgende op de wachtlijst kan de plek niet pakken zolang hij vastgehouden wordt.
    const derde = await post({ action: 'book', classId: 'c1' }, 'sporter3');
    expect(derde.statusCode).toBe(409);
    expect(derde.body.error).toMatch(/vastgehouden/i);
  });

  it('wie de plek vastgehouden kreeg, koopt credits en meldt zich aan', async () => {
    const { eerste } = await fullWithTwoWaiting();
    store['creditAccounts/vanas__sporter2'].balance = 0;
    await post({ action: 'cancel', bookingId: eerste.body.bookingId }, 'sporter1');

    store['creditAccounts/vanas__sporter2'].balance = 2;
    const res = await post({ action: 'book', classId: 'c1' }, 'sporter2');
    expect(res.body.status).toBe('booked');
    expect(store['classes/c1'].bookedCount).toBe(1);
    expect(store['classes/c1'].holdUserId).toBeNull();
  });

  it('verloopt de vastgehouden plek, dan schuift de volgende door; de eerste blijft op de wachtlijst', async () => {
    const { eerste } = await fullWithTwoWaiting();
    store['creditAccounts/vanas__sporter2'].balance = 0;
    await post({ action: 'cancel', bookingId: eerste.body.bookingId }, 'sporter1');
    store['classes/c1'].holdUntil = new Date(Date.now() - 60_000).toISOString();

    const res = await post({ action: 'settleWaitlists' }, 'sporter1');
    expect(res.body.settled).toBe(1);
    expect(bookingOf('sporter3').status).toBe('booked');
    expect(store['creditAccounts/vanas__sporter3'].balance).toBe(2);
    expect(bookingOf('sporter2')).toMatchObject({ status: 'waitlist' });
    expect(bookingOf('sporter2').offerExpiredAt).toBeTruthy();
    expect(store['classes/c1'].holdUserId).toBeNull();
    expect(store['classes/c1'].bookedCount).toBe(1);
  });

  it('de trainer kan een vastgehouden plek meteen doorgeven aan de volgende', async () => {
    const { eerste } = await fullWithTwoWaiting();
    store['creditAccounts/vanas__sporter2'].balance = 0;
    await post({ action: 'cancel', bookingId: eerste.body.bookingId }, 'sporter1');

    const weiger = await post({ action: 'releaseHold', classId: 'c1' }, 'sporter3');
    expect(weiger.statusCode).toBe(403);

    const res = await post({ action: 'releaseHold', classId: 'c1' }, 'trainer1');
    expect(res.body.promotedUserId).toBe('sporter3');
    expect(bookingOf('sporter3').status).toBe('booked');
  });

  it('de trainer zet iemand van de wachtlijst er extra bij, ook als de les vol zit', async () => {
    await post({ action: 'book', classId: 'c1' }, 'sporter1');
    await post({ action: 'book', classId: 'c1' }, 'sporter2');

    const weiger = await post({ action: 'book', classId: 'c1', userId: 'sporter2', extra: true }, 'sporter1');
    expect(weiger.statusCode).toBe(403);

    const res = await post({ action: 'book', classId: 'c1', userId: 'sporter2', extra: true }, 'trainer1');
    expect(res.body.status).toBe('booked');
    expect(bookingOf('sporter2')).toMatchObject({ status: 'booked', creditsSpent: 1 });
    expect(store['classes/c1'].bookedCount).toBe(2);
    expect(store['classes/c1'].waitlistCount).toBe(0);
    expect(store['creditAccounts/vanas__sporter2'].balance).toBe(2);
  });

  it('extra erbij zetten gaat ook voor een plek die voor een ander wordt vastgehouden', async () => {
    const { eerste } = await fullWithTwoWaiting();
    store['creditAccounts/vanas__sporter2'].balance = 0;
    await post({ action: 'cancel', bookingId: eerste.body.bookingId }, 'sporter1');

    const res = await post({ action: 'book', classId: 'c1', userId: 'sporter3', extra: true }, 'trainer1');
    expect(res.body.status).toBe('booked');
    // De vastgehouden plek blijft voor de eerste op de wachtlijst.
    expect(store['classes/c1'].holdUserId).toBe('sporter2');
  });

  it('staf op de wachtlijst schuift gratis door', async () => {
    const eerste = await post({ action: 'book', classId: 'c1' }, 'sporter1');
    await post({ action: 'book', classId: 'c1' }, 'trainer1');
    const res = await post({ action: 'cancel', bookingId: eerste.body.bookingId }, 'sporter1');
    expect(res.body.promotedUserId).toBe('trainer1');
    expect(bookingOf('trainer1').creditsSpent).toBe(0);
  });

  it('nog eens "boeken" terwijl je op de wachtlijst staat en de les vol is: nette melding', async () => {
    await post({ action: 'book', classId: 'c1' }, 'sporter1');
    await post({ action: 'book', classId: 'c1' }, 'sporter2');
    const res = await post({ action: 'book', classId: 'c1' }, 'sporter2');
    expect(res.statusCode).toBe(409);
    expect(res.body.error).toMatch(/al op de wachtlijst/i);
  });

  it('geeft je plek op de wachtlijst, niet wie er voor je staat', async () => {
    addSporter3();
    await post({ action: 'book', classId: 'c1' }, 'sporter1');
    const a = await post({ action: 'book', classId: 'c1' }, 'sporter2');
    const b = await post({ action: 'book', classId: 'c1' }, 'sporter3');
    store[`bookings/${a.body.bookingId}`].createdAt = '2026-09-26T10:00:00.000Z';
    store[`bookings/${b.body.bookingId}`].createdAt = '2026-09-26T11:00:00.000Z';

    const res = await post({ action: 'waitlistPositions' }, 'sporter3');
    expect(res.statusCode).toBe(200);
    expect(res.body.positions).toEqual({ c1: 2 });
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

  it('0 uur bij de studio betekent tot de start gratis, niet de standaard 12 uur', async () => {
    store['orgs/vanas'] = { bookingPolicy: { freeCancelHours: 0 } };
    Object.assign(store['classes/c1'], amsterdamWallClock(new Date(Date.now() + 2 * 3_600_000)));
    const booked = await post({ action: 'book', classId: 'c1' });
    ageBooking(booked.body.bookingId);
    const res = await post({ action: 'cancel', bookingId: booked.body.bookingId });
    expect(res.body.refunded).toBe(true);
  });

  it('gebruikt de eigen annuleertermijn van de studio in plaats van de standaard 12 uur', async () => {
    store['orgs/vanas'] = { bookingPolicy: { freeCancelHours: 1 } };
    // Les over twee uur: buiten de eigen termijn van 1 uur, maar wel binnen de standaard 12 uur.
    Object.assign(store['classes/c1'], amsterdamWallClock(new Date(Date.now() + 2 * 3_600_000)));

    const booked = await post({ action: 'book', classId: 'c1' });
    const res = await post({ action: 'cancel', bookingId: booked.body.bookingId });

    expect(res.body.refunded).toBe(true);
  });
});

describe('elke week inschrijven', () => {
  beforeEach(() => {
    store['classes/c1'].classTypeId = 'ct1';
  });

  it('zet een actieve inschrijving klaar zodra je "elke week" aanvinkt', async () => {
    const res = await post({ action: 'book', classId: 'c1', weekly: true });
    expect(res.statusCode).toBe(200);

    const weekday = new Date(`${store['classes/c1'].date}T00:00:00`).getDay();
    const id = `sb_ct1_sporter1_${weekday}_0900`;
    expect(store[`standingBookings/${id}`]).toMatchObject({
      orgId: 'vanas', userId: 'sporter1', classTypeId: 'ct1', weekday, startTime: '09:00',
      active: true, lastOutcome: 'booked',
    });
  });

  it('maakt geen inschrijving aan voor een losse les zonder lessoort', async () => {
    delete store['classes/c1'].classTypeId;
    await post({ action: 'book', classId: 'c1', weekly: true });
    const standing = Object.keys(store).filter((k) => k.startsWith('standingBookings/'));
    expect(standing).toHaveLength(0);
  });

  it('maakt geen inschrijving aan als het vinkje niet aanstond', async () => {
    await post({ action: 'book', classId: 'c1', weekly: false });
    const standing = Object.keys(store).filter((k) => k.startsWith('standingBookings/'));
    expect(standing).toHaveLength(0);
  });

  it('zet een bestaande inschrijving weer aan of uit voor de eigenaar', async () => {
    await post({ action: 'book', classId: 'c1', weekly: true });
    const weekday = new Date(`${store['classes/c1'].date}T00:00:00`).getDay();
    const id = `sb_ct1_sporter1_${weekday}_0900`;

    const off = await post({ action: 'setStandingBooking', standingBookingId: id, active: false });
    expect(off.statusCode).toBe(200);
    expect(store[`standingBookings/${id}`].active).toBe(false);

    const on = await post({ action: 'setStandingBooking', standingBookingId: id, active: true });
    expect(on.statusCode).toBe(200);
    expect(store[`standingBookings/${id}`].active).toBe(true);
  });

  it('laat een ander niet aan iemands inschrijving komen', async () => {
    await post({ action: 'book', classId: 'c1', weekly: true }, 'sporter1');
    const weekday = new Date(`${store['classes/c1'].date}T00:00:00`).getDay();
    const id = `sb_ct1_sporter1_${weekday}_0900`;

    const res = await post({ action: 'setStandingBooking', standingBookingId: id, active: false }, 'sporter2');
    expect(res.statusCode).toBe(403);
    expect(store[`standingBookings/${id}`].active).toBe(true);
  });

  it('geeft 404 voor een inschrijving die niet (meer) bestaat', async () => {
    const res = await post({ action: 'setStandingBooking', standingBookingId: 'sb_onbekend', active: false });
    expect(res.statusCode).toBe(404);
  });
});

describe('credits handmatig aanpassen', () => {
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

describe('facturen', () => {
  const seedPlan = () => {
    store['plans/pl1'] = { orgId: 'vanas', name: 'Maand 8', period: 'month', price: 139, credits: 8, rollover: 'expire', vatRate: 9 };
    store['orgs/vanas'] = { name: 'Van As Personal Training', business: { legalName: 'Van As PT', invoicePrefix: 'VAS-2026-', nextInvoiceNumber: 142 } };
  };

  it('koppelen geeft de eerste post een factuurnummer en schuift de teller door', async () => {
    seedPlan();
    const res = await post({ action: 'assign', userId: 'sporter1', planId: 'pl1' }, 'trainer1');
    expect(res.statusCode).toBe(200);
    const charge = Object.entries(store).find(([k]) => k.startsWith('charges/'))[1];
    expect(charge).toMatchObject({ userId: 'sporter1', amount: 139, vatRate: 9, invoiceNumber: 'VAS-2026-0142', status: 'open' });
    expect(charge.invoiceIssuedAt).toBeTruthy();
    expect(store['orgs/vanas'].business.nextInvoiceNumber).toBe(143);
  });

  it('een lid haalt zijn eigen factuur op, een ander lid niet; een oude post krijgt alsnog een nummer', async () => {
    store['charges/ch1'] = { orgId: 'vanas', userId: 'sporter1', planName: 'Maand 8', description: 'Maand 8 · 2026-09', amount: 139, period: '2026-09', status: 'open', issuedAt: '2026-09-01T00:00:00.000Z', dueAt: '2026-09-01T00:00:00.000Z' };
    const ander = await post({ action: 'invoice', chargeId: 'ch1' }, 'sporter2');
    expect(ander.statusCode).toBe(403);

    const eigen = await post({ action: 'invoice', chargeId: 'ch1' }, 'sporter1');
    expect(eigen.statusCode).toBe(200);
    expect(eigen.body.invoiceNumber).toMatch(/^\d{4}-0001$/);
    expect(eigen.body.fileName).toBe(`Factuur-${eigen.body.invoiceNumber}.pdf`);
    expect(eigen.body.pdfBase64.startsWith('JVBERi')).toBe(true);
    expect(store['charges/ch1']).toMatchObject({ invoiceNumber: eigen.body.invoiceNumber, vatRate: 9 });

    // De staf krijgt dezelfde factuur: het nummer verandert niet meer.
    const staf = await post({ action: 'invoice', chargeId: 'ch1' }, 'trainer1');
    expect(staf.statusCode).toBe(200);
    expect(staf.body.invoiceNumber).toBe(eigen.body.invoiceNumber);
    expect(store['orgs/vanas'].business.nextInvoiceNumber).toBe(2);
  });

  it('weigert een factuur van een andere studio voor staf', async () => {
    store['charges/chB'] = { orgId: 'studiob', userId: 'sporterB', planName: 'B', amount: 50, status: 'open' };
    const res = await post({ action: 'invoice', chargeId: 'chB' }, 'trainer1');
    expect(res.statusCode).toBe(403);
  });
});

describe('factuur per mail', () => {
  const seedCharge = () => {
    store['charges/ch1'] = { orgId: 'vanas', userId: 'sporter1', planName: 'Maand 8', description: 'Maand 8 · 2026-09', amount: 139, period: '2026-09', status: 'open', vatRate: 9, invoiceNumber: 'VAS-2026-0142', invoiceIssuedAt: '2026-09-01T00:00:00.000Z', issuedAt: '2026-09-01T00:00:00.000Z', dueAt: '2026-09-01T00:00:00.000Z' };
    store['profiles/sporter1'] = { ...store['profiles/sporter1'], email: 'jan@x.nl', displayName: 'Jan de Vries' };
    store['orgs/vanas'] = { name: 'Van As', business: { legalName: 'Van As PT', invoiceEmail: 'info@vanaspt.nl' } };
  };

  it('meldt of mail is ingericht en weigert versturen zolang dat niet zo is', async () => {
    seedCharge();
    delete process.env.RESEND_API_KEY;
    delete process.env.INVOICE_FROM_EMAIL;
    const status = await post({ action: 'mailStatus' }, 'trainer1');
    expect(status.body.configured).toBe(false);
    const res = await post({ action: 'sendInvoice', chargeId: 'ch1' }, 'trainer1');
    expect(res.statusCode).toBe(409);
    expect(store['charges/ch1'].invoiceSentAt).toBeUndefined();
  });

  it('verstuurt via Resend met de PDF als bijlage en zet dat op de post', async () => {
    seedCharge();
    process.env.RESEND_API_KEY = 'test-key';
    process.env.INVOICE_FROM_EMAIL = 'facturen@vanaspt.nl';
    const calls = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (url, init) => {
      if (String(url).startsWith('https://api.resend.com/')) {
        calls.push(JSON.parse(init.body));
        return { ok: true, json: async () => ({ id: 'msg_42' }) };
      }
      return { ok: false, status: 404, headers: { get: () => null }, arrayBuffer: async () => new ArrayBuffer(0) };
    };
    try {
      const sporter = await post({ action: 'sendInvoice', chargeId: 'ch1' }, 'sporter1');
      expect(sporter.statusCode).toBe(403);
      const res = await post({ action: 'sendInvoice', chargeId: 'ch1' }, 'trainer1');
      expect(res.statusCode).toBe(200);
      expect(res.body).toMatchObject({ invoiceNumber: 'VAS-2026-0142', sentTo: 'jan@x.nl' });
      expect(calls).toHaveLength(1);
      expect(calls[0]).toMatchObject({ from: 'Van As PT <facturen@vanaspt.nl>', to: ['jan@x.nl'], reply_to: 'info@vanaspt.nl' });
      expect(calls[0].subject).toBe('Factuur VAS-2026-0142 · Van As PT · € 139,00');
      expect(calls[0].attachments[0].filename).toBe('Factuur-VAS-2026-0142.pdf');
      expect(Buffer.from(calls[0].attachments[0].content, 'base64').subarray(0, 5).toString()).toBe('%PDF-');
      expect(store['charges/ch1']).toMatchObject({ invoiceSentTo: 'jan@x.nl', invoiceMessageId: 'msg_42' });
      expect(store['charges/ch1'].invoiceSentAt).toBeTruthy();
    } finally {
      globalThis.fetch = realFetch;
      delete process.env.RESEND_API_KEY;
      delete process.env.INVOICE_FROM_EMAIL;
    }
  });
});

describe('factuurlink', () => {
  const seed = () => {
    store['charges/ch1'] = { orgId: 'vanas', userId: 'sporter1', planName: 'Maand 8', description: 'Maand 8 · 2026-09', amount: 139, period: '2026-09', status: 'open', vatRate: 9, invoiceNumber: 'VAS-2026-0142', invoiceIssuedAt: '2026-09-01T00:00:00.000Z', issuedAt: '2026-09-01T00:00:00.000Z', dueAt: '2026-09-01T00:00:00.000Z' };
    store['profiles/sporter1'] = { ...store['profiles/sporter1'], displayName: 'Jan de Vries', email: 'jan@x.nl' };
    store['orgs/vanas'] = { name: 'Van As', business: { legalName: 'Van As PT' } };
  };

  it('maakt één vaste code per post en een WhatsApp-tekst in de taal van het lid', async () => {
    seed();
    const res = await post({ action: 'invoiceLink', chargeId: 'ch1' }, 'trainer1');
    expect(res.statusCode).toBe(200);
    expect(res.body.url).toMatch(/^https:\/\/lift-log-phi\.vercel\.app\/f\/[0-9a-f]{32}$/);
    expect(res.body.text).toBe(`Hoi Jan, hier is je factuur VAS-2026-0142 van Van As PT: € 139,00, te betalen vóór 15 september 2026. Bekijken en downloaden: ${res.body.url}`);
    const again = await post({ action: 'invoiceLink', chargeId: 'ch1' }, 'sporter1');
    expect(again.body.url).toBe(res.body.url);
    const ander = await post({ action: 'invoiceLink', chargeId: 'ch1' }, 'sporter2');
    expect(ander.statusCode).toBe(403);
  });

  it('geeft de PDF op GET met de code, en niets zonder geldige code', async () => {
    seed();
    const link = await post({ action: 'invoiceLink', chargeId: 'ch1' }, 'trainer1');
    const token = link.body.url.split('/f/')[1];
    const get = async (invoice) => {
      const res = makeRes();
      const chunks = [];
      res.end = (payload) => {
        chunks.push(payload);
      };
      await handler({ method: 'GET', headers: {}, query: { invoice } }, res);
      return { status: res.statusCode, body: chunks[0] };
    };
    const ok = await get(token);
    expect(ok.status).toBe(200);
    expect(Buffer.from(ok.body).subarray(0, 5).toString()).toBe('%PDF-');
    expect((await get('ffffffffffffffffffffffffffffffff')).status).toBe(404);
    expect((await get('../etc')).status).toBe(404);
  });
});

describe('betalingen (Mollie)', () => {
  beforeEach(() => {
    store['profiles/admin1'] = { userId: 'admin1', orgId: 'vanas', orgIds: ['vanas'], role: 'admin' };
  });

  const mockMollie = (behavior) => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (url, init) => {
      if (String(url) === 'https://api.mollie.com/v2/organizations/me') return behavior(init);
      return { ok: false, status: 404, headers: { get: () => null }, arrayBuffer: async () => new ArrayBuffer(0) };
    };
    return () => {
      globalThis.fetch = realFetch;
    };
  };

  it('weigert voor een trainer; alleen een beheerder mag betaalgegevens instellen', async () => {
    const res = await post({ action: 'savePaymentKey', orgId: 'vanas', mode: 'test', apiKey: 'test_abcdefghij1234' }, 'trainer1');
    expect(res.statusCode).toBe(403);
    expect(store['orgSecrets/vanas']).toBeUndefined();
  });

  it('weigert een sleutel van de verkeerde vorm, zonder Mollie te bellen', async () => {
    const restore = mockMollie(() => {
      throw new Error('had niet gebeld moeten worden');
    });
    try {
      const res = await post({ action: 'savePaymentKey', orgId: 'vanas', mode: 'test', apiKey: 'live_abcdefghij1234' }, 'admin1');
      expect(res.statusCode).toBe(400);
      expect(res.body.error).toMatch(/live-sleutel/);
    } finally {
      restore();
    }
  });

  it('weigert een sleutel die Mollie zelf niet herkent, en slaat niets op', async () => {
    const restore = mockMollie(() => ({ ok: false, status: 401, json: async () => ({}) }));
    try {
      const res = await post({ action: 'savePaymentKey', orgId: 'vanas', mode: 'test', apiKey: 'test_abcdefghij1234' }, 'admin1');
      expect(res.statusCode).toBe(409);
      expect(store['orgSecrets/vanas']).toBeUndefined();
      expect(store['orgs/vanas']?.payments).toBeUndefined();
    } finally {
      restore();
    }
  });

  it('koppelt een geldige sleutel: de sleutel gaat naar orgSecrets, alleen het restje naar orgs', async () => {
    const restore = mockMollie(() => ({ ok: true, status: 200, json: async () => ({ name: 'Van As Personal Training' }) }));
    try {
      const res = await post({ action: 'savePaymentKey', orgId: 'vanas', mode: 'test', apiKey: 'test_abcdefghij1234' }, 'admin1');
      expect(res.statusCode).toBe(200);
      expect(res.body).toMatchObject({ mode: 'test', last4: '1234', organizationName: 'Van As Personal Training' });
      expect(res.body.apiKey).toBeUndefined();

      expect(store['orgSecrets/vanas'].mollieTestKey).toBe('test_abcdefghij1234');
      expect(store['orgs/vanas'].payments).toMatchObject({
        provider: 'mollie',
        testKeyLast4: '1234',
        testOrganizationName: 'Van As Personal Training',
      });
      expect(store['orgs/vanas'].payments.testConnectedAt).toBeTruthy();
      // Nooit de sleutel zelf op het document dat de client wél mag lezen.
      expect(JSON.stringify(store['orgs/vanas'])).not.toContain('test_abcdefghij1234');
    } finally {
      restore();
    }
  });

  it('bewaart de sleutel van de andere modus als je de tweede koppelt', async () => {
    const restore = mockMollie(() => ({ ok: true, status: 200, json: async () => ({ name: 'Van As Personal Training' }) }));
    try {
      await post({ action: 'savePaymentKey', orgId: 'vanas', mode: 'test', apiKey: 'test_abcdefghij1234' }, 'admin1');
      const live = await post({ action: 'savePaymentKey', orgId: 'vanas', mode: 'live', apiKey: 'live_abcdefghij5678' }, 'admin1');
      expect(live.statusCode).toBe(200);
      expect(store['orgSecrets/vanas']).toMatchObject({ mollieTestKey: 'test_abcdefghij1234', mollieLiveKey: 'live_abcdefghij5678' });
      expect(store['orgs/vanas'].payments).toMatchObject({ testKeyLast4: '1234', liveKeyLast4: '5678' });
    } finally {
      restore();
    }
  });

  it('weigert een studio die niet van de aanvrager is', async () => {
    const restore = mockMollie(() => {
      throw new Error('had niet gebeld moeten worden');
    });
    try {
      const res = await post({ action: 'savePaymentKey', orgId: 'studiob', mode: 'test', apiKey: 'test_abcdefghij1234' }, 'admin1');
      expect(res.statusCode).toBe(403);
    } finally {
      restore();
    }
  });

  it('koppelt los: de sleutel verdwijnt uit orgSecrets, het restje wordt leeg', async () => {
    const restore = mockMollie(() => ({ ok: true, status: 200, json: async () => ({ name: 'Van As Personal Training' }) }));
    try {
      await post({ action: 'savePaymentKey', orgId: 'vanas', mode: 'test', apiKey: 'test_abcdefghij1234' }, 'admin1');
      const res = await post({ action: 'removePaymentKey', orgId: 'vanas', mode: 'test' }, 'admin1');
      expect(res.statusCode).toBe(200);
      expect('mollieTestKey' in (store['orgSecrets/vanas'] ?? {})).toBe(false);
      expect(store['orgs/vanas'].payments).toMatchObject({ testKeyLast4: null, testConnectedAt: null, testOrganizationName: null });
    } finally {
      restore();
    }
  });

  it('een trainer mag geen sleutel loskoppelen', async () => {
    const res = await post({ action: 'removePaymentKey', orgId: 'vanas', mode: 'test' }, 'trainer1');
    expect(res.statusCode).toBe(403);
  });

  describe('zelf een abonnement kopen (Mollie-checkout)', () => {
    const webhook = async (orgId, id) => {
      const res = makeRawRes();
      await handler({ method: 'POST', headers: {}, query: { mollieWebhook: orgId }, body: { id } }, res);
      return res;
    };

    const mockMolliePayments = (paymentStatus = 'paid') => {
      const realFetch = globalThis.fetch;
      const calls = [];
      globalThis.fetch = async (url, init) => {
        calls.push({ url: String(url), init });
        if (String(url) === 'https://api.mollie.com/v2/payments') {
          return { ok: true, json: async () => ({ id: 'tr_test1', _links: { checkout: { href: 'https://mollie.test/checkout/tr_test1' } } }) };
        }
        if (String(url) === 'https://api.mollie.com/v2/payments/tr_test1') {
          return { ok: true, json: async () => ({ id: 'tr_test1', status: paymentStatus }) };
        }
        return { ok: false, status: 404, json: async () => ({}) };
      };
      return {
        calls,
        restore: () => {
          globalThis.fetch = realFetch;
        },
      };
    };

    beforeEach(() => {
      store['orgs/vanas'] = { ...(store['orgs/vanas'] ?? {}), name: 'Van As', payments: { mode: 'test' } };
      store['orgSecrets/vanas'] = { mollieTestKey: 'test_abcdefghij1234' };
      store['plans/pl1'] = {
        orgId: 'vanas',
        name: 'Strippenkaart 10x',
        price: 50,
        period: 'once',
        credits: 10,
        validityMonths: null,
        rollover: 'expire',
        availableTo: 'all',
        status: 'active',
        vatRate: 9,
      };
    });

    it('weigert zonder gekoppelde Mollie-sleutel', async () => {
      delete store['orgSecrets/vanas'];
      const res = await post({ action: 'purchasePlan', planId: 'pl1' });
      expect(res.statusCode).toBe(409);
    });

    it('weigert een gratis plan (geen betaling nodig)', async () => {
      store['plans/pl1'].price = 0;
      const res = await post({ action: 'purchasePlan', planId: 'pl1' });
      expect(res.statusCode).toBe(409);
    });

    it('weigert een plan van een andere studio', async () => {
      store['plans/pl1'].orgId = 'studiob';
      const res = await post({ action: 'purchasePlan', planId: 'pl1' });
      expect(res.statusCode).toBe(403);
    });

    it('weigert een alleen-op-uitnodiging-plan', async () => {
      store['plans/pl1'].availableTo = 'invite';
      const res = await post({ action: 'purchasePlan', planId: 'pl1' });
      expect(res.statusCode).toBe(403);
    });

    it('maakt een Mollie-betaling aan en bewaart een tussentijdse checkout-post', async () => {
      const mollie = mockMolliePayments();
      try {
        const res = await post({ action: 'purchasePlan', planId: 'pl1' });
        expect(res.statusCode).toBe(200);
        expect(res.body.checkoutUrl).toBe('https://mollie.test/checkout/tr_test1');
        expect(store['mollieCheckouts/tr_test1']).toMatchObject({ orgId: 'vanas', userId: 'sporter1', planId: 'pl1', status: 'pending' });
        // De sleutel van de studio gaat mee, nooit iets van de sporter.
        expect(mollie.calls[0].init.headers.Authorization).toBe('Bearer test_abcdefghij1234');
      } finally {
        mollie.restore();
      }
    });

    it('beperkt het aantal checkout-pogingen per dag', async () => {
      const mollie = mockMolliePayments();
      try {
        for (let i = 0; i < 20; i++) {
          const res = await post({ action: 'purchasePlan', planId: 'pl1' });
          expect(res.statusCode).toBe(200);
        }
        const res = await post({ action: 'purchasePlan', planId: 'pl1' });
        expect(res.statusCode).toBe(429);
      } finally {
        mollie.restore();
      }
    });

    it('kent na een geslaagde betaling credits toe, boekt de post betaald, en verwerkt een dubbele melding niet nog eens', async () => {
      const mollie = mockMolliePayments('paid');
      try {
        await post({ action: 'purchasePlan', planId: 'pl1' });
        const first = await webhook('vanas', 'tr_test1');
        expect(first.statusCode).toBe(200);
        expect(store['creditAccounts/vanas__sporter1'].balance).toBe(13); // 3 bestaand + 10 nieuw
        expect(store['mollieCheckouts/tr_test1'].status).toBe('completed');
        const chargeId = store['mollieCheckouts/tr_test1'].chargeId;
        expect(store[`charges/${chargeId}`]).toMatchObject({ status: 'paid', paidBy: 'mollie', amount: 50, molliePaymentId: 'tr_test1' });
        expect(store[`charges/${chargeId}`].invoiceNumber).toBeTruthy();

        // Nogmaals dezelfde melding (Mollie kan dubbel melden): geen dubbele credits.
        const second = await webhook('vanas', 'tr_test1');
        expect(second.statusCode).toBe(200);
        expect(store['creditAccounts/vanas__sporter1'].balance).toBe(13);
      } finally {
        mollie.restore();
      }
    });

    it('doet niets bij een onbekend betaal-id', async () => {
      const res = await webhook('vanas', 'tr_unknown');
      expect(res.statusCode).toBe(200);
    });

    it('doet niets als de melding niet bij deze studio hoort', async () => {
      const mollie = mockMolliePayments('paid');
      try {
        await post({ action: 'purchasePlan', planId: 'pl1' });
        const res = await webhook('studiob', 'tr_test1');
        expect(res.statusCode).toBe(200);
        expect(store['mollieCheckouts/tr_test1'].status).toBe('pending');
      } finally {
        mollie.restore();
      }
    });

    it('markeert een mislukte betaling zonder iets toe te kennen', async () => {
      const mollie = mockMolliePayments('failed');
      try {
        await post({ action: 'purchasePlan', planId: 'pl1' });
        const res = await webhook('vanas', 'tr_test1');
        expect(res.statusCode).toBe(200);
        expect(store['mollieCheckouts/tr_test1'].status).toBe('failed');
        expect(store['creditAccounts/vanas__sporter1'].balance).toBe(3);
      } finally {
        mollie.restore();
      }
    });
  });
});

describe('terugkerende lessen (cron)', () => {
  const getCron = async (authHeader) => {
    const res = makeRes();
    await handler({ method: 'GET', headers: authHeader ? { authorization: authHeader } : {}, query: { cron: 'generateClasses' } }, res);
    return res;
  };
  const todayIso = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const ORIGINAL_SECRET = process.env.CRON_SECRET;
  beforeEach(() => {
    process.env.CRON_SECRET = 'test-secret';
  });
  afterEach(() => {
    if (ORIGINAL_SECRET === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = ORIGINAL_SECRET;
  });

  it('weigert als CRON_SECRET niet is ingesteld op de server', async () => {
    delete process.env.CRON_SECRET;
    const res = await getCron('Bearer whatever');
    expect(res.statusCode).toBe(500);
  });

  it('weigert een verkeerde of ontbrekende sleutel', async () => {
    expect((await getCron('Bearer verkeerd')).statusCode).toBe(401);
    expect((await getCron(undefined)).statusCode).toBe(401);
  });

  it('zet de ontbrekende les van een lessoort met schema op het rooster', async () => {
    store['classTypes/ct1'] = {
      orgId: 'vanas', name: 'Kicking', capacity: 8, creditCost: 1,
      defaultTrainerId: 'trainer1', schemaId: null,
      schedule: [{ weekday: new Date().getDay(), startTime: '19:00', endTime: '20:00' }],
    };
    const res = await getCron('Bearer test-secret');
    expect(res.statusCode).toBe(200);
    expect(res.body.created).toBeGreaterThan(0);
    const createdId = `classes/cls_gen_ct1_${todayIso()}_1900`;
    expect(store[createdId]).toMatchObject({ orgId: 'vanas', title: 'Kicking', startTime: '19:00', endTime: '20:00', trainerId: 'trainer1', classTypeId: 'ct1', bookedCount: 0 });
  });

  it('plant een lessoort zonder vaste trainer ook in, zonder trainer op de les', async () => {
    store['classTypes/ct2'] = {
      orgId: 'vanas', name: 'Open gym', capacity: null, creditCost: 0,
      defaultTrainerId: null, schemaId: null,
      schedule: [{ weekday: new Date().getDay(), startTime: '08:00', endTime: '09:00' }],
    };
    const res = await getCron('Bearer test-secret');
    expect(res.statusCode).toBe(200);
    expect(store[`classes/cls_gen_ct2_${todayIso()}_0800`]).toMatchObject({ title: 'Open gym', trainerId: null });
  });

  it('maakt een moment niet nog een keer aan als het al bestaat, ook als het is afgelast', async () => {
    const id = `classes/cls_gen_ct3_${todayIso()}_1900`;
    store['classTypes/ct3'] = {
      orgId: 'vanas', name: 'Kicking', capacity: 8, creditCost: 1,
      defaultTrainerId: 'trainer1', schemaId: null,
      schedule: [{ weekday: new Date().getDay(), startTime: '19:00', endTime: '20:00' }],
    };
    store[id] = { orgId: 'vanas', title: 'Kicking', classTypeId: 'ct3', cancelledAt: '2026-01-01T00:00:00.000Z' };
    const res = await getCron('Bearer test-secret');
    expect(res.statusCode).toBe(200);
    expect(store[id].cancelledAt).toBe('2026-01-01T00:00:00.000Z');
  });

  describe('"elke week"-inschrijvingen meeboeken op een nieuw gegenereerde les', () => {
    const schedule = [{ weekday: new Date().getDay(), startTime: '19:00', endTime: '20:00' }];
    // Alle acht weekmomenten die de cron binnen zijn horizon zou willen zetten; realistisch is dat
    // de eerste zeven al bestaan (van vorige cron-runs) en alleen de verste nieuw bijkomt — dat is
    // wat hier wordt nagebootst, in plaats van alle acht in één keer aan te maken.
    const occurrences = occurrencesForSchedule(schedule, todayIso(), 8);
    const newest = occurrences[occurrences.length - 1];
    const generatedId = `classes/${classIdForOccurrence('ct4', newest.date, newest.startTime)}`;

    beforeEach(() => {
      store['classTypes/ct4'] = {
        orgId: 'vanas', name: 'Kicking', capacity: 1, creditCost: 1,
        defaultTrainerId: 'trainer1', schemaId: null,
        schedule,
      };
      for (const o of occurrences.slice(0, -1)) {
        store[`classes/${classIdForOccurrence('ct4', o.date, o.startTime)}`] = {
          orgId: 'vanas', title: 'Kicking', date: o.date, startTime: o.startTime, endTime: o.endTime,
          trainerId: 'trainer1', capacity: 1, creditCost: 1, classTypeId: 'ct4',
          bookedCount: 0, waitlistCount: 0, cancelledAt: null,
        };
      }
    });

    it('boekt een sporter met een actieve inschrijving en telt dat mee in de respons', async () => {
      store['standingBookings/sb1'] = {
        id: 'sb1', orgId: 'vanas', userId: 'sporter1', classTypeId: 'ct4',
        weekday: schedule[0].weekday, startTime: '19:00', active: true, lastOutcome: null, lastOutcomeDate: null,
      };
      const res = await getCron('Bearer test-secret');

      expect(res.statusCode).toBe(200);
      expect(res.body.autoBooked).toBe(1);
      expect(store[generatedId].bookedCount).toBe(1);
      expect(store['creditAccounts/vanas__sporter1'].balance).toBe(2);
      const booking = Object.values(store).find((v) => v.classId === generatedId.slice('classes/'.length) && v.userId === 'sporter1');
      expect(booking).toMatchObject({ status: 'booked', creditsSpent: 1 });
      expect(store['standingBookings/sb1']).toMatchObject({ lastOutcome: 'booked', lastOutcomeDate: newest.date });
    });

    it('slaat de week over als de sporter geen credits meer heeft, zonder te boeken', async () => {
      store['creditAccounts/vanas__sporter1'].balance = 0;
      store['standingBookings/sb1'] = {
        id: 'sb1', orgId: 'vanas', userId: 'sporter1', classTypeId: 'ct4',
        weekday: schedule[0].weekday, startTime: '19:00', active: true, lastOutcome: null, lastOutcomeDate: null,
      };
      const res = await getCron('Bearer test-secret');

      expect(res.body.autoSkippedNoCredits).toBe(1);
      expect(store[generatedId].bookedCount).toBe(0);
      expect(store['standingBookings/sb1'].lastOutcome).toBe('skippedNoCredits');
    });

    it('zet de tweede inschrijving op de wachtlijst zodra de eerste de enige plek pakt', async () => {
      store['standingBookings/sb1'] = {
        id: 'sb1', orgId: 'vanas', userId: 'sporter1', classTypeId: 'ct4',
        weekday: schedule[0].weekday, startTime: '19:00', active: true, lastOutcome: null, lastOutcomeDate: null,
      };
      store['standingBookings/sb2'] = {
        id: 'sb2', orgId: 'vanas', userId: 'sporter2', classTypeId: 'ct4',
        weekday: schedule[0].weekday, startTime: '19:00', active: true, lastOutcome: null, lastOutcomeDate: null,
      };
      const res = await getCron('Bearer test-secret');

      expect(res.body.autoBooked).toBe(1);
      expect(res.body.autoWaitlisted).toBe(1);
      expect(store[generatedId].bookedCount).toBe(1);
      expect(store[generatedId].waitlistCount).toBe(1);
      expect(store['standingBookings/sb1'].lastOutcome).toBe('booked');
      expect(store['standingBookings/sb2'].lastOutcome).toBe('skippedFull');
      // Op de wachtlijst gaat er nog geen credit af.
      expect(store['creditAccounts/vanas__sporter2'].balance).toBe(3);
    });

    it('slaat een uitgezette inschrijving over', async () => {
      store['standingBookings/sb1'] = {
        id: 'sb1', orgId: 'vanas', userId: 'sporter1', classTypeId: 'ct4',
        weekday: schedule[0].weekday, startTime: '19:00', active: false, lastOutcome: null, lastOutcomeDate: null,
      };
      const res = await getCron('Bearer test-secret');

      expect(res.body.autoBooked).toBe(0);
      expect(store[generatedId].bookedCount).toBe(0);
      expect(store['standingBookings/sb1'].lastOutcome).toBeNull();
    });
  });
});

describe('rooster meteen vullen na het opslaan van een lessoort', () => {
  beforeEach(() => {
    store['classTypes/ct5'] = {
      orgId: 'vanas', name: 'Kickboksen', capacity: 12, creditCost: 1,
      defaultTrainerId: 'trainer1', schemaId: null,
      schedule: [{ weekday: new Date().getDay(), startTime: '19:00', endTime: '20:00' }],
    };
  });

  it('zet de les op het rooster zonder op de cron te wachten', async () => {
    const res = await post({ action: 'generateClassOccurrences', classTypeId: 'ct5' }, 'trainer1');
    expect(res.statusCode).toBe(200);
    expect(res.body.created).toBeGreaterThan(0);
    const todayIso2 = new Date().toISOString().slice(0, 10);
    expect(store[`classes/cls_gen_ct5_${todayIso2}_1900`]).toMatchObject({ title: 'Kickboksen', classTypeId: 'ct5' });
  });

  it('weigert dit voor een sporter', async () => {
    const res = await post({ action: 'generateClassOccurrences', classTypeId: 'ct5' }, 'sporter1');
    expect(res.statusCode).toBe(403);
  });

  it('weigert een lessoort van een andere studio', async () => {
    store['classTypes/ct5'].orgId = 'studiob';
    const res = await post({ action: 'generateClassOccurrences', classTypeId: 'ct5' }, 'trainer1');
    expect(res.statusCode).toBe(403);
  });

  it('doet niets voor een lessoort zonder schema, in plaats van te crashen', async () => {
    store['classTypes/ct6'] = { orgId: 'vanas', name: 'Losse les', schedule: [], defaultTrainerId: null };
    const res = await post({ action: 'generateClassOccurrences', classTypeId: 'ct6' }, 'trainer1');
    expect(res.statusCode).toBe(200);
    expect(res.body.created).toBe(0);
  });
});

describe('vaste lessen vanuit het profiel', () => {
  const inDays = (n) => {
    const d = new Date(Date.now() + n * 86_400_000);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const d1 = inDays(7);
  const d2 = inDays(14);
  const d3 = inDays(21);
  const weekday = new Date(`${d1}T12:00:00`).getDay();
  const cls = (date, extra = {}) => ({
    orgId: 'vanas', title: 'HIIT', date, startTime: '09:00', endTime: '10:00', trainerId: 'trainer1',
    capacity: 8, creditCost: 1, bookedCount: 0, waitlistCount: 0, classTypeId: 'ct9', ...extra,
  });
  const sbId = `sb_ct9_sporter1_${weekday}_0900`;
  const myBookings = () => Object.values(store).filter((v) => v.userId === 'sporter1' && v.classId && ['booked', 'waitlist'].includes(v.status));

  beforeEach(() => {
    store['classTypes/ct9'] = {
      orgId: 'vanas', name: 'HIIT', capacity: 8, creditCost: 1, defaultTrainerId: 'trainer1',
      schedule: [{ weekday, startTime: '09:00', endTime: '10:00' }],
    };
    store['classes/w1'] = cls(d1);
    store['classes/w2'] = cls(d2);
    store['classes/w3'] = cls(d3);
    store['classes/anders'] = cls(d1, { startTime: '18:00' });
    // Een sporter plant zelf alleen in wat zijn abonnement toestaat.
    store['plans/plan_sgt'] = { orgId: 'vanas', name: 'Small Group Training - 2x per week', price: 0, period: 'month', credits: 8 };
    store['memberships/mb_s1'] = { orgId: 'vanas', userId: 'sporter1', planId: 'plan_sgt', status: 'active' };
  });

  it('boekt meteen de weken die al op het rooster staan', async () => {
    const res = await post({ action: 'addStandingBooking', classTypeId: 'ct9', weekday, startTime: '09:00' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ standingBookingId: sbId, booked: 3, skippedNoCredits: 0 });
    expect(myBookings().map((b) => b.classId).sort()).toEqual(['w1', 'w2', 'w3']);
    expect(store['creditAccounts/vanas__sporter1'].balance).toBe(0);
    expect(store[`standingBookings/${sbId}`]).toMatchObject({ active: true, userId: 'sporter1' });
  });

  it('begint pas op de startdatum', async () => {
    const res = await post({ action: 'addStandingBooking', classTypeId: 'ct9', weekday, startTime: '09:00', startDate: d2 });
    expect(res.body.booked).toBe(2);
    expect(myBookings().map((b) => b.classId).sort()).toEqual(['w2', 'w3']);
  });

  it('een trainer zet het voor een klant; een sporter niet voor een ander', async () => {
    const byTrainer = await post({ action: 'addStandingBooking', classTypeId: 'ct9', weekday, startTime: '09:00', userId: 'sporter1' }, 'trainer1');
    expect(byTrainer.statusCode).toBe(200);
    expect(myBookings()).toHaveLength(3);
    const bySporter = await post({ action: 'addStandingBooking', classTypeId: 'ct9', weekday, startTime: '09:00', userId: 'sporter1' }, 'sporter2');
    expect(bySporter.statusCode).toBe(403);
  });

  it('weigert een weekmoment dat niet bij de lessoort hoort', async () => {
    const res = await post({ action: 'addStandingBooking', classTypeId: 'ct9', weekday, startTime: '07:00' });
    expect(res.statusCode).toBe(400);
  });

  it('stoppen meldt de geboekte lessen af, met credit terug buiten de termijn', async () => {
    await post({ action: 'addStandingBooking', classTypeId: 'ct9', weekday, startTime: '09:00' });
    const res = await post({ action: 'setStandingBooking', standingBookingId: sbId, active: false });
    expect(res.body).toMatchObject({ active: false, cancelled: 3, refunded: 3 });
    expect(myBookings()).toHaveLength(0);
    expect(store['creditAccounts/vanas__sporter1'].balance).toBe(3);
  });

  it('pauze meldt alleen de lessen in die periode af, en opheffen boekt ze weer', async () => {
    await post({ action: 'addStandingBooking', classTypeId: 'ct9', weekday, startTime: '09:00' });
    const paused = await post({ action: 'pauseStandingBooking', standingBookingId: sbId, from: d2, until: d2 });
    expect(paused.body.cancelled).toBe(1);
    expect(myBookings().map((b) => b.classId).sort()).toEqual(['w1', 'w3']);
    const resumed = await post({ action: 'pauseStandingBooking', standingBookingId: sbId, from: null });
    expect(resumed.body.booked).toBe(1);
    expect(myBookings().map((b) => b.classId).sort()).toEqual(['w1', 'w2', 'w3']);
  });
});

describe('vaste PT-momenten (privé-lessoort per lid)', () => {
  const inDays = (n) => {
    const d = new Date(Date.now() + n * 86_400_000);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  // Over drie dagen, zodat de eerste les altijd in de toekomst ligt en ruim buiten de afmeldtermijn.
  const first = inDays(3);
  const weekday = new Date(`${first}T12:00:00`).getDay();
  const ctId = `ctp_sporter1_${weekday}_1800`;
  const sbId = `sb_${ctId}_sporter1_${weekday}_1800`;
  const ptClasses = () =>
    Object.entries(store)
      .filter(([k, v]) => k.startsWith('classes/') && v.classTypeId === ctId)
      .map(([k, v]) => ({ ...v, id: k.slice('classes/'.length) }))
      .sort((a, b) => a.date.localeCompare(b.date));
  const futurePt = () => ptClasses().filter((c) => c.date >= first);
  const myActive = () => Object.values(store).filter((v) => v.userId === 'sporter1' && v.classId && ['booked', 'waitlist'].includes(v.status));
  const slot = (extra = {}) => ({
    action: 'addPersonalSlot', userId: 'sporter1', baseClassTypeId: 'ctPT', weekday, startTime: '18:00', endTime: '19:00', startDate: first, ...extra,
  });

  beforeEach(() => {
    store['classTypes/ctPT'] = {
      orgId: 'vanas', name: 'Personal training', capacity: 1, creditCost: 1, defaultTrainerId: 'trainer1', sessionKind: '1on1', schedule: [],
    };
    store['creditAccounts/vanas__sporter1'].balance = 20;
  });

  it('een trainer zet "elke week 18:00" voor een lid: privé-lessoort, lessen op het rooster en geboekt', async () => {
    const res = await post(slot(), 'trainer1');
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ classTypeId: ctId, standingBookingId: sbId });
    expect(store[`classTypes/${ctId}`]).toMatchObject({ privateFor: 'sporter1', capacity: 1, defaultTrainerId: 'trainer1', name: 'Personal training' });
    const classes = futurePt();
    expect(classes.length).toBeGreaterThanOrEqual(7);
    expect(classes.every((c) => c.privateFor === 'sporter1' && c.trainerId === 'trainer1' && !c.cancelledAt)).toBe(true);
    expect(res.body.booked).toBe(classes.length);
    expect(myActive()).toHaveLength(classes.length);
  });

  it('dubbel plannen: dezelfde trainer op hetzelfde moment kan niet, met voorstellen', async () => {
    expect((await post(slot(), 'trainer1')).statusCode).toBe(200);
    const res = await post(slot({ userId: 'sporter2', startTime: '18:30', endTime: '19:30' }), 'trainer1');
    expect(res.statusCode).toBe(409);
    expect(res.body.error).toMatch(/botst met Personal training .*zelfde trainer/);
    expect(res.body.conflicts[0]).toMatchObject({ sameTrainer: true, other: { id: ctId } });
    // Voorstel: een tijd op dezelfde dag waarop de trainer vrij is (niet overlappend met 18:00–19:00).
    expect(res.body.suggestions.times.length).toBeGreaterThan(0);
    expect(res.body.suggestions.times.every((t) => t.endTime <= '18:00' || t.startTime >= '19:00')).toBe(true);
    expect(store[`classTypes/ctp_sporter2_${weekday}_1830`]).toBeUndefined();
  });

  it('dubbel plannen mag als de studio het niet blokkeert', async () => {
    store['orgs/vanas'] = { ...(store['orgs/vanas'] ?? {}), scheduling: { blockDoubleBooking: false } };
    expect((await post(slot(), 'trainer1')).statusCode).toBe(200);
    expect((await post(slot({ userId: 'sporter2' }), 'trainer1')).statusCode).toBe(200);
  });

  it('beschikbaarheid: trainer zet eigen uren, voorstellen blijven daarbinnen, beheerder mag voor een trainer', async () => {
    const days = { [weekday]: [{ from: '16:00', to: '21:00' }] };
    expect((await post({ action: 'saveAvailability', days }, 'sporter1')).statusCode).toBe(403);
    store['profiles/trainer2'] = { userId: 'trainer2', orgId: 'vanas', orgIds: ['vanas'], role: 'trainer' };
    expect((await post({ action: 'saveAvailability', userId: 'trainer2', days }, 'trainer1')).statusCode).toBe(403);
    const saved = await post({ action: 'saveAvailability', days }, 'trainer1');
    expect(saved.statusCode).toBe(200);
    expect(saved.body.days[String(weekday)]).toEqual([{ from: '16:00', to: '21:00' }]);
    expect((await post({ action: 'getAvailability' }, 'trainer1')).body.days[String(weekday)]).toHaveLength(1);
    store['profiles/admin1'] = { userId: 'admin1', orgId: 'vanas', orgIds: ['vanas'], role: 'admin' };
    expect((await post({ action: 'saveAvailability', userId: 'trainer2', days }, 'admin1')).statusCode).toBe(200);
    expect((await post({ action: 'saveAvailability', userId: 'sporter2', days }, 'admin1')).statusCode).toBe(400);

    // PT-moment 18:00–19:00 staat; een tweede op 18:30 botst. Voorstellen: binnen 16:00–21:00, aansluitend eerst.
    await post(slot(), 'trainer1');
    const res = await post(slot({ userId: 'sporter2', startTime: '18:30', endTime: '19:30' }), 'trainer1');
    expect(res.statusCode).toBe(409);
    const times = res.body.suggestions.times;
    expect(times[0].adjacent).toBe(true);
    expect(times.map((t) => t.startTime).slice(0, 2).sort()).toEqual(['17:00', '19:00']);
    expect(times.every((t) => t.startTime >= '16:00' && t.endTime <= '21:00')).toBe(true);
  });

  it('checkSchedule meldt botsingen van een lessoort, alleen voor staf', async () => {
    await post(slot(), 'trainer1');
    const body = { action: 'checkSchedule', classType: { id: 'nieuw', name: 'Bootcamp', defaultTrainerId: 'trainer1', room: null, schedule: [{ weekday, startTime: '18:30', endTime: '19:30' }] } };
    expect((await post(body, 'sporter1')).statusCode).toBe(403);
    const res = await post(body, 'trainer1');
    expect(res.statusCode).toBe(200);
    expect(res.body.block).toBe(true);
    expect(res.body.conflicts).toHaveLength(1);
    expect(res.body.suggestions[0].times.length).toBeGreaterThan(0);
    const all = await post({ action: 'scheduleConflicts' }, 'trainer1');
    expect(all.body.conflicts).toHaveLength(0);
  });

  it('alleen staf; een ander lid kan de privé-les niet boeken', async () => {
    expect((await post(slot(), 'sporter1')).statusCode).toBe(403);
    await post(slot(), 'trainer1');
    const other = await post({ action: 'book', classId: futurePt()[0].id }, 'sporter2');
    expect(other.statusCode).toBe(409);
    expect(other.body.error).toMatch(/persoonlijke afspraak/);
  });

  it('weigert een lid of trainer van een andere studio en een eindtijd voor de begintijd', async () => {
    expect((await post(slot({ userId: 'sporterB' }), 'trainer1')).statusCode).toBe(403);
    expect((await post(slot({ trainerId: 'sporter2' }), 'trainer1')).statusCode).toBe(400);
    expect((await post(slot({ endTime: '17:00' }), 'trainer1')).statusCode).toBe(400);
  });

  it('"deze keer niet" haalt de les van het rooster; opnieuw boeken zet hem terug', async () => {
    await post(slot(), 'trainer1');
    const cls = futurePt()[0];
    const booking = myActive().find((b) => b.classId === cls.id);
    const bookingId = Object.entries(store).find(([, v]) => v === booking)[0].slice('bookings/'.length);
    const cancelled = await post({ action: 'cancel', bookingId });
    expect(cancelled.body.refunded).toBe(true);
    expect(store[`classes/${cls.id}`]).toMatchObject({ autoCancelled: true, bookedCount: 0 });
    expect(store[`classes/${cls.id}`].cancelledAt).toBeTruthy();

    const again = await post({ action: 'book', classId: cls.id });
    expect(again.statusCode).toBe(200);
    expect(store[`classes/${cls.id}`]).toMatchObject({ cancelledAt: null, autoCancelled: false, bookedCount: 1 });
  });

  it('pauze haalt die weken van het rooster, opheffen zet ze terug en boekt ze weer', async () => {
    await post(slot(), 'trainer1');
    const second = futurePt()[1];
    const paused = await post({ action: 'pauseStandingBooking', standingBookingId: sbId, from: second.date, until: second.date });
    expect(paused.body.cancelled).toBe(1);
    expect(store[`classes/${second.id}`].autoCancelled).toBe(true);
    const resumed = await post({ action: 'pauseStandingBooking', standingBookingId: sbId, from: null });
    expect(resumed.body.booked).toBe(1);
    expect(store[`classes/${second.id}`]).toMatchObject({ cancelledAt: null, bookedCount: 1 });
  });

  it('een les die de trainer zelf afgelastte komt niet terug bij het opheffen van een pauze', async () => {
    await post(slot(), 'trainer1');
    const second = futurePt()[1];
    await post({ action: 'pauseStandingBooking', standingBookingId: sbId, from: second.date, until: second.date });
    store[`classes/${second.id}`] = { ...store[`classes/${second.id}`], autoCancelled: false };
    const resumed = await post({ action: 'pauseStandingBooking', standingBookingId: sbId, from: null });
    expect(resumed.body.booked).toBe(0);
    expect(store[`classes/${second.id}`].cancelledAt).toBeTruthy();
  });

  it('weken voor de startdatum staan niet als lege les op het rooster', async () => {
    const res = await post(slot({ startDate: inDays(10) }), 'trainer1');
    const before = futurePt().filter((c) => c.date < inDays(10));
    expect(before.length).toBeGreaterThan(0);
    expect(before.every((c) => c.cancelledAt && c.autoCancelled)).toBe(true);
    expect(res.body.booked).toBe(futurePt().length - before.length);
  });

  it('stoppen meldt af en haalt het PT-moment helemaal weg', async () => {
    await post(slot(), 'trainer1');
    const res = await post({ action: 'setStandingBooking', standingBookingId: sbId, active: false }, 'trainer1');
    expect(res.statusCode).toBe(200);
    expect(res.body.cancelled).toBeGreaterThanOrEqual(7);
    expect(myActive()).toHaveLength(0);
    expect(futurePt()).toHaveLength(0);
    expect(store[`classTypes/${ctId}`]).toBeUndefined();
    expect(store[`standingBookings/${sbId}`]).toBeUndefined();
    expect(store['creditAccounts/vanas__sporter1'].balance).toBe(20);
  });
});

describe('kalenderfeed', () => {
  const token = 'a'.repeat(32);

  beforeEach(() => {
    store[`calendarFeedTokens/${hashFeedToken(token)}`] = { userId: 'sporter1' };
    store['bookings/bk1'] = { orgId: 'vanas', classId: 'c1', userId: 'sporter1', status: 'booked', creditsSpent: 1 };
  });

  it('geeft de .ics-feed terug voor een geldige sleutel', async () => {
    const res = await getFeed(token);
    expect(res.statusCode).toBe(200);
    expect(res.headers['Content-Type']).toMatch(/text\/calendar/);
    expect(res.body).toContain('BEGIN:VCALENDAR');
    expect(res.body).toContain('SUMMARY:Small Group');
  });

  it('toont alleen lessen waar dit lid zelf voor geboekt staat', async () => {
    store['classes/c2'] = {
      orgId: 'vanas', title: 'Andermans les', date: morgen(), startTime: '10:00',
      trainerId: 'trainer1', capacity: 5, creditCost: 1, bookedCount: 1, waitlistCount: 0,
    };
    store['bookings/bk2'] = { orgId: 'vanas', classId: 'c2', userId: 'sporter2', status: 'booked', creditsSpent: 1 };

    const res = await getFeed(token);
    expect(res.body).toContain('SUMMARY:Small Group');
    expect(res.body).not.toContain('Andermans les');
  });

  it('laat een les uit een andere studio niet zien, ook al staat er per ongeluk een boeking op', async () => {
    store['classes/cB'] = {
      orgId: 'studiob', title: 'Studio B les', date: morgen(), startTime: '10:00',
      trainerId: 'trainerB', capacity: 5, creditCost: 1, bookedCount: 1, waitlistCount: 0,
    };
    store['bookings/bk3'] = { orgId: 'studiob', classId: 'cB', userId: 'sporter1', status: 'booked', creditsSpent: 1 };

    const res = await getFeed(token);
    expect(res.body).not.toContain('Studio B les');
  });

  it('laat een geannuleerde boeking niet zien', async () => {
    store['bookings/bk1'].status = 'cancelled';
    const res = await getFeed(token);
    expect(res.body).not.toContain('BEGIN:VEVENT');
  });

  it('geeft 404 voor een onbekende sleutel', async () => {
    const res = await getFeed('b'.repeat(32));
    expect(res.statusCode).toBe(404);
  });

  it('geeft 404 voor een ingetrokken sleutel', async () => {
    delete store[`calendarFeedTokens/${hashFeedToken(token)}`];
    const res = await getFeed(token);
    expect(res.statusCode).toBe(404);
  });

  it('geeft 404 voor een ongeldig gevormde sleutel, zonder Firestore te raadplegen', async () => {
    const res = await getFeed('te-kort');
    expect(res.statusCode).toBe(404);
  });

  describe('trainerfeed', () => {
    const trainerToken = 't'.repeat(32);

    beforeEach(() => {
      store[`calendarFeedTokens/${hashFeedToken(trainerToken)}`] = { userId: 'trainer1', kind: 'trainer' };
    });

    it('toont lessen die de trainer zelf geeft, ongeacht boekingen', async () => {
      const res = await getFeed(trainerToken);
      expect(res.statusCode).toBe(200);
      expect(res.body).toContain('SUMMARY:Small Group');
    });

    it('toont geen lessen van een andere trainer', async () => {
      store['classes/c2'] = {
        orgId: 'vanas', title: 'Les van collega', date: morgen(), startTime: '10:00',
        trainerId: 'trainer2', capacity: 5, creditCost: 1, bookedCount: 0, waitlistCount: 0,
      };
      const res = await getFeed(trainerToken);
      expect(res.body).not.toContain('Les van collega');
    });

    it('laat een afgelaste les zien als geannuleerd i.p.v. hem te verbergen', async () => {
      store['classes/c1'].cancelledAt = '2026-09-06T10:00:00.000Z';
      const res = await getFeed(trainerToken);
      expect(res.body).toContain('SUMMARY:Small Group');
      expect(res.body).toContain('STATUS:CANCELLED');
    });

    it('geeft 404 voor een trainerfeed-token op een sporter-profiel', async () => {
      store[`calendarFeedTokens/${hashFeedToken(trainerToken)}`] = { userId: 'sporter1', kind: 'trainer' };
      const res = await getFeed(trainerToken);
      expect(res.statusCode).toBe(404);
    });

    it('werkt ook voor een admin-profiel', async () => {
      store['profiles/admin1'] = { userId: 'admin1', orgId: 'vanas', orgIds: ['vanas'], role: 'admin' };
      store['classes/c1'].trainerId = 'admin1';
      store[`calendarFeedTokens/${hashFeedToken(trainerToken)}`] = { userId: 'admin1', kind: 'trainer' };
      const res = await getFeed(trainerToken);
      expect(res.statusCode).toBe(200);
      expect(res.body).toContain('SUMMARY:Small Group');
    });
  });
});

describe('lesherinneringen (cron)', () => {
  const runReminders = async (authHeader = 'Bearer test-secret') => {
    const res = makeRes();
    await handler({ method: 'GET', headers: authHeader ? { authorization: authHeader } : {}, query: { cron: 'evening' } }, res);
    return res;
  };

  const ORIGINAL_SECRET = process.env.CRON_SECRET;
  beforeEach(() => {
    process.env.CRON_SECRET = 'test-secret';
    sentPushes = [];
    const tomorrow = amsterdamDate(new Date(), 1);
    store['classes/c1'].date = tomorrow;
    store['classes/c2'] = { orgId: 'vanas', title: 'Yoga', date: tomorrow, startTime: '18:30', capacity: 5, creditCost: 1 };
    store['bookings/b1'] = { orgId: 'vanas', classId: 'c1', userId: 'sporter1', status: 'booked' };
    store['bookings/b2'] = { orgId: 'vanas', classId: 'c1', userId: 'sporter2', status: 'waitlist' };
    store['bookings/b3'] = { orgId: 'vanas', classId: 'c2', userId: 'sporter1', status: 'booked' };
    store['pushTokens/tok_sporter1'] = { userId: 'sporter1', orgId: 'vanas', platform: 'web' };
    store['pushTokens/tok_sporter2'] = { userId: 'sporter2', orgId: 'vanas', platform: 'web' };
  });
  afterEach(() => {
    if (ORIGINAL_SECRET === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = ORIGINAL_SECRET;
  });

  it('weigert zonder het juiste geheim', async () => {
    const res = await runReminders('Bearer fout');
    expect(res.statusCode).toBe(401);
    expect(sentPushes).toHaveLength(0);
  });

  it('stuurt één melding per persoon met een plek, niet naar de wachtlijst', async () => {
    const res = await runReminders();
    expect(res.statusCode).toBe(200);
    expect(res.body.classReminders).toEqual({ people: 1, devices: 1 });
    expect(sentPushes).toHaveLength(1);
    expect(sentPushes[0].tokens).toEqual(['tok_sporter1']);
    expect(sentPushes[0].notification).toEqual({
      title: 'Morgen 2 lessen',
      body: 'Small Group 9:00 · Yoga 18:30. Kun je niet? Meld je op tijd af in de app.',
    });
    expect(store['bookings/b1'].reminderSentAt).toBeTruthy();
    expect(store['bookings/b3'].reminderSentAt).toBeTruthy();
    expect(store['bookings/b2'].reminderSentAt).toBeUndefined();
  });

  it('een tweede run op dezelfde dag stuurt niets opnieuw', async () => {
    await runReminders();
    sentPushes = [];
    const res = await runReminders();
    expect(res.body.classReminders.people).toBe(0);
    expect(sentPushes).toHaveLength(0);
  });

  it('een afgelaste les levert geen herinnering op', async () => {
    store['classes/c1'].cancelledAt = '2026-09-25T10:00:00.000Z';
    store['classes/c2'].cancelledAt = '2026-09-25T10:00:00.000Z';
    const res = await runReminders();
    expect(res.body.classReminders.people).toBe(0);
    expect(sentPushes).toHaveLength(0);
  });
});

describe('meldingen bij boeken en afmelden', () => {
  beforeEach(() => {
    sentPushes = [];
    store['pushTokens/tok_sporter1'] = { userId: 'sporter1', orgId: 'vanas' };
    store['pushTokens/tok_sporter2'] = { userId: 'sporter2', orgId: 'vanas' };
  });
  const titlesFor = (token) => sentPushes.filter((p) => p.tokens.includes(token)).map((p) => p.notification.title);

  it('staf meldt een sporter af: die krijgt "Les geannuleerd", de wachtlijst schuift door', async () => {
    const booked = await post({ action: 'book', classId: 'c1' }, 'sporter1');
    await post({ action: 'book', classId: 'c1' }, 'sporter2'); // vol → wachtlijst
    sentPushes = [];
    const res = await post({ action: 'cancel', bookingId: booked.body.bookingId }, 'trainer1');
    expect(res.statusCode).toBe(200);
    expect(res.body.notice).toBeUndefined();
    expect(titlesFor('tok_sporter1')).toEqual(['Les geannuleerd']);
    expect(titlesFor('tok_sporter2')).toEqual(['Je bent ingeschreven!']);
    expect(sentPushes.find((p) => p.tokens.includes('tok_sporter2')).notification.body).toContain('binnen een uur gratis af');
    expect(sentPushes.find((p) => p.tokens.includes('tok_sporter1')).notification.body).toContain('Je credit staat weer op je saldo.');
  });

  it('geen credits op de wachtlijst: melding aan de sporter én aan de trainer', async () => {
    const booked = await post({ action: 'book', classId: 'c1' }, 'sporter1');
    await post({ action: 'book', classId: 'c1' }, 'sporter2');
    store['creditAccounts/vanas__sporter2'].balance = 0;
    store['pushTokens/tok_trainer1'] = { userId: 'trainer1', orgId: 'vanas', platform: 'web' };
    sentPushes = [];
    await post({ action: 'cancel', bookingId: booked.body.bookingId }, 'sporter1');
    expect(titlesFor('tok_sporter2')).toEqual(['Plek vrij, maar je credits zijn op']);
    expect(titlesFor('tok_trainer1')).toEqual(['Wachtlijst: geen credits']);
  });

  it('wie zichzelf afmeldt, krijgt geen "Les geannuleerd"', async () => {
    const booked = await post({ action: 'book', classId: 'c1' }, 'sporter1');
    sentPushes = [];
    await post({ action: 'cancel', bookingId: booked.body.bookingId }, 'sporter1');
    expect(titlesFor('tok_sporter1')).toEqual([]);
  });

  it('staat de melding uit bij de studio, dan gaat hij niet', async () => {
    store['orgs/vanas'] = { name: 'Van As', notifications: { classCancelled: false, waitlistPromoted: false } };
    const booked = await post({ action: 'book', classId: 'c1' }, 'sporter1');
    await post({ action: 'book', classId: 'c1' }, 'sporter2');
    sentPushes = [];
    await post({ action: 'cancel', bookingId: booked.body.bookingId }, 'trainer1');
    expect(sentPushes).toHaveLength(0);
  });

  it('bij 1 credit over na het boeken: seintje om bij te kopen', async () => {
    store['creditAccounts/vanas__sporter1'].balance = 2;
    const res = await post({ action: 'book', classId: 'c1' }, 'sporter1');
    expect(res.body.balance).toBe(1);
    expect(titlesFor('tok_sporter1')).toEqual(['Nog 1 credit over']);
  });

  it('met genoeg credits over: geen seintje', async () => {
    await post({ action: 'book', classId: 'c1' }, 'sporter1');
    expect(titlesFor('tok_sporter1')).toEqual([]);
  });
});

describe('berichten van de studio', () => {
  const ORIGINAL_SECRET = process.env.CRON_SECRET;
  beforeEach(() => {
    sentPushes = [];
    process.env.CRON_SECRET = 'test-secret';
    store['profiles/sporter1'].orgIds = ['vanas'];
    store['pushTokens/tok_sporter1'] = { userId: 'sporter1', orgId: 'vanas' };
    store['pushTokens/tok_sporter2'] = { userId: 'sporter2', orgId: 'vanas' };
    store['pushTokens/tok_trainer1'] = { userId: 'trainer1', orgId: 'vanas' };
    store['pushTokens/tok_sporterB'] = { userId: 'sporterB', orgId: 'studiob' };
  });
  afterEach(() => {
    if (ORIGINAL_SECRET === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = ORIGINAL_SECRET;
  });
  const base = { action: 'sendBroadcast', orgId: 'vanas', title: 'Andere zaal', body: 'De les van morgen is in zaal 2.' };

  it('een sporter mag geen bericht sturen', async () => {
    const res = await post({ ...base, audience: { type: 'all' } }, 'sporter1');
    expect(res.statusCode).toBe(403);
  });

  it('naar iedereen: alle leden van de eigen studio, niet jezelf en niet een andere studio', async () => {
    const res = await post({ ...base, audience: { type: 'all' } }, 'trainer1');
    expect(res.statusCode).toBe(200);
    expect(res.body.broadcast).toMatchObject({ status: 'sent', recipients: 2, devices: 2 });
    const tokens = sentPushes.flatMap((p) => p.tokens).sort();
    expect(tokens).toEqual(['tok_sporter1', 'tok_sporter2']);
    expect(sentPushes[0].notification).toEqual({ title: 'Andere zaal', body: 'De les van morgen is in zaal 2.' });
  });

  it('naar de deelnemers van een les: ingeschreven en wachtlijst', async () => {
    await post({ action: 'book', classId: 'c1' }, 'sporter1');
    await post({ action: 'book', classId: 'c1' }, 'sporter2');
    sentPushes = [];
    const res = await post({ ...base, audience: { type: 'class', id: 'c1', label: 'Small Group' } }, 'trainer1');
    expect(res.body.broadcast.recipients).toBe(2);
  });

  it('gepland bericht gaat niet meteen, wel in de avondronde van die dag', async () => {
    const tomorrow = amsterdamDate(new Date(), 1);
    const res = await post({ ...base, audience: { type: 'member', id: 'sporter2' }, scheduledFor: tomorrow }, 'trainer1');
    expect(res.statusCode).toBe(200);
    expect(res.body.broadcast.status).toBe('scheduled');
    expect(sentPushes).toHaveLength(0);

    // Doen alsof het nu die dag is: het bericht op vandaag zetten en de avondronde draaien.
    const id = res.body.broadcast.id;
    store[`broadcasts/${id}`].scheduledFor = amsterdamDate(new Date(), 0);
    const cron = makeRes();
    await handler({ method: 'GET', headers: { authorization: 'Bearer test-secret' }, query: { cron: 'evening' } }, cron);
    expect(cron.body.broadcasts).toEqual({ sent: 1 });
    expect(sentPushes.flatMap((p) => p.tokens)).toEqual(['tok_sporter2']);
    expect(store[`broadcasts/${id}`]).toMatchObject({ status: 'sent', recipients: 1 });
  });

  it('een ingetrokken gepland bericht gaat niet meer', async () => {
    const res = await post({ ...base, audience: { type: 'all' }, scheduledFor: amsterdamDate(new Date(), 1) }, 'trainer1');
    const id = res.body.broadcast.id;
    const cancel = await post({ action: 'cancelBroadcast', broadcastId: id }, 'trainer1');
    expect(cancel.statusCode).toBe(200);
    store[`broadcasts/${id}`].scheduledFor = amsterdamDate(new Date(), 0);
    const cron = makeRes();
    await handler({ method: 'GET', headers: { authorization: 'Bearer test-secret' }, query: { cron: 'evening' } }, cron);
    expect(cron.body.broadcasts).toEqual({ sent: 0 });
    expect(sentPushes).toHaveLength(0);
  });

  it('een datum van vandaag of eerder wordt geweigerd', async () => {
    const res = await post({ ...base, audience: { type: 'all' }, scheduledFor: amsterdamDate(new Date(), 0) }, 'trainer1');
    expect(res.statusCode).toBe(400);
  });

  it('de lijst toont alleen berichten van de eigen studio, nieuwste eerst', async () => {
    store['broadcasts/oud'] = { orgId: 'vanas', title: 'Oud', createdAt: '2026-01-01T00:00:00.000Z', status: 'sent' };
    store['broadcasts/ander'] = { orgId: 'studiob', title: 'Andere studio', createdAt: '2026-09-01T00:00:00.000Z', status: 'sent' };
    await post({ ...base, audience: { type: 'all' } }, 'trainer1');
    const res = await post({ action: 'listBroadcasts', orgId: 'vanas' }, 'trainer1');
    expect(res.body.broadcasts.map((b) => b.title)).toEqual(['Andere zaal', 'Oud']);
  });
});

describe('naam van de trainer voor sporters', () => {
  beforeEach(() => {
    store['profiles/trainer1'] = { ...store['profiles/trainer1'], displayName: 'Jesse', email: 'jesse@x.nl' };
    store['profiles/admin1'] = { userId: 'admin1', orgIds: ['vanas'], role: 'admin', email: 'zonder-naam@x.nl' };
    store['profiles/trainerB'] = { userId: 'trainerB', orgIds: ['studiob'], role: 'trainer', displayName: 'Bo' };
  });

  it('geeft een sporter geen namen zolang de studio het niet aan heeft', async () => {
    store['orgs/vanas'] = { name: 'Van As' };
    const res = await post({ action: 'trainerNames', orgId: 'vanas' });
    expect(res.statusCode).toBe(200);
    expect(res.body.names).toEqual({});
  });

  it('geeft alleen namen van trainers van de eigen studio, nooit een e-mailadres', async () => {
    store['orgs/vanas'] = { name: 'Van As', showTrainerNames: true };
    const res = await post({ action: 'trainerNames', orgId: 'vanas' });
    expect(res.body.names).toEqual({ trainer1: 'Jesse' });
  });

  it('staf ziet de namen altijd; een andere studio vragen mag niet', async () => {
    store['orgs/vanas'] = { name: 'Van As' };
    expect((await post({ action: 'trainerNames', orgId: 'vanas' }, 'trainer1')).body.names).toEqual({ trainer1: 'Jesse' });
    expect((await post({ action: 'trainerNames', orgId: 'studiob' })).statusCode).toBe(403);
  });
});

describe('hele les afgelasten', () => {
  const soon = () => amsterdamWallClock(new Date(Date.now() + 2 * 3_600_000));

  it('meldt iedereen af, geeft de credit terug (ook kort van tevoren) en schuift niemand door', async () => {
    store['classes/c1'] = { ...store['classes/c1'], ...soon() };
    await post({ action: 'book', classId: 'c1' }, 'sporter1');
    await post({ action: 'book', classId: 'c1' }, 'sporter2');
    expect(store['creditAccounts/vanas__sporter1'].balance).toBe(2);

    const res = await post({ action: 'cancelClass', classId: 'c1' }, 'trainer1');
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ cancelled: 2, refunded: 1, failed: 0 });

    const bookings = Object.entries(store).filter(([k]) => k.startsWith('bookings/')).map(([, v]) => v);
    expect(bookings.every((b) => b.status === 'cancelled')).toBe(true);
    expect(store['creditAccounts/vanas__sporter1'].balance).toBe(3);
    expect(store['creditAccounts/vanas__sporter2'].balance).toBe(3);
    expect(store['classes/c1']).toMatchObject({ bookedCount: 0, waitlistCount: 0, autoCancelled: false });
    expect(store['classes/c1'].cancelledAt).toBeTruthy();
  });

  it('mag alleen door staf, en alleen in de eigen studio', async () => {
    expect((await post({ action: 'cancelClass', classId: 'c1' }, 'sporter1')).statusCode).toBe(403);
    store['profiles/trainerB'] = { userId: 'trainerB', orgId: 'studiob', orgIds: ['studiob'], role: 'trainer' };
    expect((await post({ action: 'cancelClass', classId: 'c1' }, 'trainerB')).statusCode).toBe(403);
    expect(store['classes/c1'].cancelledAt).toBeUndefined();
  });
});

describe('trainer meldt één sporter af, binnen de afmeldtermijn', () => {
  const lateBooking = async () => {
    store['classes/c1'] = { ...store['classes/c1'], ...amsterdamWallClock(new Date(Date.now() + 2 * 3_600_000)) };
    const booked = await post({ action: 'book', classId: 'c1' }, 'sporter1');
    // Buiten de bedenktijd van een uur na het boeken.
    const key = `bookings/${booked.body.bookingId}`;
    store[key] = { ...store[key], createdAt: new Date(Date.now() - 3 * 3_600_000).toISOString() };
    return booked.body.bookingId;
  };

  it('standaard vervalt de credit, net als wanneer de sporter het zelf doet', async () => {
    const id = await lateBooking();
    const res = await post({ action: 'cancel', bookingId: id }, 'trainer1');
    expect(res.body.refunded).toBe(false);
    expect(store['creditAccounts/vanas__sporter1'].balance).toBe(2);
  });

  it('met "credit terug bij afmelden door de studio" aan krijgt de sporter hem terug', async () => {
    store['orgs/vanas'] = { name: 'Van As', studioCancelRefund: true };
    const id = await lateBooking();
    const res = await post({ action: 'cancel', bookingId: id }, 'trainer1');
    expect(res.body.refunded).toBe(true);
    expect(store['creditAccounts/vanas__sporter1'].balance).toBe(3);
  });

  it('de instelling geldt niet als de sporter zichzelf afmeldt', async () => {
    store['orgs/vanas'] = { name: 'Van As', studioCancelRefund: true };
    const id = await lateBooking();
    const res = await post({ action: 'cancel', bookingId: id }, 'sporter1');
    expect(res.body.refunded).toBe(false);
  });
});

describe('leden (de)activeren', () => {
  beforeEach(() => {
    store['profiles/admin1'] = { userId: 'admin1', orgId: 'vanas', orgIds: ['vanas'], role: 'admin' };
    store['standingBookings/sb1'] = { orgId: 'vanas', userId: 'sporter1', classTypeId: 'ct1', weekday: 2, startTime: '09:00', active: true };
  });

  it('alleen een beheerder', async () => {
    const res = await post({ action: 'setMemberActive', userId: 'sporter1', active: false }, 'trainer1');
    expect(res.statusCode).toBe(403);
  });

  it('deactiveren: status per studio, reservering afgemeld, vaste les uit', async () => {
    await post({ action: 'book', classId: 'c1' }, 'sporter1');
    const res = await post({ action: 'setMemberActive', userId: 'sporter1', active: false }, 'admin1');
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ active: false, bookingsCancelled: 1, standingPaused: 1 });
    expect(store['profiles/sporter1'].inactiveOrgs).toEqual(['vanas']);
    expect(store['standingBookings/sb1']).toMatchObject({ active: false, pausedByInactive: true });
    expect(store['classes/c1'].bookedCount).toBe(0);
  });

  it('inactief lid kan niet boeken, en staf kan het er ook niet bij zetten', async () => {
    await post({ action: 'setMemberActive', userId: 'sporter1', active: false }, 'admin1');
    expect((await post({ action: 'book', classId: 'c1' }, 'sporter1')).statusCode).toBe(403);
    expect((await post({ action: 'book', classId: 'c1', userId: 'sporter1' }, 'trainer1')).statusCode).toBe(409);
  });

  it('activeren: weer boeken, en de vaste les staat weer aan', async () => {
    await post({ action: 'setMemberActive', userId: 'sporter1', active: false }, 'admin1');
    const res = await post({ action: 'setMemberActive', userId: 'sporter1', active: true }, 'admin1');
    expect(res.body).toMatchObject({ active: true, standingRestored: 1 });
    expect(store['profiles/sporter1'].inactiveOrgs).toEqual([]);
    expect(store['standingBookings/sb1'].active).toBe(true);
    expect(store['standingBookings/sb1'].pausedByInactive).toBeUndefined();
    expect((await post({ action: 'book', classId: 'c1' }, 'sporter1')).body.status).toBe('booked');
  });

  it('een lid van een andere studio kan een beheerder niet (de)activeren', async () => {
    const res = await post({ action: 'setMemberActive', userId: 'sporterB', active: false }, 'admin1');
    expect(res.statusCode).toBe(404);
    expect(store['profiles/sporterB'].inactiveOrgs).toBeUndefined();
  });
});

describe('staf traint ook mee als lid', () => {
  beforeEach(() => {
    store['profiles/admin1'] = { userId: 'admin1', orgId: 'vanas', orgIds: ['vanas'], role: 'admin' };
  });

  it('alleen een beheerder zet het aan', async () => {
    const res = await post({ action: 'setTrainsAsMember', userId: 'trainer1', on: true }, 'trainer1');
    expect(res.statusCode).toBe(403);
    expect(store['profiles/trainer1'].trainsAsMemberOrgs).toBeUndefined();
  });

  it('niet voor een sporter (die traint altijd als lid)', async () => {
    const res = await post({ action: 'setTrainsAsMember', userId: 'sporter1', on: true }, 'admin1');
    expect(res.statusCode).toBe(409);
  });

  it('niet voor iemand van een andere studio', async () => {
    store['profiles/trainerB'] = { userId: 'trainerB', orgId: 'studiob', orgIds: ['studiob'], role: 'trainer' };
    const res = await post({ action: 'setTrainsAsMember', userId: 'trainerB', on: true }, 'admin1');
    expect(res.statusCode).toBe(404);
  });

  it('aan: boeken kost een credit, zonder credits lukt het niet', async () => {
    await post({ action: 'setTrainsAsMember', userId: 'trainer1', on: true }, 'admin1');
    expect(store['profiles/trainer1'].trainsAsMemberOrgs).toEqual(['vanas']);
    const zonder = await post({ action: 'book', classId: 'c1' }, 'trainer1');
    expect(zonder.statusCode).toBe(409);
    store['creditAccounts/vanas__trainer1'] = { orgId: 'vanas', userId: 'trainer1', balance: 2 };
    const res = await post({ action: 'book', classId: 'c1' }, 'trainer1');
    expect(res.body.status).toBe('booked');
    expect(store['creditAccounts/vanas__trainer1'].balance).toBe(1);
  });

  it('beheerder zet een meetrainende trainer erbij: diens credit gaat eraf', async () => {
    store['profiles/trainer1'].trainsAsMemberOrgs = ['vanas'];
    store['creditAccounts/vanas__trainer1'] = { orgId: 'vanas', userId: 'trainer1', balance: 2 };
    const res = await post({ action: 'book', classId: 'c1', userId: 'trainer1' }, 'admin1');
    expect(res.body.status).toBe('booked');
    expect(store['creditAccounts/vanas__trainer1'].balance).toBe(1);
  });

  it('beheerder die zelf meetraint betaalt ook, terwijl een andere trainer gratis blijft', async () => {
    store['profiles/admin1'].trainsAsMemberOrgs = ['vanas'];
    store['creditAccounts/vanas__admin1'] = { orgId: 'vanas', userId: 'admin1', balance: 1 };
    store['classes/c1'].capacity = 2;
    await post({ action: 'book', classId: 'c1' }, 'admin1');
    await post({ action: 'book', classId: 'c1' }, 'trainer1');
    expect(store['creditAccounts/vanas__admin1'].balance).toBe(0);
    expect(store['creditAccounts/vanas__trainer1']).toBeUndefined();
  });

  it('op de wachtlijst doorschuiven kost een meetrainende trainer een credit', async () => {
    store['profiles/trainer1'].trainsAsMemberOrgs = ['vanas'];
    store['creditAccounts/vanas__trainer1'] = { orgId: 'vanas', userId: 'trainer1', balance: 2 };
    const eerste = await post({ action: 'book', classId: 'c1' }, 'sporter1');
    await post({ action: 'book', classId: 'c1' }, 'trainer1');
    const res = await post({ action: 'cancel', bookingId: eerste.body.bookingId }, 'sporter1');
    expect(res.body.promotedUserId).toBe('trainer1');
    const trainerBooking = Object.values(store).find((v) => v.classId === 'c1' && v.userId === 'trainer1' && v.status);
    expect(trainerBooking.creditsSpent).toBe(1);
  });

  it('uitzetten kan pas als het abonnement gestopt is', async () => {
    store['profiles/trainer1'].trainsAsMemberOrgs = ['vanas'];
    store['memberships/mb1'] = { orgId: 'vanas', userId: 'trainer1', planId: 'p1', status: 'active' };
    const res = await post({ action: 'setTrainsAsMember', userId: 'trainer1', on: false }, 'admin1');
    expect(res.statusCode).toBe(409);
    expect(store['profiles/trainer1'].trainsAsMemberOrgs).toEqual(['vanas']);
    store['memberships/mb1'].status = 'cancelled';
    const ok = await post({ action: 'setTrainsAsMember', userId: 'trainer1', on: false }, 'admin1');
    expect(ok.body.trainsAsMember).toBe(false);
    expect(store['profiles/trainer1'].trainsAsMemberOrgs).toEqual([]);
  });
});

describe('groepen', () => {
  const seed = () => {
    store['profiles/admin1'] = { userId: 'admin1', orgId: 'vanas', orgIds: ['vanas'], role: 'admin' };
    store['plans/plG'] = { orgId: 'vanas', name: 'Pouw 4 weken', period: 'fourWeeks', price: 771, credits: null, rollover: 'expire', vatRate: 9, availableTo: 'invite' };
    store['orgs/vanas'] = { name: 'Van As', business: { invoicePrefix: 'VAS-2026-', nextInvoiceNumber: 10 } };
  };
  const makeGroup = async (extra = {}) =>
    post({ action: 'saveGroup', name: 'Pouw', kind: 'gezin', memberIds: ['sporter1', 'sporter2'], payerId: 'sporter1', ...extra }, 'trainer1');

  it('alleen staf beheert groepen', async () => {
    seed();
    const res = await post({ action: 'saveGroup', name: 'Pouw', memberIds: ['sporter1'], payerId: 'sporter1' }, 'sporter1');
    expect(res.statusCode).toBe(403);
  });

  it('groep opslaan: leden van de studio, hoofdprofiel moet erin zitten', async () => {
    seed();
    const res = await makeGroup();
    expect(res.statusCode).toBe(200);
    const g = res.body.group;
    expect(store[`groups/${g.id}`]).toMatchObject({ orgId: 'vanas', name: 'Pouw', kind: 'gezin', memberIds: ['sporter1', 'sporter2'], payerId: 'sporter1' });
    expect((await makeGroup({ payerId: 'sporterB' })).statusCode).toBe(400);
    expect((await makeGroup({ memberIds: ['sporter1', 'sporterB'] })).statusCode).toBe(403);
    store['profiles/sporter2'].inactiveOrgs = ['vanas'];
    expect((await makeGroup()).statusCode).toBe(409);
  });

  it('groepsabonnement: prijs als tegoed in euro\'s op de groep, post naar het hoofdprofiel', async () => {
    seed();
    const g = (await makeGroup()).body.group;
    const res = await post({ action: 'assign', groupId: g.id, planId: 'plG' }, 'trainer1');
    expect(res.statusCode).toBe(200);
    expect(res.body.balance).toBe(771);
    expect(store[`creditAccounts/vanas__grp_${g.id}`]).toMatchObject({ userId: `grp_${g.id}`, groupId: g.id, unit: 'eur', balance: 771, memberIds: ['sporter1', 'sporter2'] });
    const membership = Object.entries(store).find(([k, v]) => k.startsWith('memberships/') && v.groupId === g.id)[1];
    expect(membership).toMatchObject({ userId: `grp_${g.id}`, billToUserId: 'sporter1', status: 'active' });
    const charge = Object.entries(store).find(([k]) => k.startsWith('charges/'))[1];
    expect(charge).toMatchObject({ userId: 'sporter1', groupId: g.id, amount: 771, invoiceNumber: 'VAS-2026-0010' });
    // Geen persoonlijke credits voor het hoofdprofiel.
    expect(store['creditAccounts/vanas__sporter1'].balance).toBe(3);
  });

  it('ander hoofdprofiel: de volgende factuur gaat naar die persoon', async () => {
    seed();
    const g = (await makeGroup()).body.group;
    await post({ action: 'assign', groupId: g.id, planId: 'plG' }, 'trainer1');
    await makeGroup({ groupId: g.id, payerId: 'sporter2' });
    const membership = Object.entries(store).find(([k, v]) => k.startsWith('memberships/') && v.groupId === g.id)[1];
    expect(membership.billToUserId).toBe('sporter2');
  });

  it('verlenging: tegoed komt erbij (restant blijft), post naar het hoofdprofiel', async () => {
    seed();
    const g = (await makeGroup()).body.group;
    await post({ action: 'assign', groupId: g.id, planId: 'plG' }, 'trainer1');
    const [key] = Object.entries(store).find(([k, v]) => k.startsWith('memberships/') && v.groupId === g.id);
    store[key].nextRenewalAt = new Date(Date.now() - 1000).toISOString();
    store[`creditAccounts/vanas__grp_${g.id}`].balance = 50;
    const res = await post({ action: 'renewDue', orgId: 'vanas' }, 'trainer1');
    expect(res.body.steps).toBe(1);
    expect(store[`creditAccounts/vanas__grp_${g.id}`].balance).toBe(821);
    const charges = Object.entries(store).filter(([k]) => k.startsWith('charges/')).map(([, v]) => v);
    expect(charges).toHaveLength(2);
    expect(charges.every((c) => c.userId === 'sporter1' && c.groupId === g.id)).toBe(true);
  });

  it('groepstegoed bijstellen in euro\'s, niet onder nul', async () => {
    seed();
    const g = (await makeGroup()).body.group;
    const plus = await post({ action: 'grant', groupId: g.id, amount: 12.5 }, 'trainer1');
    expect(plus.body.balance).toBe(12.5);
    expect((await post({ action: 'grant', groupId: g.id, amount: -20 }, 'trainer1')).statusCode).toBe(409);
    const min = await post({ action: 'grant', groupId: g.id, amount: -2.25 }, 'trainer1');
    expect(min.body.balance).toBe(10.25);
  });

  it('een groep van een andere studio is onbereikbaar', async () => {
    seed();
    store['groups/gB'] = { id: 'gB', orgId: 'studiob', name: 'B', memberIds: ['sporterB'], payerId: 'sporterB' };
    expect((await post({ action: 'grant', groupId: 'gB', amount: 10 }, 'trainer1')).statusCode).toBe(404);
    expect((await post({ action: 'assign', groupId: 'gB', planId: 'plG' }, 'trainer1')).statusCode).toBe(404);
    expect((await post({ action: 'deleteGroup', groupId: 'gB' }, 'trainer1')).statusCode).toBe(404);
  });

  it('verwijderen pas zonder abonnement en zonder tegoed', async () => {
    seed();
    const g = (await makeGroup()).body.group;
    await post({ action: 'assign', groupId: g.id, planId: 'plG' }, 'trainer1');
    expect((await post({ action: 'deleteGroup', groupId: g.id }, 'trainer1')).statusCode).toBe(409);
    await post({ action: 'unassign', groupId: g.id }, 'trainer1');
    expect((await post({ action: 'deleteGroup', groupId: g.id }, 'trainer1')).statusCode).toBe(409);
    await post({ action: 'grant', groupId: g.id, amount: -771 }, 'trainer1');
    const res = await post({ action: 'deleteGroup', groupId: g.id }, 'trainer1');
    expect(res.body.deleted).toBe(true);
    expect(store[`groups/${g.id}`]).toBeUndefined();
  });
});

describe('vaste groepslessen (betaald uit het groepstegoed, naar opkomst)', () => {
  const inDays = (n) => {
    const d = new Date(Date.now() + n * 86_400_000);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const first = inDays(3);
  const weekday = new Date(`${first}T12:00:00`).getDay();
  let groupId;
  const holder = () => `creditAccounts/vanas__grp_${groupId}`;
  const ctId = () => `ctp_grp_${groupId}_${weekday}_1800`;
  const lessons = () =>
    Object.entries(store)
      .filter(([k, v]) => k.startsWith('classes/') && v.classTypeId === ctId() && v.date >= first)
      .map(([k, v]) => ({ ...v, id: k.slice('classes/'.length) }))
      .sort((a, b) => a.date.localeCompare(b.date));
  const bookingOf = (userId, classId) =>
    Object.entries(store).find(([k, v]) => k.startsWith('bookings/') && v.userId === userId && v.classId === classId && ['booked', 'waitlist'].includes(v.status));

  beforeEach(async () => {
    store['profiles/sporter4'] = { userId: 'sporter4', orgId: 'vanas', orgIds: ['vanas'], role: 'sporter' };
    store['classTypes/ctPT'] = { orgId: 'vanas', name: 'Personal training', capacity: 1, creditCost: 1, defaultTrainerId: 'trainer1', sessionKind: '1on1', schedule: [] };
    const g = await post({ action: 'saveGroup', name: 'Pouw', kind: 'gezin', memberIds: ['sporter1', 'sporter2', 'sporter4'], payerId: 'sporter1' }, 'trainer1');
    groupId = g.body.group.id;
    await post({ action: 'grant', groupId, amount: 5000 }, 'trainer1');
    const res = await post({ action: 'addPersonalSlot', groupId, baseClassTypeId: 'ctPT', weekday, startTime: '18:00', endTime: '19:00', startDate: first }, 'trainer1');
    expect(res.statusCode).toBe(200);
  });

  it('inplannen: alle leden elke week geboekt, €85 + €25 per extra persoon van het groepstegoed', () => {
    expect(store[`classTypes/${ctId()}`]).toMatchObject({ privateForGroup: groupId, privateFor: null, capacity: 3, groupMemberIds: ['sporter1', 'sporter2', 'sporter4'] });
    const list = lessons();
    expect(list.length).toBeGreaterThanOrEqual(7);
    expect(list.every((c) => c.bookedCount === 3 && c.groupSpent === 135)).toBe(true);
    expect(store[holder()].balance).toBe(5000 - 135 * list.length);
    // Het lid zelf betaalt niets.
    expect(store['creditAccounts/vanas__sporter1'].balance).toBe(3);
  });

  it('iemand buiten de groep kan de groepsles niet boeken', async () => {
    store['profiles/sporter5'] = { userId: 'sporter5', orgId: 'vanas', orgIds: ['vanas'], role: 'sporter' };
    const res = await post({ action: 'book', classId: lessons()[0].id }, 'sporter5');
    expect(res.statusCode).toBe(409);
    expect(res.body.error).toMatch(/groep/);
  });

  it('op tijd afmelden: de les wordt €25 goedkoper, dat komt terug op het groepstegoed', async () => {
    const cls = lessons()[0];
    const before = store[holder()].balance;
    const [key] = bookingOf('sporter2', cls.id);
    const res = await post({ action: 'cancel', bookingId: key.slice('bookings/'.length) }, 'sporter2');
    expect(res.body.refunded).toBe(true);
    expect(store[holder()].balance).toBe(before + 25);
    expect(store[`classes/${cls.id}`]).toMatchObject({ groupSpent: 110, groupPaidIds: ['sporter1', 'sporter4'] });
  });

  it('te laat afmelden: de groep betaalt die plek; toch komen kost niets extra', async () => {
    store['orgs/vanas'] = { ...(store['orgs/vanas'] ?? {}), bookingPolicy: { freeCancelHours: 24 * 30 } };
    const cls = lessons()[0];
    const [key] = bookingOf('sporter2', cls.id);
    store[key].createdAt = new Date(Date.now() - 2 * 86_400_000).toISOString();
    const before = store[holder()].balance;
    await post({ action: 'cancel', bookingId: key.slice('bookings/'.length) }, 'sporter2');
    expect(store[holder()].balance).toBe(before);
    expect(store[`classes/${cls.id}`].groupSpent).toBe(135);
    const again = await post({ action: 'book', classId: cls.id }, 'sporter2');
    expect(again.statusCode).toBe(200);
    expect(store[holder()].balance).toBe(before);
  });

  it('laatste afmelding op tijd: alles terug en de les gaat van het rooster', async () => {
    const cls = lessons()[0];
    const before = store[holder()].balance;
    for (const uid of ['sporter1', 'sporter2', 'sporter4']) {
      const [key] = bookingOf(uid, cls.id);
      await post({ action: 'cancel', bookingId: key.slice('bookings/'.length) }, uid);
    }
    expect(store[holder()].balance).toBe(before + 135);
    expect(store[`classes/${cls.id}`]).toMatchObject({ groupSpent: 0, autoCancelled: true });
  });

  it('studio gelast de les af: de groep krijgt alles terug', async () => {
    const cls = lessons()[0];
    const before = store[holder()].balance;
    const res = await post({ action: 'cancelClass', classId: cls.id }, 'trainer1');
    expect(res.statusCode).toBe(200);
    expect(store[holder()].balance).toBe(before + 135);
    expect(store[`classes/${cls.id}`].groupSpent).toBe(0);
  });

  it('lid uit de groep: afgemeld en de lessen worden goedkoper; groep verwijderen pas zonder vaste les', async () => {
    const cls = lessons()[0];
    await post({ action: 'saveGroup', groupId, name: 'Pouw', kind: 'gezin', memberIds: ['sporter1', 'sporter2'], payerId: 'sporter1' }, 'trainer1');
    expect(bookingOf('sporter4', cls.id)).toBeUndefined();
    expect(store[`classes/${cls.id}`]).toMatchObject({ groupSpent: 110, capacity: 2, groupMemberIds: ['sporter1', 'sporter2'] });
    expect((await post({ action: 'deleteGroup', groupId }, 'trainer1')).statusCode).toBe(409);
  });

  it('vaste groepsles stoppen: komende lessen afgelast, groepstegoed weer vol', async () => {
    const res = await post({ action: 'removeGroupSlot', classTypeId: ctId() }, 'trainer1');
    expect(res.statusCode).toBe(200);
    expect(store[holder()].balance).toBe(5000);
    expect(store[`classTypes/${ctId()}`]).toBeUndefined();
    expect(Object.values(store).some((v) => v.classTypeId === ctId() && v.userId && !['cancelled'].includes(v.status) && v.orgId)).toBe(false);
  });
});

describe('verzetten na afmelden (PT-moment)', () => {
  const D = amsterdamDate(new Date(), 3);
  const allWeek = Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((d) => [String(d), [{ from: '16:00', to: '21:00' }]]));

  beforeEach(() => {
    store['classes/pt1'] = {
      orgId: 'vanas', title: 'Personal Training', date: D, startTime: '18:00', endTime: '19:00', room: 'Zaal 1',
      trainerId: 'trainer1', capacity: 1, creditCost: 1, bookedCount: 0, waitlistCount: 0, privateFor: 'sporter1', classTypeId: 'ctp_x',
    };
    store['classes/other'] = {
      orgId: 'vanas', title: 'Small Group', date: D, startTime: '19:00', endTime: '20:00', room: 'Zaal 2',
      trainerId: 'trainer1', capacity: 6, creditCost: 1, bookedCount: 0, waitlistCount: 0,
    };
    store['trainerAvailability/vanas__trainer1'] = { orgId: 'vanas', userId: 'trainer1', days: allWeek };
  });

  const cancelPt = async () => {
    const booked = await post({ action: 'book', classId: 'pt1' });
    return post({ action: 'cancel', bookingId: booked.body.bookingId });
  };

  it('op tijd afgemeld: credit terug en de app mag een ander moment aanbieden', async () => {
    const res = await cancelPt();
    expect(res.body.refunded).toBe(true);
    expect(res.body.reschedule).toEqual({ classId: 'pt1', userId: 'sporter1' });
  });

  it('een groepsles afmelden biedt geen verzetten aan', async () => {
    const booked = await post({ action: 'book', classId: 'c1' });
    const res = await post({ action: 'cancel', bookingId: booked.body.bookingId });
    expect(res.body.reschedule).toBeNull();
  });

  it('opties: binnen de beschikbaarheid, aansluitend op een andere les eerst, niet het afgemelde moment', async () => {
    await cancelPt();
    const res = await post({ action: 'rescheduleOptions', classId: 'pt1' });
    expect(res.statusCode).toBe(200);
    expect(res.body.adjacent).toEqual([{ date: D, startTime: '20:00', endTime: '21:00', adjacent: true }]);
    const day = res.body.days.find((d) => d.date === D);
    expect(day.times.map((t) => t.startTime)).toEqual(['16:00', '16:30', '17:00', '17:30', '20:00']);
    // Een ander lid mag de opties van deze les niet opvragen.
    expect((await post({ action: 'rescheduleOptions', classId: 'pt1' }, 'sporter2')).statusCode).toBe(403);
  });

  it('sporter vraagt aan, trainer keurt goed: nieuwe les, ingeschreven, credit eraf', async () => {
    await cancelPt();
    expect(store['creditAccounts/vanas__sporter1'].balance).toBe(3);
    const req = await post({ action: 'requestReschedule', classId: 'pt1', date: D, startTime: '20:00' });
    expect(req.body).toMatchObject({ requestId: 'rr_pt1', status: 'pending' });
    expect(store['rescheduleRequests/rr_pt1']).toMatchObject({ userId: 'sporter1', trainerId: 'trainer1', date: D, startTime: '20:00', endTime: '21:00' });
    // Nog een keer aanvragen gaat niet zolang dit verzoek loopt.
    expect((await post({ action: 'requestReschedule', classId: 'pt1', date: D, startTime: '17:00' })).statusCode).toBe(409);
    // Het aangevraagde moment is voor anderen bij deze trainer niet meer vrij.
    const opts = await post({ action: 'rescheduleOptions', classId: 'pt1' });
    expect(opts.body.days.find((d) => d.date === D).times.map((t) => t.startTime)).not.toContain('20:00');

    // De sporter ziet zijn verzoek; de trainer ziet het openstaande verzoek met naam.
    const mine = await post({ action: 'rescheduleRequests' });
    expect(mine.body.requests.map((r) => r.status)).toEqual(['pending']);
    expect((await post({ action: 'answerReschedule', requestId: 'rr_pt1', approve: true })).statusCode).toBe(403);

    const ok = await post({ action: 'answerReschedule', requestId: 'rr_pt1', approve: true }, 'trainer1');
    expect(ok.statusCode).toBe(200);
    const cls = store['classes/cls_rs_rr_pt1'];
    expect(cls).toMatchObject({ date: D, startTime: '20:00', endTime: '21:00', privateFor: 'sporter1', trainerId: 'trainer1', bookedCount: 1, rescheduledFrom: 'pt1' });
    expect(store['creditAccounts/vanas__sporter1'].balance).toBe(2);
    expect(store['rescheduleRequests/rr_pt1'].status).toBe('approved');
    expect((await post({ action: 'answerReschedule', requestId: 'rr_pt1', approve: false }, 'trainer1')).statusCode).toBe(409);
  });

  it('trainer wijst af: de sporter kan daarna een ander moment aanvragen', async () => {
    await cancelPt();
    await post({ action: 'requestReschedule', classId: 'pt1', date: D, startTime: '20:00' });
    const no = await post({ action: 'answerReschedule', requestId: 'rr_pt1', approve: false }, 'trainer1');
    expect(no.body.status).toBe('declined');
    expect(store['creditAccounts/vanas__sporter1'].balance).toBe(3);
    const again = await post({ action: 'requestReschedule', classId: 'pt1', date: D, startTime: '17:00' });
    expect(again.body.status).toBe('pending');
  });

  it('staf plant meteen in, zonder goedkeuring', async () => {
    await cancelPt();
    const res = await post({ action: 'requestReschedule', classId: 'pt1', date: D, startTime: '16:00' }, 'trainer1');
    expect(res.body).toMatchObject({ status: 'approved', classId: 'cls_rs_rr_pt1' });
    expect(store['classes/cls_rs_rr_pt1'].bookedCount).toBe(1);
    expect(store['creditAccounts/vanas__sporter1'].balance).toBe(2);
  });

  it('weigert een moment dat niet wordt aangeboden, of zolang je nog ingeschreven staat', async () => {
    const booked = await post({ action: 'book', classId: 'pt1' });
    expect((await post({ action: 'requestReschedule', classId: 'pt1', date: D, startTime: '20:00' })).statusCode).toBe(409);
    await post({ action: 'cancel', bookingId: booked.body.bookingId });
    expect((await post({ action: 'requestReschedule', classId: 'pt1', date: D, startTime: '19:00' })).statusCode).toBe(409);
    expect((await post({ action: 'requestReschedule', classId: 'pt1', date: D, startTime: '09:00' })).statusCode).toBe(409);
  });
});

describe('losse PT-afspraak (niet herhaald)', () => {
  const D = amsterdamDate(new Date(), 3);
  const LATER = amsterdamDate(new Date(), 20);
  const allWeek = Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((d) => [String(d), [{ from: '16:00', to: '21:00' }]]));
  const idFor = (user, date, time) => `r1_${user}_${date.replaceAll('-', '')}_${time.replace(':', '')}`;

  beforeEach(() => {
    store['profiles/sporter1'].trainerId = 'trainer1';
    store['classes/other'] = {
      orgId: 'vanas', title: 'Small Group', date: D, startTime: '19:00', endTime: '20:00', room: 'Zaal 2',
      trainerId: 'trainer1', capacity: 6, creditCost: 1, bookedCount: 0, waitlistCount: 0,
    };
    store['trainerAvailability/vanas__trainer1'] = { orgId: 'vanas', userId: 'trainer1', days: allWeek };
  });

  it('opties: vrije tijden bij de eigen trainer, ook verder dan twee weken vooruit', async () => {
    const res = await post({ action: 'singlePtOptions', duration: 60 });
    expect(res.statusCode).toBe(200);
    expect(res.body.trainerId).toBe('trainer1');
    expect(res.body.days.find((d) => d.date === D).times.map((t) => t.startTime)).toEqual(['16:00', '16:30', '17:00', '17:30', '18:00', '20:00']);
    expect(res.body.days.some((d) => d.date === LATER)).toBe(true);
  });

  it('sporter vraagt aan, trainer keurt goed: les aangemaakt, ingeschreven, credit eraf', async () => {
    const before = store['creditAccounts/vanas__sporter1'].balance;
    const req = await post({ action: 'bookSinglePt', duration: 60, date: LATER, startTime: '17:00' });
    expect(req.body).toMatchObject({ requestId: idFor('sporter1', LATER, '17:00'), status: 'pending' });
    expect(store[`rescheduleRequests/${idFor('sporter1', LATER, '17:00')}`]).toMatchObject({ kind: 'single', userId: 'sporter1', trainerId: 'trainer1', endTime: '18:00' });
    expect((await post({ action: 'bookSinglePt', duration: 60, date: LATER, startTime: '17:00' })).statusCode).toBe(409);
    const list = await post({ action: 'rescheduleRequests' }, 'trainer1');
    expect(list.body.requests.find((r) => r.id === idFor('sporter1', LATER, '17:00')).kind).toBe('single');

    const ok = await post({ action: 'answerReschedule', requestId: idFor('sporter1', LATER, '17:00'), approve: true }, 'trainer1');
    expect(ok.statusCode).toBe(200);
    expect(store[`classes/cls_rs_${idFor('sporter1', LATER, '17:00')}`]).toMatchObject({
      date: LATER, startTime: '17:00', endTime: '18:00', privateFor: 'sporter1', trainerId: 'trainer1', bookedCount: 1, rescheduledFrom: null,
    });
    expect(store['creditAccounts/vanas__sporter1'].balance).toBe(before - 1);
  });

  it('staf plant meteen in voor een lid, bij de gekozen trainer', async () => {
    const res = await post({ action: 'bookSinglePt', userId: 'sporter1', trainerId: 'trainer1', duration: 60, date: D, startTime: '20:00' }, 'trainer1');
    expect(res.body).toMatchObject({ status: 'approved' });
    expect(store[`classes/${res.body.classId}`]).toMatchObject({ date: D, startTime: '20:00', bookedCount: 1, privateFor: 'sporter1' });
  });

  it('weigert een bezet moment, een sporter zonder trainer, en boekt nooit voor een ander lid', async () => {
    expect((await post({ action: 'bookSinglePt', duration: 60, date: D, startTime: '19:00' })).statusCode).toBe(409);
    const own = await post({ action: 'bookSinglePt', userId: 'sporter2', duration: 60, date: D, startTime: '16:00' });
    expect(own.body.requestId).toBe(idFor('sporter1', D, '16:00'));
    delete store['profiles/sporter1'].trainerId;
    expect((await post({ action: 'bookSinglePt', duration: 60, date: D, startTime: '17:00' })).statusCode).toBe(409);
  });
});

describe('abonnement bepaalt wat je vast inplant', () => {
  const allWeek = Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((d) => [String(d), [{ from: '16:00', to: '21:00' }]]));
  beforeEach(() => {
    store['profiles/sporter1'].trainerId = 'trainer1';
    store['trainerAvailability/vanas__trainer1'] = { orgId: 'vanas', userId: 'trainer1', days: allWeek };
    store['plans/plan_pt'] = { orgId: 'vanas', name: 'Personal Training - 2x per week', price: 0, period: 'fourWeeks', credits: 8 };
    store['memberships/mb_pt'] = { orgId: 'vanas', userId: 'sporter1', planId: 'plan_pt', status: 'active' };
    store['classTypes/ct_group'] = {
      orgId: 'vanas', name: 'Classic Strength', capacity: 8, creditCost: 1, defaultTrainerId: 'trainer1', sessionKind: 'group',
      schedule: [{ weekday: 2, startTime: '09:00', endTime: '10:00' }],
    };
  });

  it('status: waarvoor het abonnement geldt en hoe vaak per week', async () => {
    const r = await post({ action: 'planStatus' });
    expect(r.body).toMatchObject({ plan: { id: 'plan_pt', covers: 'pt', perWeek: 2 }, used: 0, pending: 0, trainerId: 'trainer1' });
  });

  it('sporter vraagt vaste PT-momenten aan binnen zijn abonnement; de trainer keurt goed', async () => {
    const opts = await post({ action: 'weeklyPtOptions' });
    expect(opts.body.trainerId).toBe('trainer1');
    const monday = opts.body.days.find((d) => d.weekday === 1);
    expect(monday.times.map((t) => t.startTime)).toContain('17:00');

    const a = await post({ action: 'requestStandingPt', weekday: 1, startTime: '17:00', endTime: '18:00' });
    expect(a.body).toMatchObject({ status: 'pending' });
    expect((await post({ action: 'requestStandingPt', weekday: 1, startTime: '17:00', endTime: '18:00' })).statusCode).toBe(409);
    expect((await post({ action: 'requestStandingPt', weekday: 3, startTime: '18:00', endTime: '19:00' })).body.status).toBe('pending');
    // 2x per week: een derde gaat niet.
    const third = await post({ action: 'requestStandingPt', weekday: 5, startTime: '18:00', endTime: '19:00' });
    expect(third.statusCode).toBe(409);
    expect(third.body.error).toMatch(/2x per week/);

    // De trainer ziet de verzoeken en keurt het eerste goed: vast PT-moment, zonder gekozen lessoort.
    const list = await post({ action: 'rescheduleRequests' }, 'trainer1');
    expect(list.body.requests.filter((r) => r.kind === 'standing')).toHaveLength(2);
    const ok = await post({ action: 'answerReschedule', requestId: a.body.requestId, approve: true }, 'trainer1');
    expect(ok.statusCode).toBe(200);
    expect(store['classTypes/ctp_sporter1_1_1700']).toMatchObject({ name: 'Personal Training', privateFor: 'sporter1', defaultTrainerId: 'trainer1', sessionKind: '1on1' });
    expect(store['standingBookings/sb_ctp_sporter1_1_1700_sporter1_1_1700']).toMatchObject({ active: true });
    expect(store[`rescheduleRequests/${a.body.requestId}`].status).toBe('approved');
  });

  it('een PT-abonnement geeft geen vaste groepsles, en zonder abonnement niets', async () => {
    const r = await post({ action: 'addStandingBooking', classTypeId: 'ct_group', weekday: 2, startTime: '09:00' });
    expect(r.statusCode).toBe(409);
    expect(r.body.error).toMatch(/personal training/);
    delete store['memberships/mb_pt'];
    const none = await post({ action: 'addStandingBooking', classTypeId: 'ct_group', weekday: 2, startTime: '09:00' });
    expect(none.body.error).toMatch(/geen abonnement/);
    // Staf mag het wel (de app waarschuwt).
    expect((await post({ action: 'addStandingBooking', classTypeId: 'ct_group', weekday: 2, startTime: '09:00', userId: 'sporter1' }, 'trainer1')).statusCode).toBe(200);
  });

  it('staf zet een PT-moment vast zonder lessoort te kiezen', async () => {
    const r = await post({ action: 'addPersonalSlot', userId: 'sporter1', weekday: 4, startTime: '19:00', endTime: '20:00', trainerId: 'trainer1' }, 'trainer1');
    expect(r.statusCode).toBe(200);
    expect(store['classTypes/ctp_sporter1_4_1900']).toMatchObject({ name: 'Personal Training', creditCost: 1, baseClassTypeId: null });
  });
});

describe('afspraken wijzigen: één afspraak of de hele reeks (staf)', () => {
  const D = amsterdamDate(new Date(), 3);
  const allWeek = Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((d) => [String(d), [{ from: '06:00', to: '21:00' }]]));
  beforeEach(() => {
    store['trainerAvailability/vanas__trainer1'] = { orgId: 'vanas', userId: 'trainer1', days: allWeek };
  });

  it('één afspraak verzetten: credit terug (ook binnen de afmeldtermijn), nieuw moment meteen geboekt', async () => {
    // Les over drie uur: gewoon afmelden zou de credit kosten.
    const soon = new Date(Date.now() + 3 * 3_600_000);
    const [date, time] = soon.toLocaleString('sv-SE', { timeZone: 'Europe/Amsterdam' }).split(' ');
    store['classes/ptx'] = {
      orgId: 'vanas', title: 'Personal Training', date, startTime: time.slice(0, 5), endTime: `${String((Number(time.slice(0, 2)) + 1) % 24).padStart(2, '0')}:${time.slice(3, 5)}`,
      trainerId: 'trainer1', capacity: 1, creditCost: 1, bookedCount: 0, waitlistCount: 0, privateFor: 'sporter1',
    };
    const booked = await post({ action: 'book', classId: 'ptx' });
    store[`bookings/${booked.body.bookingId}`].createdAt = new Date(Date.now() - 2 * 3_600_000).toISOString();
    expect(store['creditAccounts/vanas__sporter1'].balance).toBe(2);
    // Een sporter mag dit niet direct.
    expect((await post({ action: 'moveOccurrence', bookingId: booked.body.bookingId, date: D, startTime: '10:00' })).statusCode).toBe(403);

    const r = await post({ action: 'moveOccurrence', bookingId: booked.body.bookingId, date: D, startTime: '10:00' }, 'trainer1');
    expect(r.statusCode).toBe(200);
    expect(store[`bookings/${booked.body.bookingId}`]).toMatchObject({ status: 'cancelled', refunded: true });
    expect(store['classes/cls_rs_rr_ptx']).toMatchObject({ date: D, startTime: '10:00', privateFor: 'sporter1', bookedCount: 1 });
    // Netto één credit: terug voor de oude, eraf voor de nieuwe.
    expect(store['creditAccounts/vanas__sporter1'].balance).toBe(2);
  });

  it('hele reeks wijzigen: nieuw weekmoment vanaf een datum, de oude reeks verdwijnt', async () => {
    const add = await post({ action: 'addPersonalSlot', userId: 'sporter1', weekday: 1, startTime: '19:00', endTime: '20:00', trainerId: 'trainer1' }, 'trainer1');
    expect(add.statusCode).toBe(200);
    const oldSb = add.body.standingBookingId;
    // Een half uur later op dezelfde dag botst met het oude moment, maar dat telt niet mee.
    const r = await post(
      { action: 'moveStandingPt', standingBookingId: oldSb, weekday: 1, startTime: '19:30', endTime: '20:30', trainerId: 'trainer1', fromDate: amsterdamDate(new Date(), 0) },
      'trainer1'
    );
    expect(r.statusCode).toBe(200);
    expect(store['classTypes/ctp_sporter1_1_1930']).toMatchObject({ privateFor: 'sporter1', schedule: [{ weekday: 1, startTime: '19:30', endTime: '20:30' }] });
    expect(store['classTypes/ctp_sporter1_1_1900']).toBeUndefined();
    expect(store[`standingBookings/${oldSb}`]).toBeUndefined();
    // Alles wat van de oude reeks geboekt stond, is afgemeld met de credit terug.
    const oldBookings = Object.entries(store)
      .filter(([k, v]) => k.startsWith('bookings/') && v.userId === 'sporter1' && String(v.classId).startsWith('cls_gen_ctp_sporter1_1_1900'))
      .map(([, v]) => v);
    expect(oldBookings.length).toBeGreaterThan(0);
    expect(oldBookings.every((b) => b.status === 'cancelled' && (b.creditsSpent === 0 || b.refunded === true))).toBe(true);
    // Een sporter kan geen reeks wijzigen.
    expect((await post({ action: 'moveStandingPt', standingBookingId: 'x', weekday: 1, startTime: '10:00', endTime: '11:00' })).statusCode).toBe(403);
  });
});
