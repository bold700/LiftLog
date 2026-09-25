/**
 * Gelogde oefeningen van wie je bekijkt, voor de Inzichten-tabs.
 *
 * Je eigen oefeningen komen uit de lokale opslag (die op de achtergrond met de cloud wordt
 * gelijkgehouden) en ververst bij elke nieuwe log. Kijk je via "Bekijk als" bij een sporter mee,
 * dan staan zijn logs niet op dit toestel en halen we ze rechtstreeks uit Firestore.
 */
import { useCallback, useEffect, useState } from 'react';
import { useViewAs } from '../context/ViewAsContext';
import { getAllExercises } from '../utils/storage';
import { getLogsForUser } from '../services/logService';
import { logToExercise } from '../utils/exerciseLogMapping';
import type { Exercise } from '../types';

export interface ViewedExercises {
  /** Nieuwste eerst. */
  exercises: Exercise[];
  loading: boolean;
  error: string | null;
  viewingOther: boolean;
  /** Opnieuw ophalen, bijv. na bewerken of verwijderen. */
  reload: () => Promise<void>;
}

const byDateDesc = (a: Exercise, b: Exercise) => new Date(b.date).getTime() - new Date(a.date).getTime();

export function useViewedExercises(): ViewedExercises {
  const { viewed } = useViewAs();
  const viewingOther = viewed.isOther;
  const viewedUserId = viewed.userId;
  const [exercises, setExercises] = useState<Exercise[]>(() => (viewingOther ? [] : getAllExercises()));
  const [loading, setLoading] = useState(viewingOther);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!viewingOther) {
      setError(null);
      setLoading(false);
      setExercises([...getAllExercises()].sort(byDateDesc));
      return;
    }
    setLoading(true);
    try {
      const logs = await getLogsForUser(viewedUserId);
      setError(null);
      setExercises(logs.map(logToExercise).sort(byDateDesc));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setExercises([]);
      setError(
        msg.toLowerCase().includes('permission')
          ? 'Geen toegang tot de logs van deze sporter. Zit hij of zij wel in jouw studio?'
          : 'De logs konden niet geladen worden.'
      );
    } finally {
      setLoading(false);
    }
  }, [viewingOther, viewedUserId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Eigen logs: opnieuw lezen zodra er iets gelogd is (zelfde tab of een andere).
  useEffect(() => {
    if (viewingOther) return;
    const refresh = () => void reload();
    window.addEventListener('storage', refresh);
    window.addEventListener('workoutUpdated', refresh);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener('workoutUpdated', refresh);
    };
  }, [viewingOther, reload]);

  return { exercises, loading, error, viewingOther, reload };
}
