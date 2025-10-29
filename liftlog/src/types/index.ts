export type MuscleGroup = 'legs' | 'push' | 'pull' | 'core' | 'other';

export type Unit = 'kg' | 'lb';

export type Locale = 'nl' | 'en';

export interface Exercise {
  id: string;
  user_id: string;
  name: string;
  muscle_group: MuscleGroup;
  created_at: string;
}

export interface Session {
  id: string;
  user_id: string;
  started_at: string;
  ended_at: string | null;
  notes?: string;
}

export interface SetLog {
  id: string;
  session_id: string;
  exercise_id: string;
  performed_at: string;
  weight_kg: number;
  reps: number;
  rpe?: number;
  is_pr: boolean;
  synced_at: string | null;
}

export interface Profile {
  id: string;
  full_name?: string;
  unit: Unit;
  created_at: string;
}

export interface SetLogWithExercise extends SetLog {
  exercise?: Exercise;
}

export interface SessionWithSets extends Session {
  sets: SetLogWithExercise[];
}


