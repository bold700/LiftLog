import { create } from 'zustand';
import { Exercise, Session, SetLog, Profile } from '../types';
import * as db from '../db/sqlite';
import { supabase } from '../api/supabase';
import { checkIsPR } from '../utils/pr';
import { generateUUID } from '../utils/uuid';

interface WorkoutState {
  // State
  currentSession: Session | null;
  currentSets: SetLog[];
  exercises: Exercise[];
  profile: Profile | null;
  isLoading: boolean;
  isSyncing: boolean;
  syncError: string | null;

  // Actions
  initialize: (userId: string) => Promise<void>;
  loadExercises: (userId: string) => Promise<void>;
  loadProfile: (userId: string) => Promise<void>;
  startSession: (userId: string) => Promise<Session>;
  addSet: (set: Omit<SetLog, 'id' | 'performed_at' | 'is_pr' | 'synced_at'>) => Promise<SetLog>;
  undoLastSet: () => Promise<void>;
  finishSession: (notes?: string) => Promise<void>;
  syncNow: () => Promise<void>;
  createExercise: (exercise: Omit<Exercise, 'id' | 'created_at'>) => Promise<Exercise>;
  getSetsForExercise: (exerciseId: string) => Promise<SetLog[]>;
  getLastSetForExercise: (exerciseId: string) => Promise<SetLog | null>;
}

export const useWorkoutStore = create<WorkoutState>((set, get) => ({
  currentSession: null,
  currentSets: [],
  exercises: [],
  profile: null,
  isLoading: false,
  isSyncing: false,
  syncError: null,

  initialize: async (userId: string) => {
    set({ isLoading: true });
    try {
      await db.initDatabase();
      await get().loadProfile(userId);
      await get().loadExercises(userId);
      
      const activeSession = await db.getActiveSession(userId);
      if (activeSession) {
        const sets = await db.getSetsForSession(activeSession.id);
        set({ currentSession: activeSession, currentSets: sets });
      }
    } catch (error) {
      console.error('Initialize error:', error);
    } finally {
      set({ isLoading: false });
    }
  },

  loadExercises: async (userId: string) => {
    try {
      const exercises = await db.getExercises(userId);
      set({ exercises });
    } catch (error) {
      console.error('Load exercises error:', error);
    }
  },

  loadProfile: async (userId: string) => {
    try {
      let profile = await db.getProfile(userId);
      if (!profile) {
        // Create default profile
        profile = {
          id: userId,
          unit: 'kg',
          created_at: new Date().toISOString(),
        };
        await db.upsertProfile(profile);
      }
      set({ profile });
    } catch (error) {
      console.error('Load profile error:', error);
    }
  },

  startSession: async (userId: string) => {
    const existingSession = await db.getActiveSession(userId);
    if (existingSession) {
      const sets = await db.getSetsForSession(existingSession.id);
      set({ currentSession: existingSession, currentSets: sets });
      return existingSession;
    }

    const newSession: Session = {
      id: generateUUID(),
      user_id: userId,
      started_at: new Date().toISOString(),
      ended_at: null,
    };
    
    await db.insertSession(newSession);
    set({ currentSession: newSession, currentSets: [] });
    return newSession;
  },

  addSet: async (setData) => {
    const { currentSession } = get();
    if (!currentSession) {
      throw new Error('No active session');
    }

    // Get previous sets for this exercise to check PR
    const previousSets = await db.getAllSetsForExercise(setData.exercise_id);
    const isPR = checkIsPR(
      { weight_kg: setData.weight_kg, reps: setData.reps },
      previousSets
    );

    const newSet: SetLog = {
      id: generateUUID(),
      ...setData,
      performed_at: new Date().toISOString(),
      is_pr: isPR,
      synced_at: null,
    };

    await db.insertSetLog(newSet);
    const updatedSets = [...get().currentSets, newSet];
    set({ currentSets: updatedSets });

    // Try to sync in background
    get().syncNow().catch(() => {
      // Silent fail, will retry later
    });

    return newSet;
  },

  undoLastSet: async () => {
    const { currentSets } = get();
    if (currentSets.length === 0) return;

    const lastSet = currentSets[currentSets.length - 1];
    await db.deleteSetLog(lastSet.id);
    const updatedSets = currentSets.slice(0, -1);
    set({ currentSets: updatedSets });
  },

  finishSession: async (notes?: string) => {
    const { currentSession } = get();
    if (!currentSession) return;

    await db.updateSession({
      id: currentSession.id,
      ended_at: new Date().toISOString(),
      notes,
    });

    // Try to sync
    await get().syncNow();

    set({ currentSession: null, currentSets: [] });
  },

  syncNow: async () => {
    const { isSyncing } = get();
    if (isSyncing) return;

    set({ isSyncing: true, syncError: null });

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('Not authenticated');
      }

      // Sync unsynced sets
      const unsyncedSets = await db.getUnsyncedSetLogs();
      
      for (const set of unsyncedSets) {
        const { error } = await supabase.from('set_logs').upsert({
          id: set.id,
          session_id: set.session_id,
          exercise_id: set.exercise_id,
          performed_at: set.performed_at,
          weight_kg: set.weight_kg,
          reps: set.reps,
          rpe: set.rpe,
          is_pr: set.is_pr,
        });

        if (!error) {
          await db.markSetLogSynced(set.id);
        }
      }

      // Sync unsynced sessions
      const unsyncedSessions = await db.getUnsyncedSessions();
      for (const session of unsyncedSessions) {
        const { error } = await supabase.from('sessions').upsert({
          id: session.id,
          user_id: session.user_id,
          started_at: session.started_at,
          ended_at: session.ended_at,
          notes: session.notes,
        });

        if (!error) {
          // Session synced when all sets are synced
        }
      }

      // Pull latest data from Supabase (for exercises mostly)
      const { data: exercises } = await supabase
        .from('exercises')
        .select('*')
        .eq('user_id', user.id);

      if (exercises) {
        for (const exercise of exercises) {
          // Check if exists locally
          const local = await db.getExercise(exercise.id);
          if (!local) {
            await db.insertExercise(exercise);
          }
        }
      }

      await get().loadExercises(user.id);
    } catch (error: any) {
      console.error('Sync error:', error);
      set({ syncError: error.message || 'Sync failed' });
    } finally {
      set({ isSyncing: false });
    }
  },

  createExercise: async (exerciseData) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      throw new Error('Not authenticated');
    }

    const newExercise: Exercise = {
      id: generateUUID(),
      ...exerciseData,
      created_at: new Date().toISOString(),
    };

    await db.insertExercise(newExercise);
    
    // Try to sync to Supabase
    try {
      const { error } = await supabase.from('exercises').insert(newExercise);
      if (error) {
        console.warn('Failed to sync exercise immediately:', error);
      }
    } catch (error) {
      console.warn('Failed to sync exercise immediately:', error);
    }

    await get().loadExercises(user.id);
    return newExercise;
  },

  getSetsForExercise: async (exerciseId: string) => {
    return await db.getAllSetsForExercise(exerciseId);
  },

  getLastSetForExercise: async (exerciseId: string) => {
    const sets = await db.getSetsForExercise(exerciseId, 1);
    return sets.length > 0 ? sets[0] : null;
  },
}));

