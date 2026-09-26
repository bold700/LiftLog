/**
 * "Meest getraind" (Inzichten → Spieren): per spiergroep op hoeveel trainingsdagen hij primair
 * getraind is. Gebruikt dezelfde regio's als het lichaamsfiguur (`getExerciseMuscleMapping`),
 * zodat lijst en kleuring altijd over dezelfde spieren gaan.
 */
import type { Exercise } from '../types';

/** Regio (zonder " Primary") → naam in de lijst. Rug-delen tellen samen als "Rug". */
const REGION_LABELS: Record<string, string> = {
  Chest: 'Borst',
  Quads: 'Quadriceps',
  'Body Back Quads': 'Quadriceps',
  'Body Back Lats': 'Rug',
  'Body Back Upper Back': 'Rug',
  'Body Back Lower Back': 'Onderrug',
  Traps: 'Trapezius',
  'Body Back Traps': 'Trapezius',
  Shoulders: 'Schouders',
  'Body Back Shoulders': 'Schouders',
  'Body Back Hamstrings': 'Hamstrings',
  'Body Back Gluteals': 'Billen',
  Biceps: 'Biceps',
  Triceps: 'Triceps',
  'Body Back Tricpes': 'Triceps',
  Underarms: 'Onderarmen',
  'Body Back Underarm': 'Onderarmen',
  Abs: 'Buikspieren',
  Obliques: 'Schuine buikspieren',
  'Body Back Obliques': 'Schuine buikspieren',
  Calves: 'Kuiten',
  'Body Back Calves': 'Kuiten',
};

export function muscleLabel(region: string): string | null {
  return REGION_LABELS[region.replace(/ (Primary|Secondary)$/, '')] ?? null;
}

export interface MuscleSessions {
  label: string;
  sessions: number;
}

/** Trainingsdag = lokale kalenderdag van de log. */
export function dayKey(date: string): string | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(date.trim())) return date.trim();
  const ms = Date.parse(date);
  if (Number.isNaN(ms)) return null;
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function countMuscleSessions(
  exercises: Exercise[],
  primaryRegions: (exerciseName: string) => string[]
): MuscleSessions[] {
  const days = new Map<string, Set<string>>();
  for (const ex of exercises) {
    const name = ex.name?.trim();
    const day = name && ex.date ? dayKey(ex.date) : null;
    if (!name || !day) continue;
    for (const region of primaryRegions(name)) {
      const label = muscleLabel(region);
      if (!label) continue;
      if (!days.has(label)) days.set(label, new Set());
      days.get(label)!.add(day);
    }
  }
  return [...days.entries()]
    .map(([label, set]) => ({ label, sessions: set.size }))
    .sort((a, b) => b.sessions - a.sessions || a.label.localeCompare(b.label, 'nl'));
}
