/**
 * Nederlandse porties bij een product: bakje, eetlepel, snee, glas.
 *
 * Open Food Facts kent voor vrijwel geen enkel Nederlands product een portiegrootte, en "100 gram"
 * is voor bijna niemand hoe je eet. Deze tabel koppelt woorden in de productnaam aan de porties
 * die een Nederlander daadwerkelijk in handen heeft. De grammen zijn gangbare gemiddelden (bron:
 * RIVM-maten en verpakkingen), bedoeld als goede eerste gok — de gebruiker kan altijd bijstellen.
 */
export interface Portion {
  label: string;
  grams: number;
}

interface PortionRule {
  /** Een woord (of woorddeel) dat in de genormaliseerde productnaam voorkomt. */
  match: RegExp;
  portions: Portion[];
}

const RULES: PortionRule[] = [
  // Zuivel
  { match: /kwark|skyr|yoghurt|yogurt|vla|pudding/, portions: [{ label: 'Schaaltje', grams: 150 }, { label: 'Bakje', grams: 200 }, { label: 'Eetlepel', grams: 30 }] },
  { match: /\bmelk|karnemelk|chocomel|drinkyoghurt|sojadrink|haverdrink|amandeldrink/, portions: [{ label: 'Glas', grams: 200 }, { label: 'Kopje', grams: 150 }, { label: 'Beker', grams: 250 }] },
  { match: /\bkaas|cheese|brie|camembert|feta|mozzarella|hüttenkäse|huttenkase|cottage/, portions: [{ label: 'Plak', grams: 20 }, { label: 'Blokje', grams: 10 }, { label: 'Portie', grams: 30 }] },
  { match: /\bei\b|eieren|omelet/, portions: [{ label: 'Stuk', grams: 60 }, { label: '2 stuks', grams: 120 }] },
  { match: /\bboter\b|margarine|halvarine|smeersel/, portions: [{ label: 'Mespunt', grams: 5 }, { label: 'Theelepel', grams: 7 }] },
  // Brood en beleg
  { match: /brood|boterham|snee|sneetje|toast|beschuit|cracker|knäckebröd|knackebrod|rijstwafel|bolletje|pistolet/, portions: [{ label: 'Snee', grams: 35 }, { label: '2 sneetjes', grams: 70 }, { label: 'Stuk', grams: 50 }] },
  { match: /pindakaas|notenpasta|hazelnootpasta|nutella|jam|honing|appelstroop|chocopasta|hummus/, portions: [{ label: 'Theelepel', grams: 5 }, { label: 'Eetlepel', grams: 15 }] },
  { match: /hagelslag|vlokken|muisjes|kokosbrood/, portions: [{ label: 'Voor 1 snee', grams: 15 }] },
  { match: /vleeswaren|ham\b|kipfilet\s*\(?beleg|filet americain|rookworst|salami|worst/, portions: [{ label: 'Plak', grams: 15 }, { label: '2 plakken', grams: 30 }] },
  // Ontbijt
  { match: /havermout|muesli|granola|cruesli|cornflakes|brinta|ontbijtgranen|oatmeal/, portions: [{ label: 'Eetlepel', grams: 10 }, { label: 'Portie', grams: 40 }, { label: 'Grote portie', grams: 60 }] },
  // Warme maaltijd
  { match: /rijst|pasta|spaghetti|penne|macaroni|noedels|noodles|couscous|bulgur|quinoa/, portions: [{ label: 'Opscheplepel', grams: 60 }, { label: 'Portie', grams: 150 }, { label: 'Grote portie', grams: 250 }] },
  { match: /aardappel|friet|patat|krieltjes|puree/, portions: [{ label: 'Stuk', grams: 70 }, { label: 'Portie', grams: 200 }] },
  { match: /kipfilet|kip\b|kippen|kalkoen|biefstuk|rundvlees|gehakt|varkens|zalm|vis\b|tonijn|kabeljauw|garnalen|tofu|tempeh/, portions: [{ label: 'Klein', grams: 100 }, { label: 'Portie', grams: 150 }, { label: 'Groot', grams: 200 }] },
  { match: /groente|broccoli|spinazie|sperzie|wortel|paprika|courgette|bloemkool|sla\b|salade|tomaat|komkommer/, portions: [{ label: 'Opscheplepel', grams: 50 }, { label: 'Portie', grams: 150 }, { label: 'Ruime portie', grams: 250 }] },
  { match: /soep/, portions: [{ label: 'Kop', grams: 250 }, { label: 'Bord', grams: 350 }] },
  { match: /\bsaus|mayonaise|ketchup|dressing|olie\b|olijfolie/, portions: [{ label: 'Theelepel', grams: 5 }, { label: 'Eetlepel', grams: 15 }] },
  // Fruit
  { match: /banaan/, portions: [{ label: 'Stuk', grams: 120 }] },
  { match: /appel|peer\b|sinaasappel|nectarine|perzik/, portions: [{ label: 'Stuk', grams: 150 }] },
  { match: /mandarijn|kiwi|pruim/, portions: [{ label: 'Stuk', grams: 70 }, { label: '2 stuks', grams: 140 }] },
  { match: /aardbei|blauwe bes|bosbes|framboos|druiven|bessen/, portions: [{ label: 'Handje', grams: 80 }, { label: 'Bakje', grams: 150 }] },
  // Tussendoor
  { match: /noten|amandel|walnoot|cashew|pinda|pistache|zaden|pitten/, portions: [{ label: 'Handje', grams: 25 }, { label: 'Zakje', grams: 45 }] },
  { match: /chips|nacho|popcorn|zoutjes/, portions: [{ label: 'Handje', grams: 25 }, { label: 'Zakje', grams: 40 }] },
  { match: /chocola|reep|snickers|mars\b|twix|kitkat|bounty|candy|snoep|drop/, portions: [{ label: 'Stukje', grams: 10 }, { label: 'Reep', grams: 45 }] },
  { match: /koek|biscuit|stroopwafel|speculaas|ontbijtkoek|cake|muffin|croissant|donut|gevulde koek/, portions: [{ label: 'Stuk', grams: 30 }, { label: '2 stuks', grams: 60 }] },
  { match: /protein bar|eiwitreep|proteïne reep|proteine reep/, portions: [{ label: 'Reep', grams: 55 }] },
  { match: /whey|eiwitpoeder|proteïnepoeder|proteine poeder|protein powder|shake/, portions: [{ label: 'Scoop', grams: 30 }, { label: '2 scoops', grams: 60 }] },
  // Dranken
  { match: /cola|fanta|sprite|limonade|frisdrank|ice tea|sap\b|smoothie|energy|bier|wijn/, portions: [{ label: 'Glas', grams: 200 }, { label: 'Blikje', grams: 330 }, { label: 'Fles', grams: 500 }] },
];

const FALLBACK: Portion[] = [{ label: '50 g', grams: 50 }, { label: '100 g', grams: 100 }, { label: '200 g', grams: 200 }];

function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
}

/**
 * Porties die bij dit product passen. Een eigen portiegrootte van het product komt vooraan, dan
 * de porties uit de tabel, en anders vaste grammen zodat er altijd iets te tikken valt.
 */
export function portionsFor(name: string, servingGrams: number | null = null): Portion[] {
  const n = norm(name);
  const rule = RULES.find((r) => r.match.test(n));
  const base = rule ? rule.portions : FALLBACK;
  const out: Portion[] = [];
  if (servingGrams != null && servingGrams > 0 && !base.some((p) => p.grams === servingGrams)) {
    out.push({ label: 'Portie op de verpakking', grams: servingGrams });
  }
  for (const p of base) if (!out.some((o) => o.grams === p.grams)) out.push(p);
  return out;
}
