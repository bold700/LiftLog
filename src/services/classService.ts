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
import type { SessionKind, StandingBooking, StandingBookingOutcome } from '../types';

const CLASSES = 'classes';
const BOOKINGS = 'bookings';
const ACCOUNTS = 'creditAccounts';
const STANDING_BOOKINGS = 'standingBookings';

/** Vaste kleur per sessiesoort, voor de legenda en kleurstip op het rooster (los van de huisstijl). */
export const SESSION_KIND_COLORS: Record<SessionKind, string> = {
  '1on1': '#4E8AC7',
  duo: '#8B6FCB',
  group: '#5FA777',
  concept: '#E39A3B',
};

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
  /** Lessoort waaruit deze les is gemaakt (Beheer → Lessoorten); null bij een losse les. */
  classTypeId: string | null;
  /** Waar dit plaatsvindt; null = geen vaste ruimte. */
  room: string | null;
  /** 1-op-1, Duo PT, Groep of Concept — voor de legenda/kleur op het rooster. */
  sessionKind: SessionKind;
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
const toSessionKind = (v: unknown): SessionKind => (v === '1on1' || v === 'duo' || v === 'concept' ? v : 'group');

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
    classTypeId: typeof data.classTypeId === 'string' ? data.classTypeId : null,
    room: data.room ? str(data.room) : null,
    sessionKind: toSessionKind(data.sessionKind),
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

const toOutcome = (v: unknown): StandingBookingOutcome | null =>
  v === 'booked' || v === 'skippedFull' || v === 'skippedNoCredits' ? v : null;

function toStandingBooking(data: Record<string, unknown>, id: string): StandingBooking {
  return {
    id,
    orgId: str(data.orgId),
    userId: str(data.userId),
    classTypeId: str(data.classTypeId),
    weekday: num(data.weekday),
    startTime: str(data.startTime, '00:00'),
    active: data.active !== false,
    lastOutcome: toOutcome(data.lastOutcome),
    lastOutcomeDate: data.lastOutcomeDate ? str(data.lastOutcomeDate) : null,
    createdAt: str(data.createdAt),
    updatedAt: str(data.updatedAt),
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

/** Eigen "elke week inschrijven"-instellingen, actief en uitgezet (voor het overzicht op Profiel). */
export async function getMyStandingBookings(userId: string): Promise<StandingBooking[]> {
  if (!isFirebaseConfigured() || !db) return [];
  const q = query(collection(db, STANDING_BOOKINGS), where('userId', '==', userId));
  const snap = await getDocs(q);
  return snap.docs.map((d) => toStandingBooking(d.data(), d.id));
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

/**
 * Alle creditsaldo's van de actieve studio, per gebruiker (voor de ledenlijst in Beheer).
 * Eén query op `orgId`; de regels laten dat toe voor trainers en beheerders van die studio.
 */
export async function getCreditBalancesForOrg(): Promise<Record<string, number>> {
  if (!isFirebaseConfigured() || !db) return {};
  const orgId = requireOrgId();
  const snap = await getDocs(query(collection(db, ACCOUNTS), where('orgId', '==', orgId)));
  const out: Record<string, number> = {};
  for (const d of snap.docs) {
    const data = d.data();
    if (typeof data.userId === 'string') out[data.userId] = num(data.balance);
  }
  return out;
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
      classTypeId: input.classTypeId ?? null,
      room: input.room ?? null,
      sessionKind: input.sessionKind,
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
    classTypeId: input.classTypeId ?? null,
    room: input.room ?? null,
    sessionKind: input.sessionKind,
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

/**
 * Een les afgelasten in plaats van verwijderen. Voor een les uit een terugkerende lessoort: de
 * dagelijkse cron (api/generate-classes.mjs) zet ontbrekende lessen terug op het rooster op basis
 * van hun (deterministische) id — een verwijderde les zou dus de volgende dag gewoon terugkomen.
 * Een afgelasten les blijft bestaan (met `cancelledAt`), dus telt hij mee als "bestaat al".
 */
export async function cancelClass(classId: string): Promise<void> {
  if (!isFirebaseConfigured() || !db) throw new Error('Firebase niet geconfigureerd');
  await setDoc(doc(db, CLASSES, classId), { cancelledAt: new Date().toISOString(), updatedAt: serverTimestamp() }, { merge: true });
}

/** Een per ongeluk afgelasten les terugzetten: `cancelledAt` weer wissen. */
export async function restoreClass(classId: string): Promise<void> {
  if (!isFirebaseConfigured() || !db) throw new Error('Firebase niet geconfigureerd');
  await setDoc(doc(db, CLASSES, classId), { cancelledAt: null, updatedAt: serverTimestamp() }, { merge: true });
}

export function newClassId(): string {
  return `cls_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// --- Schrijfacties die via de server lopen -----------------------------------

export async function callBooking<T>(body: Record<string, unknown>): Promise<T> {
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

/**
 * Reserveren. Zit de les vol, dan kom je op de wachtlijst en gaat er (nog) geen credit af.
 * `weekly`: ook dit weekmoment van de lessoort voortaan automatisch meeboeken ("elke week inschrijven").
 */
/** userId: alleen voor staf, om een andere sporter in te schrijven (diens credit gaat eraf). */
export function bookClass(
  classId: string,
  weekly = false,
  userId?: string
): Promise<{ bookingId: string; status: BookingStatus; balance: number }> {
  return callBooking({ action: 'book', classId, weekly, userId });
}

/** Afmelden. Binnen de annuleertermijn krijg je de credit terug. */
export function cancelBooking(bookingId: string): Promise<{ refunded: boolean; promotedUserId: string | null }> {
  return callBooking({ action: 'cancel', bookingId });
}

/** "Elke week inschrijven" aan- of uitzetten voor een bestaand weekmoment. */
export function setStandingBookingActive(standingBookingId: string, active: boolean): Promise<{ active: boolean }> {
  return callBooking({ action: 'setStandingBooking', standingBookingId, active });
}

/** Credits handmatig aanpassen (toekennen of afboeken), bijvoorbeeld om een verkeerde toekenning recht te zetten. */
export function grantCredits(userId: string, amount: number, note?: string): Promise<{ balance: number }> {
  return callBooking({ action: 'grant', userId, amount, note });
}
