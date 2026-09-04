/**
 * Voortgangsfoto's bij een meting, in Firebase Storage onder
 * `progress/{userId}/{measurementId}/{view}.jpg`. Drie aanzichten: voor, zij, achter.
 *
 * Foto's worden vóór upload verkleind (max 1280px, JPEG) zodat ze snel laden en
 * weinig opslag kosten. De download-URL wordt op de meting bewaard.
 *
 * Storage-rules moeten schrijven/lezen toestaan voor de eigenaar en diens trainer
 * (zie de rules-snippet in de commit-beschrijving / README).
 */
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage, isFirebaseConfigured } from '../firebase/config';

export const PHOTO_VIEWS = [
  { key: 'photoFrontUrl', view: 'front', label: 'Voor' },
  { key: 'photoSideUrl', view: 'side', label: 'Zij' },
  { key: 'photoBackUrl', view: 'back', label: 'Achter' },
] as const;

export type PhotoView = (typeof PHOTO_VIEWS)[number]['view'];
export type PhotoUrlKey = (typeof PHOTO_VIEWS)[number]['key'];

function photoRef(userId: string, measurementId: string, view: PhotoView) {
  if (!isFirebaseConfigured() || !storage) throw new Error('Firebase niet geconfigureerd');
  return ref(storage, `progress/${userId}/${measurementId}/${view}.jpg`);
}

/** Verklein naar max `max` px op de langste zijde en geef een JPEG-blob terug. */
export async function resizeImage(file: File, max = 1280, quality = 0.85): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas niet beschikbaar');
    ctx.drawImage(bitmap, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (!blob) throw new Error('Foto verkleinen mislukt');
    return blob;
  } finally {
    bitmap.close?.();
  }
}

export async function uploadProgressPhoto(userId: string, measurementId: string, view: PhotoView, file: File): Promise<string> {
  const blob = await resizeImage(file);
  const r = photoRef(userId, measurementId, view);
  await uploadBytes(r, blob, { contentType: 'image/jpeg', cacheControl: 'private, max-age=86400' });
  return getDownloadURL(r);
}

export async function deleteProgressPhoto(userId: string, measurementId: string, view: PhotoView): Promise<void> {
  if (!isFirebaseConfigured() || !storage) return;
  try {
    await deleteObject(photoRef(userId, measurementId, view));
  } catch {
    // bestaat mogelijk niet (meer)
  }
}

export async function deleteAllProgressPhotos(userId: string, measurementId: string): Promise<void> {
  await Promise.all(PHOTO_VIEWS.map((v) => deleteProgressPhoto(userId, measurementId, v.view)));
}
