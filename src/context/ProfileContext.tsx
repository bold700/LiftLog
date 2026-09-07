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
import {
  setCurrentOrgId,
  setMemberOrgIds,
  getCurrentOrgId,
  preferredOrgId,
} from '../services/orgContext';
import { setCloudSync, hydrateFromCloud } from '../utils/storage';

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
  /** Studio waarin je nu werkt. Voor de meeste mensen altijd dezelfde. */
  activeOrgId: string | null;
  /** Alle studio's waar je lid van bent; meer dan één betekent dat de wisselaar zichtbaar is. */
  orgIds: string[];
  /** Wisselt van studio en laadt de gegevens van die studio opnieuw. */
  switchOrg: (orgId: string) => Promise<void>;
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
  const [activeOrgId, setActiveOrgId] = useState<string | null>(null);

  const refreshProfile = useCallback(async () => {
    if (!auth?.user?.uid) {
      setCurrentOrgId(null);
      setMemberOrgIds([]);
      setActiveOrgId(null);
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
      // Studio vastzetten vóór elke query: services stampen en filteren hierop.
      // Bij meerdere studio's beginnen we in de laatst gebruikte, anders in de thuisstudio.
      const orgIds = p?.orgIds ?? [];
      setMemberOrgIds(orgIds);
      const active = p ? preferredOrgId(p.orgId, orgIds) : null;
      setCurrentOrgId(active);
      setActiveOrgId(active);
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
      setCurrentOrgId(null);
      setMemberOrgIds([]);
      setActiveOrgId(null);
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

  // Cloud-sync voor logs: zodra het profiel bekend is, spiegelen we schrijven naar de
  // cloud en halen we bestaande cloud-logs (incl. wat de trainer voor je logde) op.
  useEffect(() => {
    if (profile?.userId) {
      setCloudSync({ uid: profile.userId, trainerId: profile.trainerId ?? null });
      void hydrateFromCloud();
    } else {
      setCloudSync(null);
    }
  }, [profile?.userId, profile?.trainerId]);

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

  /**
   * Wisselen van studio. Alles wat we in het geheugen hebben hoort bij de vorige studio, dus we
   * halen het opnieuw op in plaats van het te laten staan — anders zie je even de sporters van
   * de ene studio onder de naam van de andere.
   */
  const switchOrg = useCallback(
    async (orgId: string) => {
      if (!profile || !profile.orgIds.includes(orgId) || orgId === getCurrentOrgId()) return;
      setCurrentOrgId(orgId);
      setActiveOrgId(orgId);
      setSporters([]);
      setAllSporters([]);
      await refreshProfile();
    },
    [profile, refreshProfile]
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
    activeOrgId,
    orgIds: profile?.orgIds ?? [],
    switchOrg,
    refreshProfile,
    ensureProfile,
  };

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfile(): ProfileState | null {
  return useContext(ProfileContext);
}
