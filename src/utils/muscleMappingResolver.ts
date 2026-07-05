/**
 * Resolvet een oefeningnaam naar body-diagram-regio's ({primary, secondary}).
 * 1) Probeert de handmatige mapping (exerciseMuscleMapping.json) + metadata-aliassen.
 * 2) Valt terug op de gekochte ExerciseDB-dataset (target + secondaryMuscles).
 *
 * Zo kleuren ook de nieuwe dataset-oefeningen de "Meest getrainde spiergroepen".
 */
import exerciseMuscleMapping from '../data/exerciseMuscleMapping.json';
import exerciseGifIndex from '../data/exerciseGifIndex.json';
import { findExerciseMetadata } from '../data/exerciseMetadata';

export type MuscleMapping = { primary: string[]; secondary: string[] };

const manualMapping = exerciseMuscleMapping as Record<string, MuscleMapping>;

function norm(s: string): string {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\(.*?\)/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

type IndexEntry = { name: string; target?: string; secondaryMuscles?: string[] };
const datasetByNorm = new Map<string, IndexEntry>();
for (const e of exerciseGifIndex as IndexEntry[]) {
  const k = norm(e.name);
  if (!datasetByNorm.has(k)) datasetByNorm.set(k, e);
}

/** ExerciseDB-spiernaam → body-diagram regio-basis. `null` = geen zichtbare regio. */
const MUSCLE_TO_REGION: Record<string, string | null> = {
  // Romp voor
  abs: 'Abs',
  abdominals: 'Abs',
  'lower abs': 'Abs',
  core: 'Abs',
  obliques: 'Obliques',
  'serratus anterior': 'Obliques',
  pectorals: 'Chest',
  chest: 'Chest',
  'upper chest': 'Chest',
  // Armen
  biceps: 'Biceps',
  brachialis: 'Biceps',
  triceps: 'Triceps',
  forearms: 'Underarms',
  'wrist extensors': 'Underarms',
  'wrist flexors': 'Underarms',
  wrists: 'Underarms',
  'grip muscles': 'Underarms',
  hands: 'Underarms',
  // Schouders
  delts: 'Shoulders',
  deltoids: 'Shoulders',
  shoulders: 'Shoulders',
  'rotator cuff': 'Shoulders',
  'rear deltoids': 'Body Back Shoulders',
  // Rug
  lats: 'Body Back Lats',
  'latissimus dorsi': 'Body Back Lats',
  'upper back': 'Body Back Upper Back',
  back: 'Body Back Upper Back',
  rhomboids: 'Body Back Upper Back',
  'lower back': 'Body Back Lower Back',
  spine: 'Body Back Lower Back',
  traps: 'Body Back Traps',
  trapezius: 'Body Back Traps',
  'upper trapezius': 'Body Back Traps',
  'levator scapulae': 'Body Back Traps',
  // Benen
  quads: 'Quads',
  quadriceps: 'Quads',
  adductors: 'Quads',
  'inner thighs': 'Quads',
  groin: 'Quads',
  'hip flexors': 'Quads',
  hamstrings: 'Body Back Hamstrings',
  glutes: 'Body Back Gluteals',
  abductors: 'Body Back Gluteals',
  'gluteus medius': 'Body Back Gluteals',
  'gluteus minimus': 'Body Back Gluteals',
  piriformis: 'Body Back Gluteals',
  calves: 'Calves',
  gastrocnemius: 'Calves',
  soleus: 'Calves',
  'tibialis anterior': 'Calves',
  'tibialis posterior': 'Calves',
  shins: 'Calves',
  ankles: 'Calves',
  'ankle stabilizers': 'Calves',
  feet: 'Calves',
  // Nek → traps-omgeving
  'sternocleidomastoid': 'Body Back Traps',
  scalenes: 'Body Back Traps',
  // Overig / niet zichtbaar
  'cardiovascular system': null,
};

function regionFor(muscle: string): string | null {
  const key = norm(muscle);
  if (key in MUSCLE_TO_REGION) return MUSCLE_TO_REGION[key];
  // Losse heuristiek voor niet exact gemapte varianten
  if (key.includes('glute')) return 'Body Back Gluteals';
  if (key.includes('peroneus') || key.includes('extensor') || key.includes('flexor') || key.includes('hallucis') || key.includes('digitorum')) return 'Calves';
  if (key.includes('obturator') || key.includes('gemellus')) return 'Body Back Gluteals';
  if (key.includes('cervic') || key.includes('capitis') || key.includes('colli') || key.includes('suboccipital') || key.includes('splenius')) return 'Body Back Traps';
  return null;
}

function resolveFromDataset(name: string): MuscleMapping | null {
  const entry = datasetByNorm.get(norm(name));
  if (!entry) return null;
  const primary = new Set<string>();
  const secondary = new Set<string>();
  if (entry.target) {
    const r = regionFor(entry.target);
    if (r) primary.add(`${r} Primary`);
  }
  for (const m of entry.secondaryMuscles || []) {
    const r = regionFor(m);
    if (r) secondary.add(`${r} Secondary`);
  }
  if (primary.size === 0 && secondary.size === 0) return null;
  return { primary: [...primary], secondary: [...secondary] };
}

/** Handmatige mapping (exact / case-insensitive / via metadata-alias), anders dataset-fallback. */
export function getExerciseMuscleMapping(name: string): MuscleMapping | null {
  if (!name) return null;
  const metadata = findExerciseMetadata(name);
  const actual = metadata ? metadata.name : name;

  let mapping = manualMapping[actual] || manualMapping[name];
  if (!mapping) {
    const lower = actual.toLowerCase();
    for (const key in manualMapping) {
      if (key.toLowerCase() === lower) {
        mapping = manualMapping[key];
        break;
      }
    }
  }
  if (mapping) return mapping;
  return resolveFromDataset(name);
}
