import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import { initializeApp, deleteApp } from 'firebase/app';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  signInWithPopup,
  deleteUser,
  getAuth,
  GoogleAuthProvider,
  sendPasswordResetEmail,
  EmailAuthProvider,
  reauthenticateWithCredential,
  verifyBeforeUpdateEmail,
  updatePassword,
  sendEmailVerification,
  type User,
} from 'firebase/auth';
import { getFirestore, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, isFirebaseConfigured, firebaseConfig } from '../firebase/config';
import { createProfile, deleteProfile, updateProfile } from '../services/profileService';
import type { ProfileRole } from '../types';

type AuthState = {
  user: User | null;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, role?: ProfileRole, displayName?: string | null) => Promise<void>;
  /** Beheerder maakt een account aan zonder uit te loggen en zonder e-mailverificatie. */
  adminCreateAccount: (email: string, password: string, role: ProfileRole, displayName: string | null) => Promise<{ uid: string; email: string | null }>;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  changeEmail: (currentPassword: string, newEmail: string) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  resendVerification: () => Promise<void>;
  reloadUser: () => Promise<void>;
  clearError: () => void;
};

const AuthContext = createContext<AuthState | null>(null);

/** Vertaalt Firebase-auth-foutcodes naar begrijpelijke meldingen. */
function friendlyAuthError(e: unknown, fallback: string): string {
  const code = e && typeof e === 'object' && 'code' in e ? String((e as { code: unknown }).code) : '';
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'E-mailadres of wachtwoord klopt niet.';
    case 'auth/invalid-email':
      return 'Vul een geldig e-mailadres in.';
    case 'auth/email-already-in-use':
      return 'Er bestaat al een account met dit e-mailadres.';
    case 'auth/weak-password':
      return 'Kies een sterker wachtwoord (minstens 6 tekens).';
    case 'auth/too-many-requests':
      return 'Te veel pogingen. Probeer het later opnieuw.';
    case 'auth/network-request-failed':
      return 'Geen internetverbinding. Controleer je verbinding en probeer opnieuw.';
    case 'auth/user-disabled':
      return 'Dit account is uitgeschakeld. Neem contact op met je trainer.';
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return 'Inloggen geannuleerd.';
    case 'auth/requires-recent-login':
      return 'Log opnieuw in om deze wijziging te bevestigen.';
    default:
      return fallback;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isFirebaseConfigured() || !auth) {
      setLoading(false);
      return;
    }
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setError(null);
    if (!auth) throw new Error('Firebase Auth niet geconfigureerd');
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (e: unknown) {
      const msg = friendlyAuthError(e, 'Inloggen mislukt.');
      setError(msg);
      throw e;
    }
  }, []);

  const register = useCallback(async (email: string, password: string, role: ProfileRole = 'sporter', displayName?: string | null) => {
    setError(null);
    if (!auth) throw new Error('Firebase Auth niet geconfigureerd');
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      // Verstuur verificatiemail zodat het e-mailadres bevestigd moet worden
      try {
        await sendEmailVerification(cred.user);
      } catch {
        /* niet-blokkerend */
      }
      if (isFirebaseConfigured()) {
        try {
          const name = (displayName?.trim() || cred.user.displayName) ?? null;
          if (role === 'trainer') {
            await createProfile(cred.user.uid, 'sporter', cred.user.email ?? email, name, true);
          } else {
            await createProfile(cred.user.uid, role, cred.user.email ?? email, name);
          }
        } catch (profileErr) {
          // Account bestaat al in Auth; profiel wordt bij eerste laden alsnog aangemaakt door ProfileContext
          console.warn('Profiel direct na registratie aanmaken mislukt, wordt bij laden opnieuw geprobeerd:', profileErr);
        }
      }
    } catch (e: unknown) {
      const msg = friendlyAuthError(e, 'Registreren mislukt.');
      setError(msg);
      throw e;
    }
  }, []);

  const adminCreateAccount = useCallback(
    async (email: string, password: string, role: ProfileRole, displayName: string | null) => {
      if (!firebaseConfig) throw new Error('Firebase niet geconfigureerd');
      // Tweede app-instance: de nieuwe user wordt daar ingelogd, de admin blijft in de hoofd-app ingelogd.
      const secondary = initializeApp(firebaseConfig, `admin-create-${Date.now()}`);
      try {
        const secAuth = getAuth(secondary);
        const secDb = getFirestore(secondary);
        let cred;
        try {
          cred = await createUserWithEmailAndPassword(secAuth, email.trim(), password);
        } catch (e) {
          throw new Error(friendlyAuthError(e, 'Account aanmaken mislukt.'));
        }
        const uid = cred.user.uid;
        const name = displayName?.trim() || null;
        // Profiel schrijven terwijl we als de nieuwe user zijn ingelogd (uid == doc): geen extra Firestore-rule nodig.
        await setDoc(doc(secDb, 'profiles', uid), {
          userId: uid,
          role: 'sporter',
          email: (cred.user.email ?? email).trim().toLowerCase(),
          displayName: name,
          trainerId: null,
          trainerRequested: false,
          leaderboardVisibility: 'named',
          createdByAdmin: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        // Geen verificatiemail: account is meteen bruikbaar.
        await firebaseSignOut(secAuth);
        // Trainer-rol zetten via de admin-sessie (bestaand, toegestaan pad).
        if (role === 'trainer') {
          await updateProfile(uid, { role: 'trainer' }).catch(() => {});
        }
        return { uid, email: cred.user.email ?? email };
      } finally {
        await deleteApp(secondary).catch(() => {});
      }
    },
    []
  );

  const signInWithGoogle = useCallback(async () => {
    setError(null);
    if (!auth) throw new Error('Firebase Auth niet geconfigureerd');
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (e: unknown) {
      const msg = friendlyAuthError(e, 'Google inloggen mislukt.');
      setError(msg);
      throw e;
    }
  }, []);

  const logout = useCallback(async () => {
    setError(null);
    if (!auth) return;
    await firebaseSignOut(auth);
  }, []);

  const deleteAccount = useCallback(async () => {
    setError(null);
    if (!auth?.currentUser) return;
    const uid = auth.currentUser.uid;
    try {
      await deleteProfile(uid);
      await deleteUser(auth.currentUser);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Account verwijderen mislukt';
      setError(msg);
      throw e;
    }
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    setError(null);
    if (!auth) throw new Error('Firebase Auth niet geconfigureerd');
    await sendPasswordResetEmail(auth, email);
  }, []);

  const changeEmail = useCallback(async (currentPassword: string, newEmail: string) => {
    setError(null);
    if (!auth?.currentUser?.email) throw new Error('Niet ingelogd met e-mail/wachtwoord');
    const cred = EmailAuthProvider.credential(auth.currentUser.email, currentPassword);
    await reauthenticateWithCredential(auth.currentUser, cred);
    // Stuurt een verificatiemail naar het nieuwe adres; e-mail wijzigt pas na bevestiging.
    await verifyBeforeUpdateEmail(auth.currentUser, newEmail);
  }, []);

  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    setError(null);
    if (!auth?.currentUser?.email) throw new Error('Niet ingelogd met e-mail/wachtwoord');
    const cred = EmailAuthProvider.credential(auth.currentUser.email, currentPassword);
    await reauthenticateWithCredential(auth.currentUser, cred);
    await updatePassword(auth.currentUser, newPassword);
  }, []);

  const resendVerification = useCallback(async () => {
    if (!auth?.currentUser) return;
    await sendEmailVerification(auth.currentUser);
  }, []);

  const reloadUser = useCallback(async () => {
    if (!auth?.currentUser) return;
    await auth.currentUser.reload();
    setUser({ ...auth.currentUser } as User);
  }, []);

  const clearError = useCallback(() => setError(null), []);

  const value: AuthState = {
    user,
    loading,
    error,
    login,
    register,
    adminCreateAccount,
    signInWithGoogle,
    logout,
    deleteAccount,
    resetPassword,
    changeEmail,
    changePassword,
    resendVerification,
    reloadUser,
    clearError,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState | null {
  return useContext(AuthContext);
}
