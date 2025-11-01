export interface Exercise {
  id: string;
  name: string;
  weight: number;
  date: string; // ISO date string
  sets?: number;
  reps?: number;
  notes?: string; // Optionele notitie bijv. "last van mn schouder", "ging goed", "was te zwaar"
}

export interface Workout {
  id: string;
  date: string;
  exercises: Exercise[];
}

