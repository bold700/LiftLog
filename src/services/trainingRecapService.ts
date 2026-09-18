/**
 * Overdracht na een training: laat de server twee teksten schrijven op basis van wat er is
 * gelogd. De trainer kan ze daarna bijschrijven voordat ze weggaan.
 */
import { apiUrl } from '../utils/apiOrigin';
import { authHeaders } from '../utils/authHeaders';
import type { ExerciseEffort } from '../types';

export interface RecapExercise {
  name: string;
  weight?: number | null;
  sets?: number | null;
  reps?: number | null;
  effort?: ExerciseEffort | null;
  note?: string | null;
  /** Gewicht van de vorige keer, zodat het verschil in de tekst kan. */
  previousWeight?: number | null;
}

export interface TrainingRecap {
  /** Van collega tot collega: wat er is gedaan en waar de volgende keer op te letten. */
  handover: string;
  /** Kort bericht aan de sporter zelf. */
  toSporter: string;
}

export async function generateTrainingRecap(input: {
  sporterName: string;
  dayLabel: string;
  feeling?: number | null;
  sporterNote?: string | null;
  exercises: RecapExercise[];
}): Promise<TrainingRecap> {
  // Deelt het assistent-endpoint: Vercel telt elk bestand in api/ als een aparte functie.
  const res = await fetch(apiUrl('/api/assistant'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
    body: JSON.stringify({ action: 'recap', ...input }),
  });
  const data = (await res.json().catch(() => null)) as { handover?: string; toSporter?: string; error?: string } | null;
  if (!res.ok) throw new Error(data?.error || 'Samenvatten mislukt.');
  return { handover: String(data?.handover ?? ''), toSporter: String(data?.toSporter ?? '') };
}
