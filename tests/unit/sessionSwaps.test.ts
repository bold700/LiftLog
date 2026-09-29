import { beforeEach, describe, expect, it } from 'vitest';
import { getSessionSwaps, setSessionSwap } from '../../src/utils/sessionSwaps';

const mem = new Map<string, string>();
beforeEach(() => {
  mem.clear();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => void mem.delete(k),
  };
});

describe('sessionSwaps', () => {
  it('bewaart een wissel per trainingsdag', () => {
    setSessionSwap('s1', 0, 2, 'Hammer Curl', 1000);
    expect(getSessionSwaps('s1', 0, 2000)).toEqual({ 2: 'Hammer Curl' });
    expect(getSessionSwaps('s1', 1, 2000)).toEqual({});
  });

  it('terug naar gepland haalt de wissel weg', () => {
    setSessionSwap('s1', 0, 2, 'Hammer Curl', 1000);
    expect(setSessionSwap('s1', 0, 2, null, 1500)).toEqual({});
    expect(getSessionSwaps('s1', 0, 2000)).toEqual({});
  });

  it('verloopt na 12 uur', () => {
    setSessionSwap('s1', 0, 0, 'Goblet Squat', 0);
    expect(getSessionSwaps('s1', 0, 13 * 60 * 60 * 1000)).toEqual({});
  });
});
