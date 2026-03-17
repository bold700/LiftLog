/**
 * Gedeelde spiergroep-filter voor oefenlijsten (AddPage logs, SchemaEditView schema).
 */
import exerciseMuscleMapping from '../data/exerciseMuscleMapping.json';
import { findExerciseMetadata } from '../data/exerciseMetadata';

export const MUSCLE_GROUP_OPTIONS = [
  'Borst',
  'Biceps',
  'Triceps',
  'Schouders',
  'Buikspieren',
  'Obliques',
  'Quadriceps',
  'Kuiten',
  'Traps',
  'Lats',
  'Upper Back',
  'Lower Back',
  'Hamstrings',
  'Gluteals',
  'Underarms',
] as const;

const muscleDisplayToMapping: Record<string, string[]> = {
  Borst: ['Chest Primary', 'Chest Secondary'],
  Biceps: ['Biceps Primary', 'Biceps Secondary'],
  Triceps: ['Triceps Primary', 'Triceps Secondary', 'Body Back Tricpes Primary', 'Body Back Tricpes Secondary'],
  Schouders: ['Shoulders Primary', 'Shoulders Secondary', 'Body Back Shoulders Primary', 'Body Back Shoulders Secondary'],
  Traps: ['Traps Primary', 'Traps Secondary', 'Body Back Traps Primary', 'Body Back Traps Secondary'],
  Lats: ['Body Back Lats Primary', 'Body Back Lats Secondary'],
  'Upper Back': ['Body Back Upper Back Primary', 'Body Back Upper Back Secondary'],
  'Lower Back': ['Body Back Lower Back Primary', 'Body Back Lower Back Secondary'],
  Buikspieren: ['Abs Primary', 'Abs Secondary'],
  Obliques: ['Obliques Primary', 'Obliques Secondary', 'Body Back Obliques Primary', 'Body Back Obliques Secondary'],
  Quadriceps: ['Quads Primary', 'Quads Secondary', 'Body Back Quads Primary', 'Body Back Quads Secondary'],
  Kuiten: ['Calves Primary', 'Calves Secondary', 'Body Back Calves Primary', 'Body Back Calves Secondary'],
  Hamstrings: ['Body Back Hamstrings Primary', 'Body Back Hamstrings Secondary'],
  Gluteals: ['Body Back Gluteals Primary', 'Body Back Gluteals Secondary'],
  Underarms: ['Underarms Primary', 'Underarms Secondary', 'Body Back Underarm Primary', 'Body Back Underarm Secondary'],
};

const mappingData = exerciseMuscleMapping as Record<string, { primary: string[]; secondary: string[] }>;

/**
 * Filtert oefeningnamen op spiergroep (zelfde logica als AddPage).
 * Bij null/leeg: retourneert de oorspronkelijke lijst.
 */
export function filterExerciseNamesByMuscleGroup(
  exerciseNames: string[],
  muscleGroup: string | null
): string[] {
  if (!muscleGroup || !muscleGroup.trim()) return exerciseNames;
  const mappingNames = muscleDisplayToMapping[muscleGroup] ?? [];
  if (mappingNames.length === 0) return exerciseNames;

  return exerciseNames.filter((name) => {
    const metadata = findExerciseMetadata(name);
    const actualName = metadata ? metadata.name : name;
    let mapping = mappingData[actualName];
    if (!mapping) {
      const lower = actualName.toLowerCase();
      for (const key in mappingData) {
        if (key.toLowerCase() === lower) {
          mapping = mappingData[key];
          break;
        }
      }
    }
    if (!mapping) return false;
    const allMuscles = [...(mapping.primary ?? []), ...(mapping.secondary ?? [])];
    return mappingNames.some((mappingName) => {
      const baseName = mappingName.replace(' Primary', '').replace(' Secondary', '');
      return allMuscles.some((muscle) => {
        const muscleBase = muscle.replace(' Primary', '').replace(' Secondary', '');
        return muscleBase === baseName || muscle.includes(baseName);
      });
    });
  });
}
