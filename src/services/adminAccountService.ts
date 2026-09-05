/**
 * Beheerdersacties op accounts via het serverless endpoint `/api/admin-account`.
 * Gebruikt `apiUrl` zodat het ook in de native (Capacitor) app bij Vercel uitkomt.
 */
import type { User } from 'firebase/auth';
import { apiUrl } from '../utils/apiOrigin';

/** Verwijdert login-account, profiel, persoonlijke data en ranglijstdocument definitief. Alleen beheerders (server controleert de rol). */
export async function deleteAccountAsAdmin(caller: User, targetUid: string): Promise<void> {
  const token = await caller.getIdToken();
  const res = await fetch(apiUrl('/api/admin-account'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ action: 'delete', targetUid }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string })?.error || 'Verwijderen mislukt.');
}

export interface OrphanedLeaderboardEntry {
  uid: string;
  label: string;
}

/**
 * Verwijdert ranglijstdocumenten van accounts die al weg zijn (achtergebleven van eerdere
 * verwijderingen). Alleen beheerders. Geeft terug wie er is opgeruimd.
 */
export async function cleanupOrphanedLeaderboard(caller: User): Promise<OrphanedLeaderboardEntry[]> {
  const token = await caller.getIdToken();
  const res = await fetch(apiUrl('/api/admin-account'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ action: 'cleanup-orphans' }),
  });
  const data = (await res.json().catch(() => ({}))) as { error?: string; removed?: OrphanedLeaderboardEntry[] };
  if (!res.ok) throw new Error(data?.error || 'Opschonen mislukt.');
  return Array.isArray(data.removed) ? data.removed : [];
}
