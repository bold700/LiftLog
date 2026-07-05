import { Exercise, Workout } from '../types';
import { saveExerciseLog, deleteExerciseLog, getLogsForUser } from '../services/logService';

const STORAGE_KEY = 'liftlog_workouts';

/**
 * Cloud-sync onder de lokale opslag. De synchrone API hieronder blijft werken;
 * schrijven wordt (fire-and-forget) gespiegeld naar Firestore onder het eigen account,
 * en bij inloggen worden cloud-logs in de lokale cache gemerged (zodat je ook ziet wat
 * je trainer voor je logde). Wordt gezet vanuit ProfileContext.
 */
type CloudSync = { uid: string; trainerId: string | null };
let cloudSync: CloudSync | null = null;

export function setCloudSync(cfg: CloudSync | null): void {
  cloudSync = cfg;
}

function logToExercise(log: {
  id: string;
  exerciseName: string;
  weight: number | null;
  sets: number | null;
  reps: number | null;
  notes?: string | null;
  date: string;
  schemaId?: string | null;
  schemaDayIndex?: number | null;
}): Exercise {
  return {
    id: log.id,
    name: log.exerciseName || undefined,
    weight: log.weight ?? undefined,
    date: log.date,
    sets: log.sets ?? undefined,
    reps: log.reps ?? undefined,
    notes: log.notes ?? undefined,
    schemaId: log.schemaId ?? null,
    schemaDayIndex: log.schemaDayIndex ?? null,
  };
}

function mirrorToCloud(ex: Exercise): void {
  if (!cloudSync || !ex.name) return;
  void saveExerciseLog({
    id: ex.id,
    userId: cloudSync.uid,
    loggedBy: cloudSync.uid,
    trainerId: cloudSync.trainerId,
    exerciseName: ex.name,
    exerciseId: ex.name,
    weight: ex.weight ?? null,
    sets: ex.sets ?? null,
    reps: ex.reps ?? null,
    notes: ex.notes ?? null,
    date: ex.date,
    schemaId: ex.schemaId ?? null,
    schemaDayIndex: ex.schemaDayIndex ?? null,
    sessionId: null,
  }).catch(() => {
    // offline / rechten: lokale opslag blijft leidend, cloud volgt later
  });
}

/** Haal cloud-logs op en merge ze in de lokale cache (cloud wint op id). */
export async function hydrateFromCloud(): Promise<void> {
  if (!cloudSync) return;
  let cloudLogs;
  try {
    cloudLogs = await getLogsForUser(cloudSync.uid);
  } catch {
    return;
  }
  if (!cloudLogs || cloudLogs.length === 0) {
    window.dispatchEvent(new Event('workoutUpdated'));
    return;
  }
  const workouts = getWorkouts();
  const existing = new Map<string, { w: Workout; i: number }>();
  workouts.forEach((w) => w.exercises.forEach((e, i) => existing.set(e.id, { w, i })));
  for (const log of cloudLogs) {
    const ex = logToExercise(log);
    const day = (log.date || '').slice(0, 10) || new Date().toISOString().slice(0, 10);
    const hit = existing.get(ex.id);
    if (hit) {
      hit.w.exercises[hit.i] = ex;
    } else {
      let w = workouts.find((x) => x.date === day);
      if (!w) {
        w = { id: `cloud_${day}`, date: day, exercises: [] };
        workouts.push(w);
      }
      w.exercises.push(ex);
      existing.set(ex.id, { w, i: w.exercises.length - 1 });
    }
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(workouts));
  window.dispatchEvent(new Event('workoutUpdated'));
}

export const getWorkouts = (): Workout[] => {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
};

export const saveWorkout = (workout: Workout): void => {
  const workouts = getWorkouts();
  workouts.push(workout);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(workouts));
};

/**
 * Voegt een oefening/log toe aan de workout van vandaag.
 * Optioneel: geef schemaId en schemaDayIndex mee wanneer de log vanuit een schema-sessie komt.
 */
export const addExercise = (exercise: Exercise): void => {
  const workouts = getWorkouts();
  const today = new Date().toISOString().split('T')[0];

  // Find or create today's workout
  let todayWorkout = workouts.find((w) => w.date === today);
  if (!todayWorkout) {
    todayWorkout = {
      id: Date.now().toString(),
      date: today,
      exercises: [],
    };
    workouts.push(todayWorkout);
  }

  // Add exercise to today's workout (inclusief optionele schemaId/schemaDayIndex)
  todayWorkout.exercises.push(exercise);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(workouts));

  // Spiegel naar de cloud onder het eigen account
  mirrorToCloud(exercise);

  // Dispatch event voor andere tabs/components
  window.dispatchEvent(new Event('workoutUpdated'));
};

export const getAllExercisesByName = (exerciseName: string): Exercise[] => {
  const workouts = getWorkouts();
  return workouts
    .flatMap(workout => workout.exercises)
    .filter(ex => ex.name && ex.name.toLowerCase() === exerciseName.toLowerCase())
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
};

export const getExerciseNames = (): string[] => {
  const workouts = getWorkouts();
  const names = new Set<string>();
  workouts.forEach(workout => {
    workout.exercises.forEach(ex => {
      // Voeg alleen oefeningen met een naam toe (sla notities zonder oefening over)
      if (ex.name) {
        names.add(ex.name);
      }
    });
  });
  return Array.from(names).sort();
};

export const updateExercise = (exerciseId: string, updatedExercise: Partial<Exercise>): void => {
  const workouts = getWorkouts();
  let found = false;
  
  for (const workout of workouts) {
    const exerciseIndex = workout.exercises.findIndex(ex => ex.id === exerciseId);
    if (exerciseIndex !== -1) {
      workout.exercises[exerciseIndex] = { ...workout.exercises[exerciseIndex], ...updatedExercise };
      found = true;
      break;
    }
  }

  if (found) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(workouts));
    const merged = workouts.flatMap((w) => w.exercises).find((e) => e.id === exerciseId);
    if (merged) mirrorToCloud(merged);
    window.dispatchEvent(new Event('workoutUpdated'));
  } else {
    console.warn('Exercise not found for update:', exerciseId);
  }
};

export const deleteExercise = (exerciseId: string): void => {
  const workouts = getWorkouts();
  let found = false;
  
  for (let i = 0; i < workouts.length; i++) {
    const workout = workouts[i];
    const exerciseIndex = workout.exercises.findIndex(ex => ex.id === exerciseId);
    if (exerciseIndex !== -1) {
      workout.exercises.splice(exerciseIndex, 1);
      found = true;
      
      // Remove workout if it has no exercises left
      if (workout.exercises.length === 0) {
        workouts.splice(i, 1);
      }
      
      break;
    }
  }
  
  if (found) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(workouts));
    if (cloudSync) void deleteExerciseLog(exerciseId).catch(() => {});
    window.dispatchEvent(new Event('workoutUpdated'));
  } else {
    console.warn('Exercise not found for deletion:', exerciseId);
  }
};

export const getAllExercises = (): Exercise[] => {
  const workouts = getWorkouts();
  return workouts
    .flatMap(workout => workout.exercises)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
};

