import { describe, expect, it } from 'vitest';
import { buildMemberImportRows, detectCreditColumns, fillForExisting, fillSummary, importOutcome, MAX_IMPORT_CREDITS, normalizePhone, parseImportDate, PLACEHOLDER_EMAIL_DOMAIN } from '../../src/utils/memberImport';
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

  it('telefoon, adres en lid sinds uit Virtuagym (0 vooraan terug die Excel weghaalde)', () => {
    const [row] = buildMemberImportRows(
      [{ 'first name': 'Eva', 'last name': 'J', email: 'eva@x.nl', mobile: '612345678', 'street address': 'Dorpsstraat 1', 'zip code': '1234ab', city: 'Utrecht', 'member since': '01-03-2021' }],
      new Set()
    );
    expect(row).toMatchObject({ phone: '0612345678', address: { street: 'Dorpsstraat 1', zip: '1234AB', city: 'Utrecht' }, memberSince: '2021-03-01' });
    expect(normalizePhone('06-12345678')).toBe('06-12345678');
    expect(normalizePhone('')).toBeNull();
  });

  it('bestaand lid: alleen lege velden aanvullen', () => {
    const [row] = buildMemberImportRows(
      [{ naam: 'Eva', email: 'eva@x.nl', telefoon: '0612345678', geboortedatum: '01-02-1990', geslacht: 'vrouw', 'lid sinds': '01-03-2021', adres: 'Straat 1' }],
      new Set(['eva@x.nl']),
      '2026-09-29'
    );
    const fill = fillForExisting(row, { birthDate: '1985-05-05', gender: null, phone: null, address: null, memberSince: null });
    expect(fill).toEqual({ gender: 'vrouw', phone: '0612345678', memberSince: '2021-03-01', address: { street: 'Straat 1', zip: null, city: null } });
    expect(fillSummary(fill)).toBe('geslacht, telefoon, adres en lid sinds');
    expect(fillForExisting(row, { birthDate: 'x', gender: 'man', phone: '1', address: {}, memberSince: 'y' })).toEqual({});
  });
});


describe('creditsaldo uit Virtuagym', () => {
  const vg = (extra: Record<string, string>) => ({ member_id: '1', firstname: 'Jan', lastname: 'Vries', email: 'jan@x.nl', phone: '612345678', ...extra });

  it('herkent alleen niet-standaard kolommen met hele getallen, en alleen in een Virtuagym-export', () => {
    const rows = [vg({ bootcamp: '0', 'small group training': '5', tags: '12' }), vg({ bootcamp: '-3', 'small group training': '', tags: '' })];
    const headers = ['member_id', 'firstname', 'lastname', 'email', 'phone', 'tags', 'bootcamp', 'small group training'];
    expect(detectCreditColumns(headers, rows)).toEqual(['bootcamp', 'small group training']);
    // Alles nul: niets over te nemen.
    expect(detectCreditColumns(['member_id', 'firstname', 'bootcamp'], [vg({ bootcamp: '0' })])).toEqual([]);
    // Tekst in de kolom: geen saldo.
    expect(detectCreditColumns(['member_id', 'firstname', 'notitie'], [vg({ notitie: 'vip' })])).toEqual([]);
    // Eigen sjabloon: geen Virtuagym.
    expect(detectCreditColumns(['naam', 'email', 'extra'], [{ naam: 'Jan', email: 'j@x.nl', extra: '4' }])).toEqual([]);
  });

  it('telt positieve saldi op en neemt een negatief saldo niet over', () => {
    const cols = ['bootcamp', 'small group training'];
    const [a, b, c] = buildMemberImportRows(
      [vg({ bootcamp: '10', 'small group training': '3' }), vg({ email: 'b@x.nl', bootcamp: '-3', 'small group training': '4' }), vg({ email: 'c@x.nl', bootcamp: '0', 'small group training': '' })],
      new Set(),
      '2026-09-30',
      { creditColumns: cols }
    );
    expect(a.credits).toBe(13);
    expect(b.credits).toBe(4);
    expect(b.warnings.join(' ')).toContain('Negatief saldo "Bootcamp" (-3)');
    expect(c.credits).toBeNull();
  });

  it('neemt geen saldo over zonder schakelaar, en een eigen creditskolom gaat voor', () => {
    const [off] = buildMemberImportRows([vg({ bootcamp: '10' })], new Set(), '2026-09-30');
    expect(off.credits).toBeNull();
    const [own] = buildMemberImportRows([vg({ bootcamp: '10', credits: '2' })], new Set(), '2026-09-30', { creditColumns: ['bootcamp'] });
    expect(own.credits).toBe(2);
  });

  it('begrenst een groot saldo op het maximum', () => {
    const [row] = buildMemberImportRows([vg({ bootcamp: String(MAX_IMPORT_CREDITS), sgt: '5' })], new Set(), '2026-09-30', { creditColumns: ['bootcamp', 'sgt'] });
    expect(row.credits).toBe(MAX_IMPORT_CREDITS);
    expect(row.warnings.join(' ')).toContain(`${MAX_IMPORT_CREDITS} overgenomen`);
  });
});
