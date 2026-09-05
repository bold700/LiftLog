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

function toMeasurement(data, id) {
  return {
    id,
    date: String(data.date ?? ''),
    weightKg: num(data.weightKg),
    bodyFatPct: num(data.bodyFatPct),
    waistCm: num(data.waistCm),
    note: String(data.note ?? ''),
  };
}

/** Maakt de datalaag voor één Firestore-instantie. */
export function createStore(db) {
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

    async getAllProfiles() {
      const snap = await db.collection('profiles').get();
      return snap.docs.map((d) => toProfile(d.data(), d.id));
    },

    async getSchemasForUser(userId, role) {
      const col = db.collection('workouts');
      const snaps = await Promise.all([
        col.where('clientId', '==', userId).get(),
        col.where('participantIds', 'array-contains', userId).get(),
        col.where('audience', '==', 'open').get(),
        ...(role === 'trainer' || role === 'admin' ? [col.where('trainerId', '==', userId).get()] : []),
      ]);
      const byId = new Map();
      for (const snap of snaps) for (const d of snap.docs) byId.set(d.id, toSchema(d.data(), d.id));
      return Array.from(byId.values()).sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1));
    },

    async getLogsForUser(userId) {
      const snap = await db.collection('logs').where('userId', '==', userId).get();
      return snap.docs.map((d) => toLog(d.data(), d.id)).sort((a, b) => (b.date > a.date ? 1 : -1));
    },

    async saveLog(log) {
      const id = newId('log');
      const createdAt = new Date().toISOString();
      await db.collection('logs').doc(id).set({ ...log, id, createdAt, updatedAt: FieldValue.serverTimestamp() });
      return { ...log, id, createdAt };
    },

    async getNutritionForDay(userId, date) {
      const snap = await db.collection('nutritionLogs').where('userId', '==', userId).where('date', '==', date).get();
      return snap.docs.map((d) => toNutritionLog(d.data(), d.id)).sort((a, b) => (a.createdAt > b.createdAt ? 1 : -1));
    },

    async saveNutritionLog(log) {
      const id = newId('food');
      const createdAt = new Date().toISOString();
      await db.collection('nutritionLogs').doc(id).set({ ...log, id, createdAt, updatedAt: FieldValue.serverTimestamp() });
      return { ...log, id, createdAt };
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
      await db.collection('measurements').doc(id).set({ ...empty, ...m, id, createdAt, updatedAt: FieldValue.serverTimestamp() });
      return { ...m, id, createdAt };
    },
  };
}
