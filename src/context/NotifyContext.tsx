/**
 * Eén plek voor korte meldingen aan de gebruiker (fout of bevestiging), als Snackbar onderin.
 * Gebruik: const notify = useNotify(); notify.error('Opslaan mislukt.'); notify.success('Opgeslagen.');
 * Zo hoeft niet elk scherm zijn eigen foutweergave te bouwen en verdwijnen er geen fouten stil.
 */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
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

export function NotifyProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<{ key: number; severity: Severity; message: string; onUndo?: () => void | Promise<void> } | null>(null);

  const show = useCallback((severity: Severity, message: string, onUndo?: () => void | Promise<void>) => {
    setCurrent({ key: Date.now(), severity, message, onUndo });
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
          setCurrent(null);
        }}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          severity={current?.severity ?? 'info'}
          variant="filled"
          onClose={() => setCurrent(null)}
          action={
            current?.onUndo ? (
              <Button
                color="inherit"
                size="small"
                sx={{ fontWeight: 700 }}
                onClick={() => {
                  const undo = current.onUndo;
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
