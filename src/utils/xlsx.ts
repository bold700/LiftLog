/**
 * Minimale xlsx-lezer voor het importeren van leden (bijv. de ledenexport uit Virtuagym, die als
 * Excel komt). Leest alleen het eerste werkblad als tekst: genoeg voor een lijst met namen,
 * e-mailadressen, datums en getallen. Een xlsx is een zip met XML; fflate pakt uit, de rest is
 * eenvoudig tekstwerk zodat dit ook in tests (zonder browser) werkt. Zelfde uitvoer als parseCsv.
 */
import { unzipSync, strFromU8 } from 'fflate';
import type { ParsedCsv } from './csv';

const decode = (s: string) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, '&');

/** Alle tekst in <t>-elementen samen (een tekst kan uit meerdere opgemaakte stukjes bestaan). */
const textOf = (xml: string) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => decode(m[1])).join('');

const attr = (attrs: string, name: string) => attrs.match(new RegExp(`(?:^|\\s)${name}="([^"]*)"`))?.[1];

/** "AB12" → 27 (kolomindex, 0 = A). */
function columnIndex(ref: string): number {
  let n = 0;
  for (const ch of ref.replace(/\d+/g, '')) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** Ingebouwde Excel-getalnotaties die een datum zijn. */
const BUILTIN_DATE_FORMATS = new Set([14, 15, 16, 17, 22, 27, 30, 36, 50, 57]);

/** Per celstijl (`s="…"`) of het een datum is: een ingebouwde datumnotatie of een eigen met d/m/y. */
function dateStyles(stylesXml: string): boolean[] {
  const custom = new Map<number, string>();
  for (const m of stylesXml.matchAll(/<numFmt\s([^>]*?)\/?>/g)) {
    const id = Number(attr(m[1], 'numFmtId'));
    const code = decode(attr(m[1], 'formatCode') ?? '');
    custom.set(id, code);
  }
  const xfs = stylesXml.match(/<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/)?.[1] ?? '';
  return [...xfs.matchAll(/<xf\s([^>]*?)\/?>/g)].map((m) => {
    const id = Number(attr(m[1], 'numFmtId') ?? 0);
    if (BUILTIN_DATE_FORMATS.has(id)) return true;
    // Tekst tussen aanhalingstekens en [kleur]-codes tellen niet mee, minuten (h:mm, mm:ss) ook niet;
    // wat overblijft met d, m of y is een datum.
    const code = (custom.get(id) ?? '').replace(/"[^"]*"|\[[^\]]*\]/g, '').replace(/h+:m+|m+:s+/gi, '');
    return /[dmy]/i.test(code);
  });
}

/** Excel-datum (dagen sinds 30-12-1899) → "2024-03-01". */
function serialToIso(serial: number): string {
  const ms = Math.round((serial - 25569) * 86400000);
  return new Date(ms).toISOString().slice(0, 10);
}

/** Pad van het eerste werkblad volgens workbook.xml, of sheet1 als dat niet te vinden is. */
function firstSheetPath(files: Record<string, Uint8Array>, read: (p: string) => string): string | undefined {
  const rid = read('xl/workbook.xml').match(/<sheet\s[^>]*?r:id="([^"]+)"/)?.[1];
  if (rid) {
    for (const m of read('xl/_rels/workbook.xml.rels').matchAll(/<Relationship\s([^>]*?)\/?>/g)) {
      if (attr(m[1], 'Id') !== rid) continue;
      const target = attr(m[1], 'Target') ?? '';
      const path = target.startsWith('/') ? target.slice(1) : `xl/${target}`;
      if (files[path]) return path;
    }
  }
  if (files['xl/worksheets/sheet1.xml']) return 'xl/worksheets/sheet1.xml';
  return Object.keys(files).find((p) => /^xl\/worksheets\/sheet\d+\.xml$/.test(p));
}

/** Leest het eerste werkblad; de eerste niet-lege rij zijn de kolomkoppen (kleine letters). */
export function parseXlsx(data: Uint8Array): ParsedCsv {
  const files = unzipSync(data);
  const read = (path: string) => (files[path] ? strFromU8(files[path]) : '');
  const shared = [...read('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1]));
  const isDateStyle = dateStyles(read('xl/styles.xml'));
  const sheetPath = firstSheetPath(files, read);
  if (!sheetPath) return { headers: [], rows: [] };

  const grid: string[][] = [];
  for (const row of read(sheetPath).matchAll(/<row\b[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const cells: string[] = [];
    let next = 0;
    for (const c of (row[1] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1];
      const body = c[2] ?? '';
      const ref = attr(attrs, 'r');
      const idx = ref ? columnIndex(ref) : next;
      const type = attr(attrs, 't');
      const v = body.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      let value = '';
      if (type === 's') value = shared[Number(v)] ?? '';
      else if (type === 'inlineStr') value = textOf(body);
      else if (v != null) {
        value = decode(v);
        const num = Number(value);
        if (type !== 'str' && type !== 'b' && type !== 'e' && isDateStyle[Number(attr(attrs, 's') ?? 0)] && Number.isFinite(num) && num > 0) value = serialToIso(num);
      }
      cells[idx] = value.trim();
      next = idx + 1;
    }
    grid.push(Array.from(cells, (x) => x ?? ''));
  }

  const nonEmpty = grid.filter((r) => r.some((v) => v !== ''));
  if (nonEmpty.length === 0) return { headers: [], rows: [] };
  const headers = nonEmpty[0].map((h) => h.trim().toLowerCase());
  const rows = nonEmpty.slice(1).map((r) => {
    const out: Record<string, string> = {};
    headers.forEach((h, i) => {
      if (h) out[h] = r[i] ?? '';
    });
    return out;
  });
  return { headers, rows };
}
