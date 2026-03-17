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
import type { Profile, ProfileRole } from '../types';

const COLLECTION = 'profiles';

function toProfile(data: Record<string, unknown>, userId: string): Profile {
  const toStr = (v: unknown) => (v == null ? null : String(v));
  const ts = (v: unknown) => (v && typeof (v as Timestamp).toDate === 'function' ? (v as Timestamp).toDate().toISOString() : new Date().toISOString());
  const rawRole = data.role != null ? String(data.role).toLowerCase().trim() : '';
  const role = rawRole === 'admin' || rawRole === 'trainer' || rawRole === 'sporter' ? rawRole : 'sporter';
  return {
    userId,
    role: role as ProfileRole,
    email: toStr(data.email),
    displayName: toStr(data.displayName),
    trainerId: toStr(data.trainerId),
    trainerRequested: data.trainerRequested === true,
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
  data: Partial<Pick<Profile, 'role' | 'displayName' | 'trainerId' | 'trainerRequested'>>
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
