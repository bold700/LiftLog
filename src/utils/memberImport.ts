/**
 * Pure logica voor het bulk importeren van leden (Beheer → Leden importeren): parsed CSV-rijen
 * omzetten naar gevalideerde import-rijen, los van Firebase/React zodat dit apart te unit-testen is.
 * De eigenlijke accounts aanmaken gebeurt in MemberImportDialog.tsx via de bestaande
 * auth.adminCreateAccount/grantCredits-paden — dezelfde als bij één account tegelijk aanmaken.
 */
import { EMAIL_RE } from './account';
import type { ProfileRole } from '../types';

/** Zoveel credits mag je in één keer toekennen (zelfde grens als de `grant`-actie in api/booking.mjs). */
export const MAX_IMPORT_CREDITS = 500;
/** Meer rijen dan dit in één bestand is vermoedelijk een vergissing (verkeerd bestand, geen sjabloon). */
export const MAX_IMPORT_ROWS = 500;

export interface MemberImportRow {
  /** Regelnummer in het bestand (1 = de header), voor foutmeldingen. */
  line: number;
  displayName: string;
  email: string;
  role: ProfileRole;
  /** E-mailadres van de trainer uit de CSV, indien opgegeven (alleen relevant bij role 'sporter'). */
  trainerEmail: string;
  /** Startsaldo in credits, of null als niet opgegeven. */
  credits: number | null;
  /** Blokkeert import van deze rij. */
  errors: string[];
  /** Niet-blokkerend, bijv. een trainer die niet gevonden kon worden. */
  warnings: string[];
}

function normalizeRole(raw: string): ProfileRole {
  const v = raw.trim().toLowerCase();
  if (v === 'trainer') return 'trainer';
  if (v === 'admin' || v === 'beheerder') return 'admin';
  return 'sporter';
}

/** Leest een veld uit een CSV-rij onder een van de gegeven kolomnamen (eerste match wint). */
function field(row: Record<string, string>, ...names: string[]): string {
  for (const n of names) {
    if (row[n] != null && row[n] !== '') return row[n];
  }
  return '';
}

export function buildMemberImportRows(rows: Record<string, string>[], existingEmails: ReadonlySet<string>): MemberImportRow[] {
  const seenInFile = new Set<string>();
  return rows.map((raw, i) => {
    const errors: string[] = [];
    const warnings: string[] = [];

    const displayName = field(raw, 'naam', 'name').trim();
    const email = field(raw, 'email', 'e-mail', 'e-mailadres').trim().toLowerCase();
    const role = normalizeRole(field(raw, 'rol', 'role'));
    const trainerEmail = field(raw, 'trainer').trim().toLowerCase();
    const creditsRaw = field(raw, 'credits', 'creditsaldo', 'saldo').trim();

    let credits: number | null = null;
    if (creditsRaw) {
      const n = Number(creditsRaw.replace(',', '.'));
      if (!Number.isInteger(n)) errors.push('Creditsaldo moet een heel getal zijn.');
      else if (Math.abs(n) > MAX_IMPORT_CREDITS) errors.push(`Creditsaldo moet tussen -${MAX_IMPORT_CREDITS} en ${MAX_IMPORT_CREDITS} liggen.`);
      else credits = n;
    }

    if (!displayName) errors.push('Naam ontbreekt.');
    if (!email) {
      errors.push('E-mailadres ontbreekt.');
    } else if (!EMAIL_RE.test(email)) {
      errors.push('E-mailadres is ongeldig.');
    } else if (existingEmails.has(email)) {
      errors.push('Dit e-mailadres heeft al een account.');
    } else if (seenInFile.has(email)) {
      errors.push('Dit e-mailadres staat dubbel in het bestand.');
    }
    if (email) seenInFile.add(email);

    return { line: i + 2, displayName, email, role, trainerEmail, credits, errors, warnings };
  });
}

/** Kolomkoppen en een voorbeeldrij voor het downloadbare CSV-sjabloon. */
export const MEMBER_IMPORT_TEMPLATE: { headers: string[]; example: string[] } = {
  headers: ['naam', 'email', 'rol', 'trainer', 'credits'],
  example: ['Jan de Vries', 'jan@voorbeeld.nl', 'sporter', '', '10'],
};
