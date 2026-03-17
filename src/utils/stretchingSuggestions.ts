/**
 * Stretching-voorstellen op basis van oefeningen in het schema.
 * Haalt spiergroepen uit exercise metadata en normaliseert voor de stretching-sectie.
 */
import { findExerciseMetadata } from '../data/exerciseMetadata';
import { normalizeMuscleName, getDisplayName } from './muscleNames';

/**
 * Geeft unieke spiergroepen terug op basis van de gegeven oefennamen.
 * Gebruikt primaire en secundaire spieren uit de metadata; namen worden genormaliseerd en in displayvorm (bijv. "Rug/Traps").
 */
export function getMuscleGroupsFromExerciseNames(exerciseNames: string[]): string[] {
  const groups = new Set<string>();
  for (const name of exerciseNames) {
    const meta = findExerciseMetadata(name);
    if (!meta) continue;
    for (const m of [...meta.primaryMuscles, ...meta.secondaryMuscles]) {
      const normalized = normalizeMuscleName(m);
      if (normalized.trim()) groups.add(getDisplayName(normalized));
    }
  }
  return Array.from(groups).sort();
}
