/**
 * Overdracht na een training: twee stukjes tekst op basis van wat er is gelogd — een verhaal voor
 * de vaste trainer en een kort bericht voor de sporter.
 *
 * Waarom dit naast de assistent in hetzelfde endpoint hangt en geen eigen route is: Vercel telt
 * elk bestand in `api/` als een aparte serverless functie, en daar zit een plafond aan. Alles in
 * `api/_lib/` is gedeelde code en telt niet mee. De assistent is bovendien de plek waar de app al
 * met het model praat; dit is diezelfde stem, alleen zonder gereedschapskist.
 *
 * Aanroep: POST /api/assistant met { action: 'recap', sporterName, dayLabel, feeling?,
 * sporterNote?, exercises: [...] } → { handover, toSporter }
 */
const OPENAI_API_URL = 'https://api.openai.com/v1/responses';
export const RECAP_MODEL = (process.env.OPENAI_RECAP_MODEL || 'gpt-4.1-mini').trim().split(/\s+/)[0];

/** Per gebruiker per dag. Een training afronden gebeurt hooguit een paar keer per dag. */
export const RECAP_RATE_LIMIT_PER_DAY = 60;
export const RECAP_DAY_MS = 24 * 60 * 60 * 1000;
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


/**
 * Doet de modelaanroep. `fetchImpl` is er zodat een test hem kan vervangen zonder netwerk.
 * Gooit een Error met een nette Nederlandse tekst als er niets bruikbaars uitkomt.
 */
export async function requestRecap(body, fetchImpl = fetch) {
  const facts = buildFacts(body ?? {});
  if (!/^- /m.test(facts)) {
    const err = new Error('Er is nog niets gelogd om over te schrijven.');
    err.status = 400;
    throw err;
  }
  const response = await fetchImpl(OPENAI_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: RECAP_MODEL,
      temperature: 0.4,
      max_output_tokens: 700,
      input: [
        { role: 'system', content: [{ type: 'input_text', text: SYSTEM }] },
        { role: 'user', content: [{ type: 'input_text', text: facts }] },
      ],
    }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    console.error('[recap] OpenAI HTTP', response.status, String(text).slice(0, 300));
    const err = new Error('De AI-dienst gaf een fout terug. Schrijf het zelf of probeer het later.');
    err.status = 502;
    throw err;
  }
  const recap = parseRecapReply(extractText(await response.json()));
  if (!recap) {
    const err = new Error('De AI gaf geen bruikbare tekst terug.');
    err.status = 502;
    throw err;
  }
  return recap;
}
