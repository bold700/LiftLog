/**
 * Firebase config – leest uitsluitend uit environment variables.
 *
 * SECURITY: Geen API keys of secrets in deze file. Alleen waarden uit
 * import.meta.env (Vite leest die uit .env). Het bestand .env staat in
 * .gitignore en mag nooit gecommit worden.
 */
import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import { getFirestore, type Firestore } from 'firebase/firestore';

const apiKey = import.meta.env.VITE_FIREBASE_API_KEY;
const authDomain = import.meta.env.VITE_FIREBASE_AUTH_DOMAIN;
const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
const storageBucket = import.meta.env.VITE_FIREBASE_STORAGE_BUCKET;
const messagingSenderId = import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID;
const appId = import.meta.env.VITE_FIREBASE_APP_ID;

const hasConfig =
  typeof apiKey === 'string' &&
  apiKey.length > 0 &&
  typeof projectId === 'string' &&
  projectId.length > 0;

let app: FirebaseApp | null = null;
let authInstance: Auth | null = null;
let firestore: Firestore | null = null;

if (hasConfig) {
  app = initializeApp({
    apiKey,
    authDomain: authDomain || undefined,
    projectId,
    storageBucket: storageBucket || undefined,
    messagingSenderId: messagingSenderId || undefined,
    appId: appId || undefined,
  });
  authInstance = getAuth(app);
  firestore = getFirestore(app);
}

export const firebaseApp = app;
export const auth = authInstance;
export const db = firestore;

/** Of Firebase is geconfigureerd (alleen dan zijn app en db beschikbaar). */
export const isFirebaseConfigured = (): boolean => hasConfig;
