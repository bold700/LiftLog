/**
 * Berichten tussen trainer en sporter. Collectie: `messages`.
 *
 * Waarom in de app en niet in WhatsApp: daar staat het contact buiten het dossier, door elkaar met
 * privéberichten, en het is niet overdraagbaar als een collega de begeleiding overneemt.
 *
 * Een gesprek is altijd tussen precies twee mensen binnen dezelfde studio. De `threadId` wordt uit
 * de twee uid's afgeleid, zodat beide kanten zonder extra administratie hetzelfde gesprek vinden.
 */
import {
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
  type Timestamp,
} from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../firebase/config';
import { requireOrgId } from './orgContext';
import { notifyUser } from './pushService';

const COLLECTION = 'messages';

/** Een gewoon bericht, of een wekelijkse check-in met cijfers erbij. */
export type MessageKind = 'text' | 'checkin';

export interface CheckinDetails {
  /** Gewicht in kg, als de sporter dat heeft ingevuld. */
  weightKg: number | null;
  /** Hoe de week ging, 1 (zwaar) tot 5 (top). */
  feeling: number | null;
  /** Aantal trainingen deze week. */
  sessions: number | null;
}

export interface Message {
  id: string;
  orgId: string;
  threadId: string;
  /**
   * De twee uid's in het gesprek, gesorteerd. Firestore kan een leesregel alleen toepassen als de
   * query er zelf op filtert; zonder dit veld wordt het ophalen van een gesprek geweigerd, ook voor
   * een deelnemer. Zie de `messages`-regel in firestore.rules.
   */
  participants: string[];
  senderId: string;
  recipientId: string;
  text: string;
  kind: MessageKind;
  checkin?: CheckinDetails | null;
  createdAt: string;
  /** Tijdstip waarop de ontvanger het las; `null` betekent ongelezen. */
  readAt: string | null;
}

/**
 * Vast gespreks-id voor twee mensen, ongeacht wie het gesprek begon.
 * Sorteren maakt hem aan beide kanten gelijk.
 */
export function threadIdFor(a: string, b: string): string {
  return [a, b].sort().join('__');
}

function newId(): string {
  return `msg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function isoOrNull(v: unknown): string | null {
  if (!v) return null;
  if (typeof v === 'string') return v;
  if (typeof (v as Timestamp).toDate === 'function') return (v as Timestamp).toDate().toISOString();
  return null;
}

function toMessage(data: Record<string, unknown>, id: string): Message {
  const kind = data.kind === 'checkin' ? 'checkin' : 'text';
  const raw = data.checkin as Record<string, unknown> | undefined;
  const numOrNull = (v: unknown) => {
    const n = typeof v === 'number' ? v : Number(v);
    return Number.isFinite(n) ? n : null;
  };
  return {
    id,
    orgId: String(data.orgId ?? ''),
    threadId: String(data.threadId ?? ''),
    participants: Array.isArray(data.participants) ? data.participants.map(String) : [],
    senderId: String(data.senderId ?? ''),
    recipientId: String(data.recipientId ?? ''),
    text: String(data.text ?? ''),
    kind,
    checkin:
      kind === 'checkin' && raw
        ? { weightKg: numOrNull(raw.weightKg), feeling: numOrNull(raw.feeling), sessions: numOrNull(raw.sessions) }
        : null,
    createdAt: isoOrNull(data.createdAt) ?? new Date().toISOString(),
    readAt: isoOrNull(data.readAt),
  };
}

/** Verstuurt een bericht. De afzender is altijd de ingelogde gebruiker (regels dwingen dat af). */
export async function sendMessage(input: {
  senderId: string;
  recipientId: string;
  text: string;
  kind?: MessageKind;
  checkin?: CheckinDetails | null;
}): Promise<Message> {
  if (!isFirebaseConfigured() || !db) throw new Error('Firebase niet geconfigureerd');
  const text = input.text.trim();
  if (!text) throw new Error('Bericht is leeg.');
  if (input.senderId === input.recipientId) throw new Error('Je kunt geen bericht aan jezelf sturen.');

  const id = newId();
  const message: Message = {
    id,
    orgId: requireOrgId(),
    threadId: threadIdFor(input.senderId, input.recipientId),
    participants: [input.senderId, input.recipientId].sort(),
    senderId: input.senderId,
    recipientId: input.recipientId,
    text: text.slice(0, 4000),
    kind: input.kind ?? 'text',
    checkin: input.checkin ?? null,
    createdAt: new Date().toISOString(),
    readAt: null,
  };
  await setDoc(doc(db, COLLECTION, id), { ...message, updatedAt: serverTimestamp() });
  // Melding sturen op de achtergrond: het bericht staat er al, ook als de melding niet aankomt.
  void notifyUser(message.kind === 'checkin' ? 'checkin' : 'message', input.recipientId, message.text);
  return message;
}

/**
 * Alle berichten in één gesprek, oud → nieuw.
 *
 * Het filter op `participants` is niet optioneel: de leesregel eist dat je deelnemer bent, en
 * Firestore weigert een query waarvan het dat niet uit de filters kan afleiden.
 */
export async function getThread(a: string, b: string): Promise<Message[]> {
  if (!isFirebaseConfigured() || !db) return [];
  const q = query(
    collection(db, COLLECTION),
    where('participants', 'array-contains', a),
    where('threadId', '==', threadIdFor(a, b))
  );
  const snap = await getDocs(q);
  return snap.docs
    .map((d) => toMessage(d.data(), d.id))
    .sort((x, y) => (x.createdAt > y.createdAt ? 1 : -1));
}

/** Ongelezen berichten voor deze gebruiker; alleen gelijkheidsfilters, dus geen extra index nodig. */
export async function getUnreadForUser(userId: string): Promise<Message[]> {
  if (!isFirebaseConfigured() || !db) return [];
  const q = query(
    collection(db, COLLECTION),
    where('orgId', '==', requireOrgId()),
    where('recipientId', '==', userId),
    where('readAt', '==', null)
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => toMessage(d.data(), d.id));
}

/** Aantal ongelezen berichten per gesprekspartner, voor de tellers in de lijst. */
export async function getUnreadCountsByPartner(userId: string): Promise<Record<string, number>> {
  const unread = await getUnreadForUser(userId);
  const counts: Record<string, number> = {};
  for (const m of unread) counts[m.senderId] = (counts[m.senderId] ?? 0) + 1;
  return counts;
}

/** Markeert de binnengekomen berichten in een gesprek als gelezen. */
export async function markThreadRead(userId: string, partnerId: string): Promise<void> {
  if (!isFirebaseConfigured() || !db) return;
  const messages = await getThread(userId, partnerId);
  const mine = messages.filter((m) => m.recipientId === userId && !m.readAt);
  if (mine.length === 0) return;

  // Firestore staat 500 schrijfacties per batch toe; in de praktijk halen we dat nooit.
  const batch = writeBatch(db);
  const now = new Date().toISOString();
  for (const m of mine.slice(0, 400)) batch.set(doc(db, COLLECTION, m.id), { readAt: now }, { merge: true });
  await batch.commit();
}

/** Korte samenvatting van een check-in, voor in de berichtenlijst. */
export function describeCheckin(c: CheckinDetails): string {
  const parts: string[] = [];
  if (c.weightKg != null) parts.push(`${c.weightKg} kg`);
  if (c.sessions != null) parts.push(`${c.sessions}× getraind`);
  if (c.feeling != null) parts.push(`gevoel ${c.feeling}/5`);
  return parts.join(' · ');
}
