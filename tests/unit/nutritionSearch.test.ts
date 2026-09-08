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
});
