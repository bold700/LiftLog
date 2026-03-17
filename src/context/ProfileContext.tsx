import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import { useAuth } from './AuthContext';
import {
  getProfile,
  getSportersByTrainerId,
  getAllSporters,
  createProfile,
} from '../services/profileService';
import type { Profile, ProfileRole } from '../types';

type ProfileState = {
  profile: Profile | null;
  role: ProfileRole;
  isTrainer: boolean;
  isAdmin: boolean;
  /** Sporters die aan deze trainer zijn gekoppeld (Beheer). */
  sporters: Profile[];
  /** Alle sporters in het systeem (voor workout-toewijzing: elke trainer kan elke sporter toewijzen). */
  allSporters: Profile[];
  loading: boolean;
  error: string | null;
  refreshProfile: () => Promise<void>;
  ensureProfile: (role: ProfileRole, email: string | null, displayName?: string | null) => Promise<Profile>;
};

const ProfileContext = createContext<ProfileState | null>(null);

export function ProfileProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [sporters, setSporters] = useState<Profile[]>([]);
  const [allSporters, setAllSporters] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshProfile = useCallback(async () => {
    if (!auth?.user?.uid) {
      setProfile(null);
      setSporters([]);
      setAllSporters([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      let p = await getProfile(auth.user.uid);
      if (!p) {
        await createProfile(
          auth.user.uid,
          'sporter',
          auth.user.email ?? null,
          auth.user.displayName ?? null
        );
        p = await getProfile(auth.user.uid);
      }
      setProfile(p);
      if (p?.role === 'trainer' || p?.role === 'admin') {
        const [mySporters, all] = await Promise.all([
          getSportersByTrainerId(auth.user.uid),
          getAllSporters(),
        ]);
        setSporters(mySporters);
        setAllSporters(all);
      } else {
        setSporters([]);
        setAllSporters([]);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg.includes('permission') || msg.includes('Permission') ? 'Geen toegang tot database. Controleer Firestore-regels (zie docs). ' + msg : msg);
      setProfile(null);
      setSporters([]);
      setAllSporters([]);
    } finally {
      setLoading(false);
    }
  }, [auth?.user?.uid, auth?.user?.email, auth?.user?.displayName]);

  useEffect(() => {
    refreshProfile();
  }, [refreshProfile]);

  const ensureProfile = useCallback(
    async (role: ProfileRole, email: string | null, displayName?: string | null): Promise<Profile> => {
      if (!auth?.user?.uid) throw new Error('Niet ingelogd');
      const existing = await getProfile(auth.user.uid);
      if (existing) return existing;
      const created = await createProfile(auth.user.uid, role, email, displayName ?? auth.user.displayName ?? undefined);
      setProfile(created);
      return created;
    },
    [auth?.user?.uid, auth?.user?.displayName]
  );

  const role: ProfileRole = profile?.role ?? 'sporter';
  const isAdmin = role === 'admin';
  /** Admin heeft ook trainerrechten (super user). */
  const isTrainer = role === 'trainer' || isAdmin;

  const value: ProfileState = {
    profile,
    role,
    isTrainer,
    isAdmin,
    sporters,
    allSporters,
    loading,
    error,
    refreshProfile,
    ensureProfile,
  };

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfile(): ProfileState | null {
  return useContext(ProfileContext);
}
