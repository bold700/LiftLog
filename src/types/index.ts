export interface Exercise {
  id: string;
  name?: string; // Optioneel: kan leeg zijn voor alleen notities
  weight?: number; // Optioneel: kan leeg zijn voor alleen notities
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

