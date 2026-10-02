/**
 * Beheerdersacties op accounts via het serverless endpoint `/api/admin-account`.
 * Gebruikt `apiUrl` zodat het ook in de native (Capacitor) app bij Vercel uitkomt.
 */
import type { User } from 'firebase/auth';
import { apiUrl } from '../utils/apiOrigin';
import { getCurrentOrgId } from './orgContext';

/**
 * Verwijdert login-account, profiel, persoonlijke data en ranglijstdocument definitief. De server
 * loopt daarna ook de ranglijst na op resten van eerdere verwijderingen. Alleen beheerders (server
 * controleert de rol).
 */
export async function deleteAccountAsAdmin(caller: User, targetUid: string): Promise<void> {
  const token = await caller.getIdToken();
  const res = await fetch(apiUrl('/api/admin-account'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ actingOrgId: getCurrentOrgId(), action: 'delete', targetUid }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string })?.error || 'Verwijderen mislukt.');
}

/**
 * Zegt het eigen account op: login, profiel, logs, metingen, voeding en het ranglijstdocument.
 * Loopt via de server omdat de app zelf geen profielen mag verwijderen (zie firestore.rules).
 */
export async function deleteOwnAccount(caller: User): Promise<void> {
  const token = await caller.getIdToken();
  const res = await fetch(apiUrl('/api/admin-account'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ actingOrgId: getCurrentOrgId(), action: 'delete-self' }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string })?.error || 'Account verwijderen mislukt.');
}

/**
 * Wijzigt e-mailadres en/of wachtwoord van een sporter, direct en zonder diens huidige wachtwoord.
 * Voor Profiel → "Bekijk als": een trainer/beheerder die het profiel van een sporter volledig
 * beheert, alsof hij zelf als die sporter is ingelogd. Server controleert rol en studio.
 */
export async function updateMemberCredentials(
  caller: User,
  targetUid: string,
  updates: { email?: string; password?: string }
): Promise<void> {
  const token = await caller.getIdToken();
  const res = await fetch(apiUrl('/api/admin-account'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ actingOrgId: getCurrentOrgId(), action: 'updateCredentials', targetUid, ...updates }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string })?.error || 'Wijzigen van accountgegevens mislukt.');
}

/**
 * Toestemming voor gezondheidsgegevens intrekken: de server verwijdert de metingen en zet
 * rusthartslag en blessures op het profiel leeg. Voortgangsfoto's ruimt de app eerst zelf op
 * (zie privacyService.withdrawHealthConsent).
 */
export async function withdrawHealthConsentOnServer(caller: User): Promise<void> {
  const token = await caller.getIdToken();
  const res = await fetch(apiUrl('/api/admin-account'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ actingOrgId: getCurrentOrgId(), action: 'withdraw-health-consent' }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string })?.error || 'Toestemming intrekken mislukt.');
}

/**
 * Een kopie van al je eigen gegevens (AVG: inzage en overdraagbaarheid), als JSON-object van de server.
 */
export async function exportOwnData(caller: User): Promise<unknown> {
  const token = await caller.getIdToken();
  const res = await fetch(apiUrl('/api/admin-account'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ actingOrgId: getCurrentOrgId(), action: 'export-self' }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string })?.error || 'Je gegevens ophalen mislukte.');
  return (data as { data?: unknown }).data;
}

/**
 * Rol van een lid in de actieve studio (sporter, trainer of beheerder). Loopt via de server: de rol
 * staat per studio (`orgRoles`) en die mag de app zelf niet schrijven. Alleen een beheerder.
 */
export async function setMemberRole(caller: User, targetUid: string, role: 'sporter' | 'trainer' | 'admin'): Promise<void> {
  const token = await caller.getIdToken();
  const res = await fetch(apiUrl('/api/admin-account'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ actingOrgId: getCurrentOrgId(), action: 'setRole', targetUid, role }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string })?.error || 'Rol wijzigen mislukt.');
}

/**
 * Wijst de eigenaar van de actieve studio aan (Beheer → Instellingen). Loopt via de server: de huidige
 * eigenaar draagt over, support van BOLD700 mag het ook, en zolang er geen eigenaar is elke beheerder.
 */
export async function setStudioOwner(caller: User, targetUid: string): Promise<void> {
  const token = await caller.getIdToken();
  const res = await fetch(apiUrl('/api/admin-account'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ actingOrgId: getCurrentOrgId(), action: 'setOwner', targetUid }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string })?.error || 'Eigenaar aanwijzen mislukt.');
}

export type InviteResult = { status: 'no-account' | 'already-member' | 'invited'; orgName?: string };

/**
 * Iemand met een bestaand VORM-account uitnodigen bij de actieve studio. Heeft dit e-mailadres nog
 * geen account, dan { status: 'no-account' } en maakt de app gewoon een nieuw account aan.
 */
export async function inviteMember(caller: User, email: string, role: 'sporter' | 'trainer' | 'admin'): Promise<InviteResult> {
  const token = await caller.getIdToken();
  const res = await fetch(apiUrl('/api/admin-account'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ actingOrgId: getCurrentOrgId(), action: 'invite', email, role }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string })?.error || 'Uitnodigen mislukt.');
  return data as InviteResult;
}

export interface OrgInvite {
  id: string;
  orgId: string;
  orgName: string;
  role: 'sporter' | 'trainer' | 'admin';
  invitedByName: string | null;
}

/** Openstaande uitnodigingen van andere studio's voor jou. */
export async function getMyInvites(caller: User): Promise<OrgInvite[]> {
  const token = await caller.getIdToken();
  const res = await fetch(apiUrl('/api/admin-account'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ action: 'myInvites' }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string })?.error || 'Uitnodigingen ophalen mislukt.');
  return (data as { invites?: OrgInvite[] }).invites ?? [];
}

/** Uitnodiging accepteren of weigeren. Pas na accepteren hoor je bij die studio. */
export async function answerInvite(caller: User, inviteId: string, accept: boolean): Promise<string | null> {
  const token = await caller.getIdToken();
  const res = await fetch(apiUrl('/api/admin-account'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ action: accept ? 'acceptInvite' : 'declineInvite', inviteId }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string })?.error || 'Uitnodiging verwerken mislukt.');
  return (data as { orgId?: string }).orgId ?? null;
}

export interface ImportMemberInput {
  email: string;
  displayName: string | null;
  trainerId?: string | null;
  birthDate?: string | null;
  gender?: 'man' | 'vrouw' | 'anders' | null;
  phone?: string | null;
  address?: { street: string | null; zip: string | null; city: string | null } | null;
  memberSince?: string | null;
  inactive?: boolean;
}

export interface ImportMemberResult {
  email: string;
  status: 'created' | 'exists' | 'failed';
  uid?: string;
  password?: string;
  error?: string;
}

/**
 * Leden importeren (max. 25 per keer): accounts en profielen worden op de server aangemaakt. In de
 * browser laat Firebase maar ongeveer 100 nieuwe accounts per uur toe; op de server geldt dat niet.
 */
export async function importMembers(caller: User, members: ImportMemberInput[]): Promise<ImportMemberResult[]> {
  const token = await caller.getIdToken();
  const res = await fetch(apiUrl('/api/admin-account'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ actingOrgId: getCurrentOrgId(), action: 'importMembers', members }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string })?.error || 'Importeren mislukt.');
  return (data as { results: ImportMemberResult[] }).results;
}

export interface MergeAccount {
  uid: string;
  name: string;
  email: string;
  /** Laatst ingelogd (datum-tekst van Firebase), of null als dit account nooit inlogde. */
  lastSignIn: string | null;
}

export interface MergeResult {
  counts: Record<string, number>;
  warnings: string[];
  profileFill: string[];
  keep?: MergeAccount;
  from?: MergeAccount;
}

async function mergeCall(caller: User, action: 'mergePreview' | 'mergeMembers', keepUid: string, fromUid: string): Promise<MergeResult> {
  const token = await caller.getIdToken();
  const res = await fetch(apiUrl('/api/admin-account'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ actingOrgId: getCurrentOrgId(), action, keepUid, fromUid }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string })?.error || 'Samenvoegen mislukt.');
  return data as MergeResult;
}

/** Wat er bij samenvoegen zou overgaan (er verandert niets). */
export function previewMerge(caller: User, keepUid: string, fromUid: string): Promise<MergeResult> {
  return mergeCall(caller, 'mergePreview', keepUid, fromUid);
}

/**
 * Twee accounts van dezelfde persoon samenvoegen: alles van `fromUid` gaat naar `keepUid`, daarna
 * verdwijnen het profiel en het login-account van `fromUid`. Niet terug te draaien.
 */
export function mergeAccounts(caller: User, keepUid: string, fromUid: string): Promise<MergeResult> {
  return mergeCall(caller, 'mergeMembers', keepUid, fromUid);
}
