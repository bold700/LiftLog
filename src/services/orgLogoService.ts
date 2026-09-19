/**
 * Studiologo in Firebase Storage: één bestand per studio (orgLogos/{orgId}). Publiek leesbaar,
 * alleen een beheerder van de studio schrijft (storage.rules).
 */
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage, isFirebaseConfigured } from '../firebase/config';

export async function uploadOrgLogo(orgId: string, file: File): Promise<string> {
  if (!isFirebaseConfigured() || !storage) throw new Error('Firebase niet geconfigureerd');
  const r = ref(storage, `orgLogos/${orgId}`);
  await uploadBytes(r, file, { contentType: file.type || 'image/png', cacheControl: 'public, max-age=3600' });
  return getDownloadURL(r);
}

export async function deleteOrgLogo(orgId: string): Promise<void> {
  if (!isFirebaseConfigured() || !storage) return;
  try {
    await deleteObject(ref(storage, `orgLogos/${orgId}`));
  } catch {
    // bestaat mogelijk niet
  }
}
