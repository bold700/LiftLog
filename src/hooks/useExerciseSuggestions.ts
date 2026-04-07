import { useExerciseDbSearch } from './useExerciseDbSearch';

/**
 * Gecombineerde oefeningnamen (database + gebruikerslogs) voor Autocomplete/zoekvelden.
 * Eén bron voor alle pagina's die oefening-suggesties nodig hebben.
 */
export function useExerciseSuggestions(): string[] {
  return useExerciseDbSearch('', 50);
}
