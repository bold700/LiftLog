import { describe, it, expect } from 'vitest';
import { resolveViewedUser } from '../../src/utils/viewAs';

/**
 * Waarom dit getest wordt: hier staat de grens van "Bekijk als". Zou een sporter langs deze
 * functie komen, dan zou hij de logs, metingen en voeding van een ander te zien krijgen. De
 * Firestore-regels houden dat ook tegen, maar een scherm dat het probeert is al fout.
 */

describe('resolveViewedUser', () => {
  it('zonder keuze kijk je naar jezelf', () => {
    const v = resolveViewedUser('u1', 'Kenny', true, null);
    expect(v).toEqual({ userId: 'u1', name: 'Kenny', isOther: false });
  });

  it('een trainer kan een sporter kiezen', () => {
    const v = resolveViewedUser('u1', 'Kenny', true, { userId: 'u2', name: 'Margot' });
    expect(v).toEqual({ userId: 'u2', name: 'Margot', isOther: true });
  });

  it('een sporter krijgt zichzelf, ook met een keuze in het geheugen', () => {
    const v = resolveViewedUser('u2', 'Margot', false, { userId: 'u1', name: 'Kenny' });
    expect(v).toEqual({ userId: 'u2', name: 'Margot', isOther: false });
  });

  it('jezelf kiezen telt niet als meekijken, dus geen balk', () => {
    const v = resolveViewedUser('u1', 'Kenny', true, { userId: 'u1', name: 'Kenny' });
    expect(v.isOther).toBe(false);
  });

  it('een keuze zonder id valt terug op jezelf', () => {
    const v = resolveViewedUser('u1', 'Kenny', true, { userId: '', name: '' });
    expect(v).toEqual({ userId: 'u1', name: 'Kenny', isOther: false });
  });

  it('nog geen profiel geladen levert een lege gebruiker op, niet die van een ander', () => {
    const v = resolveViewedUser(null, 'Mijzelf', true, null);
    expect(v).toEqual({ userId: '', name: 'Mijzelf', isOther: false });
  });
});
