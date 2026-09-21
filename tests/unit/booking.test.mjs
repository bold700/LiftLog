/**
 * Reserveren met credits (api/booking.mjs).
 *
 * Dit is de plek waar geld en plekken samenkomen, en waar een fout direct pijn doet: een sporter
 * die reserveert zonder saldo, twee mensen op dezelfde laatste plek, of een credit die kwijtraakt
 * bij afmelden. Daarom draait deze test de hele transactie af op een nagebootste Firestore.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { classIdForOccurrence, occurrencesForSchedule } from '../../api/_lib/classSchedule.mjs';

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
        set: (ref, value) => ops.push([ref, value]),
        commit: async () => {
          for (const [ref, value] of ops) data.set(ref.__path, applyValue(null, value));
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

  it('gebruikt de eigen annuleertermijn van de studio in plaats van de standaard 12 uur', async () => {
    store['orgs/vanas'] = { bookingPolicy: { freeCancelHours: 1 } };
    // Les over twee uur: buiten de eigen termijn van 1 uur, maar wel binnen de standaard 12 uur.
    const straks = new Date(Date.now() + 2 * 3_600_000);
    store['classes/c1'].date = straks.toISOString().slice(0, 10);
    store['classes/c1'].startTime = straks.toTimeString().slice(0, 5);

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

  it('slaat een lessoort zonder vaste trainer over (de cron kiest zelf geen trainer)', async () => {
    store['classTypes/ct2'] = {
      orgId: 'vanas', name: 'Open gym', capacity: null, creditCost: 0,
      defaultTrainerId: null, schemaId: null,
      schedule: [{ weekday: new Date().getDay(), startTime: '08:00', endTime: '09:00' }],
    };
    const res = await getCron('Bearer test-secret');
    expect(res.statusCode).toBe(200);
    expect(res.body.skippedNoTrainer).toContain('ct2');
    expect(store[`classes/cls_gen_ct2_${todayIso()}_0800`]).toBeUndefined();
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
