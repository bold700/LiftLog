/**
 * Wie mag de inloggegevens (e-mail, wachtwoord) van een ander zetten, zonder diens wachtwoord?
 * Dat gebeurt via Profiel → "Bekijk als" en Beheer → lid (api/admin-account.mjs, updateCredentials).
 *
 * Hoe hoger de rol van degene die je wijzigt, hoe minder mensen het mogen. Anders kan een trainer zo
 * het account van een beheerder overnemen:
 * - sporter: elke trainer of beheerder van de studio
 * - trainer: een beheerder
 * - beheerder: de eigenaar of support van BOLD700
 * - eigenaar: alleen support van BOLD700
 * - support van BOLD700: niemand; dat account beheert BOLD700 zelf
 *
 * Geeft null als het mag, anders de reden (Nederlands, voor in de app). Dezelfde regel staat in
 * src/utils/credentialRights.ts; de app gebruikt die alleen om de velden niet aan te bieden.
 */
export function credentialsRefusal({ callerUid, callerRole, callerIsSupport, ownerId, targetUid, targetRole, targetIsSupport }) {
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
