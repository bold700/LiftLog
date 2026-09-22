/**
 * Plaatsing van lessen in het weekrooster (Lessen → Week, tijdrooster zoals Google Agenda): welke uren
 * het rooster toont, en welke lessen naast elkaar moeten omdat ze elkaar overlappen.
 */

/** "HH:MM" → minuten sinds middernacht. */
export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

export interface Timed {
  startTime: string;
  endTime: string | null;
}

/** Een les zonder eindtijd duurt in het rooster een uur. */
export const DEFAULT_DURATION_MIN = 60;

function span(item: Timed): [number, number] {
  const start = toMinutes(item.startTime);
  const end = item.endTime ? toMinutes(item.endTime) : start + DEFAULT_DURATION_MIN;
  return [start, Math.max(end, start + 15)];
}

export interface Placed<T> {
  item: T;
  startMin: number;
  endMin: number;
  /** Kolom binnen de overlappende groep (0-gebaseerd). */
  lane: number;
  /** Aantal kolommen in die groep; de breedte is 1/lanes. */
  lanes: number;
}

/**
 * Lessen van één dag: vroegste eerst, overlappende lessen krijgen elk een eigen kolom. Een groep is
 * een reeks lessen die via overlap met elkaar verbonden zijn; binnen die groep delen ze de breedte.
 */
export function layoutDay<T extends Timed>(items: T[]): Placed<T>[] {
  const sorted = items
    .map((item) => {
      const [startMin, endMin] = span(item);
      return { item, startMin, endMin, lane: 0, lanes: 1 };
    })
    .sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);

  const out: Placed<T>[] = [];
  let group: Placed<T>[] = [];
  let laneEnds: number[] = [];
  let groupEnd = -1;
  const flush = () => {
    for (const p of group) p.lanes = laneEnds.length;
    out.push(...group);
    group = [];
    laneEnds = [];
  };

  for (const p of sorted) {
    if (group.length > 0 && p.startMin >= groupEnd) flush();
    let lane = laneEnds.findIndex((end) => end <= p.startMin);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(p.endMin);
    } else {
      laneEnds[lane] = p.endMin;
    }
    p.lane = lane;
    group.push(p);
    groupEnd = Math.max(groupEnd, p.endMin);
  }
  if (group.length > 0) flush();
  return out;
}

/**
 * Welke uren het rooster toont: van het uur van de vroegste les tot het uur waarin de laatste eindigt,
 * minstens zes uur breed. Zonder lessen: `fallback`.
 */
export function hourRange(items: Timed[], fallback: [number, number] = [7, 21]): [number, number] {
  if (items.length === 0) return fallback;
  let min = Infinity;
  let max = -Infinity;
  for (const item of items) {
    const [s, e] = span(item);
    min = Math.min(min, s);
    max = Math.max(max, e);
  }
  const start = Math.floor(min / 60);
  const end = Math.max(Math.ceil(max / 60), start + 6);
  return [Math.max(0, Math.min(start, 24 - 6)), Math.min(24, end)];
}
