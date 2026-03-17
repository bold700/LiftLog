export interface Exercise {
  id: string;
  name?: string; // Optioneel: kan leeg zijn voor alleen notities
  weight?: number; // Optioneel: kan leeg zijn voor alleen notities
  date: string; // ISO date string
  sets?: number;
  reps?: number;
  notes?: string; // Optionele notitie bijv. "last van mn schouder", "ging goed", "was te zwaar"
  /** Alleen gezet wanneer log vanuit een schema wordt aangemaakt */
  schemaId?: string | null;
  /** Welke dag van het schema (0-based index) */
  schemaDayIndex?: number | null;
}

export interface Workout {
  id: string;
  date: string;
  exercises: Exercise[];
}

/** Log voor een hele trainingssessie (één schema-dag op een datum), met optionele notitie. */
export interface TrainingSessionLog {
  id: string;
  date: string; // YYYY-MM-DD
  schemaId: string;
  schemaDayIndex: number;
  notes?: string | null;
}

// --- Schema types (trainingsplan met meerdere dagen) ---
// Structuur volgt AALO Fitness Instructeur §5.5 Trainingsonderdelen:
// 1. Warming-up (5.5.1)  2. Neuromusculair trainen/NMT (5.5.2)  3. Cardiovasculair/CVT (5.5.3)  4. Cooling-down.
// Stretching wordt in de app als extra onderdeel na cooling-down ondersteund. NMT-parameters (sets, reps, %1RM) sluiten aan op Tabel 4 (S1–S4).

export interface SchemaExercise {
  exerciseId: string;
  exerciseName: string;
  setsTarget: number;
  repsTarget: number;
  restSeconds?: number;
  notes: string;
  /** Optioneel doelgewicht voor progressie (kg). Kan automatisch uit 1RM en % 1RM worden berekend. */
  targetWeight?: number;
  /** Intensiteit in % van 1RM (Formule 7 / Tabel 4). */
  intensityPercent1RM?: number;
  /** Optioneel: geschatte 1RM (kg). Wordt gebruikt om doelgewicht te berekenen: doelgewicht = 1RM × (% 1RM / 100). */
  estimated1RMKg?: number;
}

export interface SchemaDay {
  dayLabel: string;
  exercises: SchemaExercise[];
  /** Formule 7 – per trainingsdag (sectie 2–6). Optioneel. */
  warmup?: Formule7Warmup | null;
  cardio?: Formule7Cardio | null;
  cooldown?: Formule7Cooldown | null;
  stretching?: Formule7Stretch[] | null;
}

// --- Formule 7 routekaart types ---

export type Formule7MoverType = 'Non' | 'Low' | 'High';

export type Formule7Goal =
  | 'G'
  | 'U'
  | 'S'
  | 'GU'
  | 'GS'
  | 'US'
  | 'GUS';

export type Formule7Organisation =
  | 'FIETSEN'
  | 'LOPEN'
  | 'ROEIEN'
  | 'CROSSTRAINEN'
  | 'ANDERS';

export interface Formule7Warmup {
  organisation: Formule7Organisation | null;
  intensityPercentOfMaxHr?: number | null;
  trainingHr?: number | null;
  durationMinutes?: number | null;
}

export type Formule7StrengthGoal = 'S1' | 'S2' | 'S3' | 'S4' | 'S4.1' | 'S4.2' | 'S4.3';

export interface Formule7NeuromuscularExercise {
  /** Vrije omschrijving van de fitnessoefening. */
  name: string;
  /** Intensiteit in % van 1RM. */
  intensityPercent1RM?: number | null;
  sets?: number | null;
  reps?: number | null;
  restSeconds?: number | null;
}

export interface Formule7Neuromuscular {
  goal: Formule7StrengthGoal | null;
  trainingForm?: string;
  /** Gewenst aantal oefeningen (4, 6, 7, 8 of 9). */
  desiredExerciseCount?: 4 | 6 | 7 | 8 | 9 | null;
  exercises: Formule7NeuromuscularExercise[];
}

export interface Formule7CardioZone {
  zone: 1 | 2 | 3;
  organisation: Formule7Organisation | null;
  trainingHr?: number | null;
  durationMinutes?: number | null;
}

export interface Formule7Cardio {
  trainingMethod?: string;
  organisation: Formule7Organisation | null;
  zones: Formule7CardioZone[];
}

export type Formule7CooldownOrganisation = 'FIETSEN' | 'LOPEN';

export interface Formule7Cooldown {
  organisation: Formule7CooldownOrganisation | null;
  intensityPercentOfMaxHr?: number | null;
  trainingHr?: number | null;
  durationMinutes?: number | null;
}

export interface Formule7Stretch {
  muscleGroup: string;
  stretchDurationSeconds?: number | null;
  repetitions?: number | null;
}

/** Weekschema: Total body (1–3×/week) of Split (4+×/week). */
export type Formule7WeekschemaType = 'TOTAL_BODY' | 'SPLIT';

/** Bij Total body met 2 of 3 dagen: welke versie van de week (A/B/C). */
export type Formule7TotalBodyVersion = 'A' | 'B' | 'C';

/** Bij Split: variant Upper/Lower of Upper/Lower met A/B-varianten per dag. */
export type Formule7SplitVariant = 'UPPER_LOWER' | 'UPPER_LOWER_AB';

export interface Formule7Routekaart {
  clientName: string;
  casus: string;
  gender: 'M' | 'V' | null;
  ageYears?: number | null;
  moverType: Formule7MoverType | null;
  goal: Formule7Goal | null;
  sessionsPerWeek?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | null;
  sessionDurationCategory?: '<30' | '30-60' | '>60' | null;
  restingHr?: number | null;
  theoreticalMaxHr?: number | null;
  /** Afgeleid uit frequentie: 1–3 → Total body, 4+ → Split. Opgeslagen voor weergave/export. */
  weekschemaType?: Formule7WeekschemaType | null;
  /** Bij Total body met 2 of 3 sessies: versie A, B of C van dit schema. */
  totalBodyVersion?: Formule7TotalBodyVersion | null;
  /** Bij Split: welk type split. */
  splitVariant?: Formule7SplitVariant | null;
  warmup: Formule7Warmup;
  neuromuscular: Formule7Neuromuscular;
  cardio: Formule7Cardio;
  cooldown: Formule7Cooldown;
  stretching: Formule7Stretch[];
  notes: string;
}

// --- Profiel (sporter / trainer / beheerder) ---
export type ProfileRole = 'sporter' | 'trainer' | 'admin';

export interface Profile {
  userId: string;
  role: ProfileRole;
  email: string | null;
  displayName: string | null;
  /** Alleen bij sporters: uid van de trainer die hen beheert. */
  trainerId: string | null;
  /** True als deze gebruiker als trainer wil en op goedkeuring wacht. */
  trainerRequested?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Schema {
  id: string;
  name: string;
  trainerId: string;
  clientId: string | null;
  createdAt: string; // ISO date string
  days: SchemaDay[];
  /** Start van de schema-periode (YYYY-MM-DD). Optioneel. */
  startDate?: string | null;
  /** Einde van de schema-periode (YYYY-MM-DD). Optioneel. */
  endDate?: string | null;
  /** Optioneel: Formule 7 routekaart gegevens gekoppeld aan dit schema. */
  formule7?: Formule7Routekaart | null;
  /** Flag om snel te zien of dit schema met het Formule 7 template is opgezet. */
  isFormule7Template?: boolean;
}

