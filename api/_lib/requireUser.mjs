/**
 * Toegangscontrole voor serverless functies die geld kosten (OpenAI) of persoonlijke data raken.
 *
 *   requireUser(req, res)                 → { uid } of null (antwoord is dan al verstuurd: 401/500)
 *   enforceRateLimit(db, res, uid, key, max, windowMs) → true als het mag, anders al 429 verstuurd
 *
 * De limiet telt per gebruiker per venster in Firestore (`rateLimits/{uid}_{key}`), zodat één
 * account niet het hele API-budget kan opmaken. Vercel-functies delen geen geheugen, vandaar Firestore.
 */
import { getAdmin } from './firebaseAdmin.mjs';

function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(body));
}

/**
 * Controleert de Firebase ID-token uit `Authorization: Bearer …`.
 * Geeft { uid, db } terug, of null nadat een foutantwoord is verstuurd.
 */
export async function requireUser(req, res) {
  const admin = getAdmin();
  if (admin.error) {
    console.error('[requireUser] Firebase Admin niet beschikbaar:', admin.error);
    sendJson(res, 500, { error: 'Serverconfiguratie onvolledig. Neem contact op met de beheerder.' });
    return null;
  }
  const header = req.headers?.authorization || req.headers?.Authorization || '';
  const token = typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) {
    sendJson(res, 401, { error: 'Log in om deze functie te gebruiken.' });
    return null;
  }
  try {
    const decoded = await admin.auth.verifyIdToken(token);
    return { uid: decoded.uid, db: admin.db };
  } catch {
    sendJson(res, 401, { error: 'Sessie verlopen. Log opnieuw in.' });
    return null;
  }
}

/**
 * Maximaal `max` aanvragen per `windowMs` per gebruiker. Bij overschrijding wordt 429 verstuurd
 * en komt `false` terug. Een tellerfout blokkeert de gebruiker niet (log + doorlaten).
 */
export async function enforceRateLimit(db, res, uid, key, max, windowMs) {
  const ref = db.collection('rateLimits').doc(`${uid}_${key}`);
  const now = Date.now();
  try {
    const allowed = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const data = snap.exists ? snap.data() : null;
      const fresh = !data || typeof data.windowStart !== 'number' || now - data.windowStart >= windowMs;
      const count = fresh ? 0 : Number(data.count) || 0;
      if (count >= max) return false;
      tx.set(ref, { windowStart: fresh ? now : data.windowStart, count: count + 1, updatedAt: now });
      return true;
    });
    if (!allowed) {
      const minutes = Math.max(1, Math.round(windowMs / 60000));
      sendJson(res, 429, {
        error: `Limiet bereikt: maximaal ${max} keer per ${minutes >= 60 ? `${Math.round(minutes / 60)} uur` : `${minutes} minuten`}. Probeer het later opnieuw.`,
      });
    }
    return allowed;
  } catch (err) {
    console.error('[enforceRateLimit] teller mislukt, aanvraag doorgelaten:', err);
    return true;
  }
}
