/**
 * Zoeken in het Nederlands Voedingsstoffenbestand (NEVO-online, RIVM) voor Voeding. Basisproducten
 * ("magere kwark", "volkorenbrood", "kipfilet") staan daar met betrouwbare waarden per 100 g;
 * merkproducten blijven van Open Food Facts komen.
 *
 * NEVO zet het hoofdwoord vooraan ("Kwark magere"), dus de woorden van de zoekterm mogen in elke
 * volgorde voorkomen: "magere kwark" vindt "Kwark magere". Puur, zodat het los te testen is.
 *
 * Voorwaarden NEVO-online: waarden ongewijzigd tonen, met bronvermelding (zie NEVO_ATTRIBUTION).
 */

/** [code, naam, Engelse naam, synoniemen, groep, eenheid, kcal, eiwit, koolh., vet, suikers, vezels, verz. vet, natrium mg] */
export type NevoRow = [
  number,
  string,
  string,
  string,
  string,
  'g' | 'ml',
  number | null,
  number | null,
  number | null,
  number | null,
  number | null,
  number | null,
  number | null,
  number | null,
];

export interface NevoData {
  version: string;
  source: string;
  rows: NevoRow[];
}

export interface NevoFood {
  code: string;
  name: string;
  group: string;
  unit: 'g' | 'ml';
  per100g: { kcal: number; protein: number; carbs: number; fat: number };
  details: { sugars: number | null; fiber: number | null; saturatedFat: number | null; salt: number | null } | null;
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .trim();
const words = (s: string) => norm(s).split(/\s+/).filter(Boolean);

/**
 * Woordvormen die NEVO anders schrijft dan mensen typen: meervoud ("aardappelen" ↔ "aardappel"),
 * en een voorvoegsel met een streepje ("Kwark vruchten-" → "vruchten"). Genoeg om de meeste
 * zoektermen op te vangen zonder een woordenboek.
 */
function stems(w: string): string[] {
  const out = new Set([w]);
  for (const suf of ['en', 's', 'e', 'n']) if (w.length > suf.length + 2 && w.endsWith(suf)) out.add(w.slice(0, -suf.length));
  return [...out];
}

/**
 * Hoe goed past één zoekwoord bij een lijst woorden: 3 = heel woord (ook enkelvoud/meervoud),
 * 2 = begin van een woord ("appel" in "appelmoes"), 1 = eind van een samenstelling ("brood" in
 * "tarwebrood"), 0 = niet. Korte woorden ("ei") alleen als heel woord, anders vindt "ei" alles.
 */
function wordMatch(q: string, tokens: string[]): 0 | 1 | 2 | 3 {
  const qs = stems(q);
  let best: 0 | 1 | 2 | 3 = 0;
  for (const t of tokens) {
    const ts = stems(t);
    if (qs.some((s) => ts.includes(s))) return 3;
    if (q.length < 3) continue;
    if (qs.some((s) => t.startsWith(s))) best = Math.max(best, 2) as 2;
    else if (q.length >= 4 && qs.some((s) => t.endsWith(s))) best = Math.max(best, 1) as 1;
  }
  return best;
}

const WEIGHTS = { name: [0, 6, 7, 12], syn: [0, 5, 6, 9], en: [0, 2, 3, 5] } as const;

/** Relevantie van één NEVO-regel voor de zoekwoorden; 0 = geen treffer. */
export function nevoScore(row: NevoRow, qWords: string[]): number {
  if (qWords.length === 0) return 0;
  const nameTokens = words(row[1]);
  const synTokens = words(row[3]);
  const enTokens = words(row[2]);
  let score = 0;
  let allExactInName = true;
  for (const q of qWords) {
    const inName = wordMatch(q, nameTokens);
    const w = Math.max(WEIGHTS.name[inName], WEIGHTS.syn[wordMatch(q, synTokens)], WEIGHTS.en[wordMatch(q, enTokens)]);
    if (w === 0) return 0; // elk zoekwoord moet ergens voorkomen
    if (inName !== 3) allExactInName = false;
    score += w;
  }
  // "volkoren brood" als één woord: NEVO kent "Volkorenbrood" als synoniem.
  if (qWords.length > 1) {
    const joined = qWords.join('');
    if (wordMatch(joined, nameTokens) === 3 || wordMatch(joined, synTokens) === 3) score += 10;
  }
  // Het hoofdwoord ("Kwark …") gezocht: bovenaan. Kortere namen zijn algemener, dus eerder bedoeld.
  const head = nameTokens[0] ? wordMatch(qWords[0], [nameTokens[0]]) : 0;
  score += head === 3 ? 6 : head === 2 ? 2 : 0;
  // Precies de gezochte naam ("Banaan", "Pindakaas"): de algemeenste variant.
  if (allExactInName && nameTokens.length === qWords.length) score += 4;
  score -= Math.min(nameTokens.length, 8) * 0.5;
  // Rauw of bereid? Bij verder gelijke treffers liever wat mensen meestal eten.
  if (nameTokens.includes('rauw')) score -= 0.25;
  return score;
}

/** Zout (g) uit natrium (mg): natrium × 2,5 — een berekening op de NEVO-waarde, geen wijziging ervan. */
export const saltFromSodium = (naMg: number | null) => (naMg == null ? null : Math.round((naMg * 2.5) / 100) / 10);

export function toNevoFood(row: NevoRow): NevoFood {
  const [code, name, , , group, unit, kcal, prot, cho, fat, sugar, fib, sat, na] = row;
  const details = { sugars: sugar, fiber: fib, saturatedFat: sat, salt: saltFromSodium(na) };
  return {
    code: `nevo:${code}`,
    name,
    group,
    unit,
    per100g: { kcal: kcal ?? 0, protein: prot ?? 0, carbs: cho ?? 0, fat: fat ?? 0 },
    details: Object.values(details).some((v) => v != null) ? details : null,
  };
}

/** De beste `limit` NEVO-treffers voor een zoekterm, beste eerst. */
export function searchNevo(rows: NevoRow[], term: string, limit = 12): NevoFood[] {
  const qWords = words(term);
  if (qWords.length === 0) return [];
  return rows
    .map((row) => ({ row, score: nevoScore(row, qWords) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.row[1].length - b.row[1].length)
    .slice(0, limit)
    .map((x) => toNevoFood(x.row));
}
