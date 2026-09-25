/**
 * Workouts (schemas) laden en opslaan: Firestore wanneer ingelogd, anders localStorage.
 */
import { useState, useCallback, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useProfile } from '../context/ProfileContext';
import { useViewAs } from '../context/ViewAsContext';
import {
  getWorkoutsForUser,
  getWorkoutsViewedAs,
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
  const { viewed } = useViewAs();
  const [schemas, setSchemas] = useState<Schema[]>([]);
  const [loading, setLoading] = useState(true);
  /** Gezet als het ophalen echt mislukte (rechten/verbinding) — anders lijkt dat hetzelfde als "geen workouts". */
  const [error, setError] = useState<string | null>(null);

  // "Bekijk als": laat zien wat die sporter zelf zou zien (eigen/toegewezen/open), niet de
  // trainersblik op iedereen — anders lijkt "bekijk als" niets te doen op dit scherm.
  const viewerUid = auth?.user?.uid;
  const targetUid = viewed.isOther ? viewed.userId : viewerUid;
  const targetRole = viewed.isOther ? 'sporter' : profile?.role;
  const viewingOther = viewed.isOther;

  const loadSchemas = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (targetUid && profile?.profile) {
        const list =
          viewingOther && viewerUid
            ? await getWorkoutsViewedAs(targetUid, viewerUid)
            : await getWorkoutsForUser(targetUid, targetRole ?? 'sporter');
        setSchemas(list);
      } else {
        setSchemas(getSchemas());
      }
    } catch (e) {
      setSchemas(getSchemas());
      setError(e instanceof Error ? e.message : 'Workouts ophalen mislukt.');
    } finally {
      setLoading(false);
    }
  }, [targetUid, targetRole, viewingOther, viewerUid, profile?.profile?.role]);

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
    error,
    loadSchemas,
    getSchemaById,
    saveSchema,
    deleteSchema,
    createEmptySchema,
    canCreateWorkouts,
    isTrainer,
  };
}
