/**
 * Titel in de paginakop die een scherm zelf mag zetten. Standaard staat daar de naam van het
 * tabblad ("Workouts"); een dieper scherm zoals de workout-detailweergave zet er zijn eigen naam
 * neer ("Push Pull Legs"), zoals in Figma. Bij het verlaten van dat scherm valt hij terug.
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

const PageTitleContext = createContext<{ title: string | null; setTitle: (t: string | null) => void } | null>(null);

export function PageTitleProvider({ children }: { children: ReactNode }) {
  const [title, setTitle] = useState<string | null>(null);
  return <PageTitleContext.Provider value={{ title, setTitle }}>{children}</PageTitleContext.Provider>;
}

/** De titel die een scherm heeft gezet, of null. */
export function usePageTitleOverride(): string | null {
  return useContext(PageTitleContext)?.title ?? null;
}

/** Zet de titel in de paginakop zolang dit scherm er is; null laat de naam van het tabblad staan. */
export function usePageTitle(title: string | null): void {
  const setTitle = useContext(PageTitleContext)?.setTitle;
  useEffect(() => {
    setTitle?.(title);
    return () => setTitle?.(null);
  }, [setTitle, title]);
}
