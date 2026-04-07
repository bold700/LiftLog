import { useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useProfile } from '../context/ProfileContext';
import { isFirebaseConfigured } from '../firebase/config';
import { syncMyLeaderboardPublic } from '../services/leaderboardPublicService';

const DEBOUNCE_MS = 1200;

/**
 * Stuurt geaggregeerde lokale stats naar Firestore wanneer logs wijzigen en ranglijst aan staat.
 */
export function LeaderboardAutoSync() {
  const auth = useAuth();
  const profileCtx = useProfile();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const runSync = useCallback(() => {
    const uid = auth?.user?.uid;
    const p = profileCtx?.profile;
    if (!uid || !p || !isFirebaseConfigured()) return;
    void syncMyLeaderboardPublic({
      uid,
      leaderboardVisibility: p.leaderboardVisibility,
      displayName: p.displayName,
    });
  }, [auth?.user?.uid, profileCtx?.profile]);

  useEffect(() => {
    runSync();
  }, [
    runSync,
    profileCtx?.profile?.leaderboardVisibility,
    profileCtx?.profile?.displayName,
  ]);

  useEffect(() => {
    const schedule = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        runSync();
      }, DEBOUNCE_MS);
    };
    window.addEventListener('workoutUpdated', schedule);
    window.addEventListener('dayCompletionUpdated', schedule);
    return () => {
      window.removeEventListener('workoutUpdated', schedule);
      window.removeEventListener('dayCompletionUpdated', schedule);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [runSync]);

  return null;
}
