/**
 * Beheerdersacties op accounts via het serverless endpoint `/api/admin-account`.
 * Gebruikt `apiUrl` zodat het ook in de native (Capacitor) app bij Vercel uitkomt.
 */
import type { User } from 'firebase/auth';
import { apiUrl } from '../utils/apiOrigin';

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
    body: JSON.stringify({ action: 'delete', targetUid }),
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
    body: JSON.stringify({ action: 'delete-self' }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string })?.error || 'Account verwijderen mislukt.');
}
