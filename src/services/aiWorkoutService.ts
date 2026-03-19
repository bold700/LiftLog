import type { SchemaDay } from '../types';

export interface GeneratedWorkout {
  name: string;
  days: SchemaDay[];
}

export async function generateWorkoutFromPrompt(prompt: string): Promise<GeneratedWorkout> {
  const response = await fetch('/api/generate-workout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message =
      typeof payload?.error === 'string'
        ? payload.error
        : 'Genereren mislukt. Probeer opnieuw.';
    throw new Error(message);
  }

  if (
    typeof payload?.name !== 'string' ||
    !Array.isArray(payload?.days) ||
    payload.days.length === 0
  ) {
    throw new Error('AI antwoordde, maar niet in het verwachte formaat.');
  }

  return {
    name: payload.name,
    days: payload.days as SchemaDay[],
  };
}
