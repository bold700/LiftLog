/**
 * Datalaag voor de MCP-server: leest en schrijft LiftLog-data via Firebase Admin.
 * Alle functies krijgen de Firestore-instantie mee zodat ze in tests vervangen kunnen worden.
 */
import { createHash, randomBytes } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';

/** Vandaag als YYYY-MM-DD in Nederlandse tijd. */
export function todayNl() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Amsterdam' });
}

/** Aantal weken in één schemablok (een half jaar). Gelijk aan SCHEDULE_WEEKS in workoutFilter.ts. */
export const SCHEDULE_WEEKS = 26;

/**
 * Studio waar documenten zonder `orgId` bij horen (data van vóór de multi-tenant migratie).
 * Zelfde waarde als DEFAULT_ORG_ID in src/services/orgContext.ts en defaultOrg() in firestore.rules.
 */
export const DEFAULT_ORG_ID = process.env.DEFAULT_ORG_ID?.trim() || 'vanas';

/** Studio van een document; ontbreekt het veld, dan de standaardstudio. */
export function orgIdOf(raw) {
  const v = typeof raw === 'string' ? raw.trim() : '';
  return v || DEFAULT_ORG_ID;
}

/** ISO 8601-weeknummer (1-53): de week waarin de donderdag valt. */
export function getIsoWeek(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayIndex = (d.getUTCDay() + 6) % 7; // maandag = 0
  d.setUTCDate(d.getUTCDate() - dayIndex + 3); // donderdag van deze week
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const firstDayIndex = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayIndex + 3);
  return 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * 24 * 60 * 60 * 1000));
}

/** Welke week van het halfjaarschema loopt op deze datum (1-26). */
export function scheduleWeekFor(isoDate) {
  const d = new Date(`${isoDate}T12:00:00Z`);
  return ((getIsoWeek(d) - 1) % SCHEDULE_WEEKS) + 1;
}

/** Weekdag van een YYYY-MM-DD-datum: 0 = maandag … 6 = zondag (zoals seriesOrder). */
export function weekdayIndex(isoDate) {
  const d = new Date(`${isoDate}T12:00:00Z`);
  return (d.getUTCDay() + 6) % 7;
}

export function hashKey(key) {
  return createHash('sha256').update(String(key)).digest('hex');
}

export function newId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${randomBytes(4).toString('hex')}`;
}

function num(v) {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function str(v) {
  return v == null ? null : String(v);
}

export function toProfile(data, userId) {
  const rawRole = String(data.role ?? '').toLowerCase().trim();
  return {
    userId,
    orgId: orgIdOf(data.orgId),
    role: rawRole === 'admin' || rawRole === 'trainer' ? rawRole : 'sporter',
    email: str(data.email),
    displayName: str(data.displayName),
    trainerId: str(data.trainerId),
    heightCm: num(data.heightCm),
    birthDate: str(data.birthDate),
    gender: str(data.gender),
    restingHrBpm: num(data.restingHrBpm),
    weightGoalKg: num(data.weightGoalKg),
    nutritionGoal:
      data.nutritionGoal && typeof data.nutritionGoal === 'object'
        ? {
            kcal: num(data.nutritionGoal.kcal) ?? 0,
            protein: num(data.nutritionGoal.protein) ?? 0,
            carbs: num(data.nutritionGoal.carbs) ?? 0,
            fat: num(data.nutritionGoal.fat) ?? 0,
          }
        : null,
  };
}

function toSchema(data, id) {
  const toDateStr = (v) => (v && typeof v.toDate === 'function' ? v.toDate().toISOString().slice(0, 10) : v != null ? String(v).slice(0, 10) : null);
  return {
    id,
    name: String(data.name ?? ''),
    trainerId: String(data.trainerId ?? ''),
    clientId: str(data.clientId),
    audience: data.audience ?? 'single',
    participantIds: Array.isArray(data.participantIds) ? data.participantIds.map(String) : [],
    category: str(data.category),
    series: str(data.series),
    seriesOrder: num(data.seriesOrder),
    scheduleWeek: num(data.scheduleWeek),
    createdAt: typeof data.createdAt === 'string' ? data.createdAt : '',
    days: Array.isArray(data.days) ? data.days : [],
    startDate: toDateStr(data.startDate),
    endDate: toDateStr(data.endDate),
  };
}

function toLog(data, id) {
  return {
    id,
    userId: String(data.userId ?? ''),
    exerciseName: String(data.exerciseName ?? ''),
    weight: num(data.weight),
    sets: num(data.sets),
    reps: num(data.reps),
    notes: str(data.notes),
    date: typeof data.date === 'string' ? data.date : '',
    schemaId: str(data.schemaId),
    schemaDayIndex: num(data.schemaDayIndex),
  };
}

function toNutritionLog(data, id) {
  return {
    id,
    date: String(data.date ?? ''),
    productName: String(data.productName ?? ''),
    brand: String(data.brand ?? ''),
    grams: num(data.grams) ?? 0,
    kcal: num(data.kcal) ?? 0,
    protein: num(data.protein) ?? 0,
    carbs: num(data.carbs) ?? 0,
    fat: num(data.fat) ?? 0,
    createdAt: typeof data.createdAt === 'string' ? data.createdAt : '',
  };
}

const CIRCUMFERENCE_KEYS = ['chestCm', 'waistCm', 'bellyCm', 'hipCm', 'glutesCm', 'thighLeftCm', 'thighRightCm', 'armCm'];
const SKINFOLD_KEYS = [
  'skinfoldBicepsMm',
  'skinfoldTricepsMm',
  'skinfoldSubscapularMm',
  'skinfoldSuprailiacMm',
  'skinfoldAbdomenMm',
];

function toMeasurement(data, id) {
  const out = {
    id,
    date: String(data.date ?? ''),
    weightKg: num(data.weightKg),
    bodyFatPct: num(data.bodyFatPct),
    bodyFatMethod: str(data.bodyFatMethod),
    note: String(data.note ?? ''),
  };
  for (const k of [...CIRCUMFERENCE_KEYS, ...SKINFOLD_KEYS]) out[k] = num(data[k]);
  return out;
}

/** Leesbaar tijdelijk wachtwoord zonder verwarrende tekens (0/O, 1/l). */
export function generatePassword() {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(10);
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

/** Maakt de datalaag voor Firestore en (optioneel) Firebase Auth. */
/**
 * Gegevenslaag voor de AI-koppeling.
 *
 * LET OP: dit draait op de Admin SDK en omzeilt dus alle Firestore-regels. De scheiding tussen
 * studio's moet hier in code staan. Geef `orgId` mee zodra het profiel bekend is; alles wat daarna
 * gelezen of geschreven wordt blijft binnen die studio.
 *
 * `findUserByKey` en `getProfile` draaien vóórdat de studio bekend is (het profiel bepáált hem) en
 * zijn daarom bewust niet begrensd — ze werken op één document dat via de sleutel is aangewezen.
 */
export function createStore(db, auth, orgId = null) {
  /** De studio van de aanroeper; ontbreekt hij, dan is er iets misgegaan in de opzet. */
  function requireOrg() {
    if (!orgId) throw new Error('Geen studio bekend voor deze sleutel.');
    return orgId;
  }
  return {
    async findUserByKey(key) {
      const snap = await db.collection('mcpKeys').doc(hashKey(key)).get();
      if (!snap.exists) return null;
      const userId = snap.data()?.userId;
      if (!userId) return null;
      snap.ref.set({ lastUsedAt: FieldValue.serverTimestamp() }, { merge: true }).catch(() => {});
      return String(userId);
    },

    async getProfile(userId) {
      const snap = await db.collection('profiles').doc(userId).get();
      return snap.exists ? toProfile(snap.data(), snap.id) : null;
    },

    /**
     * Werkt losse profielvelden bij; alleen wat is meegegeven verandert.
     * `orgId`, `role`, `platformAdmin`, `userId` en `createdByAdmin` worden er bewust uit gefilterd:
     * van studio wisselen of jezelf rechten geven kan nooit via de AI-koppeling.
     */
    async updateProfileFields(userId, fields) {
      const safe = { ...(fields ?? {}) };
      for (const blocked of ['orgId', 'role', 'platformAdmin', 'userId', 'createdByAdmin']) delete safe[blocked];
      await db.collection('profiles').doc(userId).set({ ...safe, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    },

    /** Alle profielen binnen de eigen studio. Nooit daarbuiten. */
    async getAllProfiles() {
      const snap = await db.collection('profiles').where('orgId', '==', requireOrg()).get();
      return snap.docs.map((d) => toProfile(d.data(), d.id));
    },

    /**
     * Schema's rond deze gebruiker, elk met een `source`:
     *  - 'client'      : persoonlijk aan deze gebruiker toegewezen
     *  - 'participant' : deelnemer aan een groepsles / meerdere-klanten-schema
     *  - 'open'        : beschikbaar voor iedereen
     *  - 'authored'    : door deze trainer gemaakt voor anderen (dus NIET zijn eigen training)
     * De eerste treffer wint, zodat een eigen schema nooit als 'authored' wordt gemarkeerd.
     */
    async getSchemasForUser(userId, role) {
      const col = db.collection('workouts').where('orgId', '==', requireOrg());
      const isStaff = role === 'trainer' || role === 'admin';
      const [byClient, byParticipant, byOpen, byAuthor] = await Promise.all([
        col.where('clientId', '==', userId).get(),
        col.where('participantIds', 'array-contains', userId).get(),
        col.where('audience', '==', 'open').get(),
        isStaff ? col.where('trainerId', '==', userId).get() : null,
      ]);
      const byId = new Map();
      const add = (snap, source) => {
        if (!snap) return;
        for (const d of snap.docs) {
          if (!byId.has(d.id)) byId.set(d.id, { ...toSchema(d.data(), d.id), source });
        }
      };
      add(byClient, 'client');
      add(byParticipant, 'participant');
      add(byOpen, 'open');
      add(byAuthor, 'authored');
      return Array.from(byId.values()).sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1));
    },

    /** Slaat een nieuw schema op. Overschrijft nooit: de id wordt hier gemaakt. */
    async saveSchema(schema) {
      const id = `schema_${Date.now()}_${randomBytes(4).toString('hex')}`;
      const doc = { ...schema, id, orgId: requireOrg(), createdAt: new Date().toISOString(), updatedAt: FieldValue.serverTimestamp() };
      await db.collection('workouts').doc(id).set(doc);
      return { ...schema, id, createdAt: doc.createdAt };
    },

    /**
     * Maakt een login-account plus profiel aan. Geeft het tijdelijke wachtwoord één keer terug.
     * `createdByAdmin` staat aan, zodat de gebruiker zonder e-mailverificatie kan inloggen.
     */
    async createAccount({ email, displayName, role, trainerId }) {
      if (!auth) throw new Error('Accounts aanmaken is niet beschikbaar op deze server.');
      const normalized = String(email).trim().toLowerCase();
      const password = generatePassword();
      let user;
      try {
        user = await auth.createUser({ email: normalized, password, displayName: displayName || undefined });
      } catch (e) {
        if (e?.code === 'auth/email-already-exists') throw new Error(`Er bestaat al een account met ${normalized}.`);
        if (e?.code === 'auth/invalid-email') throw new Error(`${normalized} is geen geldig e-mailadres.`);
        throw new Error(`Account aanmaken mislukt: ${e?.message || 'onbekende fout'}`);
      }
      await db.collection('profiles').doc(user.uid).set({
        userId: user.uid,
        orgId: requireOrg(),
        role,
        email: normalized,
        displayName: displayName || null,
        trainerId: role === 'sporter' ? trainerId ?? null : null,
        trainerRequested: false,
        leaderboardVisibility: 'named',
        createdByAdmin: true,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      return { userId: user.uid, email: normalized, password };
    },

    /** Wijst een bestaand schema toe aan een sporter (of maakt het los). Raakt de oefeningen niet aan. */
    async assignSchema(schemaId, clientId) {
      // De Admin SDK kent geen regels: eerst zelf controleren dat het schema in de eigen studio staat.
      const ref = db.collection('workouts').doc(schemaId);
      const snap = await ref.get();
      if (!snap.exists) throw new Error('Schema niet gevonden.');
      if (orgIdOf(snap.data()?.orgId) !== requireOrg()) throw new Error('Schema niet gevonden.');
      await ref.set(
        { clientId, audience: 'single', updatedAt: FieldValue.serverTimestamp() },
        { merge: true }
      );
    },

    async getLogsForUser(userId) {
      const snap = await db.collection('logs').where('userId', '==', userId).get();
      return snap.docs.map((d) => toLog(d.data(), d.id)).sort((a, b) => (b.date > a.date ? 1 : -1));
    },

    async saveLog(log) {
      const id = newId('log');
      const createdAt = new Date().toISOString();
      await db.collection('logs').doc(id).set({ ...log, id, orgId: requireOrg(), createdAt, updatedAt: FieldValue.serverTimestamp() });
      return { ...log, id, createdAt };
    },

    async getNutritionForDay(userId, date) {
      const snap = await db.collection('nutritionLogs').where('userId', '==', userId).where('date', '==', date).get();
      return snap.docs.map((d) => toNutritionLog(d.data(), d.id)).sort((a, b) => (a.createdAt > b.createdAt ? 1 : -1));
    },

    async saveNutritionLog(log) {
      const id = newId('food');
      const createdAt = new Date().toISOString();
      await db.collection('nutritionLogs').doc(id).set({ ...log, id, orgId: requireOrg(), createdAt, updatedAt: FieldValue.serverTimestamp() });
      return { ...log, id, createdAt };
    },

    /**
     * Stuurt een bericht namens iemand. De aanroeper heeft de rechten al gecontroleerd;
     * hier stampen we alleen de studio en de vaste velden.
     */
    async sendMessage({ senderId, recipientId, text, kind = 'text', checkin = null }) {
      const id = newId('msg');
      const createdAt = new Date().toISOString();
      const doc = {
        id,
        orgId: requireOrg(),
        threadId: [senderId, recipientId].sort().join('__'),
        senderId,
        recipientId,
        text: String(text).slice(0, 4000),
        kind,
        checkin,
        createdAt,
        readAt: null,
        updatedAt: FieldValue.serverTimestamp(),
      };
      await db.collection('messages').doc(id).set(doc);
      return { id, createdAt };
    },

    async getMeasurements(userId) {
      const snap = await db.collection('measurements').where('userId', '==', userId).get();
      return snap.docs.map((d) => toMeasurement(d.data(), d.id)).sort((a, b) => (a.date > b.date ? 1 : -1));
    },

    async saveMeasurement(m) {
      const id = newId('meas');
      const createdAt = new Date().toISOString();
      const empty = {
        weightKg: null, bodyFatPct: null, chestCm: null, waistCm: null, bellyCm: null, hipCm: null, glutesCm: null,
        thighLeftCm: null, thighRightCm: null, armCm: null, skinfoldBicepsMm: null, skinfoldTricepsMm: null,
        skinfoldSubscapularMm: null, skinfoldSuprailiacMm: null, skinfoldAbdomenMm: null, bodyFatMethod: null,
        photoFrontUrl: null, photoSideUrl: null, photoBackUrl: null, note: '',
      };
      await db.collection('measurements').doc(id).set({ ...empty, ...m, id, orgId: requireOrg(), createdAt, updatedAt: FieldValue.serverTimestamp() });
      return { ...m, id, createdAt };
    },
  };
}
