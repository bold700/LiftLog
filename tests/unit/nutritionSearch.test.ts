import { describe, it, expect, vi } from 'vitest';
import { NEVO_ATTRIBUTION, defaultMealForNow, searchFoods } from '../../src/services/nutritionService';
import nevo from '../../src/data/nevo2025.json';

describe('searchFoods', () => {
  it('geeft basisproducten uit NEVO terug als de server faalt', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }));
    const r = await searchFoods('magere kwark');
    expect(r.remoteFailed).toBe(true);
    expect(r.products[0]).toMatchObject({ name: 'Kwark magere', brand: 'NEVO', source: 'nevo', per100g: { kcal: 51, protein: 8.4 } });
  });

  it('voegt serverresultaten toe onder de basisproducten', async () => {
    const remote = [{ code: '1', name: 'Kwark Jumbo', brand: 'Jumbo', imageUrl: null, per100g: { kcal: 60, protein: 9, carbs: 4, fat: 0.3 }, servingGrams: null }];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, products: remote }) }));
    const r = await searchFoods('kwark');
    expect(r.remoteFailed).toBe(false);
    expect(r.products[0].source).toBe('nevo');
    expect(r.products.map((p) => p.name)).toContain('Kwark Jumbo');
  });

  it('houdt dezelfde naam van verschillende merken als aparte producten', async () => {
    const mk = (code: string, brand: string, nl = true) => ({
      code, name: 'Magere kwark', brand, imageUrl: null, per100g: { kcal: 50, protein: 9, carbs: 4, fat: 0.2 }, servingGrams: null, nl,
    });
    const remote = [mk('1', 'Melkan'), mk('2', 'Optimel'), mk('3', 'Optimel'), mk('4', 'Milbona', false)];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, products: remote }) }));
    const r = await searchFoods('kwark');
    const brands = r.products.filter((p) => p.name === 'Magere kwark' && p.source !== 'nevo').map((p) => p.brand);
    // Drie merken, en Optimel maar één keer.
    expect(brands).toEqual(['Melkan', 'Optimel', 'Milbona']);
  });

  it('zet een Nederlands product boven een buitenlands product met dezelfde naam-score', async () => {
    const mk = (code: string, brand: string, nl: boolean) => ({
      code, name: 'Volle kwark', brand, imageUrl: null, per100g: { kcal: 110, protein: 8, carbs: 4, fat: 7 }, servingGrams: null, nl,
    });
    const remote = [mk('de', 'Milbona', false), mk('nl', 'Jumbo', true)];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, products: remote }) }));
    const r = await searchFoods('volle kwark');
    expect(r.products.filter((p) => p.name === 'Volle kwark')[0].brand).toBe('Jumbo');
  });
});

describe('NEVO_ATTRIBUTION', () => {
  it('noemt dezelfde versie als het ingebouwde bestand', () => {
    expect(NEVO_ATTRIBUTION).toBe(`Gebaseerd op gegevens van ${nevo.source}`);
  });
});

describe('defaultMealForNow', () => {
  const at = (h: number, m = 0) => new Date(2026, 8, 19, h, m);
  it('kiest het eetmoment bij het uur van de dag', () => {
    expect(defaultMealForNow(at(7, 30))).toBe('ontbijt');
    expect(defaultMealForNow(at(10, 45))).toBe('tussendoor');
    expect(defaultMealForNow(at(12, 15))).toBe('lunch');
    expect(defaultMealForNow(at(15))).toBe('tussendoor');
    expect(defaultMealForNow(at(18, 30))).toBe('diner');
    expect(defaultMealForNow(at(22))).toBe('tussendoor');
  });
});
