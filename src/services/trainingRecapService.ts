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

/** Iets onder de 60 seconden die de serverfunctie zelf krijgt. */
const TIMEOUT_MS = 45_000;

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
  //
  // De harde afkap is er omdat een verzoek dat blijft hangen anders een eindeloos draaiend
  // molentje oplevert waar de trainer niets mee kan. De serverfunctie stopt zelf na 60 seconden;
  // iets daaronder afkappen betekent dat je altijd een bruikbare melding krijgt in plaats van niets.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(apiUrl('/api/assistant'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
      body: JSON.stringify({ action: 'recap', ...input }),
      signal: controller.signal,
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new Error('Het duurde te lang (meer dan 45 seconden). Schrijf de overdracht zelf of probeer het opnieuw.');
    }
    throw new Error('Geen verbinding met de server. Controleer je internet en probeer het opnieuw.');
  } finally {
    clearTimeout(timer);
  }

  const data = (await res.json().catch(() => null)) as { handover?: string; toSporter?: string; error?: string } | null;
  // Het nummer erbij: zonder dat is "mislukt" niet te onderscheiden van een storing bij de AI,
  // een verlopen sessie of een limiet, en valt er achteraf niets uit te zoeken.
  if (!res.ok) throw new Error(data?.error || `Samenvatten mislukt (foutcode ${res.status}).`);
  return { handover: String(data?.handover ?? ''), toSporter: String(data?.toSporter ?? '') };
}
