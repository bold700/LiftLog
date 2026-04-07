const STORAGE_KEY = 'liftlog_day_completions';

export interface DayCompletion {
  schemaId: string;
  schemaDayIndex: number;
  completedAt: string; // ISO
}

/** Kalenderdatums (YYYY-MM-DD) waarop minstens één schema-dag als voltooid is gemarkeerd. */
export function getCompletionCalendarDates(): string[] {
  const out = new Set<string>();
  for (const c of getCompletions()) {
    out.add(new Date(c.completedAt).toISOString().slice(0, 10));
  }
  return [...out];
}

function getCompletions(): DayCompletion[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function setCompletions(list: DayCompletion[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

/** Markeer een schema-dag als voltooid (in één keer, zonder per oefening te loggen). */
export function markDayComplete(schemaId: string, schemaDayIndex: number): void {
  const list = getCompletions();
  const now = new Date().toISOString();
  list.push({ schemaId, schemaDayIndex, completedAt: now });
  setCompletions(list);
  window.dispatchEvent(new Event('dayCompletionUpdated'));
}

/** Handmatig resetten van de voltooid-markering voor een schema-dag. */
export function clearDayComplete(schemaId: string, schemaDayIndex: number): void {
  const list = getCompletions().filter(
    (c) => !(c.schemaId === schemaId && c.schemaDayIndex === schemaDayIndex)
  );
  setCompletions(list);
  window.dispatchEvent(new Event('dayCompletionUpdated'));
}

const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;

/** Of deze dag in de laatste 12 uur als voltooid is gemarkeerd (zonder logs). */
export function isDayMarkedCompleteInLast12Hours(
  schemaId: string,
  schemaDayIndex: number
): boolean {
  const list = getCompletions();
  const now = Date.now();
  return list.some(
    (c) =>
      c.schemaId === schemaId &&
      c.schemaDayIndex === schemaDayIndex &&
      now - new Date(c.completedAt).getTime() < TWELVE_HOURS_MS
  );
}

/** Meest recente completedAt voor deze dag (binnen 12h); 0 als niet gemarkeerd. */
export function getMarkedCompleteTime(
  schemaId: string,
  schemaDayIndex: number
): number {
  const list = getCompletions();
  const now = Date.now();
  let latest = 0;
  for (const c of list) {
    if (c.schemaId !== schemaId || c.schemaDayIndex !== schemaDayIndex) continue;
    const t = new Date(c.completedAt).getTime();
    if (now - t < TWELVE_HOURS_MS && t > latest) latest = t;
  }
  return latest;
}
