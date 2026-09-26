/**
 * Mollie-koppeling per studio (Beheer → Facturatie → Betalingen).
 *
 * Elk bedrijf ontvangt geld op zijn eigen rekening, dus is dit geen platformbrede sleutel zoals
 * Resend maar een instelling per studio. De sleutel zelf staat alleen in `orgSecrets/{orgId}`,
 * een collectie die de client nooit leest of schrijft (firestore.rules: `allow read, write: if
 * false`); alleen de server raakt hem aan, via de Admin SDK die de regels toch al mag negeren.
 * Voor op het scherm blijft alleen het onschadelijke restje over: modus, laatste vier tekens,
 * organisatienaam en wanneer gekoppeld — dat staat gewoon op `orgs/{orgId}.payments`.
 */

/** "test_" of "live_" gevolgd door tekens die Mollie gebruikt; ruim genoeg zonder te streng te zijn. */
const KEY_PATTERN = /^(test|live)_\w{10,}$/;

/** null = geldig; anders de foutmelding voor de gebruiker. */
export function mollieKeyFormatError(mode, apiKey) {
  const key = String(apiKey ?? '').trim();
  if (!key) return 'Vul een API-sleutel in.';
  const m = KEY_PATTERN.exec(key);
  if (!m) return 'Dat lijkt geen geldige Mollie-sleutel (begint met test_ of live_).';
  if (m[1] !== mode) return mode === 'test' ? 'Dit is een live-sleutel; kies hierboven "Live" of plak een testsleutel.' : 'Dit is een testsleutel; kies hierboven "Testen" of plak een live-sleutel.';
  return null;
}

/**
 * Sleutel bij Mollie laten bevestigen. `GET /v2/organizations/me` bestaat specifiek om een
 * sleutel te verifiëren en levert meteen de bedrijfsnaam op ("Verbonden met …"). Een API-sleutel
 * (in tegenstelling tot een OAuth-token) heeft daar altijd toegang toe.
 */
export async function verifyMollieKey(apiKey, fetchImpl = fetch) {
  try {
    const res = await fetchImpl('https://api.mollie.com/v2/organizations/me', {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (res.status === 401 || res.status === 403) {
      return { ok: false, error: 'Mollie herkent deze sleutel niet. Kopieer hem opnieuw vanaf het Mollie-dashboard.' };
    }
    if (!res.ok) {
      return { ok: false, error: `Mollie gaf een onverwachte fout (${res.status}). Probeer het zo nog eens.` };
    }
    const data = await res.json().catch(() => ({}));
    const name = typeof data?.name === 'string' && data.name.trim() ? data.name.trim() : null;
    return { ok: true, organizationName: name };
  } catch {
    return { ok: false, error: 'Mollie was niet te bereiken. Probeer het zo nog eens.' };
  }
}

/** Laatste vier tekens, voor herkenning zonder de sleutel te tonen. */
export function last4(apiKey) {
  const key = String(apiKey ?? '');
  return key.slice(-4);
}

/** Firestore-veldnaam van de sleutel voor een modus. */
export function secretFieldFor(mode) {
  return mode === 'live' ? 'mollieLiveKey' : 'mollieTestKey';
}

/**
 * De sleutel die een studio nu actief gebruikt (`orgs/{orgId}.payments.mode` bepaalt test of
 * live), of null als er voor die modus nog geen sleutel is gekoppeld.
 */
export async function getOrgMollieKey(db, orgId) {
  const orgSnap = await db.collection('orgs').doc(orgId).get();
  const mode = orgSnap.exists && orgSnap.data()?.payments?.mode === 'live' ? 'live' : 'test';
  const secretSnap = await db.collection('orgSecrets').doc(orgId).get();
  const apiKey = secretSnap.exists ? secretSnap.data()?.[secretFieldFor(mode)] : null;
  return apiKey ? { mode, apiKey } : null;
}

/**
 * Eenmalige betaling aanmaken. `redirectUrl` is waar de browser na afloop naartoe gaat,
 * `webhookUrl` is waar Mollie de statuswijziging meldt (zie mollieWebhook in api/booking.mjs) —
 * geeft de betaal-id en de checkout-URL terug waar de browser heen moet.
 */
export async function createMolliePayment({ apiKey, amount, description, redirectUrl, webhookUrl, fetchImpl = fetch }) {
  const res = await fetchImpl('https://api.mollie.com/v2/payments', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      amount: { currency: 'EUR', value: (Math.round(Number(amount) * 100) / 100).toFixed(2) },
      description,
      redirectUrl,
      webhookUrl,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.detail || `Mollie kon geen betaling aanmaken (${res.status}).`);
  const checkoutUrl = data?._links?.checkout?.href;
  if (!data?.id || !checkoutUrl) throw new Error('Mollie gaf geen betaal-URL terug.');
  return { id: data.id, checkoutUrl };
}

/**
 * Actuele status van een betaling. Wordt altijd aangeroepen om een webhook-melding te verifiëren
 * — de melding zelf bevat verder niets vertrouwbaars, alleen het betaal-id.
 */
export async function getMolliePayment({ apiKey, paymentId, fetchImpl = fetch }) {
  const res = await fetchImpl(`https://api.mollie.com/v2/payments/${encodeURIComponent(paymentId)}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.detail || `Mollie kon de betaling niet ophalen (${res.status}).`);
  return { id: data.id, status: data.status };
}
