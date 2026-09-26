/**
 * Licht of donker. De gebruiker kiest in Profiel → Account: Systeem (volgt de telefoon of
 * computer), Licht of Donker. De keuze is per apparaat, zoals bij de meeste apps: een telefoon
 * in nachtmodus en een laptop overdag hoeven niet hetzelfde te doen.
 *
 * De kleuren zelf komen uit het Material 3-schema (theme/brandingTheme.ts): het donkere schema is
 * afgeleid van dezelfde bronkleur als het lichte, ook voor een studio met een eigen huisstijl.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Capacitor } from '@capacitor/core';
import { defaultScheme, setActiveScheme, type ColorMode } from '../theme/brandingTheme';

export type ColorModePreference = 'system' | ColorMode;

const STORAGE_KEY = 'vorm.colorMode';
const QUERY = '(prefers-color-scheme: dark)';

function readPreference(): ColorModePreference {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'light' || v === 'dark' || v === 'system' ? v : 'system';
  } catch {
    return 'system';
  }
}

function systemIsDark(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(QUERY).matches;
}

/** Welke modus er echt op het scherm komt. */
export function resolveColorMode(pref: ColorModePreference, systemDark: boolean): ColorMode {
  return pref === 'system' ? (systemDark ? 'dark' : 'light') : pref;
}

interface ColorModeValue {
  preference: ColorModePreference;
  setPreference: (p: ColorModePreference) => void;
  mode: ColorMode;
}

const ColorModeContext = createContext<ColorModeValue>({ preference: 'system', setPreference: () => {}, mode: 'light' });

export function ColorModeProvider({ children }: { children: ReactNode }) {
  const [preference, setPref] = useState<ColorModePreference>(readPreference);
  const [systemDark, setSystemDark] = useState(systemIsDark);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(QUERY);
    const onChange = () => setSystemDark(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const setPreference = useCallback((p: ColorModePreference) => {
    setPref(p);
    try {
      localStorage.setItem(STORAGE_KEY, p);
    } catch {
      // Geen opslag (privévenster): dan geldt de keuze alleen deze sessie.
    }
  }, []);

  const mode = resolveColorMode(preference, systemDark);
  // Meteen VORM in de juiste modus op het scherm, ook vóór het inloggen en terwijl de studio laadt.
  // BrandingContext (dieper in de boom) zet daarna het schema van de studio.
  useMemo(() => setActiveScheme(defaultScheme(mode), mode), [mode]);

  // Statusbalk van de iPhone- en Android-app: lichte tekst op donker, donkere tekst op licht.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    void import('@capacitor/status-bar')
      .then(({ StatusBar, Style }) => StatusBar.setStyle({ style: mode === 'dark' ? Style.Dark : Style.Light }))
      .catch(() => undefined);
  }, [mode]);

  const value = useMemo(() => ({ preference, setPreference, mode }), [preference, setPreference, mode]);
  return <ColorModeContext.Provider value={value}>{children}</ColorModeContext.Provider>;
}

export function useColorMode(): ColorModeValue {
  return useContext(ColorModeContext);
}
