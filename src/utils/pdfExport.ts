import jsPDF from 'jspdf';
import type { Schema } from '../types';

const MARGIN_X = 16;
const MARGIN_Y = 20;
const LINE_HEIGHT = 6;
const PAGE_WIDTH = 210; // A4 mm

interface PdfExportOptions {
  clientName?: string | null;
  trainerName?: string | null;
}

export async function exportSchemaToPdf(schema: Schema, options?: PdfExportOptions): Promise<void> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  let y = MARGIN_Y;

  // Branding header (alleen tekst, geen logo voor kleine bestandsgrootte)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text('Van As Personal Training', MARGIN_X, y);
  y += LINE_HEIGHT * 2;

  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text('Workout schema', MARGIN_X, y);
  y += LINE_HEIGHT * 2;

  // Workout titel
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(schema.name || 'Workout', MARGIN_X, y);
  y += LINE_HEIGHT * 2;

  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');

  // Kerninfo: periode, sporter, trainer
  const periodText =
    schema.startDate && schema.endDate
      ? `Periode: ${schema.startDate} t/m ${schema.endDate}`
      : 'Periode: niet ingesteld';
  doc.text(periodText, MARGIN_X, y);
  y += LINE_HEIGHT;

  const clientName =
    options?.clientName ??
    schema.formule7?.clientName ??
    null;
  const trainerName = options?.trainerName ?? null;

  if (clientName) {
    doc.text(`Cliënt: ${clientName}`, MARGIN_X, y);
    y += LINE_HEIGHT;
  }

  if (trainerName) {
    doc.text(`Trainer: ${trainerName}`, MARGIN_X, y);
    y += LINE_HEIGHT;
  }

  // Formule 7 routekaart – belangrijkste velden als intakeblok
  if (schema.formule7) {
    const f = schema.formule7;
    y += LINE_HEIGHT;
    doc.setFont('helvetica', 'bold');
    doc.text('Intake / Formule 7-routekaart', MARGIN_X, y);
    y += LINE_HEIGHT;

    doc.setFont('helvetica', 'normal');
    const intakeLines: string[] = [];
    if (f.clientName) intakeLines.push(`Naam cliënt: ${f.clientName}`);
    if (f.casus) intakeLines.push(`Casus: ${f.casus}`);
    if (typeof f.ageYears === 'number') intakeLines.push(`Leeftijd: ${f.ageYears} jaar`);
    if (f.gender) intakeLines.push(`Geslacht: ${f.gender}`);
    if (f.moverType) intakeLines.push(`Mover type: ${String(f.moverType)}`);
    if (f.goal) intakeLines.push(`Doelstelling (Formule 7): ${String(f.goal)}`);
    if (f.sessionsPerWeek) intakeLines.push(`Sessies per week: ${f.sessionsPerWeek}`);
    if (f.sessionDurationCategory)
      intakeLines.push(`Trainingsduur per sessie: ${String(f.sessionDurationCategory)}`);
    if (typeof f.restingHr === 'number') intakeLines.push(`Rusthartfrequentie: ${f.restingHr} bpm`);
    if (typeof f.theoreticalMaxHr === 'number')
      intakeLines.push(`Theoretische max. hartfrequentie: ${f.theoreticalMaxHr} bpm`);

    intakeLines.forEach((line) => {
      if (!line) return;
      if (y > 270) {
        doc.addPage();
        y = MARGIN_Y;
      }
      const wrapped = doc.splitTextToSize(line, PAGE_WIDTH - MARGIN_X * 2);
      doc.text(wrapped as string[], MARGIN_X, y);
      y += LINE_HEIGHT * (wrapped as string[]).length;
    });
  }

  y += LINE_HEIGHT; // extra ruimte

  if (!schema.days.length) {
    doc.text('Geen dagen / oefeningen gedefinieerd.', MARGIN_X, y);
    const safeNameEmpty = (schema.name || 'workout').replace(/[^\w\-]+/g, '_');
    doc.save(`${safeNameEmpty}.pdf`);
    return;
  }

  // Per dag tabel met oefeningen
  schema.days.forEach((day, dayIndex) => {
    if (y > 270) {
      doc.addPage();
      y = MARGIN_Y;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text(day.dayLabel || `Dag ${dayIndex + 1}`, MARGIN_X, y);
    y += LINE_HEIGHT;

    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');

    if (!day.exercises.length) {
      doc.text('Geen oefeningen', MARGIN_X, y);
      y += LINE_HEIGHT * 2;
      return;
    }

    // Tabelkop
    const colName = MARGIN_X;
    const colSets = colName + 90;
    const colReps = colSets + 20;
    const colRest = colReps + 20;

    doc.setFont('helvetica', 'bold');
    doc.text('Oefening', colName, y);
    doc.text('Sets', colSets, y);
    doc.text('Reps', colReps, y);
    doc.text('Rust (s)', colRest, y);
    y += LINE_HEIGHT;

    doc.setFont('helvetica', 'normal');

    day.exercises.forEach((ex) => {
      if (y > 280) {
        doc.addPage();
        y = MARGIN_Y;
      }

      const name = ex.exerciseName || '';
      const nameLines = doc.splitTextToSize(name, colSets - colName - 2);
      doc.text(nameLines as string[], colName, y);

      doc.text(String(ex.setsTarget ?? ''), colSets, y);
      doc.text(String(ex.repsTarget ?? ''), colReps, y);
      doc.text(String(ex.restSeconds ?? ''), colRest, y);

      y += LINE_HEIGHT * Math.max(1, (nameLines as string[]).length);
    });

    y += LINE_HEIGHT; // ruimte tussen dagen
  });

  const safeName = (schema.name || 'workout').replace(/[^\w\-]+/g, '_');
  doc.save(`${safeName}.pdf`);
}

