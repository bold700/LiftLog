import { applyCors } from './cors.mjs';
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

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
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
  if (admin.error) return json(res, 500, { error: admin.error });

  const key = keyFromRequest(req);
  if (!key || key.length < 20) return json(res, 401, { error: 'Koppelsleutel ontbreekt. Maak er een aan in LiftLog onder Profiel.' });

  const store = createStore(admin.db);
  const userId = await store.findUserByKey(key);
  if (!userId) return json(res, 401, { error: 'Koppelsleutel is ongeldig of ingetrokken.' });
  const profile = await store.getProfile(userId);
  if (!profile) return json(res, 401, { error: 'Profiel niet gevonden.' });

  // Stateless: per aanvraag een verse server + transport (Vercel-functies houden geen sessies vast).
  const server = buildServer({ profile }, store);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on('close', () => {
    transport.close().catch(() => {});
    server.close().catch(() => {});
  });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
}
