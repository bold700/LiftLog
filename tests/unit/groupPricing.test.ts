import { describe, expect, it } from 'vitest';
import { formatEuro, groupPricingOf, groupSessionPrice, isGroupHolder } from '../../src/utils/groupPricing';

describe('groepsprijs in de app', () => {
  it('standaard €85 + €25, en een eigen instelling', () => {
    expect(groupPricingOf(null)).toEqual({ base: 85, perExtra: 25 });
    expect(groupPricingOf({ base: '90', perExtra: -1 })).toEqual({ base: 90, perExtra: 25 });
    expect([1, 2, 4].map((n) => groupSessionPrice(groupPricingOf(null), n))).toEqual([85, 110, 160]);
    expect(groupSessionPrice(groupPricingOf(null), 0)).toBe(0);
  });
  it('bedragen en groepshouders', () => {
    expect(formatEuro(771).replace(/\s/g, ' ')).toBe('€ 771,00');
    expect(isGroupHolder('grp_g1')).toBe(true);
    expect(isGroupHolder('sporter1')).toBe(false);
  });
});
