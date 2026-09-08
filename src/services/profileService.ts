/**
 * Firestore profielen (trainer / sporter).
 * Collectie: profiles, document id = userId.
 */
import {
  doc,
  setDoc,
  getDoc,
  getDocFromServer,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  getDocs,
  serverTimestamp,
  type Timestamp,
} from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../firebase/config';
import type { Profile, ProfileRole, LeaderboardVisibility, Limitation, LimitationArea } from '../types';

const COLLECTION = 'profiles';

/** Toegestane lichaamsdelen bij een bijzonderheid (zelfde lijst als src/utils/exerciseLimitations.ts). */
const LIMITATION_AREA_VALUES: LimitationArea[] = [
  'schouder', 'nek', 'elleboog', 'pols', 'onderrug', 'bovenrug', 'borst', 'buik', 'heup', 'knie', 'hamstring', 'enkel', 'overig',
];

function numOrNull(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function parseGoal(v: unknown): Profile['nutritionGoal'] {
  if (!v || typeof v !== 'object') return null;
  const g = v as Record<string, unknown>;
  const n = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : Number(x) || 0);
  const goal = { kcal: n(g.kcal), protein: n(g.protein), carbs: n(g.carbs), fat: n(g.fat) };
  return goal.kcal || goal.protein || goal.carbs || goal.fat ? goal : null;
}

/** Bijzonderheden uit Firestore, met alleen bekende waarden (onbekende regels vallen weg). */
function parseLimitations(raw: unknown): Limitation[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: Limitation[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const area = LIMITATION_AREA_VALUES.includes(String(o.area) as LimitationArea) ? (String(o.area) as LimitationArea) : null;
    if (!area) continue;
    out.push({
      id: String(o.id ?? `lim_${out.length}`),
      area,
      severity: o.severity === 'vermijden' ? 'vermijden' : 'let-op',
      note: o.note == null || o.note === '' ? null : String(o.note),
      alternative: o.alternative == null || o.alternative === '' ? null : String(o.alternative),
      createdAt: typeof o.createdAt === 'string' ? o.createdAt : new Date().toISOString(),
    });
  }
  return out;
}

function toProfile(data: Record<string, unknown>, userId: string): Profile {
  const toStr = (v: unknown) => (v == null ? null : String(v));
  const ts = (v: unknown) => (v && typeof (v as Timestamp).toDate === 'function' ? (v as Timestamp).toDate().toISOString() : new Date().toISOString());
  const rawRole = data.role != null ? String(data.role).toLowerCase().trim() : '';
  const role = rawRole === 'admin' || rawRole === 'trainer' || rawRole === 'sporter' ? rawRole : 'sporter';
  const rawVis = data.leaderboardVisibility;
  const leaderboardVisibility: LeaderboardVisibility =
    rawVis === 'anonymous' || rawVis === 'named' || rawVis === 'hidden' ? rawVis : 'named';
  return {
    userId,
    role: role as ProfileRole,
    email: toStr(data.email),
    displayName: toStr(data.displayName),
    photoURL: toStr(data.photoURL),
    nutritionGoal: parseGoal(data.nutritionGoal),
    weightGoalKg: numOrNull(data.weightGoalKg),
    heightCm: numOrNull(data.heightCm),
    birthDate: toStr(data.birthDate),
    gender: data.gender === 'man' || data.gender === 'vrouw' || data.gender === 'anders' ? data.gender : null,
    restingHrBpm: numOrNull(data.restingHrBpm),
    limitations: parseLimitations(data.limitations),
    trainerId: toStr(data.trainerId),
    trainerRequested: data.trainerRequested === true,
    createdByAdmin: data.createdByAdmin === true,
    leaderboardVisibility,
    createdAt: ts(data.createdAt),
    updatedAt: ts(data.updatedAt),
  };
}

export async function createProfile(
  userId: string,
  role: ProfileRole,
  email: string | null,
  displayName?: string | null,
  trainerRequested?: boolean
): Promise<Profile> {
  if (!isFirebaseConfigured() || !db) throw new Error('Firebase niet geconfigureerd');
  const normalizedEmail = email?.trim().toLowerCase() ?? null;
  const now = new Date().toISOString();
  const profile: Profile = {
    userId,
    role,
    email: normalizedEmail,
    displayName: displayName ?? null,
    trainerId: null,
    trainerRequested: trainerRequested ?? false,
    leaderboardVisibility: 'named',
    createdAt: now,
    updatedAt: now,
  };
  const ref = doc(db, COLLECTION, userId);
  await setDoc(ref, {
    ...profile,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return profile;
}

/** Haalt profiel op van de server (niet uit cache), zodat rol-wijzigingen in de console direct zichtbaar zijn. */
export async function getProfile(userId: string): Promise<Profile | null> {
  if (!isFirebaseConfigured() || !db) return null;
  const ref = doc(db, COLLECTION, userId);
  try {
    const snap = await getDocFromServer(ref);
    if (!snap.exists()) return null;
    return toProfile(snap.data(), snap.id);
  } catch {
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;
    return toProfile(snap.data(), snap.id);
  }
}

export async function updateProfile(
  userId: string,
  data: Partial<
    Pick<
      Profile,
      | 'role'
      | 'displayName'
      | 'photoURL'
      | 'nutritionGoal'
      | 'weightGoalKg'
      | 'heightCm'
      | 'birthDate'
      | 'gender'
      | 'restingHrBpm'
      | 'limitations'
      | 'trainerId'
      | 'trainerRequested'
      | 'leaderboardVisibility'
    >
  >
): Promise<void> {
  if (!isFirebaseConfigured() || !db) throw new Error('Firebase niet geconfigureerd');
  const ref = doc(db, COLLECTION, userId);
  await updateDoc(ref, {
    ...data,
    updatedAt: serverTimestamp(),
  });
}

/** Sporters die aan deze trainer zijn gekoppeld. */
export async function getSportersByTrainerId(trainerId: string): Promise<Profile[]> {
  if (!isFirebaseConfigured() || !db) return [];
  const q = query(
    collection(db, COLLECTION),
    where('trainerId', '==', trainerId)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => toProfile(d.data(), d.id));
}

/** Alle sporters (voor workout-toewijzing: elke trainer kan elke sporter toewijzen). */
export async function getAllSporters(): Promise<Profile[]> {
  if (!isFirebaseConfigured() || !db) return [];
  const q = query(
    collection(db, COLLECTION),
    where('role', '==', 'sporter')
  );
  const snap = await getDocs(q);
  const list = snap.docs.map((d) => toProfile(d.data(), d.id));
  return list.sort((a, b) =>
    (a.displayName || a.email || a.userId).localeCompare(
      b.displayName || b.email || b.userId,
      undefined,
      { sensitivity: 'base' }
    )
  );
}

/** Zoek profiel op e-mail (om sporter aan trainer te koppelen). */
export async function getProfileByEmail(email: string): Promise<Profile | null> {
  if (!isFirebaseConfigured() || !db) return null;
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;
  const q = query(
    collection(db, COLLECTION),
    where('email', '==', normalized)
  );
  const snap = await getDocs(q);
  const first = snap.docs[0];
  return first ? toProfile(first.data(), first.id) : null;
}

/** Sporter koppelen aan trainer (trainerId zetten). */
export async function assignTrainerToSporter(sporterUserId: string, trainerId: string): Promise<void> {
  return updateProfile(sporterUserId, { trainerId });
}

/** Alle profielen (voor trainers en beheerders; vereist Firestore-read op collectie). */
export async function getAllProfiles(): Promise<Profile[]> {
  if (!isFirebaseConfigured() || !db) return [];
  const snap = await getDocs(collection(db, COLLECTION));
  return snap.docs.map((d) => toProfile(d.data(), d.id));
}

/** Profielen met openstaande trainer-aanvraag (voor beheerders). */
export async function getProfilesWithTrainerRequest(): Promise<Profile[]> {
  if (!isFirebaseConfigured() || !db) return [];
  const q = query(
    collection(db, COLLECTION),
    where('trainerRequested', '==', true)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => toProfile(d.data(), d.id));
}

/** Profiel verwijderen (o.a. bij account verwijderen). */
export async function deleteProfile(userId: string): Promise<void> {
  if (!isFirebaseConfigured() || !db) return;
  const ref = doc(db, COLLECTION, userId);
  await deleteDoc(ref);
}
