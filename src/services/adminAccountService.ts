/**
 * Beheerdersacties op accounts via het serverless endpoint `/api/admin-account`.
 * Gebruikt `apiUrl` zodat het ook in de native (Capacitor) app bij Vercel uitkomt.
 */
import type { User } from 'firebase/auth';
import { apiUrl } from '../utils/apiOrigin';

/** Verwijdert login-account én profiel definitief. Alleen beheerders (server controleert de rol). */
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
