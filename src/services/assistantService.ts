/**
 * Praten met de assistent in de app (api/assistant.mjs).
 *
 * De server doet het echte werk: hij authenticeert met het Firebase ID-token van de ingelogde
 * gebruiker en gebruikt dezelfde gereedschapskist als de AI-koppeling, met dezelfde rechten.
 */
import { auth } from '../firebase/config';
import { apiUrl } from '../utils/apiOrigin';

export interface AssistantMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AssistantReply {
  reply: string;
  /** Welke functies de assistent onderweg heeft gebruikt; handig om te tonen wat er gebeurd is. */
  steps: { tool: string; ok: boolean }[];
}

/** Leesbare namen voor wat de assistent onderweg deed. */
const STEP_LABELS: Record<string, string> = {
  get_profile: 'profiel bekeken',
  get_todays_workout: 'training van vandaag opgehaald',
  get_workout_plan: 'schema bekeken',
  get_recent_logs: 'logboek bekeken',
  get_class_workout: 'groepsles opgezocht',
  get_nutrition_day: 'voeding van de dag bekeken',
  search_food: 'voedingsmiddel opgezocht',
  get_progress: 'voortgang bekeken',
  list_athletes: 'sporters opgehaald',
  log_exercise: 'oefening gelogd',
  log_nutrition: 'voeding gelogd',
  log_measurement: 'meting vastgelegd',
  update_profile: 'profiel bijgewerkt',
  create_workout: 'schema aangemaakt',
  create_account: 'account aangemaakt',
  assign_workout: 'schema toegewezen',
};

export function labelForStep(tool: string): string {
  return STEP_LABELS[tool] ?? tool.replace(/_/g, ' ');
}

export async function askAssistant(messages: AssistantMessage[]): Promise<AssistantReply> {
  const user = auth?.currentUser;
  if (!user) throw new Error('Je bent niet ingelogd.');
  const token = await user.getIdToken();

  const res = await fetch(apiUrl('/api/assistant'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ messages }),
  });

  const data = (await res.json().catch(() => ({}))) as {
    reply?: string;
    steps?: { tool: string; ok: boolean }[];
    error?: string;
  };
  if (!res.ok) throw new Error(data.error || 'De assistent is even niet bereikbaar.');
  return { reply: data.reply ?? '', steps: data.steps ?? [] };
}
