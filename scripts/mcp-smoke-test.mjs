/**
 * Rooktest voor de MCP-server met een in-memory datalaag (geen Firebase nodig).
 * Gebruik: npm run test:mcp  (of: node scripts/mcp-smoke-test.mjs trainer)
 */
import http from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { buildServer } from '../api/_lib/mcpServer.mjs';

const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Amsterdam' });
const profiles = {
  u1: { userId: 'u1', role: 'sporter', email: 'danny@gmail.com', displayName: 'Danny', trainerId: 't1', weightGoalKg: 80, nutritionGoal: { kcal: 2400, protein: 160, carbs: 250, fat: 80 } },
  t1: { userId: 't1', role: 'trainer', email: 'kenny@x.nl', displayName: 'Kenny', trainerId: null },
};
const schema = { id: 's1', name: 'Full body A/B', trainerId: 't1', clientId: 'u1', audience: 'single', participantIds: [], createdAt: '2026-09-01', startDate: null, endDate: null,
  days: [
    { dayLabel: 'Dag A', exercises: [{ exerciseName: 'Bankdrukken', setsTarget: 3, repsTarget: 8, targetWeight: 80, notes: '' }, { exerciseName: 'Squat', setsTarget: 3, repsTarget: 5, notes: 'diep' }] },
    { dayLabel: 'Dag B', exercises: [{ exerciseName: 'Deadlift', setsTarget: 3, repsTarget: 5, notes: '' }] },
  ] };
// Groepslessen zoals scripts/import-groepslessen.mjs ze aanmaakt: één schema per lesmoment per week.
const classes = [10, 26].map((w) => ({
  id: `schema_sgt2026_zondag_w${w}`, name: `Zondag · Week ${w}`, trainerId: 't1', clientId: null,
  audience: 'group', participantIds: [], category: 'Groepslessen', series: 'Zondag', seriesOrder: 6,
  scheduleWeek: w, createdAt: '2026-01-01', startDate: null, endDate: null, source: 'authored',
  days: [{ dayLabel: `Week ${w}`, exercises: [{ exerciseName: `Barbell Back Squat (week ${w})`, setsTarget: 3, repsTarget: 12, notes: '' }] }],
}));
const logs = [{ id: 'l1', userId: 'u1', exerciseName: 'Bankdrukken', weight: 77.5, sets: 3, reps: 8, notes: 'ging goed', date: '2026-09-03T10:00:00.000Z', schemaId: 's1', schemaDayIndex: 0 }];
const nutrition = []; const meas = [{ id: 'm1', date: '2026-08-01', weightKg: 86, bodyFatPct: null, waistCm: null, note: '' }];
const store = {
  getProfile: async (id) => profiles[id] ?? null,
  getAllProfiles: async () => Object.values(profiles),
  getSchemasForUser: async (uid) =>
    uid === 'u1' ? [{ ...schema, source: 'client' }] : uid === 't1' ? [{ ...schema, source: 'authored' }, ...classes] : [],
  getLogsForUser: async (uid) => logs.filter((l) => l.userId === uid).sort((a, b) => (b.date > a.date ? 1 : -1)),
  saveLog: async (l) => { const s = { ...l, id: 'l' + (logs.length + 1) }; logs.push(s); return s; },
  saveSchema: async (sc) => ({ ...sc, id: 'schema_nieuw', createdAt: new Date().toISOString() }),
  getNutritionForDay: async (uid, date) => nutrition.filter((n) => n.userId === uid && n.date === date),
  saveNutritionLog: async (n) => { nutrition.push({ ...n, id: 'n' + nutrition.length }); return n; },
  getMeasurements: async () => meas,
  saveMeasurement: async (m) => { meas.push({ ...m, id: 'm' + meas.length }); return m; },
};

const who = process.argv[2] === 'trainer' ? 't1' : 'u1';
const httpServer = http.createServer(async (req, res) => {
  let raw = ''; for await (const c of req) raw += c;
  req.body = raw ? JSON.parse(raw) : undefined;
  const server = buildServer({ profile: profiles[who] }, store);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on('close', () => { transport.close(); server.close(); });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});
await new Promise((r) => httpServer.listen(0, r));
const port = httpServer.address().port;

const client = new Client({ name: 'test', version: '1.0.0' });
await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/api/mcp/testkey`)));
console.log('instructions:', (client.getInstructions() || '').slice(0, 90) + '…');
const tools = await client.listTools();
console.log('tools:', tools.tools.map((t) => t.name).join(', '));
const show = (name, args) => client.callTool({ name, arguments: args }).then((r) => console.log(`\n== ${name}`, JSON.stringify(args), r.isError ? 'ERROR' : '', '\n' + r.content[0].text.slice(0, 700)));
await show('get_todays_workout', {});
await show('log_exercise', { exercise: 'bankdrukken', weightKg: 80, sets: 3, reps: 8, notes: 'nieuw PR' });
await show('get_todays_workout', {});
await show('log_nutrition', { productName: 'Skyr', grams: 250, kcal: 160, protein: 27, carbs: 10, fat: 0.5 });
await show('get_nutrition_day', {});
await show('log_measurement', { weightKg: 84.2 });
await show('get_progress', {});
await show('get_recent_logs', { days: 30, exercise: 'bank' });
if (who === 't1') {
  // Een trainer die alleen schema's voor sporters maakte, heeft zelf geen training vandaag.
  await show('get_todays_workout', {});
  await show('get_todays_workout', { athlete: 'danny' });
  // Morgen is zondag 6 september 2026: ISO-week 36, dus schemaweek 10 (niet week 26).
  await show('get_class_workout', { date: 'morgen' });
  await show('get_class_workout', { date: 'zondag' });
  await show('create_workout', {
    name: 'Full body kracht',
    athlete: 'danny',
    days: [{ dayLabel: 'Dag A', exercises: [{ name: 'Goblet Squat', sets: 3, reps: 10, notes: 'rustig tempo' }, { name: 'Lat Pulldown', sets: 3, reps: 12, weightKg: 45 }] }],
  });
  await show('list_athletes', {});
  await show('get_profile', { athlete: 'danny' });
  await show('get_profile', { athlete: 'zzz' });
}
else { await show('get_profile', { athlete: 'kenny' }); }
await client.close(); httpServer.close();
