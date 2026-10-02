import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isChunkLoadError, reloadForNewVersion } from '../../src/utils/staleChunk';

describe('isChunkLoadError', () => {
  it('herkent een ontbrekend JS-bestand na een nieuwe versie', () => {
    expect(
      isChunkLoadError(new TypeError('Failed to fetch dynamically imported module: https://lift-log-phi.vercel.app/assets/BeheerPage-C4YubHr_.js')),
    ).toBe(true);
    expect(isChunkLoadError(new TypeError('Importing a module script failed.'))).toBe(true); // Safari
    expect(isChunkLoadError(new Error('error loading dynamically imported module'))).toBe(true); // Firefox
    expect(isChunkLoadError(new Error('Unable to preload CSS for /assets/x.css'))).toBe(true);
  });

  it('andere fouten niet', () => {
    expect(isChunkLoadError(new TypeError("Cannot read properties of undefined (reading 'name')"))).toBe(false);
    expect(isChunkLoadError(null)).toBe(false);
  });
});

describe('reloadForNewVersion', () => {
  const store = new Map<string, string>();
  const reload = vi.fn();
  beforeEach(() => {
    store.clear();
    reload.mockClear();
    vi.stubGlobal('sessionStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    });
    vi.stubGlobal('window', { location: { reload } });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('herlaadt één keer, en niet nog eens binnen 30 seconden', () => {
    expect(reloadForNewVersion(1_000_000)).toBe(true);
    expect(reloadForNewVersion(1_010_000)).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(reloadForNewVersion(1_040_000)).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it('zonder sessionStorage niet automatisch herladen', () => {
    vi.stubGlobal('sessionStorage', {
      getItem: () => {
        throw new Error('geblokkeerd');
      },
    });
    expect(reloadForNewVersion()).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });
});
