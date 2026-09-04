/**
 * Hartslagzones uit leeftijd en rusthartslag.
 *
 * Maximale hartslag: 220 − leeftijd (zelfde aanname als de Formule 7-routekaart).
 * Met rusthartslag: Karvonen (hartslagreserve): doel = rust + (max − rust) × %.
 * Zonder rusthartslag: percentage van de maximale hartslag.
 *
 * De 220-formule heeft een spreiding van zo'n ±10 bpm per persoon; een gemeten
 * maximum uit een test is altijd beter. De zones zijn een startpunt, geen wet.
 */

export interface HeartRateZone {
  zone: 1 | 2 | 3 | 4 | 5;
  name: string;
  /** Ondergrens en bovengrens als fractie (0..1) van reserve of max. */
  low: number;
  high: number;
  /** Berekende grenzen in bpm. */
  lowBpm: number;
  highBpm: number;
  purpose: string;
}

export interface HeartRateZonesResult {
  maxHr: number;
  restingHr: number | null;
  method: 'karvonen' | 'percent-max';
  zones: HeartRateZone[];
}

const ZONE_DEFS: { zone: 1 | 2 | 3 | 4 | 5; name: string; low: number; high: number; purpose: string }[] = [
  { zone: 1, name: 'Herstel', low: 0.5, high: 0.6, purpose: 'Warming-up, cooling-down, actief herstel' },
  { zone: 2, name: 'Duur', low: 0.6, high: 0.7, purpose: 'Vetverbranding, basisconditie, lange sessies' },
  { zone: 3, name: 'Tempo', low: 0.7, high: 0.8, purpose: 'Aerobe capaciteit, comfortabel zwaar' },
  { zone: 4, name: 'Drempel', low: 0.8, high: 0.9, purpose: 'Lactaatdrempel, intervallen van enkele minuten' },
  { zone: 5, name: 'Maximaal', low: 0.9, high: 1.0, purpose: 'Korte intervallen, sprints, VO2max' },
];

export function maxHeartRate(ageYears: number): number | null {
  if (!Number.isFinite(ageYears) || ageYears <= 0 || ageYears >= 120) return null;
  return 220 - Math.round(ageYears);
}

export function heartRateZones(ageYears: number | null | undefined, restingHr: number | null | undefined): HeartRateZonesResult | null {
  if (ageYears == null) return null;
  const maxHr = maxHeartRate(ageYears);
  if (maxHr == null) return null;
  const rest = restingHr != null && Number.isFinite(restingHr) && restingHr > 20 && restingHr < maxHr ? Math.round(restingHr) : null;
  const method = rest != null ? 'karvonen' : 'percent-max';
  const bpm = (f: number) => Math.round(rest != null ? rest + (maxHr - rest) * f : maxHr * f);
  return {
    maxHr,
    restingHr: rest,
    method,
    zones: ZONE_DEFS.map((z) => ({ ...z, lowBpm: bpm(z.low), highBpm: bpm(z.high) })),
  };
}
