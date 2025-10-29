import { SetLog } from '../types';

/**
 * Controleert of een set een PR is door te vergelijken met eerdere sets
 * PR = nieuw hoogste gewicht OF meer reps bijzelfde gewicht
 */
export function checkIsPR(
  currentSet: { weight_kg: number; reps: number },
  previousSets: SetLog[]
): boolean {
  if (previousSets.length === 0) return true;

  const sameWeightSets = previousSets.filter(
    (s) => s.weight_kg === currentSet.weight_kg
  );
  const higherWeightSets = previousSets.filter(
    (s) => s.weight_kg > currentSet.weight_kg
  );

  // Als er sets met hoger gewicht zijn, is dit geen PR voor gewicht
  if (higherWeightSets.length > 0) {
    // Check of dit meer reps zijn bij dit gewicht dan ooit
    const maxRepsAtWeight = Math.max(
      ...sameWeightSets.map((s) => s.reps),
      0
    );
    return currentSet.reps > maxRepsAtWeight;
  }

  // Nieuw hoogste gewicht = PR
  if (sameWeightSets.length === 0) {
    return true;
  }

  // Meer reps bijzelfde gewicht = PR
  const maxRepsAtWeight = Math.max(...sameWeightSets.map((s) => s.reps), 0);
  return currentSet.reps > maxRepsAtWeight;
}

/**
 * Haalt de hoogste gewicht en reps op voor een oefening
 */
export function getMaxForExercise(sets: SetLog[]): {
  maxWeight: number;
  maxReps: number;
} {
  if (sets.length === 0) {
    return { maxWeight: 0, maxReps: 0 };
  }

  const maxWeight = Math.max(...sets.map((s) => s.weight_kg));
  const maxWeightSet = sets.find((s) => s.weight_kg === maxWeight);
  const maxReps = maxWeightSet?.reps || 0;

  return { maxWeight, maxReps };
}


