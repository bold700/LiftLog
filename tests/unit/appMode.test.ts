import { describe, it, expect, afterEach } from 'vitest';
import { isNativeApp, isStandaloneApp } from '../../src/utils/appMode';

/**
 * Waarom dit getest wordt: op het antwoord van `isStandaloneApp()` hangt of Google-inloggen een
 * popup opent of doorstuurt. Zit die detectie ernaast, dan krijgt de gebruiker in de app een
 * popup die niets terug kan geven — precies de storing die deze functie moet voorkomen.
 *
 * De tests draaien in Node, dus er is geen echte `window`. We zetten er per geval zelf een neer;
 * dat maakt meteen zichtbaar op welke drie signalen de detectie precies leunt.
 */

interface FakeWindow {
  Capacitor?: { isNativePlatform?: () => boolean };
  navigator: { standalone?: boolean };
  matchMedia?: (_q: string) => { matches: boolean };
}

const g = globalThis as unknown as { window?: FakeWindow };

/** Zet een browseromgeving neer met de drie signalen waar de detectie naar kijkt. */
function browser(opts: { native?: boolean; nativeThrows?: boolean; iosStandalone?: boolean; displayMode?: boolean; noMatchMedia?: boolean } = {}) {
  const w: FakeWindow = {
    navigator: opts.iosStandalone ? { standalone: true } : {},
  };
  if (opts.nativeThrows) {
    w.Capacitor = {
      isNativePlatform: () => {
        throw new Error('boem');
      },
    };
  } else if (opts.native !== undefined) {
    w.Capacitor = { isNativePlatform: () => opts.native as boolean };
  }
  if (!opts.noMatchMedia) {
    w.matchMedia = (q: string) => ({ matches: Boolean(opts.displayMode) && q.includes('standalone') });
  }
  g.window = w;
}

afterEach(() => {
  delete g.window;
});

describe('appMode', () => {
  it('gewoon browsertabblad is niet standalone', () => {
    browser();
    expect(isNativeApp()).toBe(false);
    expect(isStandaloneApp()).toBe(false);
  });

  it('herkent de native app via Capacitor', () => {
    browser({ native: true });
    expect(isNativeApp()).toBe(true);
    expect(isStandaloneApp()).toBe(true);
  });

  it('Capacitor aanwezig maar niet native (web-build) telt niet als app', () => {
    browser({ native: false });
    expect(isNativeApp()).toBe(false);
    expect(isStandaloneApp()).toBe(false);
  });

  it('een kapotte Capacitor-schil laat de app niet omvallen', () => {
    browser({ nativeThrows: true });
    expect(isNativeApp()).toBe(false);
    expect(isStandaloneApp()).toBe(false);
  });

  it('herkent iOS vanaf het beginscherm via navigator.standalone', () => {
    browser({ iosStandalone: true });
    expect(isStandaloneApp()).toBe(true);
  });

  it('herkent standalone via display-mode', () => {
    browser({ displayMode: true });
    expect(isStandaloneApp()).toBe(true);
  });

  it('zonder matchMedia valt het terug op false in plaats van te struikelen', () => {
    browser({ noMatchMedia: true });
    expect(isStandaloneApp()).toBe(false);
  });

  it('zonder window (server-side) is er geen app-modus', () => {
    delete g.window;
    expect(isNativeApp()).toBe(false);
    expect(isStandaloneApp()).toBe(false);
  });
});
