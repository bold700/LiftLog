import { applyCors } from './cors.mjs';
/**
 * Admin-endpoint: een beheerder verwijdert een account definitief (Auth + profiel).
 *
 * Beveiliging:
 *  - Vereist een geldig Firebase ID-token in de Authorization-header (Bearer).
 *  - De beller moet in Firestore de rol 'admin' hebben.
 *
 * Vereist env-var FIREBASE_SERVICE_ACCOUNT: de JSON van een Firebase service-account
 * (als string). Zonder deze var geeft het endpoint een nette foutmelding.
 */
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

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

/**
 * Echte regeleindes binnen JSON-strings vervangen door `\n`-escapes.
 * Gebeurt als de private_key met enters is geplakt in plaats van met `\n`.
 */
function escapeNewlinesInStrings(text) {
  let out = '';
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (ch === '\\') {
        out += ch + (text[i + 1] ?? '');
        i++;
        continue;
      }
      if (ch === '"') inString = false;
      if (ch === '\r') continue;
      if (ch === '\n') {
        out += '\\n';
        continue;
      }
    } else if (ch === '"') {
      inString = true;
    }
    out += ch;
  }
  return out;
}

/**
 * Parseert de service-account-JSON tolerant: trim, omringende aanhalingstekens weg,
 * base64 toegestaan, en enters binnen strings gerepareerd.
 * Geeft { account } of { error } terug; de error bevat nooit de inhoud zelf.
 */
export function parseServiceAccount(raw) {
  let s = String(raw ?? '').trim();
  if (!s) return { error: 'FIREBASE_SERVICE_ACCOUNT ontbreekt in de serveromgeving.' };
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    // Als geheel als JSON-string geplakt (met \" binnenin): eerst de string zelf decoderen.
    try {
      const inner = JSON.parse(escapeNewlinesInStrings(s));
      s = typeof inner === 'string' ? inner.trim() : s.slice(1, -1).trim();
    } catch {
      s = s.slice(1, -1).trim();
    }
  }
  if (!s.startsWith('{')) {
    // Mogelijk base64 (één regel, geen plakproblemen).
    try {
      const decoded = Buffer.from(s, 'base64').toString('utf8').trim();
      if (decoded.startsWith('{')) s = decoded;
    } catch {
      /* geen base64 */
    }
  }
  let account = null;
  for (const candidate of [s, escapeNewlinesInStrings(s)]) {
    try {
      account = JSON.parse(candidate);
      break;
    } catch {
      /* volgende poging */
    }
  }
  const first = s[0] ?? '';
  const last = s[s.length - 1] ?? '';
  if (!account || typeof account !== 'object') {
    return {
      error: `FIREBASE_SERVICE_ACCOUNT is geen geldige JSON (lengte ${s.length}, begint met '${first}', eindigt met '${last}'). Plak de complete inhoud van het JSON-bestand van { tot en met }, of de base64 ervan.`,
    };
  }
  const missing = ['project_id', 'client_email', 'private_key'].filter((k) => typeof account[k] !== 'string' || !account[k]);
  if (missing.length) {
    return { error: `FIREBASE_SERVICE_ACCOUNT mist veld(en): ${missing.join(', ')}. Gebruik het service-account-bestand uit de Firebase Console.` };
  }
  if (!account.private_key.includes('-----BEGIN')) {
    return { error: 'FIREBASE_SERVICE_ACCOUNT: private_key ziet er niet uit als een sleutel (verwacht "-----BEGIN PRIVATE KEY-----").' };
  }
  return { account };
}

let initError = null;
function ensureAdmin() {
  if (getApps().length) return true;
  const parsed = parseServiceAccount(process.env.FIREBASE_SERVICE_ACCOUNT);
  if (parsed.error) {
    initError = parsed.error;
    return false;
  }
  try {
    initializeApp({ credential: cert(parsed.account) });
    return true;
  } catch (e) {
    initError = `Firebase Admin initialiseren mislukt: ${e?.message || 'onbekende fout'}`;
    return false;
  }
}

async function readBody(req) {
  if (req.body) {
    return typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  }
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') {
    return json(res, 405, { error: 'Method not allowed' });
  }
  if (!ensureAdmin()) {
    return json(res, 500, { error: initError || 'Server niet geconfigureerd.' });
  }

  // 1) Beller authenticeren
  const authHeader = req.headers.authorization || req.headers.Authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) {
    return json(res, 401, { error: 'Niet ingelogd.' });
  }

  let callerUid;
  try {
    const decoded = await getAuth().verifyIdToken(token);
    callerUid = decoded.uid;
  } catch {
    return json(res, 401, { error: 'Ongeldige sessie. Log opnieuw in.' });
  }

  const db = getFirestore();

  // 2) Beller moet admin zijn
  const callerSnap = await db.collection('profiles').doc(callerUid).get();
  if (!callerSnap.exists || callerSnap.data()?.role !== 'admin') {
    return json(res, 403, { error: 'Alleen beheerders mogen accounts verwijderen.' });
  }

  // 3) Verzoek verwerken
  let body;
  try {
    body = await readBody(req);
  } catch {
    return json(res, 400, { error: 'Ongeldige aanvraag.' });
  }

  const action = body?.action;
  const targetUid = String(body?.targetUid || '').trim();
  if (action !== 'delete' || !targetUid) {
    return json(res, 400, { error: 'Ongeldige actie of ontbrekende targetUid.' });
  }
  if (targetUid === callerUid) {
    return json(res, 400, { error: 'Je kunt je eigen account niet verwijderen.' });
  }

  // 4) Auth-account verwijderen (negeer als het al weg is)
  try {
    await getAuth().deleteUser(targetUid);
  } catch (e) {
    if (e?.code !== 'auth/user-not-found') {
      return json(res, 500, { error: 'Verwijderen van het login-account mislukt.' });
    }
  }

  // 5) Profiel verwijderen
  try {
    await db.collection('profiles').doc(targetUid).delete();
  } catch {
    return json(res, 500, { error: 'Login verwijderd, maar profiel opruimen mislukte.' });
  }

  return json(res, 200, { ok: true, deletedUid: targetUid });
}
