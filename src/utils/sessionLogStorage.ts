/**
 * Opslag voor trainingssessie-logs (log voor de hele training).
 * Eén log = één schema-dag op een datum, met optionele notitie.
 * Gebruikt in TrainingSessionView: "Notitie voor deze training" wordt hier opgeslagen.
 * Zie types.TrainingSessionLog.
 */
import type { TrainingSessionLog } from '../types';

const STORAGE_KEY = 'liftlog_session_logs';

export function getSessionLogs(): TrainingSessionLog[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

function saveSessionLogs(logs: TrainingSessionLog[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(logs));
  window.dispatchEvent(new Event('workoutUpdated'));
}

/** Vind een sessie-log voor deze datum + schema + dag (hooguit één). */
export function getSessionLog(
  date: string,
  schemaId: string,
  schemaDayIndex: number
): TrainingSessionLog | null {
  return (
    getSessionLogs().find(
      (log) =>
        log.date === date &&
        log.schemaId === schemaId &&
        log.schemaDayIndex === schemaDayIndex
    ) ?? null
  );
}

/** Sessie-logs voor een schema (alle dagen, alle datums). */
export function getSessionLogsForSchema(schemaId: string): TrainingSessionLog[] {
  return getSessionLogs()
    .filter((log) => log.schemaId === schemaId)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export function saveSessionLog(log: Omit<TrainingSessionLog, 'id'>): TrainingSessionLog {
  const logs = getSessionLogs();
  const existing = logs.findIndex(
    (l) =>
      l.date === log.date &&
      l.schemaId === log.schemaId &&
      l.schemaDayIndex === log.schemaDayIndex
  );
  const withId: TrainingSessionLog = {
    ...log,
    id: existing >= 0 ? logs[existing].id : `session-${Date.now()}`,
  };
  if (existing >= 0) {
    logs[existing] = withId;
  } else {
    logs.push(withId);
  }
  saveSessionLogs(logs);
  return withId;
}

export function deleteSessionLog(id: string): void {
  const logs = getSessionLogs().filter((l) => l.id !== id);
  saveSessionLogs(logs);
}
