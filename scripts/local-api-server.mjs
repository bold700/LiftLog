import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import generateHandler from '../api/generate-workout.mjs';
import exerciseDemoHandler from '../api/exercise-demo.mjs';
import exerciseGifHandler from '../api/exercise-gif.mjs';
import exerciseSearchHandler from '../api/exercise-search.mjs';

function loadDotEnvIfMissing() {
  // Simple .env loader voor lokale dev/test (zonder extra dependencies).
  // We zetten alleen waarden als ze nog niet bestaan in process.env.
  try {
    const root = process.cwd();
    const envPath = path.join(root, '.env');
    if (!fs.existsSync(envPath)) return;
    const raw = fs.readFileSync(envPath, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim();
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // Ignore: lokale server kan draaien met al ingezette env vars.
  }
}

loadDotEnvIfMissing();

function readJsonBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk) => {
      data += String(chunk);
    });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        resolve({});
      }
    });
  });
}

class ServerResponseAdapter {
  constructor(nodeRes) {
    this.nodeRes = nodeRes;
    this._status = 200;
    this._headers = {};
  }
  status(code) {
    this._status = code;
    return this;
  }
  setHeader(key, value) {
    this._headers[key] = value;
    return this;
  }
  end(body) {
    const headers = {
      'Access-Control-Allow-Origin': '*',
      ...this._headers,
    };
    this.nodeRes.writeHead(this._status, headers);
    this.nodeRes.end(body);
  }
}

const PORT = Number.parseInt(process.env.LOCAL_API_PORT || '3001', 10);

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;

  const query = Object.fromEntries(url.searchParams.entries());

  if (pathname === '/api/exercise-demo' && req.method === 'GET') {
    const reqAdapter = { method: req.method, query };
    const resAdapter = new ServerResponseAdapter(res);
    await exerciseDemoHandler(reqAdapter, resAdapter);
    return;
  }

  if (pathname === '/api/exercise-gif' && req.method === 'GET') {
    const reqAdapter = { method: req.method, query };
    const resAdapter = new ServerResponseAdapter(res);
    await exerciseGifHandler(reqAdapter, resAdapter);
    return;
  }

  if (pathname === '/api/exercise-search' && req.method === 'GET') {
    const reqAdapter = { method: req.method, query };
    const resAdapter = new ServerResponseAdapter(res);
    await exerciseSearchHandler(reqAdapter, resAdapter);
    return;
  }

  if (pathname === '/api/generate-workout') {
    const body = await readJsonBody(req);
    const reqAdapter = {
      method: req.method,
      body,
    };
    const resAdapter = new ServerResponseAdapter(res);
    await generateHandler(reqAdapter, resAdapter);
    return;
  }

  res.writeHead(404, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(
    `[local-api-server] Luistert op http://localhost:${PORT} — /api/generate-workout, /api/exercise-demo, /api/exercise-gif, /api/exercise-search`
  );
});

