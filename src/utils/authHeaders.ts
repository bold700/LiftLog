/**
 * Headers voor aanroepen van onze eigen API-functies die een ingelogde gebruiker vereisen
 * (/api/generate-workout, /api/food-photo, /api/admin-account): JSON plus de Firebase ID-token.
 */
import { auth } from '../firebase/config';

export async function authHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const user = auth?.currentUser;
  if (user) {
    try {
      headers.Authorization = `Bearer ${await user.getIdToken()}`;
    } catch {
      // Zonder token antwoordt de server met 401 en een duidelijke melding.
    }
  }
  return headers;
}
