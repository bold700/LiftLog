/**
 * Een training uit een AI-chat (ChatGPT, Claude) in een ingeplande les zetten: welke les wordt
 * bedoeld ("woensdagavond", "de bootcamp van 19:00") en hoe de oefeningen worden opgeslagen als
 * voorbereiding van die les (`classPlans/{classId}`, dezelfde als Lessen → Deelnemers → Voorbereiding).
 *
 * Pure functies, zodat de koppeling (api/_lib/mcpServer.mjs) en de tests hetzelfde rekenen.
 */

const norm = (s) =>
  String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();

const toMin = (hhmm) => {
  const [h, m] = String(hhmm ?? '').split(':').map(Number);
  return Number.isFinite(h) ? h * 60 + (Number.isFinite(m) ? m : 0) : NaN;
};

/** Dagdelen zoals iemand ze zegt: "ochtend" t/m 12:00, "middag" 12–17, "avond" vanaf 17:00. */
const PARTS = [
  { words: ['ochtend', 'morgen'], from: 0, to: 12 * 60 },
  { words: ['middag'], from: 12 * 60, to: 17 * 60 },
  { words: ['avond'], from: 17 * 60, to: 24 * 60 },
];

/**
 * Welke lessen van die dag passen bij wat er gevraagd wordt. `time` is een tijd ("19:00", "19u",
 * "19.30") of een dagdeel ("avond"); `lesson` een (deel van de) naam ("bootcamp"). Zonder iets: alle
 * lessen van die dag. PT-momenten van één lid tellen alleen mee als ze bij naam genoemd worden.
 */
export function matchClasses(classes, { time = '', lesson = '' } = {}) {
  const t = norm(time);
  const q = norm(lesson);
  let list = classes.filter((c) => !c.cancelledAt);
  if (!q) list = list.filter((c) => !c.privateFor);
  if (q) list = list.filter((c) => norm(c.title).includes(q));
  const clock = t.match(/(\d{1,2})(?:[:.u](\d{2}))?/);
  if (clock) {
    const wanted = Number(clock[1]) * 60 + Number(clock[2] ?? 0);
    // Precies die begintijd, anders de les die op dat moment bezig is of binnen een half uur begint.
    const exact = list.filter((c) => toMin(c.startTime) === wanted);
    list = exact.length ? exact : list.filter((c) => Math.abs(toMin(c.startTime) - wanted) <= 30 || (toMin(c.startTime) <= wanted && wanted < toMin(c.endTime)));
  } else if (t) {
    const part = PARTS.find((p) => p.words.some((w) => t.includes(w)));
    if (part) list = list.filter((c) => toMin(c.startTime) >= part.from && toMin(c.startTime) < part.to);
  }
  return list.sort((a, b) => String(a.startTime).localeCompare(String(b.startTime)));
}

const int = (v, max) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n > 0 ? Math.min(n, max) : 0;
};

/**
 * Oefeningen uit de chat netjes maken: naam verplicht, sets en herhalingen als hele getallen (0 =
 * niet van toepassing, bijv. bij "40 seconden"), de rest als aanwijzing.
 */
export function cleanPlanExercises(list) {
  return (Array.isArray(list) ? list : [])
    .map((e) => ({
      name: String(e?.name ?? '').replace(/\s+/g, ' ').trim().slice(0, 80),
      sets: int(e?.sets, 20),
      reps: int(e?.reps, 200),
      notes: String(e?.notes ?? '').replace(/\s+/g, ' ').trim().slice(0, 200),
    }))
    .filter((e) => e.name)
    .slice(0, 40);
}

/** "woensdag 7 oktober 19:00–20:00 · Bootcamp" */
export function classLine(c) {
  const day = new Date(`${c.date}T12:00:00Z`).toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
  return `${day} ${c.startTime}${c.endTime ? `–${c.endTime}` : ''} · ${c.title || 'Les'}`;
}
