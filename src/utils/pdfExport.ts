/**
 * PDF-export van een workout, als invulbaar trainingsschema (vergelijkbaar met de Virtuagym-export,
 * maar in eigen huisstijl): logo, gegevens van sporter/trainer/periode, per trainingsdag een datumregel
 * en per oefening een blok met plaatje, spiergroepen, doel per set en lege vakjes om per training
 * gewicht en herhalingen in te schrijven. Alleen jsPDF-basisfuncties, geen autotable-plugin.
 */
import jsPDF from 'jspdf';
import type { Schema, SchemaDay, SchemaExercise } from '../types';
import { FORMULE7_GOAL_OPTIONS, getFormule7MoverDetail, getFormule7MoverLabel } from './formule7Defaults';
import { getExerciseMuscleMapping } from './muscleMappingResolver';
import { getDisplayName, normalizeMuscleName } from './muscleNames';
import { formatCardioSummary, formatCooldownSummary, formatStretchingSummary, formatWarmupSummary } from './format';
import { loadExerciseImages } from './exerciseImage';
import { SCHEDULE_WEEKS } from './workoutFilter';
import { VA_LOGO_ASPECT, VA_LOGO_PNG_DATA_URL } from '../assets/brand/vaLogoPng';

export interface PdfExportOptions {
  clientName?: string | null;
  trainerName?: string | null;
  /** Namen van de deelnemers bij een workout voor meerdere sporters. */
  participantNames?: string[];
  /** Plaatjes van de oefeningen ophalen en inbedden (standaard aan). */
  includeImages?: boolean;
  /** Voortgang tijdens het ophalen van plaatjes, voor een statusmelding in de UI. */
  onProgress?: (message: string) => void;
}

// --- Maten (mm, A4 staand) ---------------------------------------------------
const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN_X = 14;
const MARGIN_TOP = 16;
const MARGIN_BOTTOM = 18;
const CONTENT_W = PAGE_W - MARGIN_X * 2;

/** Aantal lege kolommen per dag om trainingen in te schrijven. */
const SESSION_COLS = 6;
const SESSION_COL_W = 14;
const SESSION_W = SESSION_COLS * SESSION_COL_W;
const SESSION_X = MARGIN_X + CONTENT_W - SESSION_W;

const IMAGE_SIZE = 24;
const BLOCK_PAD = 2.5;
const SET_ROW_H = 6.2;
const MAX_SET_ROWS = 10;

// --- Kleuren -----------------------------------------------------------------
const INK = [17, 17, 17] as const;
const MUTED = [110, 110, 110] as const;
const LINE = [214, 214, 214] as const;
const LINE_SOFT = [232, 232, 232] as const;
const FILL_SOFT = [246, 246, 246] as const;
const DAY_BAR = [24, 24, 24] as const;

type Rgb = readonly [number, number, number];

function setText(doc: jsPDF, color: Rgb, size: number, style: 'normal' | 'bold' | 'italic' | 'bolditalic' = 'normal') {
  doc.setTextColor(color[0], color[1], color[2]);
  doc.setFontSize(size);
  doc.setFont('helvetica', style);
}

function setLine(doc: jsPDF, color: Rgb, width = 0.25) {
  doc.setDrawColor(color[0], color[1], color[2]);
  doc.setLineWidth(width);
}

function setFill(doc: jsPDF, color: Rgb) {
  doc.setFillColor(color[0], color[1], color[2]);
}

/** Regelhoogte in mm bij een puntgrootte (1 pt = 0,3528 mm, met wat ruimte). */
function lineHeight(pt: number): number {
  return pt * 0.3528 * 1.25;
}

function wrap(doc: jsPDF, text: string, width: number): string[] {
  const lines = doc.splitTextToSize(text, Math.max(10, width)) as string[];
  return lines.length ? lines : [''];
}

function formatDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatKg(kg: number): string {
  return `${Number.isInteger(kg) ? kg : kg.toFixed(1).replace('.', ',')} kg`;
}

/** Doel per set, zoals "12 × 40 kg" of "12 herh.". */
function setTargetText(ex: SchemaExercise): string {
  const reps = ex.repsTarget > 0 ? String(ex.repsTarget) : '–';
  if (typeof ex.targetWeight === 'number' && ex.targetWeight > 0) return `${reps} × ${formatKg(ex.targetWeight)}`;
  return ex.repsTarget > 0 ? `${reps} herh.` : reps;
}

/** Regel onder de sets: rust, intensiteit, 1RM. */
function exerciseDetailText(ex: SchemaExercise): string | null {
  const parts: string[] = [];
  if (typeof ex.restSeconds === 'number' && ex.restSeconds > 0) parts.push(`Rust ${ex.restSeconds} s`);
  if (typeof ex.intensityPercent1RM === 'number' && ex.intensityPercent1RM > 0) parts.push(`${ex.intensityPercent1RM}% 1RM`);
  if (typeof ex.estimated1RMKg === 'number' && ex.estimated1RMKg > 0) parts.push(`1RM ± ${formatKg(ex.estimated1RMKg)}`);
  return parts.length ? parts.join(' · ') : null;
}

/** Regio's uit de spiergroep-mapping → Nederlandse naam voor op papier. */
const MUSCLE_LABELS_NL: Record<string, string> = {
  chest: 'Borst',
  shoulders: 'Schouders',
  'body back shoulders': 'Schouders',
  biceps: 'Biceps',
  triceps: 'Triceps',
  underarms: 'Onderarmen',
  abs: 'Buikspieren',
  obliques: 'Schuine buikspieren',
  quads: 'Quadriceps',
  calves: 'Kuiten',
  'body back gluteals': 'Bilspieren',
  'body back hamstrings': 'Hamstrings',
  'body back lower back': 'Onderrug',
  'body back upper back': 'Bovenrug',
  'body back lats': 'Lats',
  'body back traps': 'Trapezius',
};

/** Nederlandse spiergroepen bij een oefening ("Quadriceps · Bilspieren"), of null. */
function muscleGroupsText(exerciseName: string): string | null {
  const mapping = getExerciseMuscleMapping(exerciseName);
  if (!mapping) return null;
  const names: string[] = [];
  const push = (raw: string) => {
    const base = raw.replace(/\s+(Primary|Secondary)$/i, '').trim();
    if (!base) return;
    const label = MUSCLE_LABELS_NL[base.toLowerCase()] ?? getDisplayName(normalizeMuscleName(base));
    if (!names.includes(label)) names.push(label);
  };
  mapping.primary.forEach(push);
  mapping.secondary.forEach(push);
  return names.length ? names.slice(0, 4).join(' · ') : null;
}

function goalLabel(schema: Schema): string | null {
  const goal = schema.formule7?.goal;
  if (!goal) return null;
  return FORMULE7_GOAL_OPTIONS.find((o) => o.value === goal)?.label ?? String(goal);
}

/** Dagonderdelen uit Formule 7 (warming-up, cardio, cooling-down, stretching) als label/tekst. */
function dayComponents(day: SchemaDay): Array<[string, string]> {
  const rows: Array<[string, string]> = [];
  const warmup = formatWarmupSummary(day.warmup);
  const cardio = formatCardioSummary(day.cardio);
  const cooldown = formatCooldownSummary(day.cooldown);
  const stretching = formatStretchingSummary(day.stretching);
  if (warmup) rows.push(['Warming-up', warmup]);
  if (cardio) rows.push(['Cardio', cardio]);
  if (cooldown) rows.push(['Cooling-down', cooldown]);
  if (stretching) rows.push(['Stretching', stretching]);
  return rows;
}

// --- Tekenen -------------------------------------------------------------------

class PdfWriter {
  readonly doc: jsPDF;
  y = MARGIN_TOP;

  constructor() {
    this.doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  }

  get bottom(): number {
    return PAGE_H - MARGIN_BOTTOM;
  }

  /** Zorgt dat er `height` mm ruimte is; anders een nieuwe pagina. Geeft true terug bij een paginawissel. */
  ensure(height: number): boolean {
    if (this.y + height <= this.bottom) return false;
    this.doc.addPage();
    this.y = MARGIN_TOP;
    return true;
  }

  /** Tekst met automatische regelafbreking; geeft de gebruikte hoogte terug. */
  paragraph(text: string, x: number, width: number, pt: number, color: Rgb, style: 'normal' | 'bold' | 'italic' = 'normal'): number {
    setText(this.doc, color, pt, style);
    const lines = wrap(this.doc, text, width);
    const lh = lineHeight(pt);
    this.doc.text(lines, x, this.y + pt * 0.3528);
    this.y += lines.length * lh;
    return lines.length * lh;
  }

  rule(color: Rgb = LINE): void {
    setLine(this.doc, color);
    this.doc.line(MARGIN_X, this.y, MARGIN_X + CONTENT_W, this.y);
  }
}

function drawHeader(w: PdfWriter, schema: Schema, options: PdfExportOptions): void {
  const { doc } = w;
  const logoW = 26;
  const logoH = logoW / VA_LOGO_ASPECT;
  doc.addImage(VA_LOGO_PNG_DATA_URL, 'PNG', MARGIN_X + CONTENT_W - logoW, w.y - 2, logoW, logoH, 'va-logo', 'FAST');

  const textW = CONTENT_W - logoW - 8;
  setText(doc, MUTED, 8.5, 'bold');
  doc.setCharSpace(0.4);
  doc.text('VAN AS PERSONAL TRAINING', MARGIN_X, w.y + 2.5);
  doc.setCharSpace(0);
  w.y += 8;
  w.paragraph(schema.name || 'Workout', MARGIN_X, textW, 19, INK, 'bold');
  w.y += 1;

  // Korte typering: categorie / lesmoment / week
  const tags: string[] = [];
  if (schema.category) tags.push(schema.category);
  if (schema.series) tags.push(schema.series);
  if (typeof schema.scheduleWeek === 'number') tags.push(`Week ${schema.scheduleWeek} van ${SCHEDULE_WEEKS}`);
  if (schema.isFormule7Template || schema.formule7) tags.push('Formule 7');
  if (tags.length) {
    w.paragraph(tags.join('  ·  '), MARGIN_X, textW, 9.5, MUTED);
  }
  w.y = Math.max(w.y, MARGIN_TOP + logoH + 2);
  w.y += 3;

  // Gegevensblok in twee kolommen
  const clientName = options.clientName ?? schema.formule7?.clientName ?? null;
  const participants = (options.participantNames ?? []).filter(Boolean);
  const start = formatDate(schema.startDate);
  const end = formatDate(schema.endDate);
  const goal = goalLabel(schema);
  const created = formatDate(schema.createdAt?.slice(0, 10));

  const rows: Array<[string, string]> = [];
  if (schema.audience === 'group') rows.push(['Sporter', 'Groepsles']);
  else if (participants.length > 1) rows.push(['Sporters', participants.join(', ')]);
  else if (clientName || participants[0]) rows.push(['Sporter', clientName || participants[0]]);
  else if (schema.audience === 'open') rows.push(['Sporter', 'Open workout']);
  if (options.trainerName) rows.push(['Trainer', options.trainerName]);
  if (start && end) rows.push(['Periode', `${start} t/m ${end}`]);
  else if (start) rows.push(['Start', start]);
  if (goal) rows.push(['Doel', goal]);
  rows.push(['Trainingsdagen', String(schema.days.length)]);
  if (created) rows.push(['Aangemaakt', created]);

  const colW = CONTENT_W / 2;
  const labelW = 27;
  const rowH = 5.6;
  const rowsPerCol = Math.ceil(rows.length / 2);
  const blockH = rowsPerCol * rowH + 5;
  setFill(doc, FILL_SOFT);
  doc.roundedRect(MARGIN_X, w.y, CONTENT_W, blockH, 1.5, 1.5, 'F');
  rows.forEach(([label, value], i) => {
    const col = Math.floor(i / rowsPerCol);
    const row = i % rowsPerCol;
    const x = MARGIN_X + 4 + col * colW;
    const yy = w.y + 4 + row * rowH + 3.2;
    setText(doc, MUTED, 8.5);
    doc.text(label, x, yy);
    setText(doc, INK, 9.5, 'bold');
    const valueLines = wrap(doc, value, colW - labelW - 6);
    doc.text(valueLines[0] + (valueLines.length > 1 ? '…' : ''), x + labelW, yy);
  });
  w.y += blockH + 4;

  w.paragraph(
    'Schrijf bovenaan elke kolom de datum van de training en per set het gebruikte gewicht en aantal herhalingen. Zo zie je je progressie per oefening.',
    MARGIN_X,
    CONTENT_W,
    8.5,
    MUTED,
    'italic'
  );
  w.y += 2;
}

function drawIntake(w: PdfWriter, schema: Schema): void {
  const f = schema.formule7;
  if (!f) return;
  const rows: Array<[string, string]> = [];
  if (f.casus) rows.push(['Casus', f.casus]);
  if (typeof f.ageYears === 'number') rows.push(['Leeftijd', `${f.ageYears} jaar`]);
  if (f.gender) rows.push(['Geslacht', f.gender === 'M' ? 'Man' : 'Vrouw']);
  if (f.moverType) {
    const detail = getFormule7MoverDetail(f.moverType);
    rows.push(['Activiteit', detail ? `${getFormule7MoverLabel(f.moverType)} (${detail})` : getFormule7MoverLabel(f.moverType)]);
  }
  if (f.sessionsPerWeek) rows.push(['Sessies per week', String(f.sessionsPerWeek)]);
  if (f.sessionDurationCategory) rows.push(['Duur per sessie', `${f.sessionDurationCategory} min`]);
  if (typeof f.restingHr === 'number') rows.push(['Rusthartslag', `${f.restingHr} bpm`]);
  if (typeof f.theoreticalMaxHr === 'number') rows.push(['Max. hartslag (theoretisch)', `${f.theoreticalMaxHr} bpm`]);
  if (f.weekschemaType) rows.push(['Weekschema', f.weekschemaType === 'SPLIT' ? 'Split' : 'Total body']);
  if (f.notes?.trim()) rows.push(['Opmerkingen', f.notes.trim()]);
  if (!rows.length) return;

  const { doc } = w;
  w.ensure(12);
  setText(doc, INK, 11, 'bold');
  doc.text('Intake · Formule 7-routekaart', MARGIN_X, w.y + 3.5);
  w.y += 7;
  const labelW = 42;
  for (const [label, value] of rows) {
    setText(doc, INK, 9);
    const lines = wrap(doc, value, CONTENT_W - labelW);
    const h = lines.length * lineHeight(9) + 1;
    w.ensure(h);
    setText(doc, MUTED, 8.5);
    doc.text(label, MARGIN_X, w.y + 3.1);
    setText(doc, INK, 9);
    doc.text(lines, MARGIN_X + labelW, w.y + 3.1);
    w.y += h;
  }
  w.y += 4;
}

/** Zwarte dagbalk + datumregel met lege kolommen. */
function drawDayHeader(w: PdfWriter, day: SchemaDay, dayIndex: number, dayCount: number, continued: boolean): void {
  const { doc } = w;
  const barH = 8.5;
  setFill(doc, DAY_BAR);
  doc.roundedRect(MARGIN_X, w.y, CONTENT_W, barH, 1.2, 1.2, 'F');
  setText(doc, [255, 255, 255], 11, 'bold');
  const label = day.dayLabel?.trim() || `Dag ${dayIndex + 1}`;
  // Bij één trainingsdag (bv. een groepsles per week) is "Dag 1 ·" ruis.
  const title = dayCount === 1 || /^dag\s*\d/i.test(label) ? label : `Dag ${dayIndex + 1} · ${label}`;
  doc.text(`${title}${continued ? ' (vervolg)' : ''}`, MARGIN_X + 3.5, w.y + 5.7);
  setText(doc, [200, 200, 200], 8.5);
  const count = `${day.exercises.length} ${day.exercises.length === 1 ? 'oefening' : 'oefeningen'}`;
  doc.text(count, MARGIN_X + CONTENT_W - 3.5, w.y + 5.7, { align: 'right' });
  w.y += barH + 2;

  // Datumregel: "Datum" + lege vakjes per training
  const rowH = 7.5;
  setLine(doc, LINE);
  setFill(doc, FILL_SOFT);
  doc.rect(MARGIN_X, w.y, CONTENT_W, rowH, 'FD');
  setText(doc, INK, 9, 'bold');
  doc.text('Datum', MARGIN_X + 3, w.y + 4.9);
  setText(doc, MUTED, 7.5);
  doc.text('Training', SESSION_X - 3, w.y + 4.9, { align: 'right' });
  for (let i = 0; i < SESSION_COLS; i++) {
    const x = SESSION_X + i * SESSION_COL_W;
    doc.line(x, w.y, x, w.y + rowH);
    setText(doc, MUTED, 7);
    doc.text(String(i + 1), x + 1.5, w.y + 3);
  }
  w.y += rowH + 2;
}

interface ExerciseLayout {
  nameLines: string[];
  muscles: string | null;
  setRows: number;
  extraSetsNote: string | null;
  detail: string | null;
  noteLines: string[];
  hasImage: boolean;
  textX: number;
  textW: number;
  height: number;
  headH: number;
}

function measureExercise(doc: jsPDF, ex: SchemaExercise, hasImage: boolean): ExerciseLayout {
  const textX = MARGIN_X + BLOCK_PAD + (hasImage ? IMAGE_SIZE + 3 : 0);
  const textW = SESSION_X - textX - 2;
  setText(doc, INK, 10.5, 'bold');
  const nameLines = wrap(doc, ex.exerciseName || 'Oefening', textW);
  const muscles = muscleGroupsText(ex.exerciseName);
  const sets = Math.max(1, Math.round(ex.setsTarget || 0));
  const setRows = Math.min(sets, MAX_SET_ROWS);
  const extraSetsNote = sets > MAX_SET_ROWS ? `In totaal ${sets} sets.` : null;
  const detail = exerciseDetailText(ex);
  const noteText = [extraSetsNote, ex.notes?.trim()].filter(Boolean).join(' ');
  setText(doc, INK, 8.5, 'italic');
  const noteLines = noteText ? wrap(doc, noteText, CONTENT_W - BLOCK_PAD * 2 - 14) : [];

  const headH = nameLines.length * lineHeight(10.5) + (muscles ? lineHeight(8.5) : 0) + 1.5;
  const setsH = setRows * SET_ROW_H;
  const detailH = detail ? lineHeight(8.5) + 0.5 : 0;
  const leftH = headH + setsH + detailH;
  const bodyH = Math.max(leftH, hasImage ? IMAGE_SIZE + 1 : 0);
  const notesH = noteLines.length ? noteLines.length * lineHeight(8.5) + 2 : 0;
  return {
    nameLines,
    muscles,
    setRows,
    extraSetsNote,
    detail,
    noteLines,
    hasImage,
    textX,
    textW,
    headH,
    height: BLOCK_PAD * 2 + bodyH + notesH,
  };
}

function drawExercise(w: PdfWriter, ex: SchemaExercise, layout: ExerciseLayout, image: string | null): void {
  const { doc } = w;
  const top = w.y;
  const { height } = layout;

  // Kader
  setLine(doc, LINE);
  setFill(doc, [255, 255, 255]);
  doc.roundedRect(MARGIN_X, top, CONTENT_W, height, 1.5, 1.5, 'FD');

  // Plaatje
  if (image) {
    try {
      doc.addImage(image, 'PNG', MARGIN_X + BLOCK_PAD, top + BLOCK_PAD, IMAGE_SIZE, IMAGE_SIZE, undefined, 'FAST');
    } catch {
      // Plaatje overslaan als jsPDF het niet kan lezen.
    }
  }

  // Naam + spiergroepen
  let y = top + BLOCK_PAD;
  setText(doc, INK, 10.5, 'bold');
  doc.text(layout.nameLines, layout.textX, y + 10.5 * 0.3528);
  y += layout.nameLines.length * lineHeight(10.5);
  if (layout.muscles) {
    setText(doc, MUTED, 8.5);
    doc.text(layout.muscles, layout.textX, y + 8.5 * 0.3528);
    y += lineHeight(8.5);
  }
  y = top + BLOCK_PAD + layout.headH;

  // Setregels met lege vakjes per training
  const target = setTargetText(ex);
  const rowsTop = y;
  for (let i = 0; i < layout.setRows; i++) {
    const ry = rowsTop + i * SET_ROW_H;
    if (i % 2 === 1) {
      setFill(doc, FILL_SOFT);
      doc.rect(layout.textX - 1, ry, SESSION_X + SESSION_W - layout.textX + 1, SET_ROW_H, 'F');
    }
    setText(doc, MUTED, 8.5);
    doc.text(`Set ${i + 1}`, layout.textX, ry + 4.2);
    setText(doc, INK, 9.5, 'bold');
    doc.text(target, layout.textX + 13, ry + 4.2);
  }
  // Rasterlijnen van de invulvakjes
  setLine(doc, LINE_SOFT, 0.2);
  for (let i = 0; i <= layout.setRows; i++) {
    const ry = rowsTop + i * SET_ROW_H;
    doc.line(layout.textX - 1, ry, SESSION_X + SESSION_W, ry);
  }
  for (let i = 0; i <= SESSION_COLS; i++) {
    const x = SESSION_X + i * SESSION_COL_W;
    doc.line(x, rowsTop, x, rowsTop + layout.setRows * SET_ROW_H);
  }
  y = rowsTop + layout.setRows * SET_ROW_H;

  if (layout.detail) {
    setText(doc, MUTED, 8.5);
    doc.text(layout.detail, layout.textX, y + 0.5 + 8.5 * 0.3528);
  }

  // Notitie onderaan, over de volle breedte
  if (layout.noteLines.length) {
    const noteY = top + height - BLOCK_PAD - layout.noteLines.length * lineHeight(8.5) + 1;
    setLine(doc, LINE_SOFT, 0.2);
    doc.line(MARGIN_X + BLOCK_PAD, noteY - 1.5, MARGIN_X + CONTENT_W - BLOCK_PAD, noteY - 1.5);
    setText(doc, MUTED, 8.5, 'bold');
    doc.text('Notitie', MARGIN_X + BLOCK_PAD, noteY + 8.5 * 0.3528);
    setText(doc, INK, 8.5, 'italic');
    doc.text(layout.noteLines, MARGIN_X + BLOCK_PAD + 14, noteY + 8.5 * 0.3528);
  }

  w.y = top + height + 2.5;
}

function drawDay(w: PdfWriter, day: SchemaDay, dayIndex: number, dayCount: number, images: Map<string, string>): void {
  const { doc } = w;
  const headerH = 8.5 + 2 + 7.5 + 2;
  // Dagkop nooit onderaan een pagina zonder minstens één blok eronder.
  const firstLayout = day.exercises[0]
    ? measureExercise(doc, day.exercises[0], images.has(day.exercises[0].exerciseName.trim()))
    : null;
  w.ensure(headerH + (firstLayout ? Math.min(firstLayout.height, 60) : 12));
  drawDayHeader(w, day, dayIndex, dayCount, false);

  if (day.notes?.trim()) {
    w.ensure(10);
    setFill(doc, FILL_SOFT);
    setText(doc, INK, 9, 'italic');
    const lines = wrap(doc, day.notes.trim(), CONTENT_W - 6);
    const h = lines.length * lineHeight(9) + 3;
    doc.roundedRect(MARGIN_X, w.y, CONTENT_W, h, 1.2, 1.2, 'F');
    doc.text(lines, MARGIN_X + 3, w.y + 1.5 + 9 * 0.3528);
    w.y += h + 2;
  }

  const components = dayComponents(day);
  if (components.length) {
    for (const [label, value] of components) {
      setText(doc, INK, 9);
      const lines = wrap(doc, value, CONTENT_W - 30);
      const h = lines.length * lineHeight(9) + 0.8;
      w.ensure(h);
      setText(doc, MUTED, 8.5, 'bold');
      doc.text(label, MARGIN_X + 1, w.y + 3.1);
      setText(doc, INK, 9);
      doc.text(lines, MARGIN_X + 30, w.y + 3.1);
      w.y += h;
    }
    w.y += 2;
  }

  if (!day.exercises.length) {
    w.paragraph('Geen oefeningen voor deze dag.', MARGIN_X + 1, CONTENT_W, 9, MUTED, 'italic');
    w.y += 4;
    return;
  }

  day.exercises.forEach((ex, i) => {
    const name = ex.exerciseName?.trim() ?? '';
    const image = images.get(name) ?? null;
    const layout = i === 0 && firstLayout ? firstLayout : measureExercise(doc, ex, Boolean(image));
    if (w.ensure(layout.height)) drawDayHeader(w, day, dayIndex, dayCount, true);
    drawExercise(w, ex, layout, image);
  });
  w.y += 3;
}

function drawFooters(doc: jsPDF, schema: Schema): void {
  const total = doc.getNumberOfPages();
  for (let p = 1; p <= total; p++) {
    doc.setPage(p);
    const y = PAGE_H - 10;
    setLine(doc, LINE_SOFT, 0.2);
    doc.line(MARGIN_X, y - 3.5, MARGIN_X + CONTENT_W, y - 3.5);
    setText(doc, MUTED, 7.5);
    doc.text(`Van As Personal Training · ${schema.name || 'Workout'}`, MARGIN_X, y);
    doc.text(`Pagina ${p} van ${total}`, MARGIN_X + CONTENT_W, y, { align: 'right' });
  }
}

/** Bouwt de PDF en geeft het jsPDF-document terug (voor opslaan of testen). */
export async function buildSchemaPdf(schema: Schema, options: PdfExportOptions = {}): Promise<jsPDF> {
  const includeImages = options.includeImages ?? true;
  let images = new Map<string, string>();
  if (includeImages) {
    const names = schema.days.flatMap((d) => d.exercises.map((e) => e.exerciseName?.trim() ?? '')).filter(Boolean);
    if (names.length) {
      options.onProgress?.('Plaatjes van oefeningen ophalen…');
      images = await loadExerciseImages(names, {
        size: 320,
        concurrency: 4,
        onProgress: (done, total) => options.onProgress?.(`Plaatjes ophalen… ${done}/${total}`),
      });
    }
  }
  options.onProgress?.('PDF samenstellen…');

  const w = new PdfWriter();
  drawHeader(w, schema, options);
  drawIntake(w, schema);
  if (!schema.days.length) {
    w.paragraph('Geen trainingsdagen of oefeningen in deze workout.', MARGIN_X, CONTENT_W, 10, MUTED, 'italic');
  } else {
    schema.days.forEach((day, i) => drawDay(w, day, i, schema.days.length, images));
  }
  drawFooters(w.doc, schema);
  return w.doc;
}

export async function exportSchemaToPdf(schema: Schema, options: PdfExportOptions = {}): Promise<void> {
  const doc = await buildSchemaPdf(schema, options);
  const safeName = (schema.name || 'workout').replace(/[^\w\-]+/g, '_');
  doc.save(`${safeName}.pdf`);
}
