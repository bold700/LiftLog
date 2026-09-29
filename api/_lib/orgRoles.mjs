/**
 * Rol per studio.
 *
 * Eén account kan bij meerdere studio's horen, en per studio een andere rol hebben: trainer bij de
 * ene, sporter bij de andere. Die rol staat in `orgRoles` (studio → rol). Profielen van vóór deze
 * wijziging hebben alleen `role`; die geldt dan voor elke studio zonder eigen regel in `orgRoles`.
 * Wie via een uitnodiging bij een tweede studio komt, krijgt voor álle studio's een eigen regel, zodat
 * een beheerder bij de ene studio nooit via die oude, algemene `role` beheerder wordt bij de andere.
 *
 * Dezelfde regel staat in src/utils/orgRoles.ts (app) en als roleIn() in firestore.rules.
 */
import { orgIdOf } from './liftlogData.mjs';

const ROLES = new Set(['sporter', 'trainer', 'admin']);

const clean = (r) => {
  const v = String(r ?? '').toLowerCase().trim();
  return ROLES.has(v) ? v : null;
};

/** De studio's van een profiel (`orgIds`, of alleen de thuisstudio bij oude profielen). */
export function orgsOf(data) {
  const list = Array.isArray(data?.orgIds) ? data.orgIds.map(String).filter(Boolean) : [];
  return list.length ? list : [orgIdOf(data?.orgId)];
}

/** De rol van dit profiel in deze studio. Geen lid van die studio: 'sporter' (geen rechten). */
export function roleIn(data, orgId) {
  if (!data || !orgId || !orgsOf(data).includes(orgId)) return 'sporter';
  const own = data.orgRoles && typeof data.orgRoles === 'object' ? clean(data.orgRoles[orgId]) : null;
  return own ?? clean(data.role) ?? 'sporter';
}

export const isStaffIn = (data, orgId) => ['trainer', 'admin'].includes(roleIn(data, orgId));
export const isAdminIn = (data, orgId) => roleIn(data, orgId) === 'admin';

/** Staf in minstens één studio (bijv. voor de trainersfeed, die over alle studio's gaat). */
export const isStaffAnywhere = (data) => orgsOf(data).some((o) => isStaffIn(data, o));

/**
 * De studio waarin dit verzoek handelt: de studio die de app als actief meestuurt, mits je daar lid
 * van bent; anders je thuisstudio (oude app zonder `orgId` in het verzoek).
 */
export function actingOrg(data, requested) {
  const orgs = orgsOf(data);
  const want = typeof requested === 'string' ? requested.trim() : '';
  if (want && orgs.includes(want)) return want;
  const home = orgIdOf(data?.orgId);
  return orgs.includes(home) ? home : orgs[0];
}

/**
 * Lid staat op inactief bij deze studio (Beheer → lid deactiveren, of uitgeschreven bij de import).
 * Het account en de geschiedenis blijven; boeken, kopen en meldingen van de studio staan uit.
 * Per studio: inactief bij de ene studio zegt niets over een andere.
 */
export const isInactiveIn = (data, orgId) => Array.isArray(data?.inactiveOrgs) && data.inactiveOrgs.map(String).includes(orgId);

/**
 * Staf die bij deze studio ook zelf meetraint als lid (bijv. een beheerder die ook lessen volgt).
 * Die betaalt dan net als een sporter: credits bij boeken, abonnement en facturen. Zonder die
 * vlag boekt staf gratis (meedoen als trainer). Per studio, net als de rol.
 */
export const trainsAsMemberIn = (data, orgId) =>
  Array.isArray(data?.trainsAsMemberOrgs) && data.trainsAsMemberOrgs.map(String).includes(orgId);

/** Betaalt dit profiel bij deze studio als lid? Sporters altijd, staf alleen als die meetraint. */
export const paysAsMemberIn = (data, orgId) => !isStaffIn(data, orgId) || trainsAsMemberIn(data, orgId);
