#!/usr/bin/env node
/**
 * Zet het NEVO-online databestand (RIVM) om naar src/data/nevo2025.json, de compacte zoeklijst die
 * Voeding gebruikt.
 *
 *   node scripts/build-nevo.mjs pad/naar/NEVO2025_v9.0.csv
 *
 * Het bronbestand staat niet in de repo: vraag het gratis aan via
 * https://www.rivm.nl/form/nevo-online-gegevensbestand-2 (akkoord met de voorwaarden).
 *
 * Voorwaarden (NEVO-online 2025/9.0): de gegevens alleen in ongewijzigde vorm gebruiken, met
 * bronvermelding. Dit script kiest daarom alleen kolommen uit en zet "1,8" om naar 1.8; het rondt
 * niets af en past geen waarden aan. Een lege cel blijft leeg (null), want "niet bepaald" is iets
 * anders dan 0.
 *
 * Vorm per regel: [code, naam, Engelse naam, synoniemen, groep, eenheid ("g" | "ml"),
 *                  kcal, eiwit, koolhydraten, vet, suikers, vezels, verzadigd vet, natrium (mg)]
 */
import fs from 'node:fs';
import path from 'node:path';

const src = process.argv[2];
if (!src) {
  console.error('Gebruik: node scripts/build-nevo.mjs NEVO2025_v9.0.csv');
  process.exit(1);
}

/** Eenvoudige CSV-lezer voor NEVO: velden gescheiden door |, tekst soms tussen "…" (met "" als escape). */
function parseLine(line) {
  const out = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === '|') {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

const text = fs.readFileSync(src, 'utf8').replace(/^\uFEFF/, '');
const lines = text.split(/\r?\n/).filter((l) => l.trim());
const header = parseLine(lines[0]);
const col = (name) => {
  const i = header.indexOf(name);
  if (i < 0) throw new Error(`Kolom "${name}" niet gevonden in ${path.basename(src)}`);
  return i;
};

const C = {
  version: col('NEVO-versie/NEVO-version'),
  group: col('Voedingsmiddelgroep'),
  code: col('NEVO-code'),
  name: col('Voedingsmiddelnaam/Dutch food name'),
  en: col('Engelse naam/Food name'),
  syn: col('Synoniem'),
  qty: col('Hoeveelheid/Quantity'),
  kcal: col('ENERCC (kcal)'),
  prot: col('PROT (g)'),
  cho: col('CHO (g)'),
  fat: col('FAT (g)'),
  sugar: col('SUGAR (g)'),
  fib: col('FIBT (g)'),
  sat: col('FASAT (g)'),
  na: col('NA (mg)'),
};

/** "1,8" → 1.8; leeg → null. Geen afronding: de waarde blijft zoals NEVO hem geeft. */
const num = (s) => {
  const t = String(s ?? '').trim();
  if (!t) return null;
  const n = Number(t.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

const rows = [];
let version = '';
for (const line of lines.slice(1)) {
  const f = parseLine(line);
  if (!f[C.code]) continue;
  version ||= f[C.version].trim();
  rows.push([
    Number(f[C.code]),
    f[C.name].trim(),
    f[C.en].trim(),
    f[C.syn].trim(),
    f[C.group].trim(),
    /ml/i.test(f[C.qty]) ? 'ml' : 'g',
    num(f[C.kcal]),
    num(f[C.prot]),
    num(f[C.cho]),
    num(f[C.fat]),
    num(f[C.sugar]),
    num(f[C.fib]),
    num(f[C.sat]),
    num(f[C.na]),
  ]);
}

const out = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../src/data/nevo2025.json');
// "NEVO-Online 2025 9.0" → "2025/9.0", zoals de voorgeschreven bronvermelding hem schrijft.
const m = version.match(/(\d{4})\D+(\d+\.\d+)/);
const v = m ? `${m[1]}/${m[2]}` : version;
fs.writeFileSync(out, JSON.stringify({ version: v, source: `NEVO-online versie ${v}, RIVM, Bilthoven`, rows }));
console.log(`${rows.length} voedingsmiddelen (NEVO ${v}) → ${path.relative(process.cwd(), out)}`);
