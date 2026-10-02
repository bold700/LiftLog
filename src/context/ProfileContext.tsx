import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import { isInactiveInOrg, roleInOrg, trainsAsMemberInOrg } from '../utils/orgRoles';
import { useAuth } from './AuthContext';
import {
  getProfile,
  subscribeAllProfiles,
  getAllProfiles,
  createProfile,
} from '../services/profileService';
import type { Profile, ProfileRole } from '../types';
import { rosterFromProfiles } from '../utils/roster';
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
  /**
   * Iedereen in de studio behalve jezelf: sporters, trainers en beheerders. Voor "Bekijk als",
   * waar een beheerder ook bij een collega moet kunnen meekijken (alleen voor staf geladen).
   */
  members: Profile[];
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
  const [members, setMembers] = useState<Profile[]>([]);
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
      setMembers([]);
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
      // De rol hoort bij de actieve studio (getProfile las het profiel nog vóór het vastzetten).
      if (p) p = { ...p, role: roleInOrg(p, active), inactive: isInactiveInOrg(p, active), trainsAsMember: trainsAsMemberInOrg(p, active) };
      setProfile(p);
      if (p?.role === 'trainer' || p?.role === 'admin') {
        // De ledenlijst apart afvangen: mislukt die, dan blijft het profiel (en dus de rol) staan.
        // Anders zag een beheerder de app als sporter zodra alleen de lijst werd geweigerd.
        try {
          // Eén keer de hele studio ophalen: daaruit komen zowel de sporters als "Bekijk als". Daarna
          // houdt de live koppeling hieronder de lijsten bij.
          const roster = rosterFromProfiles(await getAllProfiles(), auth.user.uid);
          setSporters(roster.sporters);
          setAllSporters(roster.allSporters);
          setMembers(roster.members);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          setError('Ledenlijst niet kunnen laden. ' + msg);
          setSporters([]);
          setAllSporters([]);
          setMembers([]);
        }
      } else {
        setSporters([]);
        setAllSporters([]);
        setMembers([]);
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
      setMembers([]);
    } finally {
      setLoading(false);
    }
  }, [auth?.user?.uid, auth?.user?.email, auth?.user?.displayName]);

  useEffect(() => {
    refreshProfile();
  }, [refreshProfile]);

  // Staf: de ledenlijsten live houden. Een lid dat in Beheer wordt toegevoegd of gewijzigd staat dan
  // meteen in "Bekijk als", bij inplannen en bij workouts toewijzen, zonder opnieuw in te loggen.
  const isStaffProfile = profile?.role === 'trainer' || profile?.role === 'admin';
  const myUid = auth?.user?.uid ?? null;
  useEffect(() => {
    if (!isStaffProfile || !myUid || !activeOrgId) return;
    return subscribeAllProfiles(
      (everyone) => {
        const roster = rosterFromProfiles(everyone, myUid);
        setSporters(roster.sporters);
        setAllSporters(roster.allSporters);
        setMembers(roster.members);
      },
      (e) => console.warn('[profile] ledenlijst live bijhouden mislukt:', e.message)
    );
  }, [isStaffProfile, myUid, activeOrgId]);

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
      setMembers([]);
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
    members,
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
