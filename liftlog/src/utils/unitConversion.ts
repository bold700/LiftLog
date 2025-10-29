import { Unit } from '../types';

/**
 * Converteert kg naar lb
 */
export function kgToLb(kg: number): number {
  return kg * 2.20462;
}

/**
 * Converteert lb naar kg
 */
export function lbToKg(lb: number): number {
  return lb / 2.20462;
}

/**
 * Formatteert gewicht volgens unit
 */
export function formatWeight(weightKg: number, unit: Unit): string {
  if (unit === 'lb') {
    return `${kgToLb(weightKg).toFixed(1)} lb`;
  }
  return `${weightKg.toFixed(1)} kg`;
}

/**
 * Converteert gewicht voor display
 */
export function convertWeight(weightKg: number, unit: Unit): number {
  if (unit === 'lb') {
    return kgToLb(weightKg);
  }
  return weightKg;
}


