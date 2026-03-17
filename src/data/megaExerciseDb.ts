/**
 * Adapter voor mega_exercise_db.json (AALO + uitgebreide bibliotheek).
 * Mapt equipment en spiergroepen naar onze types voor gebruik in schema-filter en oefenlijst.
 */
import megaDb from './mega_exercise_db.json';
import type { ExerciseData, ExerciseEquipment } from './exercises';

type MegaEquipment = 'vaste_machine' | 'cable_pulley' | 'dumbbell' | 'barbell' | 'bodyweight' | 'anders';

function mapMegaEquipment(equipment: MegaEquipment): ExerciseEquipment {
  switch (equipment) {
    case 'vaste_machine':
      return 'machine';
    case 'cable_pulley':
      return 'cable';
    case 'dumbbell':
    case 'barbell':
      return 'free_weight';
    case 'bodyweight':
      return 'bodyweight';
    default:
      return 'other';
  }
}

/** Nederlandse spiergroep (mega) → Engelse category (bestaande app). */
const MUSCLE_TO_CATEGORY: Record<string, string> = {
  borst: 'Chest',
  rug_breed: 'Back',
  rug_dik: 'Back',
  schouders: 'Shoulders',
  biceps: 'Biceps',
  triceps: 'Triceps',
  onderarm: 'Biceps',
  buik: 'Abdominals',
  onderrug: 'Back',
  billen: 'Legs',
  quadriceps: 'Legs',
  hamstrings: 'Legs',
  kuiten: 'Calves',
  adductoren: 'Legs',
  abductoren: 'Legs',
};

function primaryToCategory(primary: string[]): string {
  if (primary?.length) {
    const cat = MUSCLE_TO_CATEGORY[primary[0]];
    if (cat) return cat;
  }
  return 'Legs';
}

interface MegaExercise {
  id: string;
  name: string;
  equipment: MegaEquipment;
  movement_pattern?: string;
  muscles_primary?: string[];
  muscles_secondary?: string[];
  level?: string[];
  bilateral?: boolean;
  cues?: string[];
  aalo_note?: string;
}

const megaExercises = (megaDb as { exercises: MegaExercise[] }).exercises;

/** Alle oefeningen uit de mega-DB als ExerciseData (met equipment en category). */
const megaExerciseData: ExerciseData[] = megaExercises.map((ex) => ({
  name: ex.name,
  category: primaryToCategory(ex.muscles_primary ?? []),
  muscles: [...(ex.muscles_primary ?? []), ...(ex.muscles_secondary ?? [])],
  equipment: mapMegaEquipment(ex.equipment),
}));

export function getMegaExerciseData(): ExerciseData[] {
  return megaExerciseData;
}

/** Lookup per naam (case-insensitive fallback). */
const megaByName = new Map<string, ExerciseData>(megaExerciseData.map((e) => [e.name, e]));

export function getMegaExerciseByName(name: string): ExerciseData | undefined {
  const exact = megaByName.get(name);
  if (exact) return exact;
  const lower = name.toLowerCase();
  for (const [n, data] of megaByName) {
    if (n.toLowerCase() === lower) return data;
  }
  return undefined;
}

/** Alle oefennamen uit de mega-DB. */
export function getMegaExerciseNames(): string[] {
  return megaExerciseData.map((e) => e.name);
}
