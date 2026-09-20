import { describe, expect, it } from 'vitest';
import { buildInvoiceEmail, mailConfigured, sendViaResend } from '../../api/_lib/invoiceEmail.mjs';

const business = { legalName: 'Van As Personal Training', street: 'Sportlaan 12', postcode: '1234 AB', city: 'Amsterdam', kvk: '12345678', vatNumber: 'NL001234567B01', iban: 'NL12 RABO 0123 4567 89', invoiceEmail: 'info@vanaspt.nl', phone: '' };
const charge = { planName: 'Monthly 8', description: 'Monthly 8 · 2026-09', amount: 139, period: '2026-09', status: 'open', vatRate: 9, invoiceNumber: 'VAS-2026-0142', invoiceIssuedAt: '2026-09-01T08:00:00.000Z' };

describe('factuurmail', () => {
  it('schrijft onderwerp, aanhef en betaalregel in het Nederlands, met de gegevens van de studio', () => {
    const m = buildInvoiceEmail({ lang: 'nl', business, charge, member: { name: 'Jan de Vries', email: 'jan@x.nl' } });
    expect(m.subject).toBe('Factuur VAS-2026-0142 · Van As Personal Training · € 139,00');
    expect(m.text).toContain('Hoi Jan,');
    expect(m.text).toContain('Monthly 8 · september 2026');
    expect(m.text).toContain('vóór 15 september 2026');
    expect(m.text).toContain('NL12 RABO 0123 4567 89 t.n.v. Van As Personal Training, onder vermelding van VAS-2026-0142');
    expect(m.html).toContain('<h1');
    expect(m.html).toContain('KvK 12345678');
  });

  it('kent Engels en ontsnapt HTML in namen', () => {
    const m = buildInvoiceEmail({ lang: 'en', business, charge: { ...charge, status: 'paid', paidAt: '2026-09-03T00:00:00.000Z' }, member: { name: '<b>Eve</b>', email: 'e@x.nl' } });
    expect(m.subject.startsWith('Invoice VAS-2026-0142')).toBe(true);
    expect(m.text).toContain('This invoice was paid on 3 September 2026');
    expect(m.html).toContain('&lt;b&gt;Eve&lt;/b&gt;');
    expect(m.html).not.toContain('<b>Eve</b>');
  });

  it('is pas ingericht met sleutel én afzender', () => {
    expect(mailConfigured({})).toBe(false);
    expect(mailConfigured({ RESEND_API_KEY: 'x' })).toBe(false);
    expect(mailConfigured({ RESEND_API_KEY: 'x', INVOICE_FROM_EMAIL: 'facturen@vanaspt.nl' })).toBe(true);
  });

  it('stuurt naar Resend met afzender, antwoordadres en bijlage', async () => {
    const calls = [];
    const fetchImpl = async (url, init) => {
      calls.push({ url, body: JSON.parse(init.body), auth: init.headers.Authorization });
      return { ok: true, json: async () => ({ id: 'msg_1' }) };
    };
    const id = await sendViaResend({
      env: { RESEND_API_KEY: 'key', INVOICE_FROM_EMAIL: 'facturen@vanaspt.nl' },
      fromName: 'Van As <PT>',
      to: 'jan@x.nl',
      replyTo: 'info@vanaspt.nl',
      subject: 'S',
      html: '<p>h</p>',
      text: 't',
      attachments: [{ filename: 'Factuur-1.pdf', content: 'JVBERi0=' }],
      fetchImpl,
    });
    expect(id).toBe('msg_1');
    expect(calls[0].url).toBe('https://api.resend.com/emails');
    expect(calls[0].auth).toBe('Bearer key');
    expect(calls[0].body).toMatchObject({ from: 'Van As PT <facturen@vanaspt.nl>', to: ['jan@x.nl'], reply_to: 'info@vanaspt.nl', attachments: [{ filename: 'Factuur-1.pdf' }] });
  });

  it('geeft een leesbare fout als Resend weigert of niets is ingericht', async () => {
    const fetchImpl = async () => ({ ok: false, status: 422, json: async () => ({ message: 'Invalid from' }) });
    await expect(sendViaResend({ env: { RESEND_API_KEY: 'k', INVOICE_FROM_EMAIL: 'a@b.nl' }, fromName: 'X', to: 'j@x.nl', subject: 's', html: '', text: '', fetchImpl })).rejects.toThrow('Versturen mislukt (422): Invalid from');
    await expect(sendViaResend({ env: {}, fromName: 'X', to: 'j@x.nl', subject: 's', html: '', text: '' })).rejects.toThrow('nog niet ingericht');
  });
});
