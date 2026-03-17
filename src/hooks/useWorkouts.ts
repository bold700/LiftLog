/**
 * Workouts (schemas) laden en opslaan: Firestore wanneer ingelogd, anders localStorage.
 */
import { useState, useCallback, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useProfile } from '../context/ProfileContext';
import {
  getWorkoutsForUser,
  saveWorkoutToFirestore,
  deleteWorkoutFromFirestore,
} from '../services/workoutFirestore';
import {
  getSchemas,
  getSchemaById as getSchemaByIdStorage,
  saveSchema as saveSchemaStorage,
  deleteSchema as deleteSchemaStorage,
  createEmptySchema as createEmptySchemaStorage,
} from '../utils/schemaStorage';
import type { Schema } from '../types';

const TRAINER_ID_LOCAL = 'local_trainer';

export function useWorkouts() {
  const auth = useAuth();
  const profile = useProfile();
  const [schemas, setSchemas] = useState<Schema[]>([]);
  const [loading, setLoading] = useState(true);

  const loadSchemas = useCallback(async () => {
    setLoading(true);
    try {
      if (auth?.user?.uid && profile?.profile) {
        const list = await getWorkoutsForUser(auth.user.uid, profile.role);
        setSchemas(list);
      } else {
        setSchemas(getSchemas());
      }
    } catch {
      setSchemas(getSchemas());
    } finally {
      setLoading(false);
    }
  }, [auth?.user?.uid, profile?.profile?.role]);

  useEffect(() => {
    loadSchemas();
  }, [loadSchemas]);

  const getSchemaById = useCallback(
    (id: string): Schema | null => {
      const found = schemas.find((s) => s.id === id) ?? null;
      if (found) return found;
      if (!auth?.user) return getSchemaByIdStorage(id);
      return null;
    },
    [schemas, auth?.user]
  );

  const saveSchema = useCallback(
    async (schema: Schema) => {
      if (auth?.user?.uid) {
        await saveWorkoutToFirestore(schema);
        setSchemas((prev) => {
          const idx = prev.findIndex((s) => s.id === schema.id);
          const next = [...prev];
          if (idx >= 0) next[idx] = schema;
          else next.push(schema);
          return next.sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1));
        });
      } else {
        saveSchemaStorage(schema);
        setSchemas(getSchemas());
      }
    },
    [auth?.user?.uid]
  );

  const deleteSchema = useCallback(
    async (id: string) => {
      if (auth?.user?.uid) {
        await deleteWorkoutFromFirestore(id);
        setSchemas((prev) => prev.filter((s) => s.id !== id));
      } else {
        deleteSchemaStorage(id);
        setSchemas(getSchemas());
      }
    },
    [auth?.user?.uid]
  );

  const createEmptySchema = useCallback(
    (name: string): Schema => {
      const trainerId = auth?.user?.uid ?? TRAINER_ID_LOCAL;
      return createEmptySchemaStorage(name, trainerId);
    },
    [auth?.user?.uid]
  );

  const isTrainer = profile?.isTrainer ?? false;
  const canCreateWorkouts = !auth?.user || isTrainer;

  return {
    schemas,
    loading,
    loadSchemas,
    getSchemaById,
    saveSchema,
    deleteSchema,
    createEmptySchema,
    canCreateWorkouts,
    isTrainer,
  };
}
