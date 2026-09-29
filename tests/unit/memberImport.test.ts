import { describe, expect, it } from 'vitest';
import { buildMemberImportRows, importOutcome, MAX_IMPORT_CREDITS, parseImportDate, PLACEHOLDER_EMAIL_DOMAIN } from '../../src/utils/memberImport';
import { parseCsv } from '../../src/utils/csv';

describe('buildMemberImportRows', () => {
  it('accepteert een geldige rij zonder fouten', () => {
    const [row] = buildMemberImportRows([{ naam: 'Jan de Vries', email: 'jan@x.nl', rol: 'sporter', trainer: '', credits: '10' }], new Set());
    expect(row.errors).toEqual([]);
    expect(row.displayName).toBe('Jan de Vries');
    expect(row.email).toBe('jan@x.nl');
    expect(row.role).toBe('sporter');
    expect(row.credits).toBe(10);
    expect(row.line).toBe(2);
  });

  it('valt terug op rol sporter als de kolom leeg of onbekend is', () => {
    const [row] = buildMemberImportRows([{ naam: 'Jan', email: 'jan@x.nl', rol: '' }], new Set());
    expect(row.role).toBe('sporter');
  });

  it('herkent trainer en beheerder als rol (ook "beheerder" als Nederlands alias voor admin)', () => {
    const [trainerRow, adminRow] = buildMemberImportRows(
      [
        { naam: 'Piet', email: 'piet@x.nl', rol: 'trainer' },
        { naam: 'Anne', email: 'anne@x.nl', rol: 'beheerder' },
      ],
      new Set()
    );
    expect(trainerRow.role).toBe('trainer');
    expect(adminRow.role).toBe('admin');
  });

  it('markeert een ontbrekende naam of e-mail als fout', () => {
    const [noName, noEmail] = buildMemberImportRows(
      [
        { naam: '', email: 'jan@x.nl' },
        { naam: 'Jan', email: '' },
      ],
      new Set()
    );
    expect(noName.errors).toContain('Naam ontbreekt.');
    // Geen e-mail is geen fout meer maar een overgeslagen rij (in Virtuagym vaak geen echte persoon).
    expect(noEmail.skipReason).toBe('Geen e-mailadres');
  });

  it('markeert een ongeldig e-mailadres', () => {
    const [row] = buildMemberImportRows([{ naam: 'Jan', email: 'niet-een-email' }], new Set());
    expect(row.errors).toContain('E-mailadres is ongeldig.');
  });

  it('slaat een e-mailadres over dat al een account heeft (niet hoofdlettergevoelig)', () => {
    const [row] = buildMemberImportRows([{ naam: 'Jan', email: 'Bestaat@X.nl' }], new Set(['bestaat@x.nl']));
    expect(row.skipReason).toBe('Heeft al een account');
    expect(importOutcome(row)).toBe('skip');
  });

  it('twee personen met één e-mailadres: de tweede krijgt een tijdelijk adres', () => {
    const [first, second] = buildMemberImportRows(
      [
        { naam: 'Robert de Boer', email: 'samen@x.nl' },
        { naam: 'Hanny de Boer', email: 'samen@x.nl' },
      ],
      new Set()
    );
    expect(first.email).toBe('samen@x.nl');
    expect(second.email).toBe(`hanny.de.boer.3@${PLACEHOLDER_EMAIL_DOMAIN}`);
    expect(second.placeholderEmail).toBe(true);
    expect(second.warnings[0]).toMatch(/tijdelijk adres/);
    expect(importOutcome(second)).toBe('create');
  });

  it('dezelfde persoon twee keer: één lid, de meest volledige rij', () => {
    const rows = buildMemberImportRows(
      [
        { naam: 'Jan', email: 'jan@x.nl' },
        { naam: 'jan', email: 'jan@x.nl', geboortedatum: '01-02-1990' },
      ],
      new Set(),
      '2026-09-29'
    );
    expect(rows[0].skipReason).toBe('Dubbel: samengevoegd met regel 3');
    expect(importOutcome(rows[1])).toBe('create');
  });

  it('accepteert een leeg creditsaldo (blijft null)', () => {
    const [row] = buildMemberImportRows([{ naam: 'Jan', email: 'jan@x.nl', credits: '' }], new Set());
    expect(row.credits).toBeNull();
    expect(row.errors).toEqual([]);
  });

  it('weigert een niet-heel-getal als creditsaldo', () => {
    const [row] = buildMemberImportRows([{ naam: 'Jan', email: 'jan@x.nl', credits: '3,5' }], new Set());
    expect(row.errors).toContain('Creditsaldo moet een heel getal zijn.');
  });

  it('weigert een creditsaldo boven de grens', () => {
    const [row] = buildMemberImportRows([{ naam: 'Jan', email: 'jan@x.nl', credits: String(MAX_IMPORT_CREDITS + 1) }], new Set());
    expect(row.errors[0]).toMatch(/tussen/);
  });

  it('leest ook Engelse kolomnamen als alias', () => {
    const [row] = buildMemberImportRows([{ name: 'Jan', email: 'jan@x.nl' }], new Set());
    expect(row.displayName).toBe('Jan');
  });

  it('leest een Virtuagym-export: voornaam + achternaam, geslacht, geboortedatum, uitgeschreven', () => {
    const csv = '\uFEFF"First name";"Last Name";Gender;Birthday;Email;"Unsubscribed since"\r\nEva;Jansen;F;03-04-1985;EVA@x.nl;\r\nBas;Pieters;M;;bas@x.nl;12-01-2025\r\n';
    const { rows } = parseCsv(csv);
    const [eva, bas] = buildMemberImportRows(rows, new Set(), '2026-09-29');
    expect(eva).toMatchObject({ displayName: 'Eva Jansen', email: 'eva@x.nl', gender: 'vrouw', birthDate: '1985-04-03', inactive: false });
    expect(bas).toMatchObject({ displayName: 'Bas Pieters', gender: 'man', birthDate: null, inactive: true });
    expect(importOutcome(bas)).toBe('createInactive');
  });

  it('xlsx-kolomnamen van Virtuagym en "-" als niet uitgeschreven', () => {
    const [row] = buildMemberImportRows([{ firstname: 'Eva', lastname: 'Jansen', email: 'eva@x.nl', unsubscribe_date: '-' }], new Set());
    expect(row.displayName).toBe('Eva Jansen');
    expect(row.inactive).toBe(false);
  });

  it('slaat testaccounts en rijen zonder e-mail over, met de reden', () => {
    const [test, noMail] = buildMemberImportRows(
      [
        { naam: 'Laura test', email: 'laura@virtuagym.com' },
        { naam: 'Bij Jet', email: '' },
      ],
      new Set()
    );
    expect(test.skipReason).toBe('Testaccount');
    expect(noMail.skipReason).toBe('Geen e-mailadres');
    expect(noMail.errors).toEqual([]);
  });

  it('geboortedatum: tikfout (dit jaar of later) niet overnemen; minderjarig melden', () => {
    const [typo, kid] = buildMemberImportRows(
      [
        { naam: 'A', email: 'a@x.nl', geboortedatum: '05-06-2026' },
        { naam: 'B', email: 'b@x.nl', geboortedatum: '2012-01-01' },
      ],
      new Set(),
      '2026-09-29'
    );
    expect(typo.birthDate).toBeNull();
    expect(typo.warnings[0]).toMatch(/lijkt niet te kloppen/);
    expect(kid.birthDate).toBe('2012-01-01');
    expect(kid.warnings[0]).toMatch(/Minderjarig/);
  });

  it('status en abonnement uit het sjabloon', () => {
    const [row] = buildMemberImportRows([{ naam: 'Jan', email: 'jan@x.nl', status: 'Inactief', abonnement: 'SGT 2x per week' }], new Set());
    expect(row.inactive).toBe(true);
    expect(row.planName).toBe('SGT 2x per week');
  });

  it('datums lezen', () => {
    expect(parseImportDate('31-12-1990')).toBe('1990-12-31');
    expect(parseImportDate('1/2/2001')).toBe('2001-02-01');
    expect(parseImportDate('1990-12-31')).toBe('1990-12-31');
    expect(parseImportDate('31-02-1990')).toBeNull();
    expect(parseImportDate('gisteren')).toBeNull();
  });
});
