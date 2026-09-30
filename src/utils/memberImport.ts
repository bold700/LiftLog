/**
 * Pure logica voor het bulk importeren van leden (Beheer → Leden importeren): parsed CSV-rijen
 * omzetten naar gevalideerde import-rijen, los van Firebase/React zodat dit apart te unit-testen is.
 * De eigenlijke accounts aanmaken gebeurt in MemberImportDialog.tsx via de bestaande
 * auth.adminCreateAccount/grantCredits-paden — dezelfde als bij één account tegelijk aanmaken.
 *
 * Leest het eigen sjabloon én een ledenexport uit Virtuagym (voornaam/achternaam, geboortedatum,
 * geslacht, uitgeschreven sinds). Voor een studio die overstapt geldt:
 * - uitgeschreven in het oude systeem → wel importeren, maar als inactief lid;
 * - testaccounts van Virtuagym en rijen zonder e-mailadres → overslaan, met de reden erbij;
 * - dezelfde persoon twee keer (zelfde e-mail en naam) → één lid, de meest volledige rij;
 * - twee personen met één e-mailadres (bijv. een stel) → de tweede krijgt een tijdelijk adres, zodat
 *   beiden een eigen account hebben; het echte adres vul je later in.
 */
import { EMAIL_RE } from './account';
import type { ProfileRole } from '../types';

/** Zoveel credits mag je in één keer toekennen (zelfde grens als de `grant`-actie in api/booking.mjs). */
export const MAX_IMPORT_CREDITS = 500;
/** Meer rijen dan dit in één bestand is vermoedelijk een vergissing (verkeerd bestand, geen sjabloon). */
export const MAX_IMPORT_ROWS = 500;
/** Domein voor een tijdelijk e-mailadres: bestaat niet, dus er gaat nooit mail naartoe. */
export const PLACEHOLDER_EMAIL_DOMAIN = 'geen-email.invalid';

export type ImportGender = 'man' | 'vrouw' | 'anders';

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
  /** "YYYY-MM-DD", of null. */
  birthDate: string | null;
  gender: ImportGender | null;
  /** Uitgeschreven in het oude systeem: account wel aanmaken, maar op inactief zetten. */
  inactive: boolean;
  /** Naam van het abonnement om te koppelen (moet in Beheer → Abonnementen bestaan), of ''. */
  planName: string;
  phone: string | null;
  address: { street: string | null; zip: string | null; city: string | null } | null;
  /** Lid sinds (YYYY-MM-DD), uit het oude systeem. */
  memberSince: string | null;
  /** Tijdelijk e-mailadres gekregen omdat een ander hetzelfde adres gebruikt. */
  placeholderEmail: boolean;
  /** Niet importeren, met de reden (testaccount, dubbel, geen e-mail, bestaat al). Geen fout. */
  skipReason: string | null;
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

function normalizeGender(raw: string): ImportGender | null {
  const v = raw.trim().toLowerCase();
  if (['m', 'man', 'male'].includes(v)) return 'man';
  if (['v', 'f', 'vrouw', 'female'].includes(v)) return 'vrouw';
  if (['o', 'x', 'anders', 'other'].includes(v)) return 'anders';
  return null;
}

/** "31-12-1990", "31/12/1990" of "1990-12-31" → "1990-12-31"; anders null. */
export function parseImportDate(raw: string): string | null {
  const v = raw.trim();
  let y: number, m: number, d: number;
  let match = v.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (match) [d, m, y] = [Number(match[1]), Number(match[2]), Number(match[3])];
  else if ((match = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  else return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function ageOn(birthIso: string, todayIso: string): number {
  const [by, bm, bd] = birthIso.split('-').map(Number);
  const [ty, tm, td] = todayIso.split('-').map(Number);
  return ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0);
}

/**
 * Telefoonnummer netjes: Excel laat de 0 vooraan weg (612345678 → 0612345678). Verder zoals het
 * er stond; het is vrije tekst voor de trainer (bijv. om te appen).
 */
export function normalizePhone(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  const digits = v.replace(/\D/g, '');
  if (/^[1-9]\d{8}$/.test(digits) && digits === v.replace(/[\s-]/g, '')) return `0${digits}`;
  return v;
}

/** Leest een veld uit een CSV-rij onder een van de gegeven kolomnamen (eerste match wint). */
function field(row: Record<string, string>, ...names: string[]): string {
  for (const n of names) {
    if (row[n] != null && row[n] !== '') return row[n];
  }
  return '';
}

const slug = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '') || 'lid';

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
/** Hoeveel velden een rij heeft ingevuld: bij dubbelen wint de meest volledige. */
const filled = (r: MemberImportRow) => [r.birthDate, r.gender, r.planName, r.credits, r.trainerEmail, r.phone, r.address, r.memberSince].filter((v) => v != null && v !== '').length + (r.inactive ? 0 : 1);

export function buildMemberImportRows(rows: Record<string, string>[], existingEmails: ReadonlySet<string>, todayIso = new Date().toISOString().slice(0, 10)): MemberImportRow[] {
  const thisYear = Number(todayIso.slice(0, 4));
  const out: MemberImportRow[] = rows.map((raw, i) => {
    const errors: string[] = [];
    const warnings: string[] = [];

    const first = field(raw, 'first name', 'firstname', 'voornaam').trim();
    const last = field(raw, 'last name', 'lastname', 'achternaam').trim();
    const displayName = (field(raw, 'naam', 'name').trim() || [first, last].filter(Boolean).join(' ')).replace(/\s+/g, ' ');
    const email = field(raw, 'email', 'e-mail', 'e-mailadres').trim().toLowerCase();
    const role = normalizeRole(field(raw, 'rol', 'role'));
    const trainerEmail = field(raw, 'trainer').trim().toLowerCase();
    const creditsRaw = field(raw, 'credits', 'creditsaldo', 'saldo').trim();
    const planName = field(raw, 'abonnement', 'plan').trim();
    const gender = normalizeGender(field(raw, 'geslacht', 'gender'));
    const phone = normalizePhone(field(raw, 'telefoon', 'mobile', 'mobiel', 'phone'));
    const street = field(raw, 'adres', 'straat', 'street address', 'street').trim() || null;
    const zip = field(raw, 'postcode', 'zip code', 'zip_code').trim().toUpperCase() || null;
    const city = field(raw, 'plaats', 'woonplaats', 'city').trim() || null;
    const address = street || zip || city ? { street, zip, city } : null;
    const memberSince = parseImportDate(field(raw, 'lid sinds', 'member since', 'member_since', 'registration date', 'registration_date'));

    // Uitgeschreven: expliciete status, of een datum bij "uitgeschreven sinds" (Virtuagym).
    const status = field(raw, 'status').trim().toLowerCase();
    const unsubscribed = field(raw, 'unsubscribed since', 'unsubscribe_date', 'uitgeschreven sinds').trim();
    const inactive = ['inactief', 'inactive', 'uitgeschreven'].includes(status) || (unsubscribed !== '' && unsubscribed !== '-');

    let birthDate: string | null = null;
    const birthRaw = field(raw, 'geboortedatum', 'birthday', 'birthdate').trim();
    if (birthRaw) {
      const parsed = parseImportDate(birthRaw);
      // Een geboortejaar van dit jaar of later is een tikfout in het oude systeem: niet overnemen.
      if (!parsed || Number(parsed.slice(0, 4)) >= thisYear || Number(parsed.slice(0, 4)) < 1900) {
        warnings.push(`Geboortedatum "${birthRaw}" lijkt niet te kloppen; niet overgenomen.`);
      } else {
        birthDate = parsed;
        if (ageOn(parsed, todayIso) < 18) warnings.push('Minderjarig: toestemming van een ouder volgt later.');
      }
    }

    let credits: number | null = null;
    if (creditsRaw) {
      const n = Number(creditsRaw.replace(',', '.'));
      if (!Number.isInteger(n)) errors.push('Creditsaldo moet een heel getal zijn.');
      else if (Math.abs(n) > MAX_IMPORT_CREDITS) errors.push(`Creditsaldo moet tussen -${MAX_IMPORT_CREDITS} en ${MAX_IMPORT_CREDITS} liggen.`);
      else credits = n;
    }

    let skipReason: string | null = null;
    if (!displayName) errors.push('Naam ontbreekt.');
    if (!email) {
      skipReason = 'Geen e-mailadres';
    } else if (!EMAIL_RE.test(email)) {
      errors.push('E-mailadres is ongeldig.');
    } else if (/@virtuagym\.com$/.test(email) || /\btest\b/i.test(displayName)) {
      skipReason = 'Testaccount';
    } else if (existingEmails.has(email)) {
      skipReason = 'Heeft al een account';
    }

    return { line: i + 2, displayName, email, role, trainerEmail, credits, birthDate, gender, inactive, planName, phone, address, memberSince, placeholderEmail: false, skipReason, errors, warnings };
  });

  // Dubbelen in het bestand: zelfde e-mail + zelfde naam = één persoon (meest volledige rij wint);
  // zelfde e-mail + andere naam = een tweede persoon, met een tijdelijk adres.
  const byEmail = new Map<string, MemberImportRow[]>();
  for (const r of out) {
    if (!r.email || r.skipReason || r.errors.length) continue;
    byEmail.set(r.email, [...(byEmail.get(r.email) ?? []), r]);
  }
  for (const [email, group] of byEmail) {
    if (group.length < 2) continue;
    const people: MemberImportRow[][] = [];
    for (const r of group) {
      const same = people.find((p) => sameName(p[0].displayName, r.displayName));
      if (same) same.push(r);
      else people.push([r]);
    }
    people.forEach((rowsOfPerson, idx) => {
      const keep = [...rowsOfPerson].sort((a, b) => filled(b) - filled(a) || a.line - b.line)[0];
      for (const r of rowsOfPerson) if (r !== keep) r.skipReason = `Dubbel: samengevoegd met regel ${keep.line}`;
      if (idx > 0) {
        keep.email = `${slug(keep.displayName)}.${keep.line}@${PLACEHOLDER_EMAIL_DOMAIN}`;
        keep.placeholderEmail = true;
        keep.warnings.push(`Deelt ${email} met ${people[0][0].displayName}: krijgt een tijdelijk adres, vul later het echte in.`);
      }
    });
  }
  return out;
}

/** Wat er met een rij gebeurt, voor het voorbeeldscherm. */
export type ImportOutcome = 'create' | 'createInactive' | 'skip' | 'error';

export function importOutcome(r: MemberImportRow): ImportOutcome {
  if (r.errors.length) return 'error';
  if (r.skipReason) return 'skip';
  return r.inactive ? 'createInactive' : 'create';
}

/** Kolomkoppen en een voorbeeldrij voor het downloadbare CSV-sjabloon. */
export const MEMBER_IMPORT_TEMPLATE: { headers: string[]; example: string[] } = {
  headers: ['naam', 'email', 'rol', 'trainer', 'credits', 'abonnement', 'status', 'geboortedatum', 'geslacht', 'telefoon', 'adres', 'postcode', 'plaats', 'lid sinds'],
  example: ['Jan de Vries', 'jan@voorbeeld.nl', 'sporter', '', '10', 'SGT 2x per week', 'actief', '31-12-1990', 'man', '0612345678', 'Dorpsstraat 1', '1234 AB', 'Utrecht', '01-03-2021'],
};
