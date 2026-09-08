import { describe, it, expect } from 'vitest';
import { mapOffHits, parseServingGrams } from '../../api/food-search.mjs';

describe('parseServingGrams', () => {
  it('leest gram uit een portie-omschrijving', () => {
    expect(parseServingGrams('30 g')).toBe(30);
    expect(parseServingGrams('1 portie (150g)')).toBe(150);
    expect(parseServingGrams('12,5 g')).toBe(12.5);
    expect(parseServingGrams('250 gram')).toBe(250);
  });

  it('geeft null als er geen gram in staat', () => {
    // "1 glas" begint met een g, maar is geen gram.
    expect(parseServingGrams('1 glas')).toBeNull();
    expect(parseServingGrams('2 grote bollen')).toBeNull();
    expect(parseServingGrams(undefined)).toBeNull();
    expect(parseServingGrams('0 g')).toBeNull();
  });
});

describe('mapOffHits', () => {
  const hit = {
    code: '8718452612451',
    product_name: 'Magere kwark',
    brands: ['Jumbo'],
    image_small_url: 'https://images.openfoodfacts.org/kwark.jpg',
    serving_size: '250 g',
    nutriments: { 'energy-kcal_100g': 57, proteins_100g: 10, carbohydrates_100g: 3.4, fat_100g: 0.2 },
  };

  it('zet een zoekresultaat om naar een product', () => {
    expect(mapOffHits([hit])).toEqual([
      {
        code: '8718452612451',
        name: 'Magere kwark',
        brand: 'Jumbo',
        imageUrl: 'https://images.openfoodfacts.org/kwark.jpg',
        per100g: { kcal: 57, protein: 10, carbs: 3.4, fat: 0.2 },
        servingGrams: 250,
      },
    ]);
  });

  it('neemt het eerste merk, ook als het een komma-string is', () => {
    expect(mapOffHits([{ ...hit, brands: 'Jumbo, Huismerk' }])[0].brand).toBe('Jumbo');
    expect(mapOffHits([{ ...hit, brands: null }])[0].brand).toBe('');
  });

  it('rekent kilojoule om naar kcal als kcal ontbreekt', () => {
    const kj = { ...hit, nutriments: { energy_100g: 1000, proteins_100g: 5 } };
    expect(mapOffHits([kj])[0].per100g.kcal).toBe(239);
  });

  it('laat producten zonder naam of zonder voedingswaarde weg', () => {
    expect(mapOffHits([{ ...hit, product_name: '  ' }])).toEqual([]);
    expect(mapOffHits([{ ...hit, nutriments: {} }])).toEqual([]);
    expect(mapOffHits([{ ...hit, nutriments: undefined }])).toEqual([]);
  });

  it('houdt producten met 0 kcal die wél voedingswaarden hebben', () => {
    const water = { ...hit, product_name: 'Bronwater', nutriments: { 'energy-kcal_100g': 0, proteins_100g: 0 } };
    expect(mapOffHits([water])[0].per100g).toEqual({ kcal: 0, protein: 0, carbs: 0, fat: 0 });
  });

  it('gaat om met onzin-invoer', () => {
    expect(mapOffHits(null)).toEqual([]);
    expect(mapOffHits([null, undefined, 42])).toEqual([]);
  });
});
