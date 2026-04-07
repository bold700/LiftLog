import { useEffect, useMemo, useState } from 'react';
import { apiUrl } from '../utils/apiOrigin';

export type ExerciseDbEquipmentFilter = 'all' | 'machine' | 'free_weight' | 'cable' | 'bodyweight' | 'other';

export function useExerciseDbSearch(
  term: string,
  limit = 25,
  equipment: ExerciseDbEquipmentFilter = 'all',
  muscleGroup: string | null = null
): string[] {
  const [options, setOptions] = useState<string[]>([]);

  const query = useMemo(() => term.trim(), [term]);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      const p = new URLSearchParams();
      if (query) p.set('q', query);
      p.set('limit', String(limit));
      if (equipment) p.set('equipment', equipment);
      if (muscleGroup && muscleGroup.trim()) p.set('muscleGroup', muscleGroup.trim());
      fetch(apiUrl(`/api/exercise-search?${p.toString()}`))
        .then((r) => r.json().catch(() => null))
        .then((data) => {
          if (cancelled) return;
          if (data && Array.isArray(data.options)) {
            setOptions(data.options.filter((v: unknown) => typeof v === 'string'));
            return;
          }
          setOptions([]);
        })
        .catch(() => {
          if (!cancelled) setOptions([]);
        });
    }, 220);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, limit, equipment, muscleGroup]);

  return options;
}

