/**
 * Brug tussen de MCP-gereedschapskist en de assistent in de app.
 *
 * De AI-koppeling (api/mcp.mjs) en de assistent in LiftLog moeten precies dezelfde dingen kunnen,
 * met precies dezelfde rechten. In plaats van die 17 functies twee keer te schrijven, verbinden we
 * hier een MCP-client rechtstreeks met de bestaande server via een verbinding binnen hetzelfde
 * proces. De rolregels (welke functies een sporter ziet, over wie een trainer mag gaan) en de
 * studiogrens komen daarmee automatisch mee.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { buildServer } from './mcpServer.mjs';

/**
 * Zet een MCP JSON-schema om naar een functiebeschrijving voor de OpenAI Responses-API.
 * OpenAI wil `additionalProperties: false` en dat elk veld in `required` staat; optionele velden
 * geven we daarom door als "mag ook null zijn".
 */
function toOpenAiSchema(schema) {
  const props = schema?.properties ?? {};
  const required = new Set(schema?.required ?? []);
  const out = {};
  for (const [key, value] of Object.entries(props)) {
    out[key] = required.has(key) ? value : withNull(value);
  }
  return {
    type: 'object',
    properties: out,
    required: Object.keys(out),
    additionalProperties: false,
  };
}

/** Maakt een veld nullable, zodat het model het mag weglaten binnen de strikte modus van OpenAI. */
function withNull(value) {
  if (!value || typeof value !== 'object') return value;
  const type = value.type;
  if (typeof type === 'string' && type !== 'null') return { ...value, type: [type, 'null'] };
  if (Array.isArray(type) && !type.includes('null')) return { ...value, type: [...type, 'null'] };
  return value;
}

/** Diepe opschoning: OpenAI's strikte modus eist `additionalProperties: false` op élk object. */
function tightenObjects(node) {
  if (Array.isArray(node)) return node.map(tightenObjects);
  if (!node || typeof node !== 'object') return node;
  const out = {};
  for (const [k, v] of Object.entries(node)) out[k] = tightenObjects(v);
  const isObject = out.type === 'object' || (Array.isArray(out.type) && out.type.includes('object'));
  if (isObject && out.properties) {
    out.additionalProperties = false;
    out.required = Object.keys(out.properties);
  }
  return out;
}

/**
 * Opent een gereedschapskist voor deze gebruiker.
 * Geeft de functiebeschrijvingen voor het model, een `call` om er een uit te voeren, en `close`.
 */
export async function openToolbox(ctx, store) {
  const server = buildServer(ctx, store);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'liftlog-assistent', version: '1.0.0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  const { tools } = await client.listTools();

  const definitions = tools.map((t) => ({
    type: 'function',
    name: t.name,
    description: t.description ?? '',
    parameters: tightenObjects(toOpenAiSchema(t.inputSchema)),
    strict: true,
  }));

  return {
    definitions,
    /** Voert één functie uit en geeft het antwoord als tekst terug. */
    async call(name, args) {
      // Velden die het model expliciet op null zette horen niet in de aanroep thuis.
      const cleaned = {};
      for (const [k, v] of Object.entries(args ?? {})) if (v !== null && v !== undefined) cleaned[k] = v;
      try {
        const result = await client.callTool({ name, arguments: cleaned });
        const text = (result.content ?? [])
          .filter((c) => c.type === 'text')
          .map((c) => c.text)
          .join('\n');
        return { ok: !result.isError, text: text || (result.isError ? 'Mislukt.' : 'Gelukt.') };
      } catch (e) {
        return { ok: false, text: e instanceof Error ? e.message : 'Er ging iets mis.' };
      }
    },
    async close() {
      await client.close().catch(() => {});
      await server.close().catch(() => {});
    },
  };
}
