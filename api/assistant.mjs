import { applyCors } from './_lib/cors.mjs';
/**
 * De assistent in VORM zelf.
 *
 * Waarom dit naast de MCP-koppeling bestaat: die koppeling vraagt van iedere gebruiker een betaald
 * ChatGPT-account plus het plakken van een koppel-URL. Dat doet vrijwel geen enkele sporter. Hier
 * praat de gebruiker met dezelfde assistent binnen de app, ingelogd met het eigen account, zonder
 * dat er klantgegevens naar een chatdienst van een derde gaan buiten de modelaanroep om.
 *
 * De gereedschapskist is letterlijk dezelfde als die van de AI-koppeling (zie assistantTools.mjs),
 * dus rollen, rechten en de studiogrens gelden hier automatisch net zo.
 *
 * POST, JSON:
 *   { messages: [{ role: 'user' | 'assistant', content: string }, ...] }
 * Antwoord:
 *   { reply: string, steps: [{ tool, ok }], build }
 *
 * Beveiliging:
 *  - Vereist een geldig Firebase ID-token in de Authorization-header (Bearer).
 *  - Alles wat de assistent doet loopt via de gereedschapskist, die zelf de rechten bewaakt.
 */
import { getAdmin } from './_lib/firebaseAdmin.mjs';
import { enforceRateLimit } from './_lib/requireUser.mjs';
import { createStore, todayNl } from './_lib/liftlogData.mjs';
import { openToolbox } from './_lib/assistantTools.mjs';

const OPENAI_API_URL = 'https://api.openai.com/v1/responses';
const MODEL = (process.env.OPENAI_ASSISTANT_MODEL || process.env.OPENAI_MODEL || 'gpt-4.1-mini').trim().split(/\s+/)[0];
const BUILD = (process.env.VERCEL_GIT_COMMIT_SHA || 'dev').slice(0, 7);

/**
 * Dagelijkse limiet per gebruiker. Dit is het duurste endpoint dat we hebben (tot zes modelrondes
 * per vraag), dus zonder limiet kan één account het hele budget opmaken.
 */
const RATE_LIMIT_PER_DAY = 120;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Maximaal aantal rondes waarin het model functies mag aanroepen voordat we het antwoord afdwingen. */
const MAX_ROUNDS = 6;
/** Hoeveel eerdere berichten we meesturen. Houdt de kosten en de latentie in de hand. */
const MAX_HISTORY = 20;

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

async function readBody(req) {
  if (req.body) return typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

const ROLE_LABEL = { sporter: 'sporter', trainer: 'trainer', admin: 'beheerder' };

function systemPrompt(profile, orgName) {
  const isStaff = profile.role === 'trainer' || profile.role === 'admin';
  return [
    `Je bent de assistent in VORM, de trainingsapp van ${orgName}.`,
    `Je praat met ${profile.displayName || profile.email || 'de gebruiker'} (${ROLE_LABEL[profile.role] ?? 'sporter'}).`,
    `Vandaag is ${todayNl()} (Nederlandse tijd).`,
    `Antwoord in het Nederlands, kort en praktisch, alsof je naast iemand in de sportschool staat.`,
    `Gewichten in kilo's. Gebruik de beschikbare functies om echte gegevens op te halen in plaats van te gokken;`,
    `verzin nooit een oefening, gewicht, meting of naam die je niet uit een functie hebt gekregen.`,
    isStaff
      ? `Je spreekt met een ${ROLE_LABEL[profile.role]}. Met de parameter "athlete" gaat het over een sporter; laat je hem weg, dan gaat het over de trainer zelf. Vraag door als onduidelijk is om wie het gaat.`
      : `Deze gebruiker ziet en logt alleen de eigen gegevens.`,
    `Vraag bij een schrijfactie (loggen, aanmaken, wijzigen) om bevestiging als er ook maar iets onduidelijk is.`,
    `Kun je iets niet, zeg dat dan gewoon in plaats van er omheen te praten.`,
  ].join(' ');
}

/** Zet de gespreksgeschiedenis om naar het formaat van de Responses-API. */
function toInput(messages) {
  const recent = messages.slice(-MAX_HISTORY);
  return recent
    .filter((m) => typeof m?.content === 'string' && m.content.trim())
    .map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: [{ type: m.role === 'assistant' ? 'output_text' : 'input_text', text: String(m.content).slice(0, 4000) }],
    }));
}

async function callOpenAi(body) {
  const response = await fetch(OPENAI_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text();
    console.error('[assistant] OpenAI HTTP', response.status, text.slice(0, 300));
    throw new Error(`OpenAI HTTP ${response.status}`);
  }
  return response.json();
}

/** Haalt de leesbare tekst uit een antwoord van de Responses-API. */
function outputText(result) {
  if (typeof result.output_text === 'string' && result.output_text.trim()) return result.output_text.trim();
  const parts = [];
  for (const item of result.output ?? []) {
    if (item.type !== 'message') continue;
    for (const c of item.content ?? []) if (c.type === 'output_text' && c.text) parts.push(c.text);
  }
  return parts.join('\n').trim();
}

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed', build: BUILD });

  if (!process.env.OPENAI_API_KEY) {
    console.error('[assistant] OPENAI_API_KEY ontbreekt');
    return json(res, 500, { error: 'De assistent is niet ingesteld op de server.', build: BUILD });
  }

  const admin = getAdmin();
  if (admin.error) {
    console.error('[assistant] Firebase Admin niet beschikbaar:', admin.error);
    return json(res, 500, { error: 'Serverconfiguratie onvolledig. Neem contact op met de beheerder.', build: BUILD });
  }

  // 1) Beller authenticeren met het Firebase ID-token van de ingelogde gebruiker.
  const authHeader = req.headers.authorization || req.headers.Authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) return json(res, 401, { error: 'Niet ingelogd.', build: BUILD });

  let uid;
  try {
    uid = (await admin.auth.verifyIdToken(token)).uid;
  } catch {
    return json(res, 401, { error: 'Sessie verlopen. Log opnieuw in.', build: BUILD });
  }

  if (!(await enforceRateLimit(admin.db, res, uid, 'assistant', RATE_LIMIT_PER_DAY, DAY_MS))) return;

  // 2) Profiel bepaalt de rol én de studio; daarna is alles tot die studio begrensd.
  const lookup = createStore(admin.db, admin.auth);
  const profile = await lookup.getProfile(uid);
  if (!profile) return json(res, 401, { error: 'Profiel niet gevonden.', build: BUILD });

  let body;
  try {
    body = await readBody(req);
  } catch {
    return json(res, 400, { error: 'Ongeldige aanvraag.', build: BUILD });
  }
  const messages = Array.isArray(body?.messages) ? body.messages : [];
  if (messages.length === 0) return json(res, 400, { error: 'Geen bericht meegegeven.', build: BUILD });

  // De app stuurt mee in welke studio de gebruiker werkt. Een trainer kan bij meerdere studio's
  // horen, en dan moet de assistent over de juiste gaan. We controleren het lidmaatschap hier:
  // wat de client meestuurt is een wens, geen bewijs.
  const requestedOrgId = typeof body?.orgId === 'string' ? body.orgId.trim() : '';
  const activeOrgId = requestedOrgId && profile.orgIds.includes(requestedOrgId) ? requestedOrgId : profile.orgId;
  const store = createStore(admin.db, admin.auth, activeOrgId);

  const orgSnap = await admin.db.collection('orgs').doc(activeOrgId).get().catch(() => null);
  const orgName = orgSnap?.exists ? orgSnap.data()?.name || 'je studio' : 'je studio';

  const toolbox = await openToolbox({ profile, orgName }, store);
  const steps = [];
  try {
    let input = toInput(messages);
    const base = {
      model: MODEL,
      instructions: systemPrompt(profile, orgName),
      tools: toolbox.definitions,
      max_output_tokens: 1200,
    };

    for (let round = 0; round < MAX_ROUNDS; round++) {
      // In de laatste ronde geen functies meer: dan moet er een antwoord komen.
      const isLast = round === MAX_ROUNDS - 1;
      const result = await callOpenAi(isLast ? { ...base, tools: [], input } : { ...base, input });

      const calls = (result.output ?? []).filter((o) => o.type === 'function_call');
      if (calls.length === 0) {
        const reply = outputText(result);
        return json(res, 200, {
          reply: reply || 'Ik kon daar geen antwoord op formuleren. Probeer het anders te vragen.',
          steps,
          build: BUILD,
        });
      }

      // Functieaanroepen uitvoeren en het resultaat teruggeven aan het model.
      input = [...input, ...calls];
      for (const call of calls) {
        let args = {};
        try {
          args = call.arguments ? JSON.parse(call.arguments) : {};
        } catch {
          args = {};
        }
        const outcome = await toolbox.call(call.name, args);
        steps.push({ tool: call.name, ok: outcome.ok });
        input.push({
          type: 'function_call_output',
          call_id: call.call_id,
          output: outcome.text.slice(0, 6000),
        });
      }
    }

    return json(res, 200, { reply: 'Dat werd te ingewikkeld. Stel de vraag eens in kleinere stappen.', steps, build: BUILD });
  } catch (e) {
    console.error('[assistant] mislukt:', e);
    return json(res, 502, { error: 'De assistent is even niet bereikbaar. Probeer het zo opnieuw.', build: BUILD });
  } finally {
    await toolbox.close();
  }
}
