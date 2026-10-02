/**
 * Ledenlijsten voor staf, uit alle profielen van de studio (zie ProfileContext). Eén plek, zodat
 * de eerste keer laden en de live koppeling precies dezelfde lijsten maken.
 */
import type { Profile } from '../types';

function sortByName(list: Profile[]): Profile[] {
  const label = (p: Profile) => p.displayName || p.email || p.userId;
  return [...list].sort((a, b) => label(a).localeCompare(label(b), undefined, { sensitivity: 'base' }));
}

/**
 * - `sporters`: jouw eigen sporters (jij bent hun vaste trainer).
 * - `allSporters`: wie je kunt inschrijven of een schema geven: sporters plus staf die meetraint.
 * - `members`: iedereen behalve jezelf ("Bekijk als").
 */
export function rosterFromProfiles(everyone: Profile[], myUserId: string): { sporters: Profile[]; allSporters: Profile[]; members: Profile[] } {
  return {
    sporters: everyone.filter((p) => p.trainerId === myUserId),
    allSporters: sortByName(everyone.filter((m) => m.role === 'sporter' || (m.trainsAsMember && m.userId !== myUserId))),
    members: sortByName(everyone.filter((m) => m.userId !== myUserId)),
  };
}
