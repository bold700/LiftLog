/**
 * Bodyscan-foto's (scherm of uitdraai van de weegschaal) laten uitlezen door het vision-endpoint.
 * De server geeft ruwe getallen terug; hier worden ze omgezet naar een geldige BodyScan die de
 * gebruiker in de app nog controleert voordat hij bij de meting wordt opgeslagen.
 */
import { apiUrl } from '../utils/apiOrigin';
import { authHeaders } from '../utils/authHeaders';
import { fileToDataUrl } from '../utils/imageDataUrl';
import { parseBodyScan, type BodyScan } from '../utils/bodyScan';

/** Maximaal aantal foto's per herkenning (scherm boven, scherm onder, uitdraai). */
export const BODY_SCAN_MAX_PHOTOS = 3;

/** Cijfers op het scherm zijn klein; iets hogere resolutie dan bij voedingsfoto's. */
const PHOTO_MAX_PX = 1280;

/** Herken een bodyscan op één of meer foto's. Geeft null als er niets bruikbaars op stond. */
export async function recognizeBodyScanPhotos(files: File[]): Promise<BodyScan | null> {
  const images = await Promise.all(files.slice(0, BODY_SCAN_MAX_PHOTOS).map((f) => fileToDataUrl(f, PHOTO_MAX_PX, 0.85)));
  const res = await fetch(apiUrl('/api/bodyscan-photo'), {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ images }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || 'Fotoherkenning mislukt');
  return parseBodyScan(data?.scan);
}

/**
 * Bodyscan via de QR-code van de BodyAnalyse-weegschaal ("Show qrcode"): de link uit de code
 * gaat naar de server, die de meting bij de fabrikant ophaalt. Exacte waarden, geen foto nodig.
 */
export async function readBodyScanQr(url: string): Promise<BodyScan | null> {
  const res = await fetch(apiUrl('/api/bodyscan-qr'), {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ url }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error || 'QR-code uitlezen mislukt');
  return parseBodyScan(data?.scan);
}
