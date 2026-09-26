/**
 * Meldingen van de studio: welke automatische meldingen aan staan, de teksten, wie een bericht
 * ontvangt, en de avondronde (lesherinneringen, geplande berichten, wekelijkse check-in, 2 weken
 * niet getraind, verjaardagen).
 *
 * Gebruikt door api/booking.mjs (acties + dagelijkse cron) en api/notify.mjs. Losse, pure functies
 * waar het kan, zodat de regels te testen zijn zonder database.
 */
import { orgIdOf } from './liftlogData.mjs';
import { sendPushToUser } from './pushSend.mjs';
import { amsterdamDate as amsterdamDay, buildClassReminders } from './classReminders.mjs';

// --- Instellingen per studio (Beheer → Meldingen) -------------------------------------------

/** Alle automatische meldingen. Staat er niets op het studio-document, dan staat hij aan. */
export const NOTIFICATION_KINDS = [
  'workout',
  'checkin',
  'classReminder',
  'classCancelled',
  'waitlistPromoted',
  'creditsLow',
  'weeklyCheckin',
  'inactive',
  'birthday',
];

export function notificationEnabled(org, kind) {
  return org?.notifications?.[kind] !== false;
}

export async function orgNotificationEnabled(db, orgId, kind) {
  const snap = await db.collection('orgs').doc(orgIdOf(orgId)).get();
  return notificationEnabled(snap.exists ? snap.data() : null, kind);
}

// --- Teksten ------------------------------------------------------------------------------

const DAY_FMT = new Intl.DateTimeFormat('nl-NL', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

/** "2026-09-26" → "za 26 sep". */
export function dayLabel(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) return '';
  return DAY_FMT.format(new Date(`${date}T12:00:00Z`)).replace(/\./g, '');
}

/** "09:00" → "9:00". */
export function shortTime(hhmm) {
  const [h, m] = String(hhmm || '').split(':');
  if (!h || m === undefined) return String(hhmm || '');
  return `${Number(h)}:${m}`;
}

const credits = (n) => (n === 1 ? '1 credit' : `${n} credits`);
const when = (cls) => [dayLabel(cls?.date), shortTime(cls?.startTime)].filter(Boolean).join(' ');

export const messages = {
  /** De studio meldde iemand af (in de praktijk: de les gaat niet door). */
  bookingCancelledByStudio(cls, refunded) {
    return {
      title: 'Les geannuleerd',
      body: `Je plek bij ${cls?.title || 'de les'} (${when(cls)}) is geannuleerd door de studio.${refunded ? ' Je credit staat weer op je saldo.' : ''}`,
    };
  },
  /** Plek vrij in een les waar je op de wachtlijst staat: zelf aanmelden, wie het eerst is. */
  waitlistSpot(cls) {
    return {
      title: 'Plek vrij!',
      body: `Er is een plek vrijgekomen bij ${cls?.title || 'de les'} (${when(cls)}). Je staat op de wachtlijst: meld je aan in de app, wie het eerst is heeft de plek.`,
    };
  },
  waitlistPromoted(cls, cost) {
    return {
      title: 'Je hebt een plek!',
      body: `Er kwam een plek vrij bij ${cls?.title || 'de les'} (${when(cls)}); je staat nu ingeschreven.${cost > 0 ? ` Er is ${credits(cost)} afgeschreven.` : ''}`,
    };
  },
  creditsLow(balance) {
    return balance <= 0
      ? { title: 'Je credits zijn op', body: 'Koop nieuwe credits in de app om te blijven boeken.' }
      : { title: `Nog ${credits(balance)} over`, body: 'Koop op tijd nieuwe credits, dan kun je blijven boeken.' };
  },
  weeklyCheckin() {
    return { title: 'Wekelijkse check-in', body: 'Hoe ging je week? Vul in een minuut je check-in in voor je trainer.' };
  },
  birthday(name, studioName) {
    const first = String(name || '').trim().split(/\s+/)[0];
    return {
      title: first ? `Gefeliciteerd, ${first}!` : 'Gefeliciteerd!',
      body: `Een hele fijne verjaardag gewenst van ${studioName || 'je studio'}.`,
    };
  },
  inactiveSummary(names) {
    const n = names.length;
    if (n === 1) return { title: `${names[0]} trainde 2 weken niet`, body: 'Even een berichtje sturen?' };
    const shown = names.slice(0, 5).join(', ');
    return {
      title: `${n} sporters trainden 2 weken niet`,
      body: `${shown}${n > 5 ? ` en ${n - 5} anderen` : ''}. Even een berichtje sturen?`,
    };
  },
};

/** Staat het saldo zo laag dat we iemand waarschuwen? Alleen als deze boeking echt credits kostte. */
export function creditsLowAfterBooking(cost, balanceAfter) {
  return cost > 0 && balanceAfter <= 1;
}

// --- Datums in Nederlandse tijd -------------------------------------------------------------

/** 0 = zondag … 6 = zaterdag, voor een YYYY-MM-DD. */
export function weekdayOf(date) {
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}

// --- Wie krijgt de avondmeldingen? (puur) ---------------------------------------------------

/** Jarigen van vandaag. Wie op 29 februari jarig is, viert het in een gewoon jaar op 28 februari. */
export function birthdayProfiles(profiles, today) {
  const md = today.slice(5);
  const leap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const year = Number(today.slice(0, 4));
  return profiles.filter((p) => {
    const b = String(p.birthDate || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(b)) return false;
    const bmd = b.slice(5);
    if (bmd === '02-29' && !leap(year)) return md === '02-28';
    return bmd === md;
  });
}

function createdAtIso(p) {
  const c = p.createdAt;
  if (typeof c === 'string') return c;
  if (c && typeof c.toDate === 'function') return c.toDate().toISOString();
  return null;
}

/**
 * Per trainer: welke van zijn sporters hebben 14 dagen niets gelogd en geen les gehad? Nieuwe
 * leden (korter dan 14 dagen) tellen niet mee: die hebben simpelweg nog niet kunnen beginnen.
 * @returns {Map<string, string[]>} trainerId → namen
 */
export function inactiveByTrainer(profiles, activeUserIds, sinceIso) {
  const out = new Map();
  for (const p of profiles) {
    if (p.role !== 'sporter' || !p.trainerId || activeUserIds.has(p.userId)) continue;
    const created = createdAtIso(p);
    if (created && created > sinceIso) continue;
    const list = out.get(p.trainerId) ?? [];
    list.push(String(p.displayName || p.email || 'Een sporter').trim());
    out.set(p.trainerId, list);
  }
  for (const list of out.values()) list.sort((a, b) => a.localeCompare(b, 'nl'));
  return out;
}

// --- Berichten van de studio (Beheer → Meldingen) ------------------------------------------

export const AUDIENCE_TYPES = ['member', 'class', 'classType', 'all'];
export const TITLE_MAX = 60;
export const BODY_MAX = 240;

/** Controle van een nieuw bericht; geeft een foutmelding terug of null. */
export function validateBroadcast({ title, body, audience, scheduledFor }, tomorrow) {
  if (!title || title.length > TITLE_MAX) return `Geef een titel van maximaal ${TITLE_MAX} tekens.`;
  if (!body || body.length > BODY_MAX) return `Geef een bericht van maximaal ${BODY_MAX} tekens.`;
  if (!audience || !AUDIENCE_TYPES.includes(audience.type)) return 'Kies naar wie het bericht gaat.';
  if (audience.type !== 'all' && !audience.id) return 'Kies naar wie het bericht gaat.';
  if (scheduledFor != null) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(scheduledFor)) return 'Ongeldige datum.';
    if (scheduledFor < tomorrow) return 'Kies een datum vanaf morgen; voor vandaag verstuur je het meteen.';
  }
  return null;
}

/** Wie hoort er bij deze doelgroep, binnen deze studio? Jezelf nooit. */
export async function resolveAudience(db, orgId, audience, senderId, today) {
  const ids = new Set();
  const inOrg = (p) => {
    const orgs = Array.isArray(p.orgIds) && p.orgIds.length ? p.orgIds.map(String) : [orgIdOf(p.orgId)];
    return orgs.includes(orgId);
  };

  if (audience.type === 'member') {
    const snap = await db.collection('profiles').doc(String(audience.id)).get();
    if (snap.exists && inOrg(snap.data())) ids.add(snap.id);
  } else if (audience.type === 'all') {
    const snap = await db.collection('profiles').where('orgIds', 'array-contains', orgId).get();
    for (const d of snap.docs) ids.add(d.id);
  } else if (audience.type === 'class') {
    const cls = await db.collection('classes').doc(String(audience.id)).get();
    if (cls.exists && orgIdOf(cls.data().orgId) === orgId) {
      const snap = await db.collection('bookings').where('classId', '==', cls.id).get();
      for (const d of snap.docs) {
        const b = d.data();
        if (['booked', 'waitlist'].includes(String(b.status)) && b.userId) ids.add(String(b.userId));
      }
    }
  } else if (audience.type === 'classType') {
    // Iedereen die ingeschreven staat voor een komende les van deze soort, plus de vaste deelnemers.
    const classes = await db.collection('classes').where('classTypeId', '==', String(audience.id)).get();
    const upcoming = classes.docs.filter((d) => orgIdOf(d.data().orgId) === orgId && String(d.data().date) >= today).map((d) => d.id);
    for (let i = 0; i < upcoming.length; i += 30) {
      const snap = await db.collection('bookings').where('classId', 'in', upcoming.slice(i, i + 30)).get();
      for (const d of snap.docs) {
        const b = d.data();
        if (['booked', 'waitlist'].includes(String(b.status)) && b.userId) ids.add(String(b.userId));
      }
    }
    const standing = await db.collection('standingBookings').where('classTypeId', '==', String(audience.id)).get();
    for (const d of standing.docs) {
      const s = d.data();
      if (s.active !== false && orgIdOf(s.orgId) === orgId && s.userId) ids.add(String(s.userId));
    }
  }
  ids.delete(senderId);
  return [...ids];
}

/** Stuurt een opgeslagen bericht naar zijn doelgroep en werkt het document bij. */
export async function deliverBroadcast(db, id, data, today) {
  const ref = db.collection('broadcasts').doc(id);
  const recipients = await resolveAudience(db, orgIdOf(data.orgId), data.audience, data.createdBy, today);
  let devices = 0;
  for (const userId of recipients) {
    try {
      devices += await sendPushToUser(db, userId, { title: data.title, body: data.body, data: { kind: 'broadcast', id } });
    } catch (e) {
      console.error('[broadcast] versturen mislukt voor', userId, e);
    }
  }
  const update = { status: 'sent', sentAt: new Date().toISOString(), recipients: recipients.length, devices };
  await ref.set(update, { merge: true });
  return update;
}

// --- De avondronde ---------------------------------------------------------------------------

async function sendMany(db, list) {
  let people = 0;
  let devices = 0;
  for (const { userId, message, data } of list) {
    try {
      const n = await sendPushToUser(db, userId, { ...message, data });
      people++;
      devices += n;
    } catch (e) {
      console.error('[evening] versturen mislukt voor', userId, e);
    }
  }
  return { people, devices };
}

/**
 * Alles wat 's avonds (~18:00) de deur uit gaat. Elke stap staat los: mislukt er één, dan gaan de
 * andere gewoon door. Geeft per stap een telling terug, voor de logs van de cron.
 */
export async function runEveningNotifications(db, now = new Date()) {
  const today = amsterdamDay(now, 0);
  const tomorrow = amsterdamDay(now, 1);
  const weekday = weekdayOf(today);
  const report = {};

  const orgsSnap = await db.collection('orgs').get();
  const orgs = new Map(orgsSnap.docs.map((d) => [d.id, d.data()]));
  const orgOn = (orgId, kind) => notificationEnabled(orgs.get(orgIdOf(orgId)), kind);

  // 1. Lesherinneringen voor morgen.
  try {
    const classesSnap = await db.collection('classes').where('date', '==', tomorrow).get();
    const classes = classesSnap.docs
      .map((d) => ({ ...d.data(), id: d.id }))
      .filter((c) => orgOn(c.orgId, 'classReminder'));
    const classIds = classes.filter((c) => !c.cancelledAt).map((c) => c.id);
    const bookings = [];
    for (let i = 0; i < classIds.length; i += 30) {
      const snap = await db.collection('bookings').where('classId', 'in', classIds.slice(i, i + 30)).get();
      for (const d of snap.docs) bookings.push({ ...d.data(), id: d.id });
    }
    const reminders = buildClassReminders(classes, bookings);
    let devices = 0;
    for (const r of reminders) {
      try {
        devices += await sendPushToUser(db, r.userId, { title: r.title, body: r.body, data: { kind: 'classReminder', date: tomorrow } });
        const batch = db.batch();
        for (const id of r.bookingIds) batch.set(db.collection('bookings').doc(id), { reminderSentAt: new Date().toISOString() }, { merge: true });
        await batch.commit();
      } catch (e) {
        console.error('[evening] lesherinnering mislukt voor', r.userId, e);
      }
    }
    report.classReminders = { people: reminders.length, devices };
  } catch (e) {
    console.error('[evening] lesherinneringen mislukt', e);
    report.classReminders = { error: true };
  }

  // 2. Geplande berichten van vandaag.
  try {
    const snap = await db.collection('broadcasts').where('scheduledFor', '==', today).get();
    let sent = 0;
    for (const d of snap.docs) {
      if (d.data().status !== 'scheduled') continue;
      await deliverBroadcast(db, d.id, d.data(), today);
      sent++;
    }
    report.broadcasts = { sent };
  } catch (e) {
    console.error('[evening] geplande berichten mislukt', e);
    report.broadcasts = { error: true };
  }

  // Voor stap 3–5 hebben we de profielen nodig; één keer ophalen.
  let profiles = [];
  try {
    const snap = await db.collection('profiles').get();
    profiles = snap.docs.map((d) => ({ ...d.data(), userId: d.id }));
  } catch (e) {
    console.error('[evening] profielen ophalen mislukt', e);
  }

  // 3. Zondag: wekelijkse check-in voor sporters met een trainer.
  if (weekday === 0) {
    const list = profiles
      .filter((p) => p.role === 'sporter' && p.trainerId && orgOn(p.orgId, 'weeklyCheckin'))
      .map((p) => ({ userId: p.userId, message: messages.weeklyCheckin(), data: { kind: 'weeklyCheckin' } }));
    report.weeklyCheckin = await sendMany(db, list);
  }

  // 4. Maandag: trainers horen wie van hun sporters twee weken niet trainde.
  if (weekday === 1) {
    try {
      const since = amsterdamDay(now, -14);
      const active = new Set();
      const logs = await db.collection('logs').where('date', '>=', since).get();
      for (const d of logs.docs) if (d.data().userId) active.add(String(d.data().userId));
      const past = await db.collection('classes').where('date', '>=', since).get();
      const pastIds = past.docs.filter((d) => String(d.data().date) <= today && !d.data().cancelledAt).map((d) => d.id);
      for (let i = 0; i < pastIds.length; i += 30) {
        const snap = await db.collection('bookings').where('classId', 'in', pastIds.slice(i, i + 30)).get();
        for (const d of snap.docs) if (['booked', 'attended'].includes(d.data().status) && d.data().userId) active.add(String(d.data().userId));
      }
      const perTrainer = inactiveByTrainer(
        profiles.filter((p) => orgOn(p.orgId, 'inactive')),
        active,
        `${since}T00:00:00.000Z`
      );
      const list = [...perTrainer].map(([trainerId, names]) => ({
        userId: trainerId,
        message: messages.inactiveSummary(names),
        data: { kind: 'inactive' },
      }));
      report.inactive = await sendMany(db, list);
    } catch (e) {
      console.error('[evening] inactieve sporters mislukt', e);
      report.inactive = { error: true };
    }
  }

  // 5. Verjaardagen.
  const jarigen = birthdayProfiles(profiles, today).filter((p) => orgOn(p.orgId, 'birthday'));
  report.birthday = await sendMany(
    db,
    jarigen.map((p) => ({
      userId: p.userId,
      message: messages.birthday(p.displayName, orgs.get(orgIdOf(p.orgId))?.name),
      data: { kind: 'birthday' },
    }))
  );

  return { date: today, ...report };
}
