import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  signInWithPopup,
  deleteUser,
  GoogleAuthProvider,
  type User,
} from 'firebase/auth';
import { auth, isFirebaseConfigured } from '../firebase/config';
import { createProfile, deleteProfile } from '../services/profileService';
import type { ProfileRole } from '../types';

type AuthState = {
  user: User | null;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, role?: ProfileRole, displayName?: string | null) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  clearError: () => void;
};

const AuthContext = createContext<AuthState | null>(null);

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
      const msg = e instanceof Error ? e.message : 'Inloggen mislukt';
      setError(msg);
      throw e;
    }
  }, []);

  const register = useCallback(async (email: string, password: string, role: ProfileRole = 'sporter', displayName?: string | null) => {
    setError(null);
    if (!auth) throw new Error('Firebase Auth niet geconfigureerd');
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
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
      const msg = e instanceof Error ? e.message : 'Registreren mislukt';
      setError(msg);
      throw e;
    }
  }, []);

  const signInWithGoogle = useCallback(async () => {
    setError(null);
    if (!auth) throw new Error('Firebase Auth niet geconfigureerd');
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Google inloggen mislukt';
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

  const clearError = useCallback(() => setError(null), []);

  const value: AuthState = {
    user,
    loading,
    error,
    login,
    register,
    signInWithGoogle,
    logout,
    deleteAccount,
    clearError,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState | null {
  return useContext(AuthContext);
}
