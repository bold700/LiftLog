import { SetLog } from '../types';

/**
 * Berekent volume (gewicht * reps) voor een set
 */
export function calculateVolume(weightKg: number, reps: number): number {
  return weightKg * reps;
}

/**
 * Berekent totaal volume voor meerdere sets
 */
export function calculateTotalVolume(sets: SetLog[]): number {
  return sets.reduce((total, set) => total + calculateVolume(set.weight_kg, set.reps), 0);
}

/**
 * Berekent gemiddeld gewicht voor sets
 */
export function calculateAverageWeight(sets: SetLog[]): number {
  if (sets.length === 0) return 0;
  const total = sets.reduce((sum, set) => sum + set.weight_kg, 0);
  return total / sets.length;
}

/**
 * Groepeert sets per week voor volume berekening
 */
export function groupByWeek(sets: SetLog[]): Map<string, SetLog[]> {
  const grouped = new Map<string, SetLog[]>();
  
  sets.forEach((set) => {
    const date = new Date(set.performed_at);
    const weekStart = new Date(date);
    weekStart.setDate(date.getDate() - date.getDay());
    weekStart.setHours(0, 0, 0, 0);
    const weekKey = weekStart.toISOString().split('T')[0];
    
    if (!grouped.has(weekKey)) {
      grouped.set(weekKey, []);
    }
    grouped.get(weekKey)!.push(set);
  });
  
  return grouped;
}


