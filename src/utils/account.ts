/** Klein hulpje voor accountformulieren (nieuw account, leden importeren): e-mailvalidatie en een
 * makkelijk over te typen tijdelijk wachtwoord. */
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Willekeurig, makkelijk over te typen tijdelijk wachtwoord (zonder verwarrende tekens). */
export function generatePassword(): string {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint32Array(10);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}
