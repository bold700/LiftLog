import { useExerciseDbSearch } from './useExerciseDbSearch';

/**
 * Oefeningnamen voor Autocomplete/zoekvelden, gefilterd op de live zoekterm. Zonder `term` (of een
 * lege) krijg je de eerste alfabetische reeks — bedoeld als startlijst, niet als volledig
 * zoekresultaat: eerder werd hier altijd met een lege term gezocht, waardoor typen niets deed
 * buiten de vaste eerste 50 namen (elke andere oefening, ook op de exacte naam, gaf "geen opties").
 */
export function useExerciseSuggestions(term = ''): string[] {
  return useExerciseDbSearch(term, 50);
}
