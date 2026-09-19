/**
 * Delen van gegenereerde teksten.
 *
 * De app stuurt zelf geen berichten meer: trainers en sporters appen elkaar, en een tweede
 * postvak dat niemand opent is erger dan geen postvak. Wat de app wél doet is de tekst
 * schrijven; waar hij heen gaat kiest de gebruiker in WhatsApp zelf.
 */

/** Maximale lengte van een wa.me-link; daarboven weigeren sommige clients de link. */
const MAX_SHARE_LENGTH = 1800;

/**
 * Link die WhatsApp opent met de tekst al ingevuld, zonder nummer: de gebruiker kiest zelf
 * aan wie hij hem stuurt. `wa.me` werkt op telefoon én desktop en valt terug op WhatsApp Web.
 */
export function whatsappUrl(text: string): string {
  const trimmed = text.trim();
  const body = trimmed.length > MAX_SHARE_LENGTH ? `${trimmed.slice(0, MAX_SHARE_LENGTH - 1)}…` : trimmed;
  return `https://wa.me/?text=${encodeURIComponent(body)}`;
}

/**
 * Tekst naar het klembord, voor wie geen WhatsApp gebruikt of hem ergens anders wil plakken.
 * Geeft false terug als de browser het klembord niet toestaat; de knop kan dan zelf iets zeggen.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
