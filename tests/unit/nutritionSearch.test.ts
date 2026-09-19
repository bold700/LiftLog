import { describe, it, expect, vi } from 'vitest';
import { searchFoods } from '../../src/services/nutritionService';

describe('searchFoods', () => {
  it('geeft basisproducten terug als de server faalt', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }));
    const r = await searchFoods('kwark');
    expect(r.remoteFailed).toBe(true);
    expect(r.products.map((p) => p.name)).toContain('Magere kwark');
  });

  it('voegt serverresultaten toe onder de basisproducten', async () => {
    const remote = [{ code: '1', name: 'Kwark Jumbo', brand: 'Jumbo', imageUrl: null, per100g: { kcal: 60, protein: 9, carbs: 4, fat: 0.3 }, servingGrams: null }];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, products: remote }) }));
    const r = await searchFoods('kwark');
    expect(r.remoteFailed).toBe(false);
    expect(r.products[0].name).toBe('Magere kwark');
    expect(r.products.map((p) => p.name)).toContain('Kwark Jumbo');
  });

  it('houdt dezelfde naam van verschillende merken als aparte producten', async () => {
    const mk = (code: string, brand: string, nl = true) => ({
      code, name: 'Magere kwark', brand, imageUrl: null, per100g: { kcal: 50, protein: 9, carbs: 4, fat: 0.2 }, servingGrams: null, nl,
    });
    const remote = [mk('1', 'Melkan'), mk('2', 'Optimel'), mk('3', 'Optimel'), mk('4', 'Milbona', false)];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, products: remote }) }));
    const r = await searchFoods('kwark');
    const brands = r.products.filter((p) => p.name === 'Magere kwark' && p.brand !== 'Vers').map((p) => p.brand);
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
