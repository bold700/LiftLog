import { describe, it, expect } from 'vitest';
import { mapOffHits, mergeProducts, nutritionDetails, parseServingGrams } from '../../api/food-search.mjs';

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
        packageGrams: null,
        imageLargeUrl: null,
        nutriscore: null,
        details: null,
        nl: false,
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

  it('laat een product met alleen een barcode als naam weg', () => {
    expect(mapOffHits([{ ...hit, product_name: '4056489132032' }])).toEqual([]);
    expect(mapOffHits([{ ...hit, product_name: '4056 489 132' }])).toEqual([]);
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

describe('nl-markering en samenvoegen', () => {
  const base = { product_name: 'Kwark', nutriments: { 'energy-kcal_100g': 60 } };

  it('markeert een product dat in Nederland verkocht wordt', () => {
    expect(mapOffHits([{ ...base, code: '1', countries_tags: ['en:netherlands', 'en:belgium'] }])[0].nl).toBe(true);
    expect(mapOffHits([{ ...base, code: '2', countries_tags: ['en:germany'] }])[0].nl).toBe(false);
    expect(mapOffHits([{ ...base, code: '3' }])[0].nl).toBe(false);
  });

  it('houdt Nederlandse treffers voorop en telt een dubbel product één keer', () => {
    const nl = mapOffHits([{ ...base, code: '1', countries_tags: ['en:netherlands'] }]);
    const world = mapOffHits([
      { ...base, code: '1', product_name: 'Kwark (wereld)' },
      { ...base, code: '9', product_name: 'Quark' },
    ]);
    const merged = mergeProducts(nl, world);
    expect(merged.map((p) => p.code)).toEqual(['1', '9']);
    expect(merged[0].name).toBe('Kwark');
  });
});

describe('extra productinformatie', () => {
  it('leest verpakkingsinhoud, grote foto en Nutri-Score', () => {
    const [p] = mapOffHits([{
      code: '1', product_name: 'Protein kwark', quantity: '450 g', image_url: 'https://x/groot.jpg', nutriscore_grade: 'A',
      nutriments: { 'energy-kcal_100g': 66, sugars_100g: '3.0', fiber_100g: 0.2, salt_100g: 0.1 },
    }]);
    expect(p.packageGrams).toBe(450);
    expect(p.imageLargeUrl).toBe('https://x/groot.jpg');
    expect(p.nutriscore).toBe('a');
    expect(p.details).toEqual({ sugars: 3, fiber: 0.2, saturatedFat: null, salt: 0.1 });
  });

  it('geeft geen details als het etiket er geen noemt, en geen Nutri-Score bij "unknown"', () => {
    const [p] = mapOffHits([{ code: '1', product_name: 'X', nutriscore_grade: 'unknown', nutriments: { 'energy-kcal_100g': 1 } }]);
    expect(p.details).toBeNull();
    expect(p.nutriscore).toBeNull();
    expect(nutritionDetails({})).toBeNull();
  });
});
