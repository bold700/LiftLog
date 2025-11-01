export interface Exercise {
  id: string;
  name: string;
  weight: number;
  date: string; // ISO date string
  sets?: number;
  reps?: number;
}

export interface Workout {
  id: string;
  date: string;
  exercises: Exercise[];
}

