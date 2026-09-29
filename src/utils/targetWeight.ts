/**
 * Doelgewicht per oefening, zodat je vóór de training al weet waar je op mikt.
 *
 * Staat er een doelgewicht in de workout, dan is dat het doel (de trainer besliste). Anders stelt
 * het systeem er een voor uit de vorige keer: te licht of alle herhalingen gehaald → een stapje
 * zwaarder, te zwaar → een stapje lichter, anders hetzelfde. De trainer kan het altijd overschrijven.
 */
import type { SchemaExercise } from '../types';
import type { PreviousPerformance } from './previousPerformance';

export interface TargetWeight {
  kg: number;
  /** 'schema': ingevuld door de trainer. 'suggested': voorstel uit de vorige keer. */
  kind: 'schema' | 'suggested';
  /** Waarom dit voorstel, kort: "vorige keer te licht". Leeg bij een doel uit de workout. */
  reason: string;
}

/** Stapgrootte bij dit gewicht: kleine dumbbells per kilo, daarna per 2 en vanaf 30 kg per 2,5. */
export function weightStep(kg: number): number {
  if (kg <= 12) return 1;
  if (kg < 30) return 2;
  return 2.5;
}

const round = (kg: number) => Math.round(kg * 10) / 10;

export function targetWeightFor(
  ex: Pick<SchemaExercise, 'targetWeight' | 'repsTarget'>,
  prev: PreviousPerformance | null | undefined
): TargetWeight | null {
  if (ex.targetWeight != null && ex.targetWeight > 0) return { kg: ex.targetWeight, kind: 'schema', reason: '' };
  const w = prev?.weight;
  if (!prev || w == null || w <= 0) return null;
  const step = weightStep(w);
  if (prev.effort === 'light') return { kg: round(w + step), kind: 'suggested', reason: 'vorige keer te licht' };
  if (prev.effort === 'heavy') {
    const down = round(w - step);
    return { kg: down > 0 ? down : w, kind: 'suggested', reason: 'vorige keer te zwaar' };
  }
  if (prev.reps != null && ex.repsTarget > 0 && prev.reps >= ex.repsTarget)
    return { kg: round(w + step), kind: 'suggested', reason: 'vorige keer alle herhalingen gehaald' };
  return { kg: w, kind: 'suggested', reason: 'zelfde als vorige keer' };
}

/** "22,5 kg". */
export const formatKg = (kg: number) => `${String(kg).replace('.', ',')} kg`;
