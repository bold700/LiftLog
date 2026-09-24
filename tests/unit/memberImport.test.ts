import { describe, expect, it } from 'vitest';
import { buildMemberImportRows, MAX_IMPORT_CREDITS } from '../../src/utils/memberImport';

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
    expect(noEmail.errors).toContain('E-mailadres ontbreekt.');
  });

  it('markeert een ongeldig e-mailadres', () => {
    const [row] = buildMemberImportRows([{ naam: 'Jan', email: 'niet-een-email' }], new Set());
    expect(row.errors).toContain('E-mailadres is ongeldig.');
  });

  it('markeert een e-mailadres dat al een account heeft', () => {
    const [row] = buildMemberImportRows([{ naam: 'Jan', email: 'bestaat@x.nl' }], new Set(['bestaat@x.nl']));
    expect(row.errors).toContain('Dit e-mailadres heeft al een account.');
  });

  it('markeert een e-mailadres dat dubbel in het bestand staat, op de tweede rij', () => {
    const [first, second] = buildMemberImportRows(
      [
        { naam: 'Jan', email: 'dubbel@x.nl' },
        { naam: 'Piet', email: 'dubbel@x.nl' },
      ],
      new Set()
    );
    expect(first.errors).toEqual([]);
    expect(second.errors).toContain('Dit e-mailadres staat dubbel in het bestand.');
  });

  it('is niet hoofdlettergevoelig bij het herkennen van dubbele e-mailadressen', () => {
    const [row] = buildMemberImportRows([{ naam: 'Jan', email: 'Bestaat@X.nl' }], new Set(['bestaat@x.nl']));
    expect(row.errors).toContain('Dit e-mailadres heeft al een account.');
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
});
