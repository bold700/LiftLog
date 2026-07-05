/**
 * Profielfoto's in Firebase Storage. Eén bestand per gebruiker (avatars/{uid}).
 * getDownloadURL geeft een token-URL terug die publiek laadbaar is (voor de ranglijst).
 */
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage, isFirebaseConfigured } from '../firebase/config';

export async function uploadAvatar(uid: string, file: File): Promise<string> {
  if (!isFirebaseConfigured() || !storage) throw new Error('Firebase niet geconfigureerd');
  const r = ref(storage, `avatars/${uid}`);
  await uploadBytes(r, file, {
    contentType: file.type || 'image/jpeg',
    cacheControl: 'public, max-age=3600',
  });
  return getDownloadURL(r);
}

export async function deleteAvatar(uid: string): Promise<void> {
  if (!isFirebaseConfigured() || !storage) return;
  try {
    await deleteObject(ref(storage, `avatars/${uid}`));
  } catch {
    // bestaat mogelijk niet
  }
}
