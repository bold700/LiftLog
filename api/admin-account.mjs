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

let initError = null;
function ensureAdmin() {
  if (getApps().length) return true;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) {
    initError = 'FIREBASE_SERVICE_ACCOUNT ontbreekt in de serveromgeving.';
    return false;
  }
  try {
    const serviceAccount = JSON.parse(raw);
    initializeApp({ credential: cert(serviceAccount) });
    return true;
  } catch (e) {
    initError = 'FIREBASE_SERVICE_ACCOUNT is geen geldige JSON.';
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
