import { applyCors } from './cors.mjs';
/**
 * Verstuurt een pushnotificatie namens de ingelogde gebruiker.
 *
 * Een melding versturen vraagt de Admin SDK, en die hoort nooit in de app zelf. Daarom loopt het
 * hierlangs, met harde grenzen: je kunt alleen melden aan iemand binnen je eigen studio, alleen
 * over een gebeurtenis die wij kennen, en de tekst wordt hier opgebouwd — niet door de afzender
 * aangeleverd. Zo kan niemand deze route gebruiken om willekeurige berichten rond te sturen.
 *
 * POST, JSON:
 *   { kind: 'message' | 'workout' | 'checkin', recipientId: string, preview?: string }
 * Antwoord:
 *   { sent: number }
 *
 * Beveiliging:
 *  - Vereist een geldig Firebase ID-token (Bearer).
 *  - Ontvanger moet in dezelfde studio zitten als de afzender.
 *  - Een sporter mag alleen melden aan de eigen trainer; staf alleen aan de eigen sporters
 *    (een beheerder aan iedereen binnen de studio).
 */
import { getAdmin } from './_lib/firebaseAdmin.mjs';
import { orgIdOf } from './_lib/liftlogData.mjs';
import { getMessaging } from 'firebase-admin/messaging';

const BUILD = (process.env.VERCEL_GIT_COMMIT_SHA || 'dev').slice(0, 7);

/** Alleen deze gebeurtenissen bestaan; de teksten staan hier, niet in de aanvraag. */
const KINDS = {
  message: { title: (naam) => `Bericht van ${naam}`, body: (preview) => preview || 'Je hebt een nieuw bericht.' },
  workout: { title: () => 'Nieuw schema', body: (preview) => preview || 'Je trainer heeft een schema voor je klaargezet.' },
  checkin: { title: (naam) => `Check-in van ${naam}`, body: (preview) => preview || 'Er staat een nieuwe check-in voor je klaar.' },
};

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

async function readBody(req) {
  if (req.body) return typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

/** Mag deze afzender de ontvanger een melding sturen? */
function mayNotify(sender, recipient) {
  if (orgIdOf(sender.orgId) !== orgIdOf(recipient.orgId)) return false;
  if (sender.role === 'admin') return true;
  if (sender.role === 'trainer') return recipient.trainerId === sender.userId || recipient.userId === sender.userId;
  // Sporter: alleen naar de eigen trainer.
  return sender.trainerId != null && recipient.userId === sender.trainerId;
}

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed', build: BUILD });

  const admin = getAdmin();
  if (admin.error) {
    console.error('[notify] Firebase Admin niet beschikbaar:', admin.error);
    return json(res, 500, { error: 'Serverconfiguratie onvolledig.', build: BUILD });
  }

  const authHeader = req.headers.authorization || req.headers.Authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!token) return json(res, 401, { error: 'Niet ingelogd.', build: BUILD });

  let uid;
  try {
    uid = (await admin.auth.verifyIdToken(token)).uid;
  } catch {
    return json(res, 401, { error: 'Sessie verlopen. Log opnieuw in.', build: BUILD });
  }

  let body;
  try {
    body = await readBody(req);
  } catch {
    return json(res, 400, { error: 'Ongeldige aanvraag.', build: BUILD });
  }

  const kind = KINDS[body?.kind];
  const recipientId = typeof body?.recipientId === 'string' ? body.recipientId.trim() : '';
  if (!kind || !recipientId) return json(res, 400, { error: 'Onbekende melding.', build: BUILD });

  const [senderSnap, recipientSnap] = await Promise.all([
    admin.db.collection('profiles').doc(uid).get(),
    admin.db.collection('profiles').doc(recipientId).get(),
  ]);
  if (!senderSnap.exists || !recipientSnap.exists) return json(res, 404, { error: 'Profiel niet gevonden.', build: BUILD });

  // Alleen de velden overnemen die we nodig hebben, en het uid uit het token laten winnen.
  // Een spread van de profieldata zou een veld `userId` uit het profiel over de geauthenticeerde
  // identiteit heen schrijven — en dat veld kan een gebruiker zelf zetten.
  const pick = (snap, userId) => {
    const d = snap.data() ?? {};
    return {
      userId,
      orgId: d.orgId,
      role: d.role,
      trainerId: typeof d.trainerId === 'string' ? d.trainerId : null,
      displayName: d.displayName,
      email: d.email,
    };
  };
  const sender = pick(senderSnap, uid);
  const recipient = pick(recipientSnap, recipientId);
  if (!mayNotify(sender, recipient)) return json(res, 403, { error: 'Geen toestemming.', build: BUILD });

  // Toestellen van de ontvanger ophalen.
  const tokensSnap = await admin.db.collection('pushTokens').where('userId', '==', recipientId).get();
  const tokens = tokensSnap.docs.map((d) => d.id).filter(Boolean);
  if (tokens.length === 0) return json(res, 200, { sent: 0, build: BUILD });

  const senderName = String(sender.displayName || sender.email || 'je trainer');
  // De voorvertoning komt van de afzender, dus knippen en als platte tekst behandelen.
  const preview = typeof body.preview === 'string' ? body.preview.replace(/\s+/g, ' ').trim().slice(0, 120) : '';

  try {
    const result = await getMessaging().sendEachForMulticast({
      tokens: tokens.slice(0, 500),
      notification: { title: kind.title(senderName), body: kind.body(preview) },
      data: { kind: String(body.kind), from: uid },
    });

    // Tokens die niet meer bestaan meteen opruimen, anders blijft de lijst groeien.
    const dead = [];
    result.responses.forEach((r, i) => {
      const code = r.error?.code ?? '';
      if (code.includes('registration-token-not-registered') || code.includes('invalid-argument')) dead.push(tokens[i]);
    });
    await Promise.all(dead.map((t) => admin.db.collection('pushTokens').doc(t).delete().catch(() => {})));

    return json(res, 200, { sent: result.successCount, build: BUILD });
  } catch (e) {
    console.error('[notify] versturen mislukt:', e);
    // Een mislukte melding mag de actie eromheen (bericht versturen) nooit laten falen.
    return json(res, 200, { sent: 0, build: BUILD });
  }
}
