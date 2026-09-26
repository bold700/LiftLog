/**
 * Hoe sterk een spiergroep op de lichaamsillustratie kleurt: level 1 (minder) tot 5 (meer).
 *
 * `sortedFrequencies` zijn de verschillende aantallen sessies, van hoog naar laag. De meest getrainde
 * spiergroep krijgt level 5, de minst getrainde level 1, de rest verdeeld daartussen. Zo klopt het met
 * de legenda "Minder → Meer".
 */
export function levelForFrequency(frequency: number, sortedFrequencies: number[]): number {
  if (frequency <= 0) return 0;
  const rank = sortedFrequencies.indexOf(frequency);
  if (rank < 0) return 1;
  const level = 5 - Math.floor((rank / Math.max(1, sortedFrequencies.length - 1)) * 4);
  return Math.max(1, Math.min(5, level));
}
