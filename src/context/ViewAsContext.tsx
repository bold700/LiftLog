/**
 * "Bekijk als": welke sporter staat er op de inzichtenschermen?
 *
 * De keuze leeft alleen zolang de app open is. Bewust: als je morgen de app opent wil je je
 * eigen gegevens zien, niet die van de laatste sporter die je bekeek. Een gemiste balk boven
 * het scherm is een kleine ergernis; de verkeerde cijfers aanzien voor je eigen is een grote.
 */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useProfile } from './ProfileContext';
import { resolveViewedUser, type ViewAsSelection, type ViewedUser } from '../utils/viewAs';

interface ViewAsState {
  /** Van wie zie je de gegevens. */
  viewed: ViewedUser;
  /** Mag je überhaupt bij een ander kijken? Bepaalt of de keuzelijst zichtbaar is. */
  mayViewOthers: boolean;
  /** Kies een sporter, of null om weer naar jezelf te kijken. */
  setViewing: (selection: ViewAsSelection | null) => void;
}

const ViewAsContext = createContext<ViewAsState | null>(null);

export function ViewAsProvider({ children }: { children: ReactNode }) {
  const profile = useProfile();
  const [selection, setSelection] = useState<ViewAsSelection | null>(null);

  const ownUserId = profile?.profile?.userId ?? null;
  const ownName = profile?.profile?.displayName || profile?.profile?.email || 'Mijzelf';
  const mayViewOthers = profile?.isTrainer === true;

  const setViewing = useCallback((next: ViewAsSelection | null) => setSelection(next), []);

  const value = useMemo<ViewAsState>(
    () => ({
      viewed: resolveViewedUser(ownUserId, ownName, mayViewOthers, selection),
      mayViewOthers,
      setViewing,
    }),
    [ownUserId, ownName, mayViewOthers, selection, setViewing]
  );

  return <ViewAsContext.Provider value={value}>{children}</ViewAsContext.Provider>;
}

/**
 * Naar wie kijk je? Buiten de provider (of voor wie niets mag) krijg je jezelf terug, zodat
 * een scherm nooit hoeft te controleren of de context er wel is.
 */
export function useViewAs(): ViewAsState {
  const ctx = useContext(ViewAsContext);
  const profile = useProfile();
  const fallbackName = profile?.profile?.displayName || profile?.profile?.email || 'Mijzelf';
  const fallback = useMemo<ViewAsState>(
    () => ({
      viewed: { userId: profile?.profile?.userId ?? '', name: fallbackName, isOther: false },
      mayViewOthers: false,
      setViewing: () => {},
    }),
    [profile?.profile?.userId, fallbackName]
  );
  return ctx ?? fallback;
}
