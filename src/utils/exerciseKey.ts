/**
 * Vaste sleutel voor een oefeningnaam, zodat "Hip Thrust", "hip thrust" en "Hip-thrust" dezelfde
 * oefening in de bibliotheek zijn. Accenten weg, alles klein, alleen letters en cijfers met streepjes.
 */
export function exerciseKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}
