/**
 * Berekent geschatte 1RM met Epley formule
 * est1RM = weight_kg * (1 + reps / 30)
 */
export function calculate1RM(weightKg: number, reps: number): number {
  if (reps <= 0 || weightKg <= 0) return 0;
  if (reps === 1) return weightKg;
  return weightKg * (1 + reps / 30);
}

/**
 * Berekent geschat gewicht voor X reps met Epley formule (omgekeerd)
 */
export function calculateWeightForReps(oneRM: number, targetReps: number): number {
  if (targetReps <= 0 || oneRM <= 0) return 0;
  if (targetReps === 1) return oneRM;
  return oneRM / (1 + targetReps / 30);
}


