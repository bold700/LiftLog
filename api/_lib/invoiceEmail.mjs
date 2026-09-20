/**
 * Factuurmail, naar het ontwerp "Invoice email — 600": kop met logo en studionaam, titel met
 * het nummer, korte aanhef, bedragblok met vervaldatum, hoe te betalen, de PDF als bijlage en
 * een voettekst met de bedrijfsgegevens. Verstuurd via Resend (REST, geen SDK nodig).
 *
 * De taal volgt het lid. De iDEAL-knop komt er pas bij zodra Mollie is gekoppeld; tot die tijd
 * staat er hoe je overmaakt.
 */
import { dueDateOf, vatSplit } from './invoice.mjs';

const T = {
  nl: {
    subject: (nr, studio, amount) => `Factuur ${nr} · ${studio} · ${amount}`,
    title: (nr) => `Factuur ${nr}`,
    hi: (name) => `Hoi ${name},`,
    body: (desc, amount, due) => `Hierbij je factuur voor ${desc}. Het bedrag is ${amount}, te betalen vóór ${due}. De factuur zit als PDF bij deze mail.`,
    toPay: 'Te betalen',
    before: (due) => `vóór ${due}`,
    transfer: (iban, name, nr) => (iban ? `Maak het bedrag over naar ${iban} t.n.v. ${name}, onder vermelding van ${nr}.` : `Vermeld bij het betalen het factuurnummer ${nr}.`),
    paid: (date) => `Deze factuur is betaald op ${date}. Dank je wel!`,
    questions: 'Vragen over deze factuur? Antwoord gewoon op deze mail.',
    bye: 'Groet,',
    footer: (studio) => `Je ontvangt deze mail omdat je lid bent van ${studio}. Verstuurd met VORM.`,
    kvk: 'KvK',
    vat: 'btw',
    locale: 'nl-NL',
  },
  en: {
    subject: (nr, studio, amount) => `Invoice ${nr} · ${studio} · ${amount}`,
    title: (nr) => `Invoice ${nr}`,
    hi: (name) => `Hi ${name},`,
    body: (desc, amount, due) => `Here is your invoice for ${desc}. The amount is ${amount}, due before ${due}. The invoice is attached as a PDF.`,
    toPay: 'To pay',
    before: (due) => `before ${due}`,
    transfer: (iban, name, nr) => (iban ? `Please transfer the amount to ${iban} in the name of ${name}, quoting ${nr}.` : `Please quote invoice number ${nr} when paying.`),
    paid: (date) => `This invoice was paid on ${date}. Thank you!`,
    questions: 'Questions about this invoice? Just reply to this email.',
    bye: 'Kind regards,',
    footer: (studio) => `You receive this email because you are a member of ${studio}. Sent with VORM.`,
    kvk: 'CoC',
    vat: 'VAT',
    locale: 'en-GB',
  },
};

const money = (n, locale) => `€ ${new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n) || 0)}`;
const longDate = (iso, locale) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' });
};
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** "2026-09" → "september 2026", anders de omschrijving zoals hij is. */
function describe(charge, locale) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(charge.period ?? ''));
  if (!m) return charge.planName || charge.description || '';
  const month = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1)).toLocaleDateString(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' });
  return `${charge.planName || charge.description} · ${month}`;
}

/**
 * @returns {{ subject: string, html: string, text: string }}
 */
export function buildInvoiceEmail({ lang, business, charge, member, logoUrl = null, brandColor = null }) {
  const t = T[lang === 'en' ? 'en' : 'nl'];
  const L = t.locale;
  const brand = /^#[0-9a-f]{6}$/i.test(String(brandColor ?? '')) ? brandColor : '#426833';
  const nr = charge.invoiceNumber || '—';
  const studio = business.legalName;
  const amount = money(vatSplit(charge.amount, charge.vatRate).incl, L);
  const issued = charge.invoiceIssuedAt || charge.issuedAt || new Date().toISOString();
  const due = longDate(dueDateOf(issued), L);
  const desc = describe(charge, L);
  const firstName = String(member.name || '').trim().split(/\s+/)[0] || member.name;
  const paid = charge.status === 'paid';
  const payLine = paid ? t.paid(longDate(charge.paidAt || issued, L)) : t.transfer(business.iban, studio, nr);
  const details = [
    studio,
    [business.street, [business.postcode, business.city].filter(Boolean).join(' ')].filter(Boolean).join(' · '),
    business.kvk ? `${t.kvk} ${business.kvk}` : '',
    business.vatNumber ? `${t.vat} ${business.vatNumber}` : '',
  ]
    .filter(Boolean)
    .join(' · ');

  const subject = t.subject(nr, studio, amount);
  const text = [t.hi(firstName), '', t.body(desc, amount, due), '', `${t.toPay}: ${amount} (${t.before(due)})`, payLine, '', t.questions, '', t.bye, studio, '', details, t.footer(studio)].join('\n');

  const logo = logoUrl
    ? `<img src="${esc(logoUrl)}" width="40" height="40" alt="" style="display:block;width:40px;height:40px;border-radius:10px;object-fit:contain;background:#ffffff;">`
    : `<div style="width:40px;height:40px;border-radius:10px;background:${esc(brand)};"></div>`;
  const html = `<!doctype html><html lang="${lang === 'en' ? 'en' : 'nl'}"><body style="margin:0;padding:24px;background:#f8faf0;font-family:Roboto,Helvetica,Arial,sans-serif;color:#191d17;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="552" cellpadding="0" cellspacing="0" style="max-width:552px;width:100%;background:#ffffff;border-radius:20px;">
<tr><td style="padding:32px;">
  <table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="padding-right:12px;">${logo}</td><td style="font-size:15px;font-weight:600;">${esc(studio)}</td></tr></table>
  <h1 style="margin:20px 0 16px;font-size:24px;font-weight:600;">${esc(t.title(nr))}</h1>
  <p style="margin:0 0 16px;font-size:14px;line-height:1.45;">${esc(t.hi(firstName))}</p>
  <p style="margin:0 0 20px;font-size:14px;line-height:1.45;">${esc(t.body(desc, amount, due))}</p>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f5ea;border-radius:14px;"><tr>
    <td style="padding:18px 20px;"><div style="font-size:12px;font-weight:600;color:#43483f;">${esc(t.toPay)}</div><div style="font-size:12px;color:#43483f;margin-top:3px;">${esc(desc)}</div></td>
    <td align="right" style="padding:18px 20px;"><div style="font-size:24px;font-weight:600;">${esc(amount)}</div><div style="font-size:12px;color:#43483f;margin-top:3px;">${esc(t.before(due))}</div></td>
  </tr></table>
  <p style="margin:20px 0 0;font-size:12px;line-height:1.45;color:#43483f;">${esc(payLine)}</p>
  <p style="margin:20px 0 0;font-size:14px;line-height:1.45;">${esc(t.questions)}</p>
  <p style="margin:20px 0 0;font-size:14px;line-height:1.45;">${esc(t.bye)}<br>${esc(studio)}</p>
</td></tr></table>
<p style="max-width:552px;margin:16px auto 0;font-size:11px;line-height:1.45;color:#73796e;text-align:center;">${esc(details)}<br>${esc(t.footer(studio))}</p>
</td></tr></table></body></html>`;
  return { subject, html, text };
}

/** Is versturen ingericht? Beide variabelen komen uit Vercel (Settings → Environment Variables). */
export function mailConfigured(env = process.env) {
  return Boolean(String(env.RESEND_API_KEY ?? '').trim() && String(env.INVOICE_FROM_EMAIL ?? '').trim());
}

/**
 * Versturen via de Resend-API. Geeft het bericht-id terug of gooit met een leesbare fout.
 * @param {object} p
 * @param {string} p.fromName  naam van de studio als afzender
 * @param {{ filename: string, content: string }[]} p.attachments  content = base64
 */
export async function sendViaResend({ env = process.env, fromName, to, replyTo, subject, html, text, attachments = [], fetchImpl = fetch }) {
  const apiKey = String(env.RESEND_API_KEY ?? '').trim();
  const fromEmail = String(env.INVOICE_FROM_EMAIL ?? '').trim();
  if (!apiKey || !fromEmail) throw new Error('Mail is nog niet ingericht (RESEND_API_KEY en INVOICE_FROM_EMAIL ontbreken in Vercel).');
  const res = await fetchImpl('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: `${String(fromName).replace(/[<>"]/g, '')} <${fromEmail}>`,
      to: [to],
      ...(replyTo ? { reply_to: replyTo } : {}),
      subject,
      html,
      text,
      attachments,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Versturen mislukt (${res.status}): ${data?.message || data?.error?.message || 'onbekende fout'}`);
  return String(data.id ?? '');
}
