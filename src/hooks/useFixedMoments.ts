import { useEffect, useState } from 'react';
import { getMyStandingBookings } from '../services/classService';
import { getClassTypes } from '../services/classTypeService';
import { fixedMomentsOf, type FixedMoment } from '../utils/weekPlan';

/** Vaste momenten (PT en vaste lessen) van een sporter; leeg zonder sporter of bij een fout. */
export function useFixedMoments(userId: string | null | undefined): FixedMoment[] {
  const [moments, setMoments] = useState<FixedMoment[]>([]);
  useEffect(() => {
    if (!userId) {
      setMoments([]);
      return;
    }
    let cancelled = false;
    Promise.all([getMyStandingBookings(userId), getClassTypes()])
      .then(([standings, types]) => !cancelled && setMoments(fixedMomentsOf(standings, types)))
      .catch(() => !cancelled && setMoments([]));
    return () => {
      cancelled = true;
    };
  }, [userId]);
  return moments;
}
