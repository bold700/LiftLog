import { createContext, useContext, useCallback, useState, ReactNode } from 'react';

export interface AddFromSchemaPrefill {
  exerciseName: string;
  sets: number;
  reps: number;
  /** Optioneel doelgewicht (kg) uit het schema – wordt vooringevuld zodat de gebruiker alleen gewicht hoeft te controleren en eventueel notitie (bijv. "maar 4 reps") kan toevoegen. */
  targetWeight?: number | null;
}

export interface ReturnToSession {
  schemaId: string;
  dayIndex: number;
  exerciseId?: string;
}

export interface AddFromSchemaContextValue {
  schemaId: string | null;
  schemaDayIndex: number | null;
  prefill: AddFromSchemaPrefill | null;
  returnToSession: ReturnToSession | null;
  openLogId: string | null;
  setAddFromSchema: (prefill: AddFromSchemaPrefill, schemaId: string, schemaDayIndex: number) => void;
  clearAddFromSchema: () => void;
  setReturnToSession: (schemaId: string, dayIndex: number, exerciseId?: string) => void;
  clearReturnToSession: () => void;
  goToLog: (exerciseId: string) => void;
  clearOpenLogId: () => void;
}

const AddFromSchemaContext = createContext<AddFromSchemaContextValue | null>(null);

export function AddFromSchemaProvider({
  children,
  onSwitchToAddTab,
  onSwitchToSchemasTab,
  onSwitchToLogsTab,
}: {
  children: ReactNode;
  onSwitchToAddTab: () => void;
  onSwitchToSchemasTab: () => void;
  onSwitchToLogsTab: () => void;
}) {
  const [state, setState] = useState<{
    prefill: AddFromSchemaPrefill | null;
    schemaId: string | null;
    schemaDayIndex: number | null;
    returnToSession: ReturnToSession | null;
    openLogId: string | null;
  }>({ prefill: null, schemaId: null, schemaDayIndex: null, returnToSession: null, openLogId: null });

  const setAddFromSchema = useCallback(
    (prefill: AddFromSchemaPrefill, schemaId: string, schemaDayIndex: number) => {
      setState((s) => ({ ...s, prefill, schemaId, schemaDayIndex, returnToSession: null }));
      onSwitchToAddTab();
    },
    [onSwitchToAddTab]
  );

  const clearAddFromSchema = useCallback(() => {
    setState((s) => ({ ...s, prefill: null, schemaId: null, schemaDayIndex: null }));
  }, []);

  const setReturnToSession = useCallback(
    (schemaId: string, dayIndex: number, exerciseId?: string) => {
      setState((s) => ({ ...s, returnToSession: { schemaId, dayIndex, exerciseId } }));
      onSwitchToSchemasTab();
    },
    [onSwitchToSchemasTab]
  );

  const clearReturnToSession = useCallback(() => {
    setState((s) => ({ ...s, returnToSession: null }));
  }, []);

  const goToLog = useCallback(
    (exerciseId: string) => {
      setState((s) => ({ ...s, openLogId: exerciseId }));
      onSwitchToLogsTab();
    },
    [onSwitchToLogsTab]
  );

  const clearOpenLogId = useCallback(() => {
    setState((s) => ({ ...s, openLogId: null }));
  }, []);

  const value: AddFromSchemaContextValue = {
    prefill: state.prefill,
    schemaId: state.schemaId,
    schemaDayIndex: state.schemaDayIndex,
    returnToSession: state.returnToSession,
    openLogId: state.openLogId,
    setAddFromSchema,
    clearAddFromSchema,
    setReturnToSession,
    clearReturnToSession,
    goToLog,
    clearOpenLogId,
  };

  return (
    <AddFromSchemaContext.Provider value={value}>
      {children}
    </AddFromSchemaContext.Provider>
  );
}

export function useAddFromSchema(): AddFromSchemaContextValue | null {
  return useContext(AddFromSchemaContext);
}
