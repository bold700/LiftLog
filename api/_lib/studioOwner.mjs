/**
 * Eigenaar van een studio. Elke studio heeft één eigenaar (`orgs/{orgId}.ownerId`): de persoon die
 * namens de studio tekent (verwerkersovereenkomst), het aanspreekpunt voor BOLD700 en degene die de
 * rekening krijgt. Andere beheerders beheren mee, maar tekenen niet.
 *
 * Support van BOLD700 (een account op @bold700.com) is beheerder in een studio om te helpen, maar
 * nooit eigenaar: BOLD700 kan niet aan beide kanten van de verwerkersovereenkomst tekenen.
 *
 * Alleen de server zet `ownerId` (api/admin-account.mjs, actie setOwner); de regels weigeren het
 * vanuit de app.
 */

export const SUPPORT_DOMAIN = 'bold700.com';

/** Is dit e-mailadres van support van BOLD700? Op de server altijd het adres uit Firebase Auth. */
export const isSupportEmail = (email) => String(email ?? '').trim().toLowerCase().endsWith(`@${SUPPORT_DOMAIN}`);

/**
 * Mag de beller de eigenaar aanwijzen? De huidige eigenaar (overdragen), support van BOLD700
 * (aansluiten van een nieuwe studio, of als de eigenaar er niet meer is), en elke beheerder zolang
 * er nog geen eigenaar is.
 */
export function canSetOwner({ ownerId, callerUid, callerIsSupport }) {
  return !ownerId || ownerId === callerUid || callerIsSupport === true;
}

/** Alleen de eigenaar tekent namens de studio. */
export const canSignForStudio = ({ ownerId, callerUid }) => !!ownerId && ownerId === callerUid;
