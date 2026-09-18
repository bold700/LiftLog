import { applyCors } from './_lib/cors.mjs';
import { requireUser, enforceRateLimit } from './_lib/requireUser.mjs';
/**
 * Schrijft na een training twee stukjes tekst: een overdracht voor de trainers en een kort
 * bericht voor de sporter.
 *
 * Waarom: neemt een trainer een training over, dan zit het verhaal ("eerste keer kickboksen,
 * techniek zit er goed in, volgende keer op de heupen letten") in zijn hoofd en in losse
 * notities per oefening. De vaste trainer krijgt dat nu niet te zien. Dit maakt er één verhaal
 * van, dat de trainer nog kan bijschrijven voordat het weggaat.
 *
 * De app stuurt de feiten mee die hij al heeft; dit endpoint doet alleen de verwoording en raakt
 * geen data aan. De tekst gaat terug naar dezelfde gebruiker, dus er komt niets bij iemand
 * terecht die het niet al mocht zien.
 *
 * POST, JSON:
 *   { sporterName, dayLabel, feeling?, sporterNote?, exercises: [{ name, weight?, sets?, reps?,
 *     effort?, note?, previousWeight? }] }
 * Antwoord:
 *   { handover: string, toSporter: string }
 */
const OPENAI_API_URL = 'https://api.openai.com/v1/responses';
const MODEL = (process.env.OPENAI_RECAP_MODEL || 'gpt-4.1-mini').trim().split(/\s+/)[0];

/** Per gebruiker per dag. Een training afronden gebeurt hooguit een paar keer per dag. */
const RATE_LIMIT_PER_DAY = 60;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_EXERCISES = 30;

const EFFORT_TEXT = { light: 'te licht', good: 'ging goed', heavy: 'te zwaar' };
const FEELING_TEXT = { 1: 'zwaar', 2: 'matig', 3: 'oké', 4: 'goed', 5: 'top' };

const SYSTEM = [
  'Je schrijft voor een personal-trainingstudio. Je krijgt de feiten van één training.',
  'Lever twee teksten in het Nederlands, in jij-vorm waar dat past, zonder opsommingstekens.',
  '',
  '1) "handover": de overdracht aan de vaste trainer, van collega tot collega. Drie tot vijf zinnen:',
  'wat er is gedaan en met welke gewichten, wat opviel (techniek, belasting, klachten), en waar de',
  'volgende keer op gelet moet worden. Noem de sporter bij naam. Wees concreet en nuchter; verzin',
  'niets wat niet in de feiten staat.',
  '',
  '2) "toSporter": een kort bericht aan de sporter zelf, twee tot drie zinnen. Positief maar eerlijk,',
  'benoem wat goed ging en één ding voor de volgende keer. Geen medische uitspraken.',
  '',
  'Antwoord ALLEEN met JSON: {"handover": string, "toSporter": string}.',
].join('\n');

function json(res, status, body) {
  const payload = JSON.stringify(body);
  const ct = 'application/json; charset=utf-8';
  if (typeof res.status === 'function') {
    res.status(status).setHeader('Content-Type', ct);
    res.end(payload);
    return;
  }
  res.writeHead(status, { 'Content-Type': ct });
  res.end(payload);
}

function extractText(payload) {
  if (!payload || typeof payload !== 'object') return '';
  if (typeof payload.output_text === 'string' && payload.output_text.trim()) return payload.output_text;
  const out = Array.isArray(payload.output) ? payload.output : [];
  for (const item of out) {
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const c of content) {
      if (typeof c?.text === 'string' && c.text.trim()) return c.text;
    }
  }
  return '';
}

function parseJsonLenient(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    const a = raw.indexOf('{');
    const b = raw.lastIndexOf('}');
    if (a >= 0 && b > a) return JSON.parse(raw.slice(a, b + 1));
    throw new Error('Geen geldige JSON');
  }
}

function str(v, max) {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

function num(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/** De feiten van de training als platte tekst; dat leest een model beter dan losse JSON-velden. */
export function buildFacts(body) {
  const sporterName = str(body?.sporterName, 80) || 'de sporter';
  const dayLabel = str(body?.dayLabel, 120) || 'de training';
  const lines = [`Sporter: ${sporterName}`, `Training: ${dayLabel}`];

  const feeling = num(body?.feeling);
  if (feeling && FEELING_TEXT[feeling]) lines.push(`Hoe het voelde: ${feeling} van 5 (${FEELING_TEXT[feeling]})`);
  const sporterNote = str(body?.sporterNote, 500);
  if (sporterNote) lines.push(`Opmerking van de sporter: ${sporterNote}`);

  const exercises = Array.isArray(body?.exercises) ? body.exercises.slice(0, MAX_EXERCISES) : [];
  if (exercises.length) {
    lines.push('', 'Gedaan:');
    for (const ex of exercises) {
      const name = str(ex?.name, 120);
      if (!name) continue;
      const parts = [];
      const weight = num(ex?.weight);
      const sets = num(ex?.sets);
      const reps = num(ex?.reps);
      if (weight != null) parts.push(`${weight} kg`);
      if (sets != null && reps != null) parts.push(`${sets} × ${reps}`);
      else if (reps != null) parts.push(`${reps} reps`);
      const prev = num(ex?.previousWeight);
      if (prev != null && weight != null && prev !== weight) {
        parts.push(`vorige keer ${prev} kg`);
      }
      const effort = EFFORT_TEXT[str(ex?.effort, 10)];
      if (effort) parts.push(effort);
      const note = str(ex?.note, 300);
      if (note) parts.push(`notitie: ${note}`);
      lines.push(`- ${name}${parts.length ? ` — ${parts.join(', ')}` : ''}`);
    }
  }
  return lines.join('\n');
}

/**
 * Leest het antwoord van het model uit. Modellen zetten hun JSON nogal eens in een codeblok of
 * met een zin ervoor; daar mag dit niet op stukvallen. Null als er niets bruikbaars in staat.
 */
export function parseRecapReply(raw) {
  let parsed;
  try {
    parsed = parseJsonLenient(String(raw ?? ''));
  } catch {
    return null;
  }
  const handover = str(parsed?.handover, 2000);
  const toSporter = str(parsed?.toSporter, 1000);
  if (!handover && !toSporter) return null;
  return { handover, toSporter };
}

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
  if (!process.env.OPENAI_API_KEY) {
    console.error('[training-recap] OPENAI_API_KEY ontbreekt');
    return json(res, 500, { error: 'De samenvatting is niet geconfigureerd op de server.' });
  }

  const user = await requireUser(req, res);
  if (!user) return;
  if (!(await enforceRateLimit(user.db, res, user.uid, 'training-recap', RATE_LIMIT_PER_DAY, DAY_MS))) return;

  const facts = buildFacts(req.body ?? {});
  if (!/^- /m.test(facts)) {
    return json(res, 400, { error: 'Er is nog niets gelogd om over te schrijven.' });
  }

  try {
    const response = await fetch(OPENAI_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.4,
        max_output_tokens: 700,
        input: [
          { role: 'system', content: [{ type: 'input_text', text: SYSTEM }] },
          { role: 'user', content: [{ type: 'input_text', text: facts }] },
        ],
      }),
    });
    if (!response.ok) {
      const text = await response.text();
      console.error('[training-recap] OpenAI HTTP', response.status, text.slice(0, 300));
      return json(res, 502, { error: 'De AI-dienst gaf een fout terug. Schrijf het zelf of probeer het later.' });
    }
    const raw = extractText(await response.json());
    if (!raw) return json(res, 502, { error: 'Lege AI-respons.' });
    const recap = parseRecapReply(raw);
    if (!recap) return json(res, 502, { error: 'De AI gaf geen bruikbare tekst terug.' });
    return json(res, 200, recap);
  } catch (e) {
    console.error('[training-recap]', e instanceof Error ? e.message : String(e));
    return json(res, 502, { error: 'Samenvatten mislukt. Schrijf het zelf of probeer het opnieuw.' });
  }
}
