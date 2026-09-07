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
 * Dezelfde waarde staat als `defaultOrg()` in firestore.rules — pas ze samen aan.
 */
export const DEFAULT_ORG_ID =
  (import.meta.env?.VITE_DEFAULT_ORG_ID as string | undefined)?.trim() || 'vanas';

let currentOrgId: string | null = null;

/** Zet de actieve studio (bij het laden van het profiel, en leegmaken bij uitloggen). */
export function setCurrentOrgId(orgId: string | null | undefined): void {
  const next = typeof orgId === 'string' ? orgId.trim() : '';
  currentOrgId = next || null;
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

/** Leest `orgId` uit een documentveld; ontbreekt het (data van vóór de migratie), dan de standaardstudio. */
export function orgIdOf(raw: unknown): string {
  const v = typeof raw === 'string' ? raw.trim() : '';
  return v || DEFAULT_ORG_ID;
}
