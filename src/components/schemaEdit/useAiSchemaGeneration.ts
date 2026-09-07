/**
 * AI-generatieflow van SchemaEditView: casus-prompt, aanvullende vragen/antwoorden,
 * laden/fout, rationale, wizard-stap en of de volledige editor al ontgrendeld is.
 * Het resultaat (naam, dagen, routekaart, startdatum) wordt via onApplyGenerated
 * aan de eigenaar van die state teruggegeven.
 */
import { useState, useEffect, useCallback } from 'react';
import type { Schema, SchemaDay, Formule7Routekaart } from '../../types';
import {
  generateWorkoutFromPrompt,
  getFormule7FollowUpQuestions,
  type Formule7FollowUpQuestion,
} from '../../services/aiWorkoutService';
import {
  postProcessFormule7Ai,
  schemaHasMeaningfulF7Content,
} from '../../utils/formule7AiPostProcess';

/** Wat de AI opleverde en in de editor-state gezet moet worden. */
export interface AiGeneratedResult {
  name: string;
  days: SchemaDay[];
  /** Alleen gezet bij Formule 7 wanneer de AI een routekaart teruggaf. */
  formule7?: Formule7Routekaart;
  /** Alleen gezet bij Formule 7 met routekaart en geldige periodestart. */
  periodStartDate?: string;
}

export type AiRationale = {
  overall?: string;
  whyByDay: { dayLabel: string; why: string }[];
};

export interface UseAiSchemaGenerationArgs {
  schema: Schema;
  onApplyGenerated: (result: AiGeneratedResult) => void;
}

function initialEditorUnlocked(schema: Schema): boolean {
  if (!schema.isFormule7Template || schema.formule7AssistMode !== 'ai') return true;
  return schemaHasMeaningfulF7Content(schema);
}

export function useAiSchemaGeneration({ schema, onApplyGenerated }: UseAiSchemaGenerationArgs) {
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiQuestionsLoading, setAiQuestionsLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiQuestions, setAiQuestions] = useState<Formule7FollowUpQuestion[]>([]);
  const [aiAnswers, setAiAnswers] = useState<Record<string, string>>({});
  const [aiRationale, setAiRationale] = useState<null | AiRationale>(null);
  const [aiWizardStep, setAiWizardStep] = useState(0);
  const [aiEditorUnlocked, setAiEditorUnlocked] = useState(() => initialEditorUnlocked(schema));

  // AI-state alleen resetten bij wissel van schema
  useEffect(() => {
    setAiQuestions([]);
    setAiAnswers({});
    setAiError(null);
    setAiRationale(null);
    setAiWizardStep(0);
    setAiEditorUnlocked(initialEditorUnlocked(schema));
  }, [schema.id]);

  const handleGenerateWithAi = useCallback(async () => {
    const text = aiPrompt.trim();
    if (!text || aiGenerating) return;
    setAiGenerating(true);
    setAiError(null);
    setAiRationale(null);
    try {
      const mode = schema.isFormule7Template ? 'formule7' : 'free';
      const answersText =
        mode === 'formule7'
          ? aiQuestions
              .map((q) => {
                const answer = aiAnswers[q.id]?.trim() ?? '';
                return answer ? `${q.question}\nAntwoord: ${answer}` : '';
              })
              .filter(Boolean)
              .join('\n\n')
          : '';
      const mergedPrompt =
        mode === 'formule7' && answersText
          ? `${text}\n\nAanvullende antwoorden:\n${answersText}`
          : text;
      const generated = await generateWorkoutFromPrompt(mergedPrompt, { mode });
      const name =
        generated.name.trim() ||
        (mode === 'formule7' ? 'Formule 7 workout' : 'AI Workout');
      if (mode === 'formule7' && generated.formule7) {
        const { formule7: f7, days: d } = postProcessFormule7Ai(
          generated.formule7,
          generated.days
        );
        onApplyGenerated({
          name,
          formule7: f7,
          days: d,
          ...(generated.periodStartDate && { periodStartDate: generated.periodStartDate }),
        });
      } else {
        onApplyGenerated({ name, days: generated.days });
      }
      setAiRationale(generated.rationale ?? null);
      if (mode === 'formule7') setAiEditorUnlocked(true);
    } catch (error) {
      setAiError(error instanceof Error ? error.message : 'Genereren mislukt. Probeer opnieuw.');
    } finally {
      setAiGenerating(false);
    }
  }, [aiPrompt, aiGenerating, schema.isFormule7Template, aiQuestions, aiAnswers, onApplyGenerated]);

  const handleGetFollowUpQuestions = useCallback(async (): Promise<boolean> => {
    const text = aiPrompt.trim();
    if (!text || aiQuestionsLoading) return false;
    setAiQuestionsLoading(true);
    setAiError(null);
    try {
      const questions = await getFormule7FollowUpQuestions(text, aiAnswers);
      setAiQuestions(questions);
      return true;
    } catch (error) {
      setAiError(
        error instanceof Error ? error.message : 'Aanvullende vragen ophalen mislukt.'
      );
      return false;
    } finally {
      setAiQuestionsLoading(false);
    }
  }, [aiPrompt, aiQuestionsLoading, aiAnswers]);

  return {
    aiPrompt,
    setAiPrompt,
    aiGenerating,
    aiQuestionsLoading,
    aiError,
    aiQuestions,
    aiAnswers,
    setAiAnswers,
    aiRationale,
    aiWizardStep,
    setAiWizardStep,
    aiEditorUnlocked,
    setAiEditorUnlocked,
    handleGenerateWithAi,
    handleGetFollowUpQuestions,
  };
}

export type AiSchemaGeneration = ReturnType<typeof useAiSchemaGeneration>;
