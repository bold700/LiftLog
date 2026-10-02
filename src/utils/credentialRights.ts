/**
 * Wie mag de inloggegevens van een ander zetten? Zelfde regel als api/_lib/credentialRights.mjs (daar
 * de uitleg). De server beslist; de app gebruikt dit alleen om de velden niet aan te bieden.
 */
import type { ProfileRole } from '../types';

interface Args {
  callerUid: string;
  callerRole: ProfileRole | undefined;
  callerIsSupport: boolean;
  ownerId: string | null;
  targetUid: string;
  targetRole: ProfileRole | undefined;
  targetIsSupport: boolean;
}

export function credentialsRefusal({ callerUid, callerRole, callerIsSupport, ownerId, targetUid, targetRole, targetIsSupport }: Args): string | null {
  if (callerRole !== 'trainer' && callerRole !== 'admin') {
    return 'Alleen trainers en beheerders mogen accountgegevens van een ander wijzigen.';
  }
  if (targetIsSupport) return 'Dit is een account van BOLD700 Support; dat beheert BOLD700 zelf.';
  const isOwner = !!ownerId && targetUid === ownerId;
  if (isOwner) {
    return callerIsSupport ? null : 'Alleen de eigenaar zelf of BOLD700 Support kan de inloggegevens van de eigenaar wijzigen.';
  }
  if (targetRole === 'admin') {
    return callerIsSupport || (!!ownerId && callerUid === ownerId)
      ? null
      : 'Alleen de eigenaar van de studio of BOLD700 Support kan de inloggegevens van een beheerder wijzigen.';
  }
  if (targetRole === 'trainer') {
    return callerRole === 'admin' ? null : 'Alleen een beheerder kan de inloggegevens van een trainer wijzigen.';
  }
  return null;
}
