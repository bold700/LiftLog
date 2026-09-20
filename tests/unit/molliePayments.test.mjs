import { describe, expect, it } from 'vitest';
import { last4, mollieKeyFormatError, secretFieldFor, verifyMollieKey } from '../../api/_lib/molliePayments.mjs';

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
