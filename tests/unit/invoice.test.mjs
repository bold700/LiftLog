import { describe, expect, it } from 'vitest';
import { businessOf, dueDateOf, formatInvoiceNumber, invoiceCounter, reserveInvoiceNumber, vatRateOf, vatSplit } from '../../api/_lib/invoice.mjs';
import { bumpedCounter, newCharge } from '../../api/_lib/subscriptions.mjs';
import { buildInvoicePdf, invoiceFileName } from '../../api/_lib/invoicePdf.mjs';

describe('facturen', () => {
  it('kent alleen 0, 9 en 21 procent; al het andere wordt het standaardtarief', () => {
    expect(vatRateOf(21)).toBe(21);
    expect(vatRateOf('9')).toBe(9);
    expect(vatRateOf(0)).toBe(0);
    expect(vatRateOf(5)).toBe(9);
    expect(vatRateOf(undefined)).toBe(9);
  });

  it('splitst een inclusief bedrag in exclusief en btw die samen weer optellen', () => {
    expect(vatSplit(139, 9)).toEqual({
      incl: 139,
      excl: 127.52,
      vat: 11.48,
      rate: 9,
    });
    expect(vatSplit(121, 21)).toEqual({
      incl: 121,
      excl: 100,
      vat: 21,
      rate: 21,
    });
    expect(vatSplit(50, 0)).toEqual({ incl: 50, excl: 50, vat: 0, rate: 0 });
    const s = vatSplit(79.99, 9);
    expect(Math.round((s.excl + s.vat) * 100) / 100).toBe(79.99);
  });

  it('maakt van voorvoegsel en teller een nummer met vier cijfers', () => {
    expect(formatInvoiceNumber('VAS-2026-', 142)).toBe('VAS-2026-0142');
    expect(formatInvoiceNumber('VAS-2026-', 12345)).toBe('VAS-2026-12345');
    expect(formatInvoiceNumber('', 0)).toBe('0001');
  });

  it('valt zonder bedrijfsgegevens terug op het jaar als voorvoegsel en begint bij 1', () => {
    expect(invoiceCounter({}, '2026-09-20T00:00:00.000Z')).toEqual({
      prefix: '2026-',
      next: 1,
    });
    expect(invoiceCounter({ business: { invoicePrefix: 'VAS-2026-', nextInvoiceNumber: 143 } }, '2026-09-20T00:00:00.000Z')).toEqual({ prefix: 'VAS-2026-', next: 143 });
  });

  it('reserveert een nummer en schrijft de teller één verder', () => {
    const writes = [];
    const tx = { set: (ref, data, opts) => writes.push({ ref, data, opts }) };
    const snap = {
      exists: true,
      data: () => ({
        name: 'Van As',
        business: {
          invoicePrefix: 'VAS-2026-',
          nextInvoiceNumber: 142,
          kvk: '1',
        },
      }),
    };
    const nr = reserveInvoiceNumber(tx, 'orgRef', snap, '2026-09-20T00:00:00.000Z');
    expect(nr).toBe('VAS-2026-0142');
    expect(writes[0].data.business).toEqual({
      invoicePrefix: 'VAS-2026-',
      nextInvoiceNumber: 143,
    });
    expect(writes[0].opts).toEqual({ merge: true });
    // Twee posten in één transactie: de tweede krijgt het volgende nummer.
    const nr2 = reserveInvoiceNumber(tx, 'orgRef', bumpedCounter(snap), '2026-09-20T00:00:00.000Z');
    expect(nr2).toBe('VAS-2026-0143');
  });

  it('een post draagt het btw-tarief van het plan en het toegekende nummer', () => {
    const now = '2026-09-20T12:00:00.000Z';
    const plan = {
      id: 'p1',
      name: 'Maand 8',
      period: 'month',
      credits: 8,
      rollover: 'expire',
      price: 139,
      vatRate: 21,
    };
    const c = newCharge({
      id: 'ch1',
      orgId: 'vanas',
      userId: 'u1',
      plan,
      membershipId: 'm1',
      periodStartIso: now,
      nowIso: now,
      invoiceNumber: 'VAS-2026-0142',
    });
    expect(c.vatRate).toBe(21);
    expect(c.invoiceNumber).toBe('VAS-2026-0142');
    expect(c.invoiceIssuedAt).toBe(now);
    const zonder = newCharge({
      id: 'ch2',
      orgId: 'vanas',
      userId: 'u1',
      plan: { ...plan, vatRate: undefined },
      membershipId: 'm1',
      periodStartIso: now,
      nowIso: now,
    });
    expect(zonder.vatRate).toBe(9);
    expect(zonder.invoiceNumber).toBeNull();
    expect(zonder.invoiceIssuedAt).toBeNull();
  });

  it('bedrijfsgegevens vallen terug op de studionaam en de vervaldatum is veertien dagen later', () => {
    expect(businessOf({ name: 'Van As' }).legalName).toBe('Van As');
    expect(
      businessOf({
        name: 'Van As',
        business: { legalName: ' Van As PT ', kvk: '123' },
      })
    ).toMatchObject({ legalName: 'Van As PT', kvk: '123', iban: '' });
    expect(dueDateOf('2026-09-01T08:00:00.000Z')).toBe('2026-09-15T08:00:00.000Z');
  });

  it('bouwt een PDF in de taal van het lid met een passende bestandsnaam', () => {
    const business = businessOf({
      name: 'Van As',
      business: {
        legalName: 'Van As Personal Training',
        kvk: '12345678',
        vatNumber: 'NL001B01',
        iban: 'NL12RABO0123456789',
      },
    });
    const charge = {
      planName: 'Maand 8',
      amount: 139,
      period: '2026-09',
      status: 'open',
      vatRate: 9,
      invoiceNumber: 'VAS-2026-0142',
      invoiceIssuedAt: '2026-09-01T08:00:00.000Z',
    };
    const pdf = buildInvoicePdf({
      lang: 'nl',
      business,
      charge,
      member: { name: 'Jan', email: 'jan@x.nl' },
    });
    expect(pdf.byteLength).toBeGreaterThan(2000);
    expect(String.fromCharCode(...new Uint8Array(pdf.slice(0, 5)))).toBe('%PDF-');
    expect(invoiceFileName('nl', 'VAS-2026-0142')).toBe('Factuur-VAS-2026-0142.pdf');
    expect(invoiceFileName('en', null)).toBe('Invoice-concept.pdf');
  });
});
