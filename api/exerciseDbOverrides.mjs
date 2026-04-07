import { normalizeExerciseKey } from './exerciseCatalog.mjs';

/**
 * Handmatige overrides om lokale oefennamen stabiel aan een V2 exerciseId te koppelen.
 * Gebruik dit alleen wanneer fuzzy search structureel de verkeerde hit kiest.
 */
const RAW_OVERRIDES = {
  'rope cable curl': {
    exerciseId: 'exr_41n2hGioS8HumEF7',
    displayName: 'Hammer Curl',
  },
};

const OVERRIDES = new Map(
  Object.entries(RAW_OVERRIDES).map(([k, v]) => [normalizeExerciseKey(k), v])
);

export function resolveExerciseOverride(name) {
  if (typeof name !== 'string' || !name.trim()) return null;
  return OVERRIDES.get(normalizeExerciseKey(name)) || null;
}

