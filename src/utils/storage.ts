import { Exercise, Workout } from '../types';

const STORAGE_KEY = 'liftlog_workouts';

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

export const addExercise = (exercise: Exercise): void => {
  const workouts = getWorkouts();
  const today = new Date().toISOString().split('T')[0];
  
  // Find or create today's workout
  let todayWorkout = workouts.find(w => w.date === today);
  if (!todayWorkout) {
    todayWorkout = {
      id: Date.now().toString(),
      date: today,
      exercises: []
    };
    workouts.push(todayWorkout);
  }
  
  // Add exercise to today's workout
  todayWorkout.exercises.push(exercise);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(workouts));
  
  // Dispatch event voor andere tabs/components
  window.dispatchEvent(new Event('workoutUpdated'));
};

export const getAllExercisesByName = (exerciseName: string): Exercise[] => {
  const workouts = getWorkouts();
  return workouts
    .flatMap(workout => workout.exercises)
    .filter(ex => ex.name.toLowerCase() === exerciseName.toLowerCase())
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
};

export const getExerciseNames = (): string[] => {
  const workouts = getWorkouts();
  const names = new Set<string>();
  workouts.forEach(workout => {
    workout.exercises.forEach(ex => names.add(ex.name));
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

