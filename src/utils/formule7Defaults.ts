import type {
  Formule7Routekaart,
  Formule7Goal,
  Formule7MoverType,
  Formule7Organisation,
  Formule7CooldownOrganisation,
  Formule7StrengthGoal,
  Formule7WeekschemaType,
  Formule7TotalBodyVersion,
  Formule7SplitVariant,
} from '../types';

export const createEmptyFormule7 = (): Formule7Routekaart => ({
  clientName: '',
  casus: '',
  gender: null,
  ageYears: null,
  moverType: null,
  goal: null,
  sessionsPerWeek: null,
  sessionDurationCategory: null,
  restingHr: null,
  theoreticalMaxHr: null,
  weekschemaType: null,
  totalBodyVersion: null,
  splitVariant: null,
  warmup: {
    organisation: null,
    intensityPercentOfMaxHr: null,
    trainingHr: null,
    durationMinutes: null,
  },
  neuromuscular: {
    goal: null,
    trainingForm: '',
    desiredExerciseCount: null,
    exercises: [],
  },
  cardio: {
    trainingMethod: '',
    organisation: null,
    zones: [
      { zone: 1, organisation: null, trainingHr: null, durationMinutes: null },
      { zone: 2, organisation: null, trainingHr: null, durationMinutes: null },
      { zone: 3, organisation: null, trainingHr: null, durationMinutes: null },
    ],
  },
  cooldown: {
    organisation: null,
    intensityPercentOfMaxHr: null,
    trainingHr: null,
    durationMinutes: null,
  },
  stretching: [],
  notes: '',
});

export const FORMULE7_GOAL_OPTIONS: { value: Formule7Goal; label: string }[] = [
  { value: 'G', label: 'Route G – Gewichtscontrole' },
  { value: 'U', label: 'Route U – Verbetering uithoudingsvermogen' },
  { value: 'S', label: 'Route S – Spierversterking' },
  { value: 'GU', label: 'Route GU – Combinatieroute (G + U)' },
  { value: 'GS', label: 'Route GS – Combinatieroute (G + S)' },
  { value: 'US', label: 'Route US – Combinatieroute (U + S)' },
  { value: 'GUS', label: 'Route GUS – Combinatieroute (G + U + S)' },
];

/** Optie in UI: korte label in dropdown; uitgebreide uitleg in info-tooltip. */
export type Formule7MoverOption = {
  value: Formule7MoverType;
  label: string;
  /** Korte toelichting (ook per niveau in gecombineerde help). */
  detail: string;
};

/**
 * Technische codes (Non/Low/High) blijven voor data & Formule 7-tabellen;
 * korte labels in het formulier; details achter het (i)-icoon.
 */
export const FORMULE7_MOVER_OPTIONS: Formule7MoverOption[] = [
  { value: 'Non', label: 'Niet tot weinig', detail: 'Langer dan een jaar niet' },
  { value: 'Low', label: 'Soms', detail: 'Af en toe' },
  { value: 'High', label: 'Vaak', detail: 'Regelmatig minimaal 1 in de week' },
];

/** Tekst voor info-icoon bij activiteit / belastbaarheid. */
export const FORMULE7_MOVER_LEVELS_HELP = [
  'Niet tot weinig — langer dan een jaar niet',
  'Soms — af en toe',
  'Vaak — regelmatig minimaal 1 in de week',
].join('\n');

export function getFormule7MoverLabel(mover: Formule7MoverType | null | undefined): string {
  if (mover == null) return '';
  return FORMULE7_MOVER_OPTIONS.find((o) => o.value === mover)?.label ?? String(mover);
}

export function getFormule7MoverDetail(mover: Formule7MoverType | null | undefined): string {
  if (mover == null) return '';
  return FORMULE7_MOVER_OPTIONS.find((o) => o.value === mover)?.detail ?? '';
}

export const FORMULE7_ORGANISATION_OPTIONS: { value: Formule7Organisation; label: string }[] = [
  { value: 'FIETSEN', label: 'Fietsen' },
  { value: 'LOPEN', label: 'Lopen' },
  { value: 'ROEIEN', label: 'Roeien' },
  { value: 'CROSSTRAINEN', label: 'Crosstrainen' },
  { value: 'ANDERS', label: 'Anders' },
];

/** Bepaalt weekschema-type uit trainingsfrequentie: 1–3 → Total body, 4–7 → Split (5.5.2.3). */
export function getWeekschemaTypeFromSessions(
  sessionsPerWeek: Formule7Routekaart['sessionsPerWeek']
): Formule7WeekschemaType | null {
  if (sessionsPerWeek == null) return null;
  if (sessionsPerWeek >= 4) return 'SPLIT';
  return 'TOTAL_BODY';
}

export const FORMULE7_TOTAL_BODY_VERSION_OPTIONS: { value: Formule7TotalBodyVersion; label: string }[] = [
  { value: 'A', label: 'Versie A' },
  { value: 'B', label: 'Versie B' },
  { value: 'C', label: 'Versie C' },
];

/** Split: 4+ dagen. Spieren ~48u rust → dag 1 Upper, dag 2 Lower, dag 3 herhaal dag 1, dag 4 herhaal dag 2. */
export const FORMULE7_SPLIT_VARIANT_OPTIONS: { value: Formule7SplitVariant; label: string }[] = [
  { value: 'UPPER_LOWER', label: 'Upper/Lower – dag 1 Upper, dag 2 Lower, dag 3+4 herhalen dag 1 en 2' },
  { value: 'UPPER_LOWER_AB', label: 'Upper/Lower A/B – variatie op herhalingsdagen (andere oefeningen)' },
];

/** Warming-up variabelen per mover type (Tabel 2). Duur 8-10 min voor alle types. */
export const WARMUP_BY_MOVER_TYPE: Record<
  Formule7MoverType,
  {
    organisations: Formule7Organisation[];
    intensityPercent: number;
    intensityLabel: string;
    intensityPercentMin: number;
    intensityPercentMax: number;
    durationMinutes: number;
    durationMin: number;
    durationMax: number;
  }
> = {
  Non: {
    organisations: ['FIETSEN', 'LOPEN'],
    intensityPercent: 60,
    intensityLabel: '60%',
    intensityPercentMin: 60,
    intensityPercentMax: 60,
    durationMinutes: 10,
    durationMin: 8,
    durationMax: 10,
  },
  Low: {
    organisations: ['FIETSEN', 'LOPEN', 'ROEIEN'],
    intensityPercent: 65,
    intensityLabel: '60-70%',
    intensityPercentMin: 60,
    intensityPercentMax: 70,
    durationMinutes: 10,
    durationMin: 8,
    durationMax: 10,
  },
  High: {
    organisations: ['FIETSEN', 'LOPEN', 'ROEIEN', 'CROSSTRAINEN', 'ANDERS'],
    intensityPercent: 70,
    intensityLabel: '70%',
    intensityPercentMin: 70,
    intensityPercentMax: 70,
    durationMinutes: 10,
    durationMin: 8,
    durationMax: 10,
  },
};

/** Organisaties die al voor cardio gekozen zijn (hoofd + zones). Warming-up mag daar niet mee overlappen. */
export function collectCardioOrganisationsUsed(
  cardio: Formule7Routekaart['cardio']
): Set<Formule7Organisation> {
  const used = new Set<Formule7Organisation>();
  if (cardio.organisation) used.add(cardio.organisation);
  for (const z of cardio.zones) {
    if (z.organisation) used.add(z.organisation);
  }
  return used;
}

/**
 * Warming-up-organisatie: toegestaan voor mover-type én niet dezelfde als cardio (hoofd of zone).
 */
export function pickWarmupOrganisationAvoidingCardio(
  moverType: Formule7MoverType,
  cardio: Formule7Routekaart['cardio'],
  preferred: Formule7Organisation | null
): Formule7Organisation | null {
  const allowed = WARMUP_BY_MOVER_TYPE[moverType].organisations;
  const used = collectCardioOrganisationsUsed(cardio);
  if (preferred && allowed.includes(preferred) && !used.has(preferred)) return preferred;
  return allowed.find((o) => !used.has(o)) ?? null;
}

/** Toegestane cardio-organisatie per mover type (Tabel 8). Non: fietsen, lopen. Low: + roeien. High: + crosstrainer, anders. */
export const CARDIO_ORGANISATION_BY_MOVER_TYPE: Record<Formule7MoverType, Formule7Organisation[]> = {
  Non: ['FIETSEN', 'LOPEN'],
  Low: ['FIETSEN', 'LOPEN', 'ROEIEN'],
  High: ['FIETSEN', 'LOPEN', 'ROEIEN', 'CROSSTRAINEN', 'ANDERS'],
};

/** Trainingsmethode CVT per mover type (Tabel 8): Duur vs Interval, toegestane zones. */
export const CARDIO_TRAINING_METHOD_OPTIONS_BY_MOVER: Record<
  Formule7MoverType,
  { value: string; label: string }[]
> = {
  Non: [
    { value: 'Duur (Aeroob 1,2)', label: 'Duur – Aeroob 1,2' },
    { value: 'Interval (Aeroob 1,2, Anaeroob 1)', label: 'Interval – Aeroob 1,2, Anaeroob 1' },
  ],
  Low: [
    { value: 'Duur (Aeroob 1,2,3)', label: 'Duur – Aeroob 1,2,3' },
    { value: 'Interval (Aeroob 1,2,3, Anaeroob 1,2)', label: 'Interval – Aeroob 1,2,3, Anaeroob 1,2' },
  ],
  High: [
    { value: 'Duur (Aeroob 1,2,3)', label: 'Duur – Aeroob 1,2,3' },
    { value: 'Interval (Aeroob 1,2,3, Anaeroob 1,2)', label: 'Interval – Aeroob 1,2,3, Anaeroob 1,2' },
  ],
};

/** Tabel 9: Vijf kleurzones CVT – % HF-max per zone. Zone 1–3 = Aeroob 1–3 (duur + interval); 4–5 = Anaeroob 1–2 (alleen interval). App gebruikt Zone 1–3 = Aeroob. */
export const CARDIO_ZONE_HR_PERCENT: Record<
  1 | 2 | 3,
  { zoneName: string; defaultPercent: number; min: number; max: number }
> = {
  1: { zoneName: 'Aeroob 1', defaultPercent: 55, min: 50, max: 60 },
  2: { zoneName: 'Aeroob 2', defaultPercent: 65, min: 60, max: 70 },
  3: { zoneName: 'Aeroob 3', defaultPercent: 75, min: 70, max: 80 },
};

export const FORMULE7_COOLDOWN_ORGANISATION_OPTIONS: {
  value: Formule7CooldownOrganisation;
  label: string;
}[] = [
  { value: 'FIETSEN', label: 'Fietsen' },
  { value: 'LOPEN', label: 'Lopen' },
];

export const FORMULE7_STRENGTH_GOAL_OPTIONS: { value: Formule7StrengthGoal; label: string }[] = [
  { value: 'S1', label: 'S1 – Spierkrachtuithoudingsvermogen' },
  { value: 'S2', label: 'S2 – Hypertrofie (spieropbouw)' },
  { value: 'S3', label: 'S3 – Spierkracht' },
  { value: 'S4.1', label: 'S4.1 – Maximaalkracht' },
  { value: 'S4.2', label: 'S4.2 – Snelkrachtuithoudingsvermogen' },
  { value: 'S4.3', label: 'S4.3 – Maximaalsnelkracht' },
];

/** Toegestane NMT-doelen per mover type (belastbaarheid). Niet alle doelen zijn geschikt voor elke mover. */
export const ALLOWED_NMT_GOALS_BY_MOVER_TYPE: Record<
  Formule7MoverType,
  Formule7StrengthGoal[]
> = {
  Non: ['S1', 'S2'],
  Low: ['S1', 'S2', 'S3', 'S4.2'],
  High: ['S1', 'S2', 'S3', 'S4.1', 'S4.2', 'S4.3'],
};

/** NMT-parameters en toegestane ranges per doel (Tabel 4). */
export const NMT_PRESETS_BY_GOAL: Record<
  Formule7StrengthGoal,
  {
    trainingMethod: string;
    sets: number;
    reps: number;
    percent1RM: number;
    restSeconds: number;
    desiredExerciseCount: 4 | 6 | 7 | 8 | 9;
    minExercises: number;
    maxExercises: number;
    setsMin: number;
    setsMax: number;
    repsMin: number;
    repsMax: number;
    percent1RMMin: number;
    percent1RMMax: number;
    restSecMin: number;
    restSecMax: number;
  }
> = {
  S1: {
    trainingMethod: 'Spierkrachtuithoudingsvermogen',
    sets: 2,
    reps: 16,
    percent1RM: 65,
    restSeconds: 50,
    desiredExerciseCount: 6,
    minExercises: 4,
    maxExercises: 9,
    setsMin: 1,
    setsMax: 4,
    repsMin: 12,
    repsMax: 20,
    percent1RMMin: 60,
    percent1RMMax: 70,
    restSecMin: 10,
    restSecMax: 90,
  },
  S2: {
    trainingMethod: 'Hypertrofie',
    sets: 2,
    reps: 10,
    percent1RM: 75,
    restSeconds: 105,
    desiredExerciseCount: 6,
    minExercises: 4,
    maxExercises: 9,
    setsMin: 1,
    setsMax: 4,
    repsMin: 8,
    repsMax: 12,
    percent1RMMin: 70,
    percent1RMMax: 80,
    restSecMin: 90,
    restSecMax: 120,
  },
  S3: {
    trainingMethod: 'Spierkracht',
    sets: 2,
    reps: 7,
    percent1RM: 82,
    restSeconds: 150,
    desiredExerciseCount: 6,
    minExercises: 4,
    maxExercises: 9,
    setsMin: 1,
    setsMax: 4,
    repsMin: 6,
    repsMax: 8,
    percent1RMMin: 80,
    percent1RMMax: 85,
    restSecMin: 120,
    restSecMax: 180,
  },
  S4: {
    trainingMethod: 'Explosieve kracht',
    sets: 2,
    reps: 5,
    percent1RM: 90,
    restSeconds: 240,
    desiredExerciseCount: 6,
    minExercises: 4,
    maxExercises: 9,
    setsMin: 1,
    setsMax: 4,
    repsMin: 1,
    repsMax: 5,
    percent1RMMin: 90,
    percent1RMMax: 100,
    restSecMin: 180,
    restSecMax: 300,
  },
  'S4.1': {
    trainingMethod: 'Maximaalkracht',
    sets: 2,
    reps: 3,
    percent1RM: 95,
    restSeconds: 240,
    desiredExerciseCount: 6,
    minExercises: 4,
    maxExercises: 9,
    setsMin: 1,
    setsMax: 4,
    repsMin: 1,
    repsMax: 5,
    percent1RMMin: 90,
    percent1RMMax: 100,
    restSecMin: 180,
    restSecMax: 300,
  },
  'S4.2': {
    trainingMethod: 'Snelkrachtuithoudingsvermogen',
    sets: 2,
    reps: 7,
    percent1RM: 72,
    restSeconds: 150,
    desiredExerciseCount: 6,
    minExercises: 4,
    maxExercises: 9,
    setsMin: 1,
    setsMax: 4,
    repsMin: 6,
    repsMax: 8,
    percent1RMMin: 60,
    percent1RMMax: 85,
    restSecMin: 120,
    restSecMax: 180,
  },
  'S4.3': {
    trainingMethod: 'Maximaalsnelkracht',
    sets: 2,
    reps: 3,
    percent1RM: 92,
    restSeconds: 240,
    desiredExerciseCount: 6,
    minExercises: 4,
    maxExercises: 9,
    setsMin: 1,
    setsMax: 4,
    repsMin: 1,
    repsMax: 5,
    percent1RMMin: 85,
    percent1RMMax: 100,
    restSecMin: 180,
    restSecMax: 300,
  },
};
