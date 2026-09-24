import { describe, expect, it } from 'vitest';
import { last4, mollieKeyFormatError, secretFieldFor, verifyMollieKey, createMolliePayment, getMolliePayment } from '../../api/_lib/molliePayments.mjs';

describe('mollie-sleutel: formaat', () => {
  it('accepteert een testsleutel in testmodus en een livesleutel in livemodus', () => {
    expect(mollieKeyFormatError('test', 'test_abcdefghij1234')).toBeNull();
    expect(mollieKeyFormatError('live', 'live_abcdefghij1234')).toBeNull();
  });

  it('weigert een lege sleutel', () => {
    expect(mollieKeyFormatError('test', '')).toMatch(/Vul een API-sleutel in/);
    expect(mollieKeyFormatError('test', '   ')).toMatch(/Vul een API-sleutel in/);
  });

  it('weigert iets dat geen Mollie-sleutel is', () => {
    expect(mollieKeyFormatError('test', 'sk_live_12345678901234')).toMatch(/geen geldige Mollie-sleutel/);
    expect(mollieKeyFormatError('test', 'test_kort')).toMatch(/geen geldige Mollie-sleutel/);
  });

  it('weigert een testsleutel in livemodus en andersom, met een uitleg', () => {
    expect(mollieKeyFormatError('test', 'live_abcdefghij1234')).toMatch(/live-sleutel/);
    expect(mollieKeyFormatError('live', 'test_abcdefghij1234')).toMatch(/testsleutel/);
  });
});

describe('mollie-sleutel: veldnaam', () => {
  it('kent elke modus zijn eigen Firestore-veld toe', () => {
    expect(secretFieldFor('test')).toBe('mollieTestKey');
    expect(secretFieldFor('live')).toBe('mollieLiveKey');
  });
});

describe('mollie-sleutel: laatste vier tekens', () => {
  it('geeft alleen het einde terug, nooit de rest', () => {
    expect(last4('test_abcdefghij1234')).toBe('1234');
    expect(last4('')).toBe('');
  });
});

describe('mollie-sleutel: verifiëren bij Mollie', () => {
  it('geeft de organisatienaam terug als Mollie de sleutel herkent', async () => {
    const calls = [];
    const fetchImpl = async (url, init) => {
      calls.push({ url, auth: init.headers.Authorization });
      return { ok: true, status: 200, json: async () => ({ name: 'Van As Personal Training' }) };
    };
    const r = await verifyMollieKey('test_abcdefghij1234', fetchImpl);
    expect(r).toEqual({ ok: true, organizationName: 'Van As Personal Training' });
    expect(calls[0]).toEqual({ url: 'https://api.mollie.com/v2/organizations/me', auth: 'Bearer test_abcdefghij1234' });
  });

  it('werkt ook als Mollie geen naam meegeeft', async () => {
    const fetchImpl = async () => ({ ok: true, status: 200, json: async () => ({}) });
    expect(await verifyMollieKey('test_abcdefghij1234', fetchImpl)).toEqual({ ok: true, organizationName: null });
  });

  it('geeft een nette weigering bij een onjuiste sleutel (401/403)', async () => {
    for (const status of [401, 403]) {
      const fetchImpl = async () => ({ ok: false, status, json: async () => ({}) });
      const r = await verifyMollieKey('test_abcdefghij1234', fetchImpl);
      expect(r.ok).toBe(false);
      expect(r.error).toMatch(/herkent deze sleutel niet/);
    }
  });

  it('geeft een nette fout bij een onverwachte serverfout van Mollie', async () => {
    const fetchImpl = async () => ({ ok: false, status: 500, json: async () => ({}) });
    const r = await verifyMollieKey('test_abcdefghij1234', fetchImpl);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/onverwachte fout/);
  });

  it('geeft een nette fout als Mollie niet bereikbaar is', async () => {
    const fetchImpl = async () => {
      throw new Error('network down');
    };
    const r = await verifyMollieKey('test_abcdefghij1234', fetchImpl);
    expect(r).toEqual({ ok: false, error: 'Mollie was niet te bereiken. Probeer het zo nog eens.' });
  });
});

describe('eenmalige betaling aanmaken', () => {
  it('stuurt bedrag, omschrijving en URLs mee, en geeft id + checkout-URL terug', async () => {
    const calls = [];
    const fetchImpl = async (url, init) => {
      calls.push({ url, method: init.method, body: JSON.parse(init.body) });
      return { ok: true, json: async () => ({ id: 'tr_abc', _links: { checkout: { href: 'https://mollie.com/checkout/tr_abc' } } }) };
    };
    const r = await createMolliePayment({
      apiKey: 'test_abcdefghij1234',
      amount: 49.5,
      description: 'Strippenkaart — Van As',
      redirectUrl: 'https://vorm.app/?aankoop=pl1',
      webhookUrl: 'https://vorm.app/mollie-webhook/vanas',
      fetchImpl,
    });
    expect(r).toEqual({ id: 'tr_abc', checkoutUrl: 'https://mollie.com/checkout/tr_abc' });
    expect(calls[0].url).toBe('https://api.mollie.com/v2/payments');
    expect(calls[0].method).toBe('POST');
    expect(calls[0].body).toEqual({
      amount: { currency: 'EUR', value: '49.50' },
      description: 'Strippenkaart — Van As',
      redirectUrl: 'https://vorm.app/?aankoop=pl1',
      webhookUrl: 'https://vorm.app/mollie-webhook/vanas',
    });
  });

  it('geeft de foutmelding van Mollie door als aanmaken mislukt', async () => {
    const fetchImpl = async () => ({ ok: false, status: 422, json: async () => ({ detail: 'Ongeldig bedrag' }) });
    await expect(createMolliePayment({ apiKey: 'test_x', amount: 10, description: '', redirectUrl: '', webhookUrl: '', fetchImpl })).rejects.toThrow(
      'Ongeldig bedrag'
    );
  });

  it('geeft een foutmelding als Mollie geen checkout-URL teruggeeft', async () => {
    const fetchImpl = async () => ({ ok: true, json: async () => ({ id: 'tr_abc' }) });
    await expect(createMolliePayment({ apiKey: 'test_x', amount: 10, description: '', redirectUrl: '', webhookUrl: '', fetchImpl })).rejects.toThrow(
      'geen betaal-URL'
    );
  });
});

describe('betaling ophalen', () => {
  it('geeft id en status terug', async () => {
    const calls = [];
    const fetchImpl = async (url, init) => {
      calls.push({ url, auth: init.headers.Authorization });
      return { ok: true, json: async () => ({ id: 'tr_abc', status: 'paid' }) };
    };
    const r = await getMolliePayment({ apiKey: 'test_abcdefghij1234', paymentId: 'tr_abc', fetchImpl });
    expect(r).toEqual({ id: 'tr_abc', status: 'paid' });
    expect(calls[0]).toEqual({ url: 'https://api.mollie.com/v2/payments/tr_abc', auth: 'Bearer test_abcdefghij1234' });
  });

  it('geeft de foutmelding van Mollie door als ophalen mislukt', async () => {
    const fetchImpl = async () => ({ ok: false, status: 404, json: async () => ({ detail: 'Niet gevonden' }) });
    await expect(getMolliePayment({ apiKey: 'test_x', paymentId: 'tr_missing', fetchImpl })).rejects.toThrow('Niet gevonden');
  });
});
