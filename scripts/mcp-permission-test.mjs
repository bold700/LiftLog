/**
 * Rechten-rooktest voor de MCP-server: wie mag bij wiens gegevens?
 * Draait tegen een in-memory datalaag, dus zonder Firebase. Start met: npm run test:mcp:rechten
 */
import http from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { buildServer } from '../api/_lib/mcpServer.mjs';

const profiles = {
  sporter:  { userId: 'u1', role: 'sporter', email: 'danny@x.nl',  displayName: 'Danny',  trainerId: 't1' },
  ander:    { userId: 'u2', role: 'sporter', email: 'margot@x.nl', displayName: 'Margot', trainerId: 't2' },
  trainer:  { userId: 't1', role: 'trainer', email: 'kenny@x.nl',  displayName: 'Kenny',  trainerId: null },
  trainer2: { userId: 't2', role: 'trainer', email: 'ander@x.nl',  displayName: 'Ander',  trainerId: null },
  admin:    { userId: 'a1', role: 'admin',   email: 'kenny@bold.nl', displayName: 'Kenny Timmer', trainerId: null },
};
const store = {
  getProfile: async (id) => Object.values(profiles).find((p) => p.userId === id) ?? null,
  getAllProfiles: async () => Object.values(profiles),
  getSchemasForUser: async () => [],
  saveSchema: async (sc) => ({ ...sc, id: 'schema_nieuw', createdAt: new Date().toISOString() }),
  assignSchema: async () => {},
  createAccount: async (a) => ({ userId: 'u_nieuw', email: a.email, password: 'GeheimTest1' }),
  updateProfileFields: async (uid, f) => { Object.assign(profiles.u1 ?? {}, {}); return f; },
  getLogsForUser: async () => [],
  saveLog: async (l) => l,
  getNutritionForDay: async () => [],
  saveNutritionLog: async (n) => n,
  getMeasurements: async () => [],
  saveMeasurement: async (m) => m,
};

async function connect(who) {
  const srv = http.createServer(async (req, res) => {
    let raw = ''; for await (const c of req) raw += c;
    req.body = raw ? JSON.parse(raw) : undefined;
    const server = buildServer({ profile: profiles[who] }, store);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on('close', () => { transport.close(); server.close(); });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });
  await new Promise((r) => srv.listen(0, r));
  const client = new Client({ name: 'perm', version: '1' });
  await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${srv.address().port}/api/mcp/k`)));
  return { client, close: () => srv.close() };
}

let failures = 0;
const check = (label, ok, detail = '') => {
  if (!ok) failures++;
  console.log(`${ok ? 'OK  ' : 'LEK '} ${label}${detail ? ' → ' + detail : ''}`);
};

// --- Sporter ---
{
  const { client, close } = await connect('sporter');
  const tools = (await client.listTools()).tools;
  check('sporter ziet list_athletes NIET', !tools.some((t) => t.name === 'list_athletes'));
  check('sporter heeft geen athlete-parameter', !Object.keys(tools.find((t) => t.name === 'get_profile').inputSchema.properties ?? {}).includes('athlete'));
  check('sporter ziet create_workout NIET', !tools.some((t) => t.name === 'create_workout'));
  check('sporter ziet create_account NIET', !tools.some((t) => t.name === 'create_account'));
  check('sporter ziet assign_workout NIET', !tools.some((t) => t.name === 'assign_workout'));
  const r = await client.callTool({ name: 'get_profile', arguments: { athlete: 'margot' } });
  const t = r.content[0].text;
  check('sporter krijgt GEEN data van Margot', !t.includes('Margot') && !t.includes('margot@'), `kreeg: ${JSON.parse(t).name}`);
  const r2 = await client.callTool({ name: 'log_exercise', arguments: { athlete: 'margot', exercise: 'squat', sets: 3 } });
  const t2 = JSON.parse(r2.content[0].text);
  check('sporter logt NIET op naam van Margot', t2.logged?.forAthlete !== 'Margot', `gelogd voor: ${t2.logged?.forAthlete}`);
  await client.close(); close();
}
// --- Trainer ---
{
  const { client, close } = await connect('trainer');
  const list = await client.callTool({ name: 'list_athletes', arguments: {} });
  check('trainer ziet in list_athletes alleen eigen sporters', !list.content[0].text.includes('Margot'), list.content[0].text.replace(/\s+/g, ' ').slice(0, 90));
  const r = await client.callTool({ name: 'get_profile', arguments: { athlete: 'margot' } });
  check('trainer kan sporter van ANDERE trainer niet opvragen', r.isError === true, (r.content[0].text || '').replace(/\s+/g, ' ').slice(0, 70));
  const eigen = await client.callTool({ name: 'get_profile', arguments: { athlete: 'danny' } });
  check('trainer kan zijn EIGEN sporter wel opvragen', !eigen.isError && eigen.content[0].text.includes('Danny'));
  const mk = await client.callTool({ name: 'create_workout', arguments: { name: 'Test', athlete: 'margot', days: [{ dayLabel: 'A', exercises: [{ name: 'Squat', sets: 3, reps: 10 }] }] } });
  check('trainer maakt GEEN workout voor sporter van een ander', mk.isError === true);
  await client.close(); close();
}
// --- Beheerder: mag overal bij ---
{
  const { client, close } = await connect('admin');
  const r = await client.callTool({ name: 'get_profile', arguments: { athlete: 'margot' } });
  check('beheerder kan elke sporter opvragen', !r.isError && r.content[0].text.includes('Margot'));
  const list = await client.callTool({ name: 'list_athletes', arguments: {} });
  check('beheerder ziet alle sporters', list.content[0].text.includes('Danny') && list.content[0].text.includes('Margot'));
  await client.close(); close();
}

console.log(failures === 0 ? '\nAlle rechten-controles geslaagd.' : `\n${failures} controle(s) mislukt.`);
process.exit(failures === 0 ? 0 : 1);
