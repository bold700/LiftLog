import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import handler from '../api/generate-workout.mjs';

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
    const headers = { ...this._headers };
    this.nodeRes.writeHead(this._status, headers);
    this.nodeRes.end(body);
  }
}

const PORT = Number.parseInt(process.env.LOCAL_API_PORT || '3001', 10);

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  if (url.pathname !== '/api/generate-workout') {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Not found' }));
    return;
  }

  const body = await readJsonBody(req);
  const reqAdapter = {
    method: req.method,
    body,
  };
  const resAdapter = new ServerResponseAdapter(res);

  await handler(reqAdapter, resAdapter);
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[local-api-server] Luistert op http://localhost:${PORT}/api/generate-workout`);
});

