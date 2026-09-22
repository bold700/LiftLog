/**
 * Of de bovenbalk op de telefoon een terugpijl moet tonen i.p.v. (of naast) de paginatitel.
 *
 * Een dieper scherm binnen een tab (bijv. een trainingssessie binnen Workouts) meldt zich hier aan
 * in plaats van zelf een pijltje boven zijn eigen, scrollbare inhoud te tekenen — anders moet je
 * eerst terugscrollen voor je kan teruggaan. De knop roept altijd `window.history.back()` aan; het
 * scherm zelf luistert naar `popstate` om te bepalen wat "terug" betekent (zie SchemasPage.tsx).
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

const TopBarBackContext = createContext<{ show: boolean; setShow: (v: boolean) => void } | null>(null);

export function TopBarBackProvider({ children }: { children: ReactNode }) {
  const [show, setShow] = useState(false);
  return <TopBarBackContext.Provider value={{ show, setShow }}>{children}</TopBarBackContext.Provider>;
}

export function useTopBarBackVisible(): boolean {
  return useContext(TopBarBackContext)?.show ?? false;
}

/** Meld aan of dit scherm nu de terugpijl in de bovenbalk moet tonen. */
export function useShowBackButton(show: boolean): void {
  const ctx = useContext(TopBarBackContext);
  const setShow = ctx?.setShow;
  useEffect(() => {
    setShow?.(show);
    return () => setShow?.(false);
  }, [setShow, show]);
}
