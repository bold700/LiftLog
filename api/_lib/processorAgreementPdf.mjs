/**
 * De getekende verwerkersovereenkomst als PDF: partijen, de tekst van de getekende versie, en een
 * blok met de elektronische ondertekening (wie, functie, e-mail, datum en tijd, versie en de hash
 * van de tekst). Alleen jsPDF-basisfuncties, net als de factuur.
 *
 * De PDF wordt steeds opnieuw gemaakt uit het ondertekeningsrecord en de tekst van die versie; er
 * hoeft dus niets als bestand bewaard te worden om hem later nog eens te downloaden.
 */
import { jsPDF } from 'jspdf';
import { PROCESSOR, PROCESSOR_AGREEMENT_TITLE, agreementSections } from './processorAgreement.mjs';

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const M = 56;
const TEXT_W = PAGE_W - 2 * M;
const BOTTOM = PAGE_H - M;

/** "1 oktober 2026 om 14:05" in Nederlandse tijd. */
export function formatSignedAt(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso ?? '');
  const date = d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Amsterdam' });
  const time = d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Amsterdam' });
  return `${date} om ${time}`;
}

export function buildProcessorAgreementPdf(record) {
  const sections = agreementSections(record.version);
  if (!sections) throw new Error(`Onbekende versie van de verwerkersovereenkomst: ${record.version}`);
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  let y = M;

  const font = (size, bold = false, gray = false) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    doc.setTextColor(gray ? 100 : 25);
  };
  const ensure = (height) => {
    if (y + height > BOTTOM) {
      doc.addPage();
      y = M;
    }
  };
  /** Tekst met terugloop; `indent` voor genummerde regels. */
  const para = (text, { size = 10, bold = false, gray = false, indent = 0, label = null, after = 6 } = {}) => {
    font(size, bold, gray);
    const lh = size * 1.4;
    const lines = doc.splitTextToSize(text, TEXT_W - indent);
    lines.forEach((line, i) => {
      ensure(lh);
      if (i === 0 && label) doc.text(label, M, y + size);
      doc.text(line, M + indent, y + size);
      y += lh;
    });
    y += after;
  };

  const c = record.controller;
  const s = record.signer;

  para(PROCESSOR_AGREEMENT_TITLE, { size: 18, bold: true, after: 2 });
  para(`Versie ${record.version}`, { size: 10, gray: true, after: 16 });

  para('Partijen', { size: 12, bold: true, after: 4 });
  para(
    `${c.legalName}, ${c.street}, ${c.postcode} ${c.city}, KvK ${c.kvk}, vertegenwoordigd door ${s.name} (${s.role}); hierna "Verwerkingsverantwoordelijke".`,
    { label: '1.', indent: 16 }
  );
  para(
    `${PROCESSOR.legalName}, ${PROCESSOR.street}, ${PROCESSOR.postcode} ${PROCESSOR.city}, KvK ${PROCESSOR.kvk}; hierna "Verwerker".`,
    { label: '2.', indent: 16, after: 12 }
  );

  for (const section of sections) {
    ensure(40);
    para(section.title, { size: 12, bold: true, after: 4 });
    for (const p of section.paragraphs ?? []) para(p);
    (section.items ?? []).forEach((item, i) => para(item, { label: `${i + 1}.`, indent: 16 }));
    y += 6;
  }

  ensure(150);
  y += 6;
  para('Elektronische ondertekening', { size: 12, bold: true, after: 4 });
  para(`Namens ${c.legalName} getekend door ${s.name}, ${s.role}.`);
  para(`E-mailadres: ${s.email}`, { after: 2 });
  para(`Datum en tijd: ${formatSignedAt(record.signedAt)} (${record.signedAt})`, { after: 2 });
  para(`Versie van de tekst: ${record.version}`, { after: 2 });
  para(`Controlegetal van de tekst (SHA-256): ${record.textHash}`, { size: 8, gray: true, after: 8 });
  para(
    `${PROCESSOR.legalName} heeft deze overeenkomst aangeboden in de app VORM en is daarmee gebonden aan de inhoud. Vragen: ${PROCESSOR.email}.`,
    { size: 9, gray: true }
  );

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    font(8, false, true);
    doc.text(`${PROCESSOR_AGREEMENT_TITLE} · ${c.legalName} · versie ${record.version}`, M, PAGE_H - 28);
    doc.text(`Pagina ${i} van ${pages}`, PAGE_W - M, PAGE_H - 28, { align: 'right' });
  }
  return doc.output('arraybuffer');
}
