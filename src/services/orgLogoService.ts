/**
 * Studiologo in Firebase Storage: één bestand per studio (orgLogos/{orgId}). Publiek leesbaar,
 * alleen een beheerder van de studio schrijft (storage.rules).
 *
 * Naast het origineel (vaak SVG, scherp in de app) bewaren we een drukversie als PNG
 * (orgLogos/print/{orgId}): de factuur-PDF en de mail kunnen geen SVG tekenen. De browser maakt
 * die versie bij het uploaden, zodat de server er niets voor hoeft te installeren.
 */
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage, isFirebaseConfigured } from '../firebase/config';

/** Lange zijde van de drukversie in pixels; ruim genoeg voor 300 dpi op de factuur. */
const PRINT_SIZE = 600;

export interface UploadedLogo {
  logoUrl: string;
  /** null als de browser het plaatje niet kon rasteren (dan staat alleen de naam op de factuur). */
  logoPrintUrl: string | null;
}

/** Plaatje laden uit een blob-URL of gewone URL; bij een URL van een ander domein is CORS nodig. */
function loadImage(src: string, crossOrigin: boolean): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (crossOrigin) img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Logo niet kunnen laden'));
    img.src = src;
  });
}

/**
 * Logo (PNG, JPEG, SVG, WebP…) naar een PNG van maximaal PRINT_SIZE, met doorzichtige achtergrond.
 * Een SVG zonder maten krijgt een vierkant van PRINT_SIZE.
 */
export async function rasterizeLogo(src: string, crossOrigin = false): Promise<Blob> {
  const img = await loadImage(src, crossOrigin);
  const w0 = img.naturalWidth || PRINT_SIZE;
  const h0 = img.naturalHeight || PRINT_SIZE;
  const scale = Math.min(1, PRINT_SIZE / Math.max(w0, h0));
  const w = Math.max(1, Math.round(w0 * scale));
  const h = Math.max(1, Math.round(h0 * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas niet beschikbaar');
  ctx.drawImage(img, 0, 0, w, h);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG maken mislukt'))), 'image/png'));
}

async function uploadPrint(orgId: string, png: Blob): Promise<string> {
  if (!storage) throw new Error('Firebase niet geconfigureerd');
  const r = ref(storage, `orgLogos/print/${orgId}`);
  await uploadBytes(r, png, { contentType: 'image/png', cacheControl: 'public, max-age=3600' });
  return getDownloadURL(r);
}

export async function uploadOrgLogo(orgId: string, file: File): Promise<UploadedLogo> {
  if (!isFirebaseConfigured() || !storage) throw new Error('Firebase niet geconfigureerd');
  const r = ref(storage, `orgLogos/${orgId}`);
  await uploadBytes(r, file, { contentType: file.type || 'image/png', cacheControl: 'public, max-age=3600' });
  const logoUrl = await getDownloadURL(r);

  let logoPrintUrl: string | null = null;
  const blobUrl = URL.createObjectURL(file);
  try {
    logoPrintUrl = await uploadPrint(orgId, await rasterizeLogo(blobUrl));
  } catch {
    // Onleesbaar plaatje of geen canvas: de app werkt gewoon, alleen de factuur mist het logo.
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
  return { logoUrl, logoPrintUrl };
}

/**
 * Drukversie alsnog maken van een logo dat al in Storage staat (van vóór de drukversie). Lukt
 * alleen als Storage het plaatje met CORS-headers geeft; anders null en moet het logo opnieuw
 * geüpload worden.
 */
export async function makePrintLogoFromUrl(orgId: string, logoUrl: string): Promise<string | null> {
  if (!isFirebaseConfigured() || !storage) return null;
  try {
    return await uploadPrint(orgId, await rasterizeLogo(logoUrl, true));
  } catch {
    return null;
  }
}

/** Eigen logo voor de donkere modus uploaden (orgLogos/dark/{orgId}). */
export async function uploadOrgDarkLogo(orgId: string, file: File): Promise<string> {
  if (!isFirebaseConfigured() || !storage) throw new Error('Firebase niet geconfigureerd');
  const r = ref(storage, `orgLogos/dark/${orgId}`);
  await uploadBytes(r, file, { contentType: file.type || 'image/png', cacheControl: 'public, max-age=3600' });
  return getDownloadURL(r);
}

export async function deleteOrgDarkLogo(orgId: string): Promise<void> {
  if (!isFirebaseConfigured() || !storage) return;
  try {
    await deleteObject(ref(storage, `orgLogos/dark/${orgId}`));
  } catch {
    // bestaat mogelijk niet
  }
}

export async function deleteOrgLogo(orgId: string): Promise<void> {
  if (!isFirebaseConfigured() || !storage) return;
  for (const path of [`orgLogos/${orgId}`, `orgLogos/print/${orgId}`]) {
    try {
      await deleteObject(ref(storage, path));
    } catch {
      // bestaat mogelijk niet
    }
  }
}
