import { useState, useEffect, useCallback } from 'react';
import { getExerciseNames } from '../utils/storage';
import { getExerciseNames as getDbExerciseNames } from '../data/exercises';

/**
 * Gecombineerde oefeningnamen (database + gebruikerslogs) voor Autocomplete/zoekvelden.
 * Eén bron voor alle pagina's die oefening-suggesties nodig hebben.
 */
export function useExerciseSuggestions(): string[] {
  const [suggestions, setSuggestions] = useState<string[]>([]);

  const load = useCallback(() => {
    const db = getDbExerciseNames();
    const user = getExerciseNames();
    setSuggestions([...new Set([...db, ...user])].sort());
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return suggestions;
}
