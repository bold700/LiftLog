/**
 * Accounts die lang niet zijn gebruikt automatisch verwijderen (AVG: niet langer bewaren dan nodig).
 *
 * Staat per studio uit, tot de eigenaar het aanzet in Beheer → Huisstijl en zelf kiest na hoeveel
 * maanden (orgs/{orgId}.accountRetention = { enabled, months }). De dagelijkse avondronde
 * (api/booking.mjs → eveningRun) loopt dan de leden na:
 *
 *  1. Nog niet zo lang weg: niets.
 *  2. Over 30 dagen is de termijn om: een waarschuwing (pushmelding en, als mail is ingericht,
 *     een e-mail) en `profiles/{uid}.retentionWarning` wordt gezet.
 *  3. Na die 30 dagen en nog steeds niet ingelogd: account en gegevens weg, net als bij zelf
 *     verwijderen. Facturen en betalingen blijven voor de administratie van de studio.
 *  Logt iemand na de waarschuwing in, dan vervalt de waarschuwing en begint de termijn opnieuw.
 *
 * Voorzichtig, want verwijderen is definitief:
 *  - alleen sporters, nooit trainers, beheerders of de eigenaar;
 *  - niet wie in meer dan één studio zit (dan beslist niet één studio over het hele account);
 *  - niet wie een actief abonnement of een komende les heeft;
 *  - "laatst actief" komt uit Firebase Authentication (laatste keer ingelogd of sessie ververst).
 */
import { orgIdOf } from './liftlogData.mjs';
import { addMonths } from './subscriptions.mjs';
import { amsterdamDate } from './classReminders.mjs';
import { deleteUserData, deleteUserFiles } from './accountData.mjs';

export const RETENTION_MIN_MONTHS = 3;
export const RETENTION_MAX_MONTHS = 120;
export const WARNING_DAYS = 30;
const STALE_WARNING_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

/** De instelling van een studio, of null als die uit staat of ongeldig is. */
export function retentionSettings(org) {
  const r = org?.accountRetention;
  if (!r || r.enabled !== true) return null;
  const months = Math.round(Number(r.months));
  if (!Number.isFinite(months) || months < RETENTION_MIN_MONTHS || months > RETENTION_MAX_MONTHS) return null;
  return { months };
}

/**
 * Wat er met één lid moet gebeuren. Puur, zodat de regels zonder database te testen zijn.
 * @returns {{ action: 'keep' | 'warn' | 'delete' | 'reset', deleteOn?: string }}
 */
export function retentionDecision({ lastActiveMs, warnedAtMs = null, nowMs, months }) {
  if (!Number.isFinite(lastActiveMs)) return { action: 'keep' };
  // Na de waarschuwing weer actief geweest: opnieuw beginnen.
  if (warnedAtMs != null && lastActiveMs > warnedAtMs) return { action: 'reset' };
  const expiresMs = Date.parse(addMonths(new Date(lastActiveMs).toISOString(), months));
  if (warnedAtMs == null) {
    if (nowMs < expiresMs - WARNING_DAYS * DAY_MS) return { action: 'keep' };
    // Altijd de volle 30 dagen na de waarschuwing, ook als de termijn eigenlijk al om is
    // (bijvoorbeeld net nadat de eigenaar de instelling heeft aangezet).
    const deleteOnMs = Math.max(expiresMs, nowMs + WARNING_DAYS * DAY_MS);
    return { action: 'warn', deleteOn: new Date(deleteOnMs).toISOString() };
  }
  const deleteOnMs = Math.max(expiresMs, warnedAtMs + WARNING_DAYS * DAY_MS);
  // Een oude waarschuwing (de instelling stond een tijd uit, of de ronde liep niet): niet meteen
  // verwijderen, maar opnieuw waarschuwen en weer 30 dagen geven.
  if (nowMs > deleteOnMs + STALE_WARNING_DAYS * DAY_MS) {
    return { action: 'warn', deleteOn: new Date(nowMs + WARNING_DAYS * DAY_MS).toISOString() };
  }
  return nowMs >= deleteOnMs ? { action: 'delete' } : { action: 'keep' };
}

/** Laatste activiteit volgens Firebase Authentication, in milliseconden. */
export function lastActiveMsOf(authUser) {
  const m = authUser?.metadata ?? {};
  const times = [m.lastRefreshTime, m.lastSignInTime, m.creationTime].map((t) => (t ? Date.parse(t) : NaN)).filter(Number.isFinite);
  return times.length ? Math.max(...times) : NaN;
}

async function authUsersById(auth, uids) {
  const byId = new Map();
  for (let i = 0; i < uids.length; i += 100) {
    const { users } = await auth.getUsers(uids.slice(i, i + 100).map((uid) => ({ uid })));
    for (const u of users) byId.set(u.uid, u);
  }
  return byId;
}

/** Heeft dit lid een actief abonnement of een komende les? Dan is het account in gebruik. */
async function hasOngoingRelation(db, uid, today) {
  const memberships = await db.collection('memberships').where('userId', '==', uid).where('status', '==', 'active').limit(1).get();
  if (!memberships.empty) return true;
  const bookings = await db.collection('bookings').where('userId', '==', uid).get();
  for (const b of bookings.docs) {
    const booking = b.data();
    if (!['booked', 'waitlist'].includes(String(booking.status))) continue;
    const cls = await db.collection('classes').doc(String(booking.classId)).get();
    if (cls.exists && String(cls.data().date) >= today) return true;
  }
  return false;
}

const DATE_FMT = new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Amsterdam' });

/** De tekst van de waarschuwing. */
export function retentionWarningText(orgName, deleteOnIso) {
  const date = DATE_FMT.format(new Date(deleteOnIso));
  return {
    title: 'Je account wordt binnenkort verwijderd',
    body: `Je hebt lang niet ingelogd bij ${orgName}. Op ${date} verwijderen we je account en je gegevens. Wil je het houden? Open de app en log in.`,
  };
}

/**
 * De dagelijkse ronde. Afhankelijkheden komen binnen als parameters, zodat de test een eigen
 * database, login-dienst en meldingen kan meegeven.
 * @param {object} deps
 * @param {*} deps.db Firestore (Admin SDK)
 * @param {*} deps.auth Firebase Auth (Admin SDK)
 * @param {*} [deps.bucket] opslagbucket voor foto's, of null
 * @param {(uid: string, msg: { title: string, body: string }) => Promise<unknown>} deps.notify
 * @param {Date} [deps.now]
 */
export async function runAccountRetention({ db, auth, bucket = null, notify, now = new Date() }) {
  const report = { studios: 0, checked: 0, warned: 0, deleted: 0, reset: 0, skipped: 0 };
  const orgsSnap = await db.collection('orgs').get();
  const settings = new Map();
  const owners = new Set();
  const orgNames = new Map();
  for (const o of orgsSnap.docs) {
    const data = o.data();
    if (data.ownerId) owners.add(String(data.ownerId));
    orgNames.set(o.id, String(data.name || 'je studio'));
    const s = retentionSettings(data);
    if (s) settings.set(o.id, s);
  }
  report.studios = settings.size;
  if (settings.size === 0) return report;

  const profilesSnap = await db.collection('profiles').where('role', '==', 'sporter').get();
  const candidates = [];
  for (const p of profilesSnap.docs) {
    const data = p.data();
    const orgIds = Array.isArray(data.orgIds) && data.orgIds.length ? data.orgIds.map(orgIdOf) : [orgIdOf(data.orgId)];
    if (new Set(orgIds).size !== 1 || owners.has(p.id)) continue;
    const s = settings.get(orgIds[0]);
    if (s) candidates.push({ uid: p.id, ref: p.ref, data, orgId: orgIds[0], months: s.months });
  }
  if (candidates.length === 0) return report;

  const authById = await authUsersById(auth, candidates.map((c) => c.uid));
  const nowMs = now.getTime();
  const today = amsterdamDate(now, 0);

  for (const c of candidates) {
    const authUser = authById.get(c.uid);
    if (!authUser) continue; // Geen login meer: dat is niet aan deze ronde.
    report.checked++;
    const warnedAtMs = c.data.retentionWarning?.warnedAt ? Date.parse(c.data.retentionWarning.warnedAt) : null;
    const decision = retentionDecision({ lastActiveMs: lastActiveMsOf(authUser), warnedAtMs, nowMs, months: c.months });
    if (decision.action === 'keep') continue;
    if (decision.action === 'reset') {
      await c.ref.update({ retentionWarning: null });
      report.reset++;
      continue;
    }
    if (await hasOngoingRelation(db, c.uid, today)) {
      if (warnedAtMs != null) await c.ref.update({ retentionWarning: null });
      report.skipped++;
      continue;
    }
    if (decision.action === 'warn') {
      await c.ref.update({ retentionWarning: { warnedAt: now.toISOString(), deleteOn: decision.deleteOn } });
      await notify(c.uid, retentionWarningText(orgNames.get(c.orgId), decision.deleteOn), authUser).catch((e) =>
        console.error('[accountRetention] waarschuwen mislukte:', e)
      );
      report.warned++;
      continue;
    }
    // Verwijderen: login eerst, zodat niemand halverwege nog kan inloggen op een half account.
    try {
      await auth.deleteUser(c.uid);
    } catch (e) {
      if (e?.code !== 'auth/user-not-found') {
        console.error('[accountRetention] login verwijderen mislukte:', e);
        continue;
      }
    }
    await deleteUserFiles(bucket, c.uid);
    await c.ref.delete();
    await deleteUserData(db, c.uid);
    report.deleted++;
  }
  return report;
}
