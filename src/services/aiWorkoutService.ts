import type { Formule7Routekaart, SchemaDay } from '../types';

export type AiWorkoutMode = 'free' | 'formule7';
export interface Formule7FollowUpQuestion {
  id: string;
  question: string;
  fieldKey?: string;
}

export interface GeneratedWorkout {
  name: string;
  days: SchemaDay[];
  formule7?: Formule7Routekaart;
  rationale?: {
    overall?: string;
    whyByDay: { dayLabel: string; why: string }[];
  };
}

export async function getFormule7FollowUpQuestions(
  prompt: string,
  existingAnswers: Record<string, string> = {}
): Promise<Formule7FollowUpQuestion[]> {
  const response = await fetch('/api/generate-workout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt,
      mode: 'formule7_questions',
      existingAnswers,
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      typeof payload?.error === 'string'
        ? payload.error
        : 'Vragen ophalen mislukt. Probeer opnieuw.';
    throw new Error(message);
  }

  if (!Array.isArray(payload?.questions)) return [];
  return (payload.questions as { id?: string; question?: string; fieldKey?: string }[])
    .map((q, i) => ({
      id: typeof q.id === 'string' && q.id.trim() ? q.id.trim() : `q_${i + 1}`,
      question: typeof q.question === 'string' ? q.question.trim() : '',
      fieldKey: typeof q.fieldKey === 'string' ? q.fieldKey.trim() : undefined,
    }))
    .filter((q) => q.question.length > 0)
    .slice(0, 12);
}

export async function generateWorkoutFromPrompt(
  prompt: string,
  options?: { mode?: AiWorkoutMode }
): Promise<GeneratedWorkout> {
  const mode = options?.mode ?? 'free';
  const response = await fetch('/api/generate-workout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, mode }),
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

  if (mode === 'formule7') {
    if (!payload.formule7 || typeof payload.formule7 !== 'object') {
      throw new Error('AI antwoordde zonder Formule 7-routekaart. Probeer opnieuw.');
    }
  }

  return {
    name: payload.name,
    days: payload.days as SchemaDay[],
    formule7: mode === 'formule7' ? (payload.formule7 as Formule7Routekaart) : undefined,
    rationale:
      payload?.rationale && typeof payload.rationale === 'object'
        ? {
            overall:
              typeof payload.rationale.overall === 'string' ? payload.rationale.overall : '',
            whyByDay: Array.isArray(payload.rationale.whyByDay)
              ? (payload.rationale.whyByDay as { dayLabel?: string; why?: string }[]).map(
                  (x) => ({
                    dayLabel: typeof x?.dayLabel === 'string' ? x.dayLabel : '',
                    why: typeof x?.why === 'string' ? x.why : '',
                  })
                )
              : [],
          }
        : undefined,
  };
}
