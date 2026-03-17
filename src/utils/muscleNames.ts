/**
 * Gedeelde logica voor spiergroep-namen (normalisatie en weergave).
 * Gebruikt o.a. in SpiergroepenPage en MuscleFrequencyBody.
 */

export function normalizeMuscleName(muscleName: string): string {
  const normalized = muscleName.toLowerCase().trim();

  if (normalized.includes('borst') || normalized.includes('chest') || normalized.includes('pectoral')) {
    return 'Borst';
  }
  if (normalized.includes('biceps') || normalized.includes('bicep')) {
    return 'Biceps';
  }
  if (normalized.includes('triceps') || normalized.includes('tricep')) {
    return 'Triceps';
  }
  if (normalized.includes('schouder') || normalized.includes('shoulder') || normalized.includes('deltoid')) {
    return 'Schouders';
  }
  if (normalized.includes('rug') || normalized.includes('back') || normalized.includes('lat') || normalized.includes('trapezius') || normalized.includes('rhomboid')) {
    return 'Traps';
  }
  if (normalized.includes('buik') || normalized.includes('abdom') || normalized.includes('abs') || normalized.includes('core') || normalized.includes('rectus')) {
    return 'Buik';
  }
  if (normalized.includes('oblique')) {
    return 'Obliques';
  }
  if (normalized.includes('quad') || normalized.includes('thigh')) {
    return 'Quadriceps';
  }
  if (normalized.includes('kuit') || normalized.includes('calf') || normalized.includes('soleus') || normalized.includes('gastrocnemius')) {
    return 'Kuiten';
  }

  return muscleName;
}

const DISPLAY_NAMES: Record<string, string> = {
  Borst: 'Borst',
  Biceps: 'Biceps',
  Triceps: 'Triceps',
  Schouders: 'Schouders',
  Traps: 'Rug/Traps',
  Buik: 'Buikspieren',
  Obliques: 'Obliques',
  Quadriceps: 'Quadriceps',
  Quads: 'Quadriceps',
  Kuiten: 'Kuiten',
};

export function getDisplayName(muscleName: string): string {
  return DISPLAY_NAMES[muscleName] ?? muscleName;
}
