import { createContext, useContext, useCallback, useRef, useState, ReactNode } from 'react';

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
  /**
   * Voor wie de trainer nu logt: het userId van de sporter, of '' voor zichzelf. Staat hier en
   * niet in een scherm, zodat de keuze blijft staan terwijl je van de training naar het
   * logformulier en terug loopt.
   */
  logTargetId: string;
  setLogTargetId: (userId: string) => void;
  /**
   * Zet de sporter waar een workout aan hangt als startkeuze, maar één keer per workout: kiest de
   * trainer daarna bewust iets anders, dan blijft dat staan als hij tussendoor een log invult.
   */
  applyDefaultLogTarget: (schemaId: string, userId: string) => void;
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
  const [logTargetId, setLogTargetId] = useState('');
  const defaultedForSchema = useRef<string | null>(null);
  const applyDefaultLogTarget = useCallback((schemaId: string, userId: string) => {
    if (defaultedForSchema.current === schemaId) return;
    defaultedForSchema.current = schemaId;
    setLogTargetId(userId);
  }, []);

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
    logTargetId,
    setLogTargetId,
    applyDefaultLogTarget,
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
