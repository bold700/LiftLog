/**
 * Een bestand in een map op een gedeelde drive van BOLD700 zetten (Google Workspace), bijvoorbeeld
 * een getekende verwerkersovereenkomst. Gebruikt hetzelfde serviceaccount als Firebase
 * (FIREBASE_SERVICE_ACCOUNT); dat account moet lid zijn van de gedeelde drive (rol Inhoudbeheerder)
 * en in het Google Cloud-project moet de Google Drive API aan staan.
 *
 * Instellen: env-var GOOGLE_DRIVE_FOLDER_ID = het id van de map (het laatste stuk van de link
 * drive.google.com/drive/folders/<id>). Zonder die variabele doet dit niets.
 *
 * Een serviceaccount heeft zelf geen opslagruimte, daarom werkt dit alleen op een gedeelde drive,
 * niet in iemands "Mijn Drive".
 */
import { createSign } from 'node:crypto';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,webViewLink';
const SCOPE = 'https://www.googleapis.com/auth/drive';

export function driveFolderId(env = process.env) {
  return String(env.GOOGLE_DRIVE_FOLDER_ID ?? '').trim() || null;
}

const b64url = (input) => Buffer.from(input).toString('base64url');

/** Een ondertekende JWT voor de token-uitwisseling (RS256, zoals Google die vraagt). */
export function serviceAccountJwt(account, nowSeconds = Math.floor(Date.now() / 1000)) {
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({ iss: account.client_email, scope: SCOPE, aud: TOKEN_URL, iat: nowSeconds, exp: nowSeconds + 3600 }));
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${claims}`);
  return `${header}.${claims}.${signer.sign(account.private_key).toString('base64url')}`;
}

async function accessToken(account, fetchImpl) {
  const res = await fetchImpl(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: serviceAccountJwt(account) }).toString(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) throw new Error(`Google-token mislukt (${res.status}): ${data.error_description || data.error || 'onbekende fout'}`);
  return data.access_token;
}

/**
 * Zet een PDF in de map. Geeft `{ id, webViewLink }` terug of gooit met een leesbare fout.
 * @param {{ account: object, folderId: string, name: string, pdf: ArrayBuffer|Uint8Array, fetchImpl?: typeof fetch }} p
 */
export async function uploadPdfToDrive({ account, folderId, name, pdf, fetchImpl = fetch }) {
  const token = await accessToken(account, fetchImpl);
  const boundary = `vorm${Date.now().toString(36)}`;
  const meta = JSON.stringify({ name, parents: [folderId], mimeType: 'application/pdf' });
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`),
    Buffer.from(pdf instanceof ArrayBuffer ? new Uint8Array(pdf) : pdf),
    Buffer.from(`\r\n--${boundary}--`),
  ]);
  const res = await fetchImpl(UPLOAD_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.id) throw new Error(`Uploaden naar Drive mislukt (${res.status}): ${data?.error?.message || 'onbekende fout'}`);
  return { id: String(data.id), webViewLink: data.webViewLink ? String(data.webViewLink) : null };
}
