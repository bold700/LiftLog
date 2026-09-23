import { describe, it, expect } from 'vitest';
import { saltFromSodium, searchNevo, toNevoFood, type NevoRow } from '../../src/utils/nevoSearch';
import nevo from '../../src/data/nevo2025.json';

const row = (code: number, name: string, en = '', syn = '', kcal = 100, na: number | null = 40): NevoRow => [
  code, name, en, syn, 'Groep', 'g', kcal, 8.4, 3.8, 0, 3.1, null, 0, na,
];

const rows: NevoRow[] = [
  row(305, 'Kwark magere', 'Quark low fat', '', 51),
  row(306, 'Kwark halfvolle', 'Quark half fat', '', 77),
  row(835, 'Taart kwark-', 'Cheesecake made w quark', 'Kwarktaart/kwarkgebak', 218),
  row(1, 'Appel m schil gem', 'Apple w skin avg'),
  row(2, 'Appelmoes blik/glas', 'Apple sauce'),
  row(3, 'Ei kippen- gekookt gem', 'Egg boiled', 'Kippeneieren gekookt'),
  row(4, 'Eipoeder kippen-', 'Egg powder'),
  row(5, 'Tarwebrood volkoren gem', 'Bread wholemeal', 'Volkorenbrood'),
  row(6, 'Vlokken haver-', 'Oat flakes', 'Havermout/Havervlokken'),
  row(7, 'Mueslireep', 'Muesli bar', 'Granenreep/havermoutreep'),
];
const names = (q: string) => searchNevo(rows, q).map((f) => f.name);

describe('searchNevo', () => {
  it('vindt woorden in elke volgorde: "magere kwark" → "Kwark magere"', () => {
    expect(names('magere kwark')[0]).toBe('Kwark magere');
  });
  it('zet het hoofdwoord voor samenstellingen', () => {
    expect(names('kwark').slice(0, 2)).toEqual(['Kwark magere', 'Kwark halfvolle']);
    expect(names('kwark')).toContain('Taart kwark-');
  });
  it('een heel woord gaat voor een woord dat ermee begint', () => {
    expect(names('appel')[0]).toBe('Appel m schil gem');
  });
  it('korte woorden alleen als heel woord: "ei" vindt geen eipoeder', () => {
    expect(names('ei')).toEqual(['Ei kippen- gekookt gem']);
  });
  it('zoekt ook in synoniemen, en telt een samengevoegd woord mee', () => {
    expect(names('havermout')[0]).toBe('Vlokken haver-');
    expect(names('volkoren brood')[0]).toBe('Tarwebrood volkoren gem');
  });
  it('geen treffer als een zoekwoord nergens voorkomt', () => {
    expect(names('kwark chocolade')).toEqual([]);
    expect(names('   ')).toEqual([]);
  });
  it('werkt ook op het echte bestand', () => {
    const real = (q: string) => searchNevo(nevo.rows as NevoRow[], q, 3).map((f) => f.name);
    expect(real('magere kwark')[0]).toBe('Kwark magere');
    expect(real('banaan')[0]).toBe('Banaan');
    expect(real('pindakaas')[0]).toBe('Pindakaas');
  });
});

describe('toNevoFood', () => {
  it('neemt de waarden ongewijzigd over en rekent zout uit natrium', () => {
    const f = toNevoFood(rows[0]);
    expect(f.code).toBe('nevo:305');
    expect(f.per100g).toEqual({ kcal: 51, protein: 8.4, carbs: 3.8, fat: 0 });
    expect(f.details).toEqual({ sugars: 3.1, fiber: null, saturatedFat: 0, salt: 0.1 });
  });
  it('zout: natrium (mg) × 2,5 in gram', () => {
    expect(saltFromSodium(400)).toBe(1);
    expect(saltFromSodium(null)).toBeNull();
  });
});

describe('bronvermelding', () => {
  it('staat in het bestand zoals de voorwaarden hem voorschrijven', () => {
    expect(nevo.source).toBe('NEVO-online versie 2025/9.0, RIVM, Bilthoven');
  });
});
