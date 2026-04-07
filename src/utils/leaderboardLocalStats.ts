/**
 * Berekent lokale waarden voor de ranglijst uit localStorage (per oefening + gewicht, geen sets/reps).
 */
import { getWorkouts } from './storage';

export interface BestLift {
  exerciseName: string;
  weightKg: number;
}

const MAX_LIFTS_PER_PERIOD = 40;

export interface LeaderboardLocalMetrics {
  best7d: BestLift | null;
  best30d: BestLift | null;
  lifts7d: BestLift[];
  lifts30d: BestLift[];
}

/** Oefeningen hebben soms `YYYY-MM-DD`, soms volledige ISO (`toISOString()`). Alles naar lokale kalenderdag. */
function toLocalYmd(dateStr: string): string | null {
  const s = dateStr.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const ms = Date.parse(s);
  if (Number.isNaN(ms)) return null;
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseYmd(ymd: string): number {
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m || !d) return NaN;
  return new Date(y, m - 1, d).setHours(0, 0, 0, 0);
}

function startOfTodayLocal(): number {
  const t = new Date();
  return new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime();
}

function isDateWithinLastNDays(ymd: string, n: number): boolean {
  const day = parseYmd(ymd);
  if (Number.isNaN(day)) return false;
  const start = startOfTodayLocal() - (n - 1) * 24 * 60 * 60 * 1000;
  const end = startOfTodayLocal() + 24 * 60 * 60 * 1000 - 1;
  return day >= start && day <= end;
}

/** Zwaarste enkele log in de periode (alleen naam + gewicht; sets/reps tellen niet mee). Gelijk gewicht → meest recente datum wint. */
function findBestLiftInPeriod(nDays: number): BestLift | null {
  let best: { name: string; weight: number; day: number } | null = null;
  const workouts = getWorkouts();
  for (const w of workouts) {
    for (const ex of w.exercises) {
      const raw = ex.date || w.date;
      const ymd = raw ? toLocalYmd(String(raw)) : null;
      if (!ymd || !isDateWithinLastNDays(ymd, nDays)) continue;
      const name = ex.name?.trim();
      const weight = ex.weight;
      if (!name || weight == null || Number.isNaN(weight) || weight <= 0) continue;
      const wKg = Math.round(weight * 10) / 10;
      const day = parseYmd(ymd);
      if (Number.isNaN(day)) continue;
      if (
        !best ||
        wKg > best.weight ||
        (wKg === best.weight && day > best.day) ||
        (wKg === best.weight && day === best.day && name.localeCompare(best.name, 'nl', { sensitivity: 'base' }) < 0)
      ) {
        best = { name, weight: wKg, day };
      }
    }
  }
  return best ? { exerciseName: best.name, weightKg: best.weight } : null;
}

/** Elke logregel met naam + gewicht in het venster, gesorteerd zwaar → licht (voor ranglijst-weergave). */
function listAllLiftsInPeriod(nDays: number): BestLift[] {
  const workouts = getWorkouts();
  const out: BestLift[] = [];
  for (const w of workouts) {
    for (const ex of w.exercises) {
      const raw = ex.date || w.date;
      const ymd = raw ? toLocalYmd(String(raw)) : null;
      if (!ymd || !isDateWithinLastNDays(ymd, nDays)) continue;
      const name = ex.name?.trim();
      const weight = ex.weight;
      if (!name || weight == null || Number.isNaN(weight) || weight <= 0) continue;
      const wKg = Math.round(weight * 10) / 10;
      out.push({ exerciseName: name, weightKg: wKg });
    }
  }
  out.sort(
    (a, b) =>
      b.weightKg - a.weightKg ||
      a.exerciseName.localeCompare(b.exerciseName, 'nl', { sensitivity: 'base' })
  );
  return out.slice(0, MAX_LIFTS_PER_PERIOD);
}

export function computeLocalLeaderboardMetrics(): LeaderboardLocalMetrics {
  return {
    best7d: findBestLiftInPeriod(7),
    best30d: findBestLiftInPeriod(30),
    lifts7d: listAllLiftsInPeriod(7),
    lifts30d: listAllLiftsInPeriod(30),
  };
}
