/**
 * Bijzonderheden per sporter (blessures, pijntjes) en wat ze betekenen voor een oefening.
 *
 * De trainer legt per sporter vast wat er speelt ("linkerschouder, vermijden") en wat die sporter
 * in plaats daarvan doet. Bij een oefening zoeken we in de oefeningdataset welke spieren die belast
 * en vergelijken dat met de opgegeven lichaamsdelen; botst het, dan volgt een waarschuwing met de
 * vervanging die de trainer zelf heeft genoteerd.
 *
 * Pure functies, los van de UI, zodat het gedrag te testen is.
 */
import exerciseGifIndex from '../data/exerciseGifIndex.json';
import type { Limitation, LimitationArea } from '../types';

interface DatasetEntry {
  id: string;
  name: string;
  bodyPart?: string;
  target?: string;
  equipment?: string;
  secondaryMuscles?: string[];
}

const DATASET = exerciseGifIndex as DatasetEntry[];

function norm(s: string): string {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\(.*?\)/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const byNorm = new Map<string, DatasetEntry>();
for (const e of DATASET) {
  const k = norm(e.name);
  if (k && !byNorm.has(k)) byNorm.set(k, e);
}

/**
 * Lichaamsdelen waarop een sporter een bijzonderheid kan hebben, met de termen die de
 * oefeningdataset gebruikt (target, secondaryMuscles en bodyPart). Vergelijking gaat op hele
 * woorden, zodat "back" niet ineens "lower back" raakt.
 */
export const LIMITATION_AREAS: { value: LimitationArea; label: string; terms: string[] }[] = [
  {
    value: 'schouder',
    label: 'Schouder',
    terms: ['delts', 'deltoids', 'rear deltoids', 'shoulders', 'rotator cuff', 'serratus anterior'],
  },
  {
    value: 'nek',
    label: 'Nek',
    terms: ['neck', 'traps', 'trapezius', 'upper trapezius', 'levator scapulae', 'sternocleidomastoid', 'scalenes', 'splenius capitis', 'splenius cervicis', 'deep cervical flexors', 'suboccipitals', 'semispinalis capitis', 'longus capitis', 'longus colli'],
  },
  { value: 'elleboog', label: 'Elleboog', terms: ['biceps', 'triceps', 'brachialis'] },
  { value: 'pols', label: 'Pols of hand', terms: ['forearms', 'wrists', 'wrist extensors', 'wrist flexors', 'hands', 'grip muscles', 'lower arms'] },
  { value: 'onderrug', label: 'Onderrug', terms: ['spine', 'lower back'] },
  { value: 'bovenrug', label: 'Bovenrug', terms: ['upper back', 'lats', 'latissimus dorsi', 'rhomboids', 'traps', 'trapezius'] },
  { value: 'borst', label: 'Borst', terms: ['pectorals', 'chest', 'upper chest'] },
  { value: 'buik', label: 'Buik of lies', terms: ['abs', 'abdominals', 'lower abs', 'obliques', 'core', 'waist', 'groin', 'inner thighs'] },
  {
    value: 'heup',
    label: 'Heup of bil',
    terms: ['glutes', 'gluteus medius', 'gluteus minimus', 'abductors', 'adductors', 'hip flexors', 'piriformis', 'obturator internus', 'gemellus superior/inferior'],
  },
  { value: 'knie', label: 'Knie', terms: ['quads', 'quadriceps', 'hamstrings', 'adductors'] },
  { value: 'hamstring', label: 'Hamstring', terms: ['hamstrings'] },
  {
    value: 'enkel',
    label: 'Enkel of voet',
    terms: ['calves', 'gastrocnemius', 'soleus', 'tibialis anterior', 'tibialis posterior', 'ankles', 'ankle stabilizers', 'feet', 'shins', 'peroneus longus', 'peroneus brevis'],
  },
  { value: 'overig', label: 'Overig', terms: [] },
];

const AREA_BY_VALUE = new Map(LIMITATION_AREAS.map((a) => [a.value, a]));

export function limitationAreaLabel(area: LimitationArea): string {
  return AREA_BY_VALUE.get(area)?.label ?? 'Overig';
}

/** Korte omschrijving van één bijzonderheid, bijv. "Schouder (links) – vermijden". */
export function describeLimitation(l: Limitation): string {
  const base = limitationAreaLabel(l.area);
  const note = l.note?.trim();
  const suffix = l.severity === 'vermijden' ? 'vermijden' : 'let op';
  return note ? `${base} (${note}) – ${suffix}` : `${base} – ${suffix}`;
}

/** Alle spieren die een oefening belast (primair + secundair), genormaliseerd. */
function musclesOf(entry: DatasetEntry): string[] {
  const out = new Set<string>();
  if (entry.target) out.add(norm(entry.target));
  for (const m of entry.secondaryMuscles ?? []) out.add(norm(m));
  return [...out].filter(Boolean);
}

/** Belast deze oefening het gebied van de bijzonderheid? Vergelijking op hele woorden. */
function touchesArea(entry: DatasetEntry, area: LimitationArea): boolean {
  const spec = AREA_BY_VALUE.get(area);
  if (!spec || spec.terms.length === 0) return false;
  const values = [...musclesOf(entry), norm(entry.bodyPart ?? '')].filter(Boolean);
  return spec.terms.some((term) => {
    const key = norm(term);
    return values.some((v) => v === key || v.split(' ').includes(key) || key.split(' ').includes(v));
  });
}

export type LimitationLevel = 'ok' | 'let-op' | 'vermijden';

export interface LimitationCheck {
  level: LimitationLevel;
  /** Bijzonderheden die deze oefening raken, zwaarste eerst. */
  hits: Limitation[];
  /** Wat de trainer bij die bijzonderheden heeft genoteerd als vervanging. */
  alternatives: string[];
}

const OK: LimitationCheck = { level: 'ok', hits: [], alternatives: [] };

/**
 * Botst een oefening met de bijzonderheden van een sporter? Geeft het zwaarste niveau terug,
 * welke bijzonderheden het raakt en (bij een botsing) alternatieven.
 * Onbekende oefeningnamen geven altijd 'ok': liever geen waarschuwing dan een verkeerde.
 */
export function checkExerciseAgainstLimitations(
  exerciseName: string,
  limitations: Limitation[] | null | undefined
): LimitationCheck {
  if (!limitations || limitations.length === 0) return OK;
  const entry = byNorm.get(norm(exerciseName));
  if (!entry) return OK;

  const hits = limitations.filter((l) => touchesArea(entry, l.area));
  if (hits.length === 0) return OK;
  const level: LimitationLevel = hits.some((h) => h.severity === 'vermijden') ? 'vermijden' : 'let-op';
  const sorted = [...hits].sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'vermijden' ? -1 : 1));
  return {
    level,
    hits: sorted,
    // Geen automatisch alternatief: de oefeningdataset is te grof om te bepalen of een andere
    // oefening het klachtgebied écht ontziet. Wat de trainer zelf noteerde is wél betrouwbaar.
    alternatives: sorted.map((h) => h.alternative?.trim()).filter((a): a is string => Boolean(a)),
  };
}

/**
 * Alternatieven voor een oefening: uit de dataset, met zoveel mogelijk dezelfde spieren, maar
 * zonder een van de opgegeven klachtgebieden te belasten. Geen match → lege lijst.
 */
