/**
 * Lessen op het rooster, reserveringen en credits.
 *
 * De schrijfkant zit bewust niet hier maar op de server (`api/booking.mjs`): reserveren moet plek
 * controleren, credits afschrijven en de reservering vastleggen in één transactie. Deze module
 * leest en roept dat endpoint aan.
 */
import { collection, deleteDoc, doc, getDocs, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { auth, db, isFirebaseConfigured } from '../firebase/config';
import { requireOrgId } from './orgContext';
import { apiUrl } from '../utils/apiOrigin';

const CLASSES = 'classes';
const BOOKINGS = 'bookings';
const ACCOUNTS = 'creditAccounts';

export interface StudioClass {
  id: string;
  orgId: string;
  title: string;
  /** YYYY-MM-DD */
  date: string;
  /** HH:MM */
  startTime: string;
  endTime: string | null;
  trainerId: string;
  capacity: number;
  /** Wat de les kost. Standaard één credit. */
  creditCost: number;
  bookedCount: number;
  waitlistCount: number;
  /** Optionele koppeling aan een groepsles-schema, zodat de les weet welk programma erbij hoort. */
  schemaId: string | null;
  cancelledAt: string | null;
  createdAt: string;
}

export type BookingStatus = 'booked' | 'waitlist' | 'cancelled' | 'attended';

export interface Booking {
  id: string;
  orgId: string;
  classId: string;
  userId: string;
  status: BookingStatus;
  creditsSpent: number;
  createdAt: string;
  cancelledAt?: string | null;
  refunded?: boolean;
}

const str = (v: unknown, fallback = '') => (typeof v === 'string' ? v : fallback);
const num = (v: unknown, fallback = 0) => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
};

function toClass(data: Record<string, unknown>, id: string): StudioClass {
  return {
    id,
    orgId: str(data.orgId),
    title: str(data.title, 'Les'),
    date: str(data.date),
    startTime: str(data.startTime, '00:00'),
    endTime: data.endTime ? str(data.endTime) : null,
    trainerId: str(data.trainerId),
    capacity: num(data.capacity),
    creditCost: num(data.creditCost, 1),
    bookedCount: num(data.bookedCount),
    waitlistCount: num(data.waitlistCount),
    schemaId: data.schemaId ? str(data.schemaId) : null,
    cancelledAt: data.cancelledAt ? str(data.cancelledAt) : null,
    createdAt: str(data.createdAt),
  };
}

function toBooking(data: Record<string, unknown>, id: string): Booking {
  const status = data.status;
  return {
    id,
    orgId: str(data.orgId),
    classId: str(data.classId),
    userId: str(data.userId),
    status:
      status === 'booked' || status === 'waitlist' || status === 'cancelled' || status === 'attended'
        ? status
        : 'cancelled',
    creditsSpent: num(data.creditsSpent),
    createdAt: str(data.createdAt),
    cancelledAt: data.cancelledAt ? str(data.cancelledAt) : null,
    refunded: data.refunded === true,
  };
}

/** Lessen van de actieve studio vanaf een datum, chronologisch. */
export async function getUpcomingClasses(fromDate: string): Promise<StudioClass[]> {
  if (!isFirebaseConfigured() || !db) return [];
  const q = query(collection(db, CLASSES), where('orgId', '==', requireOrgId()));
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => toClass(d.data(), d.id))
    .filter((c) => c.date >= fromDate)
    .sort((a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`));
}

/** Eigen reserveringen (alle statussen, zodat de geschiedenis zichtbaar blijft). */
export async function getMyBookings(userId: string): Promise<Booking[]> {
  if (!isFirebaseConfigured() || !db) return [];
  const q = query(collection(db, BOOKINGS), where('userId', '==', userId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => toBooking(d.data(), d.id));
}

/** Deelnemers van één les (voor de trainer: wie staat er straks in de zaal). */
export async function getBookingsForClass(classId: string): Promise<Booking[]> {
  if (!isFirebaseConfigured() || !db) return [];
  const q = query(collection(db, BOOKINGS), where('classId', '==', classId));
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => toBooking(d.data(), d.id))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** Creditsaldo van iemand in de actieve studio. */
export async function getCreditBalance(userId: string): Promise<number> {
  if (!isFirebaseConfigured() || !db) return 0;
  const orgId = requireOrgId();
  const snap = await getDocs(
    query(collection(db, ACCOUNTS), where('orgId', '==', orgId), where('userId', '==', userId))
  );
  const first = snap.docs[0];
  return first ? num(first.data().balance) : 0;
}

/** Een les op het rooster zetten of bijwerken. Alleen trainer of beheerder (regels dwingen dat af). */
export async function saveClass(
  input: Omit<StudioClass, 'orgId' | 'bookedCount' | 'waitlistCount' | 'createdAt' | 'cancelledAt'> & {
    createdAt?: string;
  }
): Promise<void> {
  if (!isFirebaseConfigured() || !db) throw new Error('Firebase niet geconfigureerd');
  const ref = doc(db, CLASSES, input.id);
  // De tellers staan er bewust niet bij: die zet alleen de server, anders klopt de capaciteit niet.
  await setDoc(
    ref,
    {
      id: input.id,
      orgId: requireOrgId(),
      title: input.title,
      date: input.date,
      startTime: input.startTime,
      endTime: input.endTime,
      trainerId: input.trainerId,
      capacity: input.capacity,
      creditCost: input.creditCost,
      schemaId: input.schemaId,
      createdAt: input.createdAt ?? new Date().toISOString(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}

/** Nieuwe les met lege tellers. Apart van `saveClass`, want bij aanmaken eisen de regels tellers op 0. */
export async function createClass(
  input: Omit<StudioClass, 'orgId' | 'bookedCount' | 'waitlistCount' | 'createdAt' | 'cancelledAt'>
): Promise<void> {
  if (!isFirebaseConfigured() || !db) throw new Error('Firebase niet geconfigureerd');
  await setDoc(doc(db, CLASSES, input.id), {
    id: input.id,
    orgId: requireOrgId(),
    title: input.title,
    date: input.date,
    startTime: input.startTime,
    endTime: input.endTime,
    trainerId: input.trainerId,
    capacity: input.capacity,
    creditCost: input.creditCost,
    schemaId: input.schemaId,
    bookedCount: 0,
    waitlistCount: 0,
    createdAt: new Date().toISOString(),
    updatedAt: serverTimestamp(),
  });
}

export async function deleteClass(classId: string): Promise<void> {
  if (!isFirebaseConfigured() || !db) return;
  await deleteDoc(doc(db, CLASSES, classId));
}

export function newClassId(): string {
  return `cls_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// --- Schrijfacties die via de server lopen -----------------------------------

async function callBooking<T>(body: Record<string, unknown>): Promise<T> {
  const user = auth?.currentUser;
  if (!user) throw new Error('Je bent niet ingelogd.');
  const token = await user.getIdToken();
  const res = await fetch(apiUrl('/api/booking'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string })?.error || 'Er ging iets mis.');
  return data as T;
}

/** Reserveren. Zit de les vol, dan kom je op de wachtlijst en gaat er (nog) geen credit af. */
export function bookClass(classId: string): Promise<{ bookingId: string; status: BookingStatus; balance: number }> {
  return callBooking({ action: 'book', classId });
}

/** Afmelden. Binnen de annuleertermijn krijg je de credit terug. */
export function cancelBooking(bookingId: string): Promise<{ refunded: boolean; promotedUserId: string | null }> {
  return callBooking({ action: 'cancel', bookingId });
}

/** Credits toekennen of afboeken (alleen trainer of beheerder). */
export function grantCredits(userId: string, amount: number, note?: string): Promise<{ balance: number }> {
  return callBooking({ action: 'grant', userId, amount, note });
}
