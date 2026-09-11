import { applyCors } from './_lib/cors.mjs';
/**
 * MCP-endpoint (Streamable HTTP, stateless) voor ChatGPT, Claude en Gemini.
 * URL: /api/mcp/<koppelsleutel> (via rewrite in vercel.json naar /api/mcp?key=…), of /api/mcp met
 * "Authorization: Bearer <sleutel>". De sleutel wordt in de app aangemaakt (Profiel → Koppel met AI-chat)
 * en als SHA-256-hash opgeslagen in Firestore `mcpKeys/{hash}` met de userId.
 */
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { getAdmin } from './_lib/firebaseAdmin.mjs';
import { createStore } from './_lib/liftlogData.mjs';
import { buildServer } from './_lib/mcpServer.mjs';

/** Korte commit-hash van de draaiende versie, zodat je kunt zien of een deploy al live is. */
const BUILD = (process.env.VERCEL_GIT_COMMIT_SHA || 'dev').slice(0, 7);

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify({ ...body, build: BUILD }));
}

function keyFromRequest(req) {
  const fromQuery = req.query?.key;
  if (typeof fromQuery === 'string' && fromQuery) return fromQuery;
  const m = String(req.url || '').match(/\/api\/mcp\/([^/?#]+)/);
  if (m) return decodeURIComponent(m[1]);
  const auth = req.headers.authorization || '';
  return auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
}

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  const admin = getAdmin();
  if (admin.error) {
    console.error('[mcp] Firebase Admin niet beschikbaar:', admin.error);
    return json(res, 500, { error: 'Serverconfiguratie onvolledig. Neem contact op met de beheerder.' });
  }

  const key = keyFromRequest(req);
  if (!key || key.length < 20) return json(res, 401, { error: 'Koppelsleutel ontbreekt. Maak er een aan in VORM onder Profiel.' });

  // Eerst zonder studio: de sleutel wijst één gebruiker aan, en pas diens profiel bepaalt de studio.
  const lookup = createStore(admin.db, admin.auth);
  const userId = await lookup.findUserByKey(key);
  if (!userId) return json(res, 401, { error: 'Koppelsleutel is ongeldig of ingetrokken.' });
  const profile = await lookup.getProfile(userId);
  if (!profile) return json(res, 401, { error: 'Profiel niet gevonden.' });

  // Vanaf hier is alles begrensd tot de studio van deze gebruiker.
  const store = createStore(admin.db, admin.auth, profile.orgId);

  // Naam van de studio, zodat de assistent zich niet als de verkeerde studio voorstelt.
  const orgSnap = await admin.db.collection('orgs').doc(profile.orgId).get().catch(() => null);
  const orgName = orgSnap?.exists ? orgSnap.data()?.name || null : null;

  // Stateless: per aanvraag een verse server + transport (Vercel-functies houden geen sessies vast).
  const server = buildServer({ profile, orgName }, store);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on('close', () => {
    transport.close().catch(() => {});
    server.close().catch(() => {});
  });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
}
