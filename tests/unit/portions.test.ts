import { describe, expect, it } from 'vitest';
import { portionsFor } from '../../src/utils/portions';

describe('portionsFor', () => {
  it('geeft bij kwark een schaaltje, bakje en eetlepel', () => {
    const labels = portionsFor('Magere kwark').map((p) => p.label);
    expect(labels).toEqual(['Schaaltje', 'Bakje', 'Eetlepel']);
    expect(portionsFor('Magere kwark').find((p) => p.label === 'Bakje')?.grams).toBe(200);
  });

  it('herkent brood ongeacht hoofdletters en accenten', () => {
    expect(portionsFor('Volkoren BROOD').map((p) => p.label)).toContain('Snee');
    expect(portionsFor('Knäckebröd').map((p) => p.label)).toContain('Snee');
  });

  it('zet de portie van de verpakking vooraan als die er is', () => {
    const p = portionsFor('Eiwitreep', 60);
    expect(p[0]).toEqual({ label: 'Portie op de verpakking', grams: 60 });
    expect(p.map((x) => x.label)).toContain('Reep');
  });

  it('herhaalt de verpakkingsportie niet als de tabel hetzelfde gewicht al heeft', () => {
    const p = portionsFor('Banaan', 120);
    expect(p.filter((x) => x.grams === 120)).toHaveLength(1);
  });

  it('valt terug op vaste grammen voor een onbekend product', () => {
    expect(portionsFor('Xyzzy').map((p) => p.grams)).toEqual([50, 100, 200]);
  });

  it('laat "ei" niet afgaan op "eiwitreep"', () => {
    expect(portionsFor('Eiwitreep').map((p) => p.label)).not.toContain('Stuk');
  });
});
