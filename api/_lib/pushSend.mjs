/**
 * Een pushmelding naar alle toestellen van één persoon sturen (Firebase Cloud Messaging).
 *
 * Gedeeld door api/notify.mjs (meldingen die iemand in de app veroorzaakt) en de lesherinneringen
 * in api/booking.mjs. Tokens die niet meer bestaan worden meteen opgeruimd, anders groeit de lijst
 * `pushTokens` met dode toestellen.
 */
import { getMessaging } from 'firebase-admin/messaging';

/**
 * @param {import('firebase-admin/firestore').Firestore} db
 * @param {string} userId
 * @param {{ title: string, body: string, data?: Record<string, string> }} message
 * @returns {Promise<number>} aantal toestellen waar de melding aankwam
 */
export async function sendPushToUser(db, userId, { title, body, data = {} }) {
  const tokensSnap = await db.collection('pushTokens').where('userId', '==', userId).get();
  const tokens = tokensSnap.docs.map((d) => d.id).filter(Boolean).slice(0, 500);
  if (tokens.length === 0) return 0;

  const result = await getMessaging().sendEachForMulticast({ tokens, notification: { title, body }, data });

  const dead = [];
  result.responses.forEach((r, i) => {
    const code = r.error?.code ?? '';
    if (code.includes('registration-token-not-registered') || code.includes('invalid-argument')) dead.push(tokens[i]);
  });
  await Promise.all(dead.map((t) => db.collection('pushTokens').doc(t).delete().catch(() => {})));

  return result.successCount;
}
