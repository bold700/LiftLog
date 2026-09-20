/**
 * Factuur als PDF, naar het ontwerp "Invoice PDF — A4": logo en bedrijfsgegevens, nummer en data,
 * "Van" en "Aan", één regel met periode, btw en bedrag, de totalen, een betaalblok en een voettekst
 * met KvK en btw-nummer. Alleen jsPDF-basisfuncties, dus dit draait in de browser én op de server.
 *
 * De taal volgt het lid: Nederlandse leden krijgen "Factuur", Engelse "Invoice".
 */
import { jsPDF } from 'jspdf';
import { dueDateOf, vatSplit } from './invoice.mjs';

const T = {
  nl: {
    title: 'FACTUUR',
    number: 'Factuurnummer',
    date: 'Factuurdatum',
    due: 'Vervaldatum',
    status: 'Status',
    open: 'Openstaand',
    paid: 'Betaald',
    void: 'Vervallen',
    from: 'Van',
    to: 'Aan',
    description: 'Omschrijving',
    period: 'Periode',
    vat: 'Btw',
    amount: 'Bedrag',
    once: 'eenmalig',
    subtotal: 'Subtotaal excl. btw',
    vatLine: (r) => `Btw ${r}%`,
    total: 'Totaal',
    payTitle: 'Betalen',
    payBody: (due, amount, iban, name, nr) =>
      iban ? `Maak ${amount} vóór ${due} over naar ${iban} t.n.v. ${name}, onder vermelding van ${nr}.` : `Betaal ${amount} vóór ${due} onder vermelding van ${nr}.`,
    paidBody: (date) => `Deze factuur is betaald op ${date}. Dank je wel.`,
    voidBody: 'Deze factuur is vervallen en hoeft niet betaald te worden.',
    kvk: 'KvK',
    vatNo: 'btw',
    page: 'Pagina 1 van 1 · gemaakt met VORM',
    locale: 'nl-NL',
  },
  en: {
    title: 'INVOICE',
    number: 'Invoice number',
    date: 'Invoice date',
    due: 'Due date',
    status: 'Status',
    open: 'Open',
    paid: 'Paid',
    void: 'Cancelled',
    from: 'From',
    to: 'To',
    description: 'Description',
    period: 'Period',
    vat: 'VAT',
    amount: 'Amount',
    once: 'one-off',
    subtotal: 'Subtotal excl. VAT',
    vatLine: (r) => `VAT ${r}%`,
    total: 'Total',
    payTitle: 'Payment',
    payBody: (due, amount, iban, name, nr) =>
      iban ? `Please transfer ${amount} before ${due} to ${iban} in the name of ${name}, quoting ${nr}.` : `Please pay ${amount} before ${due}, quoting ${nr}.`,
    paidBody: (date) => `This invoice was paid on ${date}. Thank you.`,
    voidBody: 'This invoice has been cancelled and does not need to be paid.',
    kvk: 'CoC',
    vatNo: 'VAT',
    page: 'Page 1 of 1 · made with VORM',
    locale: 'en-GB',
  },
};

const INK = [25, 29, 23];
const MUTED = [67, 72, 63];
const LINE = [195, 200, 189];
const SOFT = [242, 245, 234];
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const M = 44;

function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex ?? '').trim());
  if (!m) return [66, 104, 51];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function money(n, locale) {
  return `€ ${new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n) || 0)}`;
}

function longDate(iso, locale) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString(locale, {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
}

/** "2026-09" → "september 2026". */
function periodLabel(period, locale) {
  const m = /^(\d{4})-(\d{2})$/.exec(String(period ?? ''));
  if (!m) return null;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1)).toLocaleDateString(locale, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * @param {object} p
 * @param {'nl'|'en'} p.lang
 * @param {{legalName,street,postcode,city,kvk,vatNumber,iban,invoiceEmail,phone}} p.business
 * @param {object} p.charge   post uit Firestore (description, planName, amount, period, status, paidAt, vatRate, invoiceNumber, invoiceIssuedAt, issuedAt)
 * @param {{name:string,email:string}} p.member
 * @param {string|null} p.logoDataUrl  PNG/JPEG als data-URL, of null
 * @param {string|null} p.brandColor   hexkleur van de studio
 * @returns {ArrayBuffer}
 */
export function buildInvoicePdf({ lang, business, charge, member, logoDataUrl = null, brandColor = null }) {
  const t = T[lang === 'en' ? 'en' : 'nl'];
  const L = t.locale;
  const brand = hexToRgb(brandColor);
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const right = PAGE_W - M;
  const text = (str, x, y, size, opts = {}) => {
    doc.setFont('helvetica', opts.bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    const c = opts.color ?? INK;
    doc.setTextColor(c[0], c[1], c[2]);
    doc.text(String(str ?? ''), x, y, {
      align: opts.align ?? 'left',
      maxWidth: opts.maxWidth,
    });
  };

  const issued = charge.invoiceIssuedAt || charge.issuedAt || new Date().toISOString();
  const number = charge.invoiceNumber || '—';
  const split = vatSplit(charge.amount, charge.vatRate);
  const period = periodLabel(charge.period, L);

  // --- Kop: logo, studio, FACTUUR ---------------------------------------------------------
  let y = 52;
  let nameX = M;
  if (logoDataUrl) {
    try {
      const props = doc.getImageProperties(logoDataUrl);
      const box = 42;
      const ratio = props.width && props.height ? props.width / props.height : 1;
      const w = ratio >= 1 ? box : box * ratio;
      const h = ratio >= 1 ? box / ratio : box;
      // 'FAST' = gecomprimeerd opslaan; zonder dat is het logo als ruwe pixels honderden kB.
      doc.addImage(logoDataUrl, props.fileType === 'JPEG' ? 'JPEG' : 'PNG', M, y - 6, w, h, undefined, 'FAST');
      nameX = M + box + 14;
    } catch {
      /* logo overslaan als het niet leesbaar is */
    }
  }
  text(business.legalName, nameX, y + 10, 14, { bold: true });
  const addrLine = [business.street, [business.postcode, business.city].filter(Boolean).join(' ')].filter(Boolean).join(' · ');
  if (addrLine) text(addrLine, nameX, y + 25, 9, { color: MUTED });
  text(t.title, right, y + 14, 22, {
    bold: true,
    color: brand,
    align: 'right',
  });

  // --- Nummer en data -----------------------------------------------------------------------
  y = 118;
  const colW = (PAGE_W - 2 * M) / 4;
  const statusText = charge.status === 'paid' ? t.paid : charge.status === 'void' ? t.void : t.open;
  const meta = [
    [t.number, number],
    [t.date, longDate(issued, L)],
    [t.due, longDate(dueDateOf(issued), L)],
    [t.status, statusText],
  ];
  meta.forEach(([k, v], i) => {
    text(k, M + i * colW, y, 8, { bold: true, color: MUTED });
    text(v, M + i * colW, y + 15, 10.5);
  });

  // --- Van / Aan ----------------------------------------------------------------------------
  y = 168;
  const fromLines = [
    business.legalName,
    business.street,
    [business.postcode, business.city].filter(Boolean).join(' '),
    [business.kvk ? `${t.kvk} ${business.kvk}` : '', business.vatNumber ? `${t.vatNo} ${business.vatNumber}` : ''].filter(Boolean).join(' · '),
    [business.invoiceEmail, business.phone].filter(Boolean).join(' · '),
  ].filter(Boolean);
  const toLines = [member.name, member.email].filter(Boolean);
  const half = (PAGE_W - 2 * M) / 2;
  const block = (label, lines, x) => {
    text(label, x, y, 8, { bold: true, color: MUTED });
    lines.forEach((l, i) =>
      text(l, x, y + 16 + i * 13, i === 0 ? 10.5 : 9.5, {
        bold: i === 0,
        color: i === 0 ? INK : MUTED,
      })
    );
  };
  block(t.from, fromLines, M);
  block(t.to, toLines, M + half);
  y += 16 + Math.max(fromLines.length, toLines.length) * 13 + 22;

  // --- Regel ----------------------------------------------------------------------------------
  const cDesc = M;
  const cPeriod = M + 250;
  const cVat = right - 96;
  const cAmt = right;
  text(t.description, cDesc, y, 8, { bold: true, color: MUTED });
  text(t.period, cPeriod, y, 8, { bold: true, color: MUTED });
  text(t.vat, cVat, y, 8, { bold: true, color: MUTED, align: 'right' });
  text(t.amount, cAmt, y, 8, { bold: true, color: MUTED, align: 'right' });
  doc.setDrawColor(INK[0], INK[1], INK[2]);
  doc.setLineWidth(0.8);
  doc.line(M, y + 6, right, y + 6);
  y += 24;
  text(charge.planName || charge.description, cDesc, y, 10.5, {
    maxWidth: cPeriod - cDesc - 12,
  });
  text(period ?? t.once, cPeriod, y, 10.5);
  text(`${split.rate}%`, cVat, y, 10.5, { align: 'right' });
  text(money(split.incl, L), cAmt, y, 10.5, { align: 'right' });
  doc.setDrawColor(LINE[0], LINE[1], LINE[2]);
  doc.setLineWidth(0.6);
  doc.line(M, y + 10, right, y + 10);

  // --- Totalen --------------------------------------------------------------------------------
  y += 34;
  const tx = right - 230;
  text(t.subtotal, tx, y, 9.5, { color: MUTED });
  text(money(split.excl, L), right, y, 9.5, { align: 'right' });
  y += 16;
  text(t.vatLine(split.rate), tx, y, 9.5, { color: MUTED });
  text(money(split.vat, L), right, y, 9.5, { align: 'right' });
  y += 12;
  doc.setFillColor(SOFT[0], SOFT[1], SOFT[2]);
  doc.roundedRect(tx - 10, y, 240, 28, 6, 6, 'F');
  text(t.total, tx, y + 18, 11, { bold: true });
  text(money(split.incl, L), right, y + 18, 12, { bold: true, align: 'right' });

  // --- Betaalblok -----------------------------------------------------------------------------
  y += 52;
  const body =
    charge.status === 'paid'
      ? t.paidBody(longDate(charge.paidAt || issued, L))
      : charge.status === 'void'
        ? t.voidBody
        : t.payBody(longDate(dueDateOf(issued), L), money(split.incl, L), business.iban, business.legalName, number);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  const wrapped = doc.splitTextToSize(body, PAGE_W - 2 * M - 32);
  const boxH = 16 + 14 + wrapped.length * 13 + 8;
  doc.setFillColor(SOFT[0], SOFT[1], SOFT[2]);
  doc.roundedRect(M, y, PAGE_W - 2 * M, boxH, 10, 10, 'F');
  text(t.payTitle, M + 16, y + 20, 10, { bold: true });
  wrapped.forEach((line, i) => text(line, M + 16, y + 36 + i * 13, 9.5));

  // --- Voettekst ------------------------------------------------------------------------------
  const foot = [business.legalName, addrLine, business.kvk ? `${t.kvk} ${business.kvk}` : '', business.vatNumber ? `${t.vatNo} ${business.vatNumber}` : '', business.invoiceEmail, business.phone]
    .filter(Boolean)
    .join(' · ');
  text(foot, M, PAGE_H - 52, 7.5, { color: MUTED, maxWidth: PAGE_W - 2 * M });
  text(t.page, M, PAGE_H - 38, 7.5, { color: [115, 121, 110] });

  return doc.output('arraybuffer');
}

/** Bestandsnaam voor de download: "Factuur-VAS-2026-0142.pdf". */
export function invoiceFileName(lang, invoiceNumber) {
  const base = lang === 'en' ? 'Invoice' : 'Factuur';
  return `${base}-${String(invoiceNumber || 'concept').replace(/[^\w-]+/g, '_')}.pdf`;
}
