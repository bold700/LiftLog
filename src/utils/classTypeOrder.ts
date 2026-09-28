import type { ClassType } from '../types';

/**
 * Lessoorten op volgorde van de week: eerst het vroegste weekmoment (maandag eerst, dan de
 * begintijd), dan de naam. Lessoorten zonder vast moment staan achteraan, op naam.
 */
export function sortClassTypesByWeek<T extends Pick<ClassType, 'name' | 'schedule'>>(types: T[]): T[] {
  const firstSlot = (t: T) => {
    const keys = (t.schedule ?? []).map((s) => `${(s.weekday + 6) % 7}-${s.startTime}`).sort();
    return keys[0] ?? '9';
  };
  return [...types].sort(
    (a, b) => firstSlot(a).localeCompare(firstSlot(b)) || a.name.localeCompare(b.name, 'nl', { sensitivity: 'base' })
  );
}
