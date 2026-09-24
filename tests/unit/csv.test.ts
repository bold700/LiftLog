import { describe, expect, it } from 'vitest';
import { parseCsv, toCsv } from '../../src/utils/csv';

describe('parseCsv', () => {
  it('parseert een simpele CSV met komma\'s', () => {
    const { headers, rows } = parseCsv('naam,email\nJan,jan@x.nl\nPiet,piet@x.nl');
    expect(headers).toEqual(['naam', 'email']);
    expect(rows).toEqual([
      { naam: 'Jan', email: 'jan@x.nl' },
      { naam: 'Piet', email: 'piet@x.nl' },
    ]);
  });

  it('herkent puntkomma als scheidingsteken (Excel-NL)', () => {
    const { headers, rows } = parseCsv('naam;email\nJan;jan@x.nl');
    expect(headers).toEqual(['naam', 'email']);
    expect(rows).toEqual([{ naam: 'Jan', email: 'jan@x.nl' }]);
  });

  it('ondersteunt aanhalingstekens rond een veld met het scheidingsteken erin', () => {
    const { rows } = parseCsv('naam,notitie\nJan,"Woont in Utrecht, sinds 2020"');
    expect(rows[0].notitie).toBe('Woont in Utrecht, sinds 2020');
  });

  it('verdubbelde aanhalingstekens worden één aanhalingsteken', () => {
    const { rows } = parseCsv('naam,notitie\nJan,"Zegt ""hoi"""');
    expect(rows[0].notitie).toBe('Zegt "hoi"');
  });

  it('negeert lege regels en trimt waarden', () => {
    const { rows } = parseCsv('naam,email\n\nJan , jan@x.nl \n');
    expect(rows).toEqual([{ naam: 'Jan', email: 'jan@x.nl' }]);
  });

  it('koppen worden lowercase', () => {
    const { headers } = parseCsv('Naam,E-mail\nJan,jan@x.nl');
    expect(headers).toEqual(['naam', 'e-mail']);
  });

  it('geeft lege headers/rows terug voor een leeg bestand', () => {
    expect(parseCsv('')).toEqual({ headers: [], rows: [] });
  });
});

describe('toCsv', () => {
  it('bouwt een puntkomma-gescheiden CSV met CRLF-regeleindes', () => {
    const csv = toCsv(['naam', 'email'], [['Jan', 'jan@x.nl']]);
    expect(csv).toBe('naam;email\r\nJan;jan@x.nl\r\n');
  });

  it('zet een veld met het scheidingsteken tussen aanhalingstekens', () => {
    const csv = toCsv(['naam'], [['Jan; de Vries']]);
    expect(csv).toContain('"Jan; de Vries"');
  });
});
