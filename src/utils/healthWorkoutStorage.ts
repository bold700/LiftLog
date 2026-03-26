/**
 * Bewaart Apple Gezondheid-samenvattingen per trainingssessie (schema) of vrije log (datum).
 */
import type { AppleHealthWorkoutSummary } from '../plugins/healthWorkout';

const KEY_PREFIX = 'liftlog_health_summary';

export function healthSummaryKeyForSchema(
  date: string,
  schemaId: string,
  schemaDayIndex: number
): string {
  return `${KEY_PREFIX}_schema_${schemaId}_${schemaDayIndex}_${date}`;
}

export function healthSummaryKeyForFreeDay(date: string): string {
  return `${KEY_PREFIX}_free_${date}`;
}

export function getStoredHealthSummary(key: string): AppleHealthWorkoutSummary | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as AppleHealthWorkoutSummary;
  } catch {
    return null;
  }
}

export function setStoredHealthSummary(
  key: string,
  summary: AppleHealthWorkoutSummary
): void {
  localStorage.setItem(key, JSON.stringify(summary));
  window.dispatchEvent(new Event('healthWorkoutUpdated'));
}

export function clearStoredHealthSummary(key: string): void {
  localStorage.removeItem(key);
  window.dispatchEvent(new Event('healthWorkoutUpdated'));
}
