import { describe, expect, it } from 'vitest';
import { chargesToCsv, isOverdue } from '../../src/services/chargeService';
import type { Charge } from '../../src/types';

const charge = (extra: Partial<Charge> = {}): Charge => ({
  id: 'ch1', orgId: 'vanas', userId: 'u1', membershipId: 'm1', planId: 'p1', planName: 'Maand 8', description: 'Maand 8 · 2026-09',
  amount: 139, period: '2026-09', issuedAt: '2026-09-01T00:00:00.000Z', dueAt: '2026-09-01T00:00:00.000Z', status: 'open', paidAt: null, note: '',
  vatRate: 9, invoiceNumber: 'VAS-2026-0142', invoiceIssuedAt: '2026-09-01T00:00:00.000Z', invoiceSentAt: null, invoiceSentTo: null, ...extra,
});

describe('facturatie', () => {
  it('een open post is achterstallig na veertien dagen, een betaalde nooit', () => {
    const now = new Date('2026-09-20T00:00:00.000Z').getTime();
    expect(isOverdue(charge(), now)).toBe(true);
    expect(isOverdue(charge({ dueAt: '2026-09-15T00:00:00.000Z' }), now)).toBe(false);
    expect(isOverdue(charge({ status: 'paid', paidAt: '2026-09-02T00:00:00.000Z' }), now)).toBe(false);
  });

  it('exporteert een CSV met kopregel, puntkomma en ontsnapte aanhalingstekens', () => {
    const csv = chargesToCsv([charge({ note: 'zei "later"' })], () => 'Jan de Vries');
    const lines = csv.split('\n');
    expect(lines[0]).toBe('"Factuurnummer";"Lid";"Omschrijving";"Periode";"Vervaldatum";"Bedrag";"Excl. btw";"Btw";"Btw %";"Status";"Betaald op";"Notitie"');
    expect(lines[1]).toBe('"VAS-2026-0142";"Jan de Vries";"Maand 8 · 2026-09";"2026-09";"2026-09-01";"139.00";"127.52";"11.48";"9";"open";"";"zei ""later"""');
  });
});

describe('btw in de app', () => {
  it('splitst hetzelfde als de server', async () => {
    const { vatSplit } = await import('../../src/services/chargeService');
    expect(vatSplit(139, 9)).toEqual({ incl: 139, excl: 127.52, vat: 11.48, rate: 9 });
  });
});
