/**
 * Studiocontext (multi-tenant).
 *
 * Elke studio is een eigen organisatie met een `orgId`. Alle documenten dragen dat veld, en
 * zowel de Firestore-regels als de queries dwingen af dat je alleen je eigen studio ziet.
 *
 * De actieve studio wordt één keer gezet zodra het profiel geladen is (ProfileContext), zodat
 * services hem kunnen opvragen zonder dat elke functie hem als argument hoeft door te geven.
 *
 * Belangrijk: `requireOrgId()` gooit wanneer er geen studio bekend is. Dat is bewust — liever een
 * zichtbare fout dan een document zonder `orgId` dat daarna voor niemand meer te vinden is.
 */

/**
 * Studio waar zelfregistratie in terechtkomt en waar documenten zonder `orgId` bij horen.
 * Documenten van vóór de multi-tenant migratie missen het veld; die worden als Van As gelezen.
 * Deze waarde staat ook als `defaultOrg()` in firestore.rules en als DEFAULT_ORG_ID in
 * api/_lib/liftlogData.mjs. Bewust een vaste waarde en geen omgevingsvariabele: de Firestore-regels
 * kunnen niet meebewegen met een env-var, en dan zouden app en regels documenten zonder `orgId`
 * bij verschillende studio's indelen.
 */
export const DEFAULT_ORG_ID = 'vanas';

let currentOrgId: string | null = null;
let memberOrgIds: string[] = [];

/** Onthoudt welke studio je het laatst open had, zodat je daar bij de volgende keer weer begint. */
const ACTIVE_ORG_KEY = 'vorm.activeOrgId';

/** Zet de actieve studio (bij het laden van het profiel, en leegmaken bij uitloggen). */
export function setCurrentOrgId(orgId: string | null | undefined): void {
  const next = typeof orgId === 'string' ? orgId.trim() : '';
  currentOrgId = next || null;
  if (!currentOrgId) return;
  try {
    localStorage.setItem(ACTIVE_ORG_KEY, currentOrgId);
  } catch {
    /* privémodus: dan begint hij volgende keer weer bij de thuisstudio */
  }
}

/**
 * De studio's waar deze gebruiker lid van is.
 *
 * Een sporter zit meestal bij één studio. Een trainer kan bij meerdere werken — dat is bij
 * freelance trainers eerder regel dan uitzondering — en wisselt in de app tussen zijn studio's.
 * Documenten horen altijd bij precies één studio; alleen het lidmaatschap is meervoudig.
 */
export function setMemberOrgIds(orgIds: string[] | null | undefined): void {
  memberOrgIds = Array.isArray(orgIds) ? orgIds.filter((o) => typeof o === 'string' && o.trim()) : [];
}

export function getMemberOrgIds(): string[] {
  return [...memberOrgIds];
}

/** Zit deze gebruiker bij meer dan één studio? Bepaalt of de wisselaar zichtbaar is. */
export function hasMultipleOrgs(): boolean {
  return memberOrgIds.length > 1;
}

/**
 * Kiest de studio om mee te beginnen: de laatst gebruikte als je daar nog lid van bent,
 * anders je thuisstudio.
 */
export function preferredOrgId(homeOrgId: string, orgIds: string[]): string {
  let remembered: string | null = null;
  try {
    remembered = localStorage.getItem(ACTIVE_ORG_KEY);
  } catch {
    /* niets */
  }
  if (remembered && orgIds.includes(remembered)) return remembered;
  return orgIds.includes(homeOrgId) ? homeOrgId : (orgIds[0] ?? homeOrgId);
}

/** De actieve studio, of null wanneer er nog geen profiel geladen is. */
export function getCurrentOrgId(): string | null {
  return currentOrgId;
}

/**
 * De actieve studio, of een fout wanneer die ontbreekt.
 * Gebruik dit bij elke schrijfactie en bij elke query die anders over studio's heen zou kijken.
 */
export function requireOrgId(): string {
  if (!currentOrgId) {
    throw new Error(
      'Geen studio geladen. Log opnieuw in — schrijven zonder studio is niet toegestaan.'
    );
  }
  return currentOrgId;
}

/**
 * De studio's van een profiel: `orgIds` als dat er staat, anders de enkele `orgId` als lijst.
 * Zo blijven profielen van vóór het meervoudige lidmaatschap gewoon werken.
 */
export function orgIdsOf(rawOrgIds: unknown, homeOrgId: string): string[] {
  const list = Array.isArray(rawOrgIds)
    ? rawOrgIds.map((o) => (typeof o === 'string' ? o.trim() : '')).filter(Boolean)
    : [];
  if (list.length === 0) return [homeOrgId];
  // De thuisstudio hoort er altijd bij, ook als hij per ongeluk uit de lijst is gevallen.
  return list.includes(homeOrgId) ? list : [homeOrgId, ...list];
}

/** Leest `orgId` uit een documentveld; ontbreekt het (data van vóór de migratie), dan de standaardstudio. */
export function orgIdOf(raw: unknown): string {
  const v = typeof raw === 'string' ? raw.trim() : '';
  return v || DEFAULT_ORG_ID;
}
