/**
 * Eén plek voor korte meldingen aan de gebruiker (fout of bevestiging), als Snackbar onderin.
 * Gebruik: const notify = useNotify(); notify.error('Opslaan mislukt.'); notify.success('Opgeslagen.');
 * Zo hoeft niet elk scherm zijn eigen foutweergave te bouwen en verdwijnen er geen fouten stil.
 */
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { Alert, Button, Snackbar } from '@mui/material';

type Severity = 'error' | 'success' | 'info';

export interface Notify {
  error: (message: string, err?: unknown) => void;
  success: (message: string) => void;
  info: (message: string) => void;
  /**
   * Bevestiging met "Ongedaan maken" (Material 3-snackbar), voor iets dat je per ongeluk kunt
   * wissen: dan geen extra "Weet je het zeker?", maar wel een weg terug.
   */
  undo: (message: string, onUndo: () => void | Promise<void>) => void;
}

const NotifyContext = createContext<Notify | null>(null);

/** Fallback buiten de provider (tests, losse componenten): alleen loggen. */
const consoleNotify: Notify = {
  error: (message, err) => console.error(message, err ?? ''),
  success: (message) => console.info(message),
  info: (message) => console.info(message),
  undo: (message) => console.info(message),
};

type Item = { key: number; severity: Severity; message: string; onUndo?: () => void | Promise<void> };

export function NotifyProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<Item | null>(null);
  const currentRef = useRef<Item | null>(null);
  currentRef.current = current;
  // Meldingen die wachten tot een "Ongedaan maken"-melding weg is: anders verdrong een melding die
  // direct erna kwam (bijv. "1 les bleef staan") de knop en was er geen weg terug meer.
  const queueRef = useRef<Item[]>([]);

  const show = useCallback((severity: Severity, message: string, onUndo?: () => void | Promise<void>) => {
    const item: Item = { key: Date.now() + Math.random(), severity, message, onUndo };
    if (currentRef.current?.onUndo && !onUndo) {
      queueRef.current.push(item);
      return;
    }
    queueRef.current = [];
    setCurrent(item);
  }, []);

  const close = useCallback(() => {
    setCurrent(queueRef.current.shift() ?? null);
  }, []);

  const value = useMemo<Notify>(
    () => ({
      error: (message, err) => {
        if (err !== undefined) console.error(message, err);
        show('error', message);
      },
      success: (message) => show('success', message),
      info: (message) => show('info', message),
      undo: (message, onUndo) => show('info', message, onUndo),
    }),
    [show]
  );

  return (
    <NotifyContext.Provider value={value}>
      {children}
      <Snackbar
        key={current?.key}
        open={current !== null}
        // Lange meldingen (bijv. welke lessen bleven staan) krijgen meer leestijd.
        autoHideDuration={current?.onUndo ? 6000 : Math.min(10000, Math.max(current?.severity === 'error' ? 6000 : 3500, (current?.message.length ?? 0) * 60))}
        onClose={(_, reason) => {
          if (reason === 'clickaway') return;
          close();
        }}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          severity={current?.severity ?? 'info'}
          variant="filled"
          onClose={close}
          action={
            current?.onUndo ? (
              <Button
                color="inherit"
                size="small"
                sx={{ fontWeight: 700 }}
                onClick={() => {
                  const undo = current.onUndo;
                  // Wat na het verwijderen in de wachtrij stond, gaat over het verwijderen: na terugzetten niet meer tonen.
                  queueRef.current = [];
                  setCurrent(null);
                  void undo?.();
                }}
              >
                Ongedaan maken
              </Button>
            ) : undefined
          }
          sx={{ width: '100%', borderRadius: 3 }}
        >
          {current?.message}
        </Alert>
      </Snackbar>
    </NotifyContext.Provider>
  );
}

export function useNotify(): Notify {
  return useContext(NotifyContext) ?? consoleNotify;
}
