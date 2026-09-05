/**
 * Gedeelde Firebase Admin-initialisatie voor serverless functies.
 * Vereist env-var FIREBASE_SERVICE_ACCOUNT (JSON van een service-account, of base64 daarvan).
 */
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

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

/**
 * Initialiseert Firebase Admin (eenmalig per proces).
 * Geeft { auth, db } terug, of { error } als de serveromgeving niet klopt.
 */
export function getAdmin() {
  if (!getApps().length) {
    const parsed = parseServiceAccount(process.env.FIREBASE_SERVICE_ACCOUNT);
    if (parsed.error) return { error: parsed.error };
    try {
      initializeApp({ credential: cert(parsed.account) });
    } catch (e) {
      return { error: `Firebase Admin initialiseren mislukt: ${e?.message || 'onbekende fout'}` };
    }
  }
  return { auth: getAuth(), db: getFirestore() };
}
