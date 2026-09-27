/**
 * Ingebouwde standaard voor de oefeningenbibliotheek: per soort oefening (bewegingspatroon) de
 * gangbare regressies, progressies en alternatieven bij veelvoorkomende klachten. Dit is het
 * voorstel van het systeem; de studio neemt het over en past het aan in Beheer → Oefeningen.
 * De trainer beslist: dit is naslag, geen voorschrift.
 */

export type ComplaintKey = 'rug' | 'knie' | 'schouder' | 'pols' | 'elleboog' | 'heup' | 'nek' | 'enkel' | 'zwanger';

export const COMPLAINT_LABELS: Record<ComplaintKey, string> = {
  rug: 'Rug',
  knie: 'Knie',
  schouder: 'Schouder',
  pols: 'Pols',
  elleboog: 'Elleboog',
  heup: 'Heup',
  nek: 'Nek',
  enkel: 'Enkel',
  zwanger: 'Zwanger',
};

/** Vrije tekst van de trainer ("lage rug", "zwangerschap", "knieën") naar een vaste klacht. */
const COMPLAINT_SYNONYMS: [ComplaintKey, RegExp][] = [
  ['zwanger', /zwanger|pregnan|postpartum|na de bevalling|bekkenbodem|diastase|rectus/],
  ['rug', /rug|back|lumba|hernia|si-gewricht/],
  ['knie', /knie|knee|patella|meniscus|kruisband/],
  ['schouder', /schouder|shoulder|rotator|impingement/],
  ['pols', /pols|wrist|hand/],
  ['elleboog', /elleboog|elbow|tennisarm|golfarm/],
  ['heup', /heup|hip|lies|bil|glute/],
  ['nek', /nek|neck/],
  ['enkel', /enkel|ankle|achilles|voet|kuit/],
];

export function complaintKeyOf(text: string): ComplaintKey | null {
  const t = text.toLowerCase().trim();
  if (!t) return null;
  for (const [key, re] of COMPLAINT_SYNONYMS) if (re.test(t)) return key;
  return null;
}

export interface StandardAdvice {
  /** Soort oefening, bijv. "Squat-patroon". */
  family: string;
  regressions: string[];
  progressions: string[];
  alternatives: Partial<Record<ComplaintKey, string>>;
}

interface Family extends StandardAdvice {
  /** Trefwoorden in de naam (klein geschreven). De eerste familie die past, wint. */
  match: RegExp;
}

/** Volgorde telt: specifiekere patronen (split squat, hip thrust) staan voor algemenere (squat). */
const FAMILIES: Family[] = [
  {
    family: 'Heupbrug / hip thrust',
    match: /hip ?th?rust|hiptrust|glute bridge|bridge/,
    regressions: ['Glute bridge op de grond', 'Hip thrust zonder gewicht', 'Glute bridge met band om de knieën'],
    progressions: ['Single leg hip thrust', 'Barbell hip thrust zwaarder', 'Pauze van 2 tellen bovenin', 'B-stance hip thrust'],
    alternatives: {
      zwanger: 'Met resistance band over de heupen, geen stang op de buik; na het 1e trimester niet lang plat op de rug',
      rug: 'Glute bridge met bekken kantelen, niet overstrekken bovenin',
      knie: 'Voeten iets verder van het lichaam, minder kniebuiging',
      nek: 'Bovenrug stabiel op de bank, kin naar de borst',
      heup: 'Glute bridge op de grond met kleinere uitslag',
    },
  },
  {
    family: 'Lunge / split squat',
    match: /lunge|split squat|bulgarian|step[- ]?up/,
    regressions: [
      'Split squat met steun (hand tegen muur of rek)',
      'Reverse lunge (stap naar achter)',
      'Kleinere pas en minder diepte',
    ],
    progressions: [
      'Walking lunge met dumbbells',
      'Bulgarian split squat',
      'Deficit reverse lunge (voorvoet op verhoging)',
      'Pauze onderin',
    ],
    alternatives: {
      knie: 'Reverse lunge of step-up op een lage box; knie boven de voet',
      rug: 'Dumbbells naast het lichaam in plaats van een stang op de rug',
      heup: 'Kleinere pas, steun vasthouden',
      zwanger: 'Split squat met steun voor het evenwicht, geen jumping lunges',
      pols: 'Gewichtsvest of kettlebell in goblet-positie',
      enkel: 'Split squat op de plek in plaats van lopend',
    },
  },
  {
    family: 'Squat-patroon',
    match: /squat|goblet|leg press|wall sit|sissy/,
    regressions: [
      'Box squat (zitten tot op een bank)',
      'Squat met steun (TRX of rek vasthouden)',
      'Squat zonder gewicht, minder diep',
    ],
    progressions: [
      'Goblet squat zwaarder',
      'Front squat of back squat met stang',
      'Tempo squat (3 tellen omlaag)',
      'Pauze van 2 tellen onderin',
    ],
    alternatives: {
      knie: 'Box squat tot net boven 90°, knieën in lijn met de voeten',
      rug: 'Goblet squat of box squat, geen stang op de rug',
      heup: 'Minder diep, voeten iets breder en licht uitgedraaid',
      zwanger: 'Goblet squat of squat met steun, niet te diep, uitademen bij het omhoog komen',
      schouder: 'Goblet squat in plaats van een stang op de rug',
      pols: 'Goblet squat met de kettlebell aan de horens',
      enkel: 'Hakken licht verhoogd (plaatje onder de hakken)',
    },
  },
  {
    family: 'Heupscharnier (hinge)',
    match: /deadlift|\brdl\b|romanian|good ?morning|swing|hinge|pull[- ]?through/,
    regressions: [
      'Hip hinge met een stok langs de rug',
      'Kettlebell deadlift vanaf een verhoging',
      'Romanian deadlift met lichte dumbbells',
    ],
    progressions: ['Barbell deadlift', 'Single leg Romanian deadlift', 'Deficit deadlift', 'Pauze net onder de knie'],
    alternatives: {
      rug: 'Glute bridge of hip thrust; of hinge vanaf een verhoging met licht gewicht',
      knie: 'Romanian deadlift: knieën licht gebogen, geen diepe kniebuiging',
      zwanger: 'Kettlebell deadlift vanaf een verhoging, licht, niet persen',
      pols: 'Trap bar of lifting straps',
      schouder: 'Trap bar deadlift',
      heup: 'Kleinere uitslag, vanaf een verhoging',
    },
  },
  {
    family: 'Duwen horizontaal (borst)',
    match: /push[- ]?up|press[- ]?up|bench|chest|floor press|\bdips?\b|\bfly\b|flye|pec/,
    regressions: ['Incline push-up (handen op een bank)', 'Push-up op de knieën', 'Wall push-up', 'Chest press machine'],
    progressions: ['Push-up met pauze onderin', 'Decline push-up', 'Dumbbell bench press zwaarder', 'Push-up met gewichtsvest'],
    alternatives: {
      schouder: 'Neutrale greep met dumbbells, ellebogen op 45°, of floor press (kleinere uitslag)',
      pols: 'Push-up op dumbbells of push-up grips (rechte pols)',
      zwanger: 'Incline push-up; na het 1e trimester niet plat op de rug liggen',
      elleboog: 'Kleinere uitslag, neutrale greep',
      rug: 'Incline push-up, buik en billen aangespannen',
      nek: 'Chest press machine met hoofdsteun',
    },
  },
  {
    family: 'Duwen verticaal (schouder)',
    match: /overhead|shoulder press|\bohp\b|military|arnold|lateral raise|side raise|front raise|landmine|pike|y[- ]?raise/,
    regressions: ['Zittende dumbbell press met rugsteun', 'Landmine press', 'Lichtere dumbbells, halve beweging'],
    progressions: ['Staande barbell press', 'Push press', 'Single arm press', 'Pauze bovenin'],
    alternatives: {
      schouder: 'Landmine press (schuine hoek) of neutrale greep; blijf onder de pijngrens',
      rug: 'Zittend met rugsteun',
      nek: 'Landmine press, schouders laag houden',
      zwanger: 'Zittend met rugsteun, niet persen',
      pols: 'Neutrale greep met dumbbells',
      elleboog: 'Lichter, neutrale greep',
    },
  },
  {
    family: 'Trekken (rug)',
    match: /\brows?\b|rowing|pull[- ]?up|chin[- ]?up|pulldown|pull[- ]?down|face pull|rear delt|lat /,
    regressions: [
      'Lat pulldown of assisted pull-up (band)',
      'Ring row of TRX row, lichaam meer rechtop',
      'Seated cable row met borststeun',
    ],
    progressions: [
      'Pull-up of chin-up',
      'Negatieve pull-up (3–5 tellen omlaag)',
      'Bent-over row zwaarder',
      'Pauze met het gewicht tegen de borst',
    ],
    alternatives: {
      rug: 'Chest supported row (borst op een schuine bank)',
      schouder: 'Neutrale greep, niet boven de pijngrens trekken',
      elleboog: 'Neutrale greep, minder gewicht',
      pols: 'Straps of neutrale greep',
      zwanger: 'Seated cable row of chest supported row, niet voorover gebogen',
      nek: 'Schouders laag, kin licht ingetrokken',
    },
  },
  {
    family: 'Core / buik',
    match:
      /plank|dead ?bug|crunch|sit[- ]?up|bicycle|leg raise|russian twist|bird ?dog|hollow|mountain climber|rollout|pallof|\babs?\b|buik|flutter|v[- ]?up|toe touch/,
    regressions: ['Plank op de knieën', 'Dead bug met gebogen knieën', 'Bird dog'],
    progressions: ['Plank met arm of been optillen', 'Hollow hold', 'Ab wheel rollout', 'Pallof press met rotatie'],
    alternatives: {
      rug: 'Dead bug of bird dog in plaats van sit-ups en crunches',
      zwanger:
        'Geen crunches of sit-ups; na het 1e trimester niet lang op de rug. Bird dog, zijplank op de knieën, ademhaling en bekkenbodem',
      nek: 'Hoofd ondersteund, dead bug',
      pols: 'Plank op de onderarmen',
      schouder: 'Dead bug in plaats van plank',
      heup: 'Dead bug met gebogen knieën',
    },
  },
  {
    family: 'Armen (biceps/triceps)',
    match: /curl|tricep|skull ?crusher|pushdown|push[- ]?down|kickback|extension|hammer/,
    regressions: ['Lichter gewicht of elastiek', 'Zittend met rugsteun', 'Kabel in plaats van dumbbell'],
    progressions: ['Tempo (3 tellen omlaag)', 'Pauze halverwege', 'Zwaarder, minder herhalingen'],
    alternatives: {
      elleboog: 'Kabel of elastiek in plaats van een stang, kleinere uitslag',
      pols: 'Neutrale greep (hammer)',
      schouder: 'Tricep pushdown in plaats van overhead extension',
      zwanger: 'Zittend, licht',
    },
  },
  {
    family: 'Kuiten',
    match: /calf|kuit/,
    regressions: ['Met steun, op twee benen', 'Zittend (seated calf raise)'],
    progressions: ['Op één been', 'Op een verhoging met pauze onderin', 'Met gewicht'],
    alternatives: {
      enkel: 'Kleinere uitslag, zittend',
      knie: 'Zittende calf raise',
      zwanger: 'Met steun voor het evenwicht',
    },
  },
  {
    family: 'Dragen (carry)',
    match: /carry|farmer|suitcase|waiter/,
    regressions: ['Lichter, kortere afstand', 'Twee gewichten in plaats van één'],
    progressions: ['Zwaarder', 'Suitcase carry (één kant)', 'Overhead carry'],
    alternatives: {
      rug: 'Lichter, rechtop blijven, twee kanten gelijk',
      pols: 'Straps of dikkere handgrepen',
      schouder: 'Gewicht laag langs het lichaam, geen overhead',
      zwanger: 'Licht, rustig lopen',
    },
  },
  {
    family: 'Heupspieren met band',
    match: /band walk|lateral walk|monster walk|clamshell|abduction|side step|mini[- ]?band/,
    regressions: ['Band boven de knieën in plaats van bij de enkels', 'Kleinere stappen', 'Clamshell op de grond'],
    progressions: ['Band bij de enkels of voeten', 'Dieper in de knieën zakken', 'Zwaardere band'],
    alternatives: {
      knie: 'Band boven de knieën, hoog blijven staan',
      heup: 'Clamshell op de grond, kleinere uitslag',
      zwanger: 'Met steun, band boven de knieën',
    },
  },
  {
    family: 'Springen en conditie',
    match: /jump|burpee|battle rope|wall ball|box jump|skater|sprint|rope|skipping|jumping jack|thruster|slam/,
    regressions: ['Zonder sprong (step-back of step-up)', 'Lager tempo', 'Kleinere beweging of lichtere bal'],
    progressions: ['Hoger tempo of langere set', 'Zwaardere bal', 'Hogere box'],
    alternatives: {
      knie: 'Zonder springen: step-up of squat to press',
      zwanger: 'Niet springen: marcheren, step-back burpee zonder sprong',
      rug: 'Lagere intensiteit, geen draaien onder belasting',
      enkel: 'Zonder springen, op de fiets of roeier',
      schouder: 'Battle rope lager, of een oefening zonder boven het hoofd',
    },
  },
];

/** Algemeen advies per klacht als de oefening geen eigen alternatief heeft. */
const GENERIC: Record<ComplaintKey, string> = {
  rug: 'Neutrale rug, lichter gewicht, met steun (zittend of borst op een bank)',
  knie: 'Minder diep, knie boven de voet, geen sprongen',
  schouder: 'Neutrale greep, niet boven schouderhoogte, lichter',
  pols: 'Neutrale greep of op de onderarmen',
  elleboog: 'Neutrale greep, elastiek of kabel',
  heup: 'Kleinere bewegingsuitslag, met steun',
  nek: 'Hoofd ondersteund, schouders laag',
  enkel: 'Zonder springen, met steun voor het evenwicht',
  zwanger: 'Lichter, niet persen, niet lang op de rug na het 1e trimester, niet springen',
};

/** Het standaardvoorstel voor een oefening, of null als de soort oefening niet herkend wordt. */
export function standardAdvice(exerciseName: string): StandardAdvice | null {
  const n = exerciseName.toLowerCase();
  const fam = FAMILIES.find((f) => f.match.test(n));
  if (!fam) return null;
  return { family: fam.family, regressions: fam.regressions, progressions: fam.progressions, alternatives: fam.alternatives };
}

/**
 * Een alternatief voor deze oefening bij een klacht (vrije tekst of vaste klacht). Eerst het
 * alternatief van de soort oefening, anders het algemene advies voor die klacht; null als de klacht
 * niet herkend wordt (dan kan de trainer het slimme voorstel vragen).
 */
export function standardAlternative(exerciseName: string, complaint: string): string | null {
  const key = complaintKeyOf(complaint);
  if (!key) return null;
  return standardAdvice(exerciseName)?.alternatives[key] ?? GENERIC[key];
}

/** Van een beperking op het profiel (Beheer/Profiel) naar een klacht. */
export function complaintOfLimitationArea(area: string): ComplaintKey | null {
  switch (area) {
    case 'onderrug':
    case 'bovenrug':
      return 'rug';
    case 'knie':
    case 'hamstring':
      return 'knie';
    case 'schouder':
    case 'borst':
      return 'schouder';
    case 'pols':
      return 'pols';
    case 'elleboog':
      return 'elleboog';
    case 'heup':
    case 'buik':
      return 'heup';
    case 'nek':
      return 'nek';
    case 'enkel':
      return 'enkel';
    default:
      return null;
  }
}
