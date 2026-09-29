/**
 * Oefening gewisseld tijdens een training (makkelijker, zwaarder of bij een klacht). Geldt alleen
 * voor deze training: het schema zelf blijft hetzelfde. Staat op dit toestel, net zo lang als de
 * rest van de lopende training (12 uur), zodat een herlaadactie de wissel niet kwijtraakt.
 */
const STORAGE_KEY = 'liftlog_session_swaps';
const TTL_MS = 12 * 60 * 60 * 1000;

type Stored = Record<string, { at: number; swaps: Record<string, string> }>;

const keyOf = (schemaId: string, dayIndex: number) => `${schemaId}:${dayIndex}`;

function read(): Stored {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return parsed && typeof parsed === 'object' ? (parsed as Stored) : {};
  } catch {
    return {};
  }
}

function write(all: Stored): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  } catch {
    // Geen opslag (privévenster): de wissel geldt dan alleen tot herladen.
  }
}

/** Wissels van deze trainingsdag: positie van de oefening → gekozen oefening. */
export function getSessionSwaps(schemaId: string, dayIndex: number, now = Date.now()): Record<number, string> {
  const entry = read()[keyOf(schemaId, dayIndex)];
  if (!entry || now - entry.at > TTL_MS) return {};
  const out: Record<number, string> = {};
  for (const [i, name] of Object.entries(entry.swaps ?? {})) {
    if (typeof name === 'string' && name.trim()) out[Number(i)] = name;
  }
  return out;
}

/** Wissel zetten (of met `null` terug naar de geplande oefening). Geeft de nieuwe wissels terug. */
export function setSessionSwap(
  schemaId: string,
  dayIndex: number,
  index: number,
  exerciseName: string | null,
  now = Date.now()
): Record<number, string> {
  const all = read();
  // Verlopen trainingen meteen opruimen.
  for (const [k, v] of Object.entries(all)) if (!v || now - v.at > TTL_MS) delete all[k];
  const swaps = { ...getSessionSwaps(schemaId, dayIndex, now) };
  if (exerciseName && exerciseName.trim()) swaps[index] = exerciseName.trim();
  else delete swaps[index];
  const key = keyOf(schemaId, dayIndex);
  if (Object.keys(swaps).length) all[key] = { at: now, swaps };
  else delete all[key];
  write(all);
  return swaps;
}
