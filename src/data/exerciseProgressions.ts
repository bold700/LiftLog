/**
 * Ingebouwde standaard voor de oefeningenbibliotheek, op basis van de oefeningendatabase (de
 * VORM-catalogus in mega_exercise_db.json en de gif-database). Per soort oefening een ladder van
 * makkelijk naar zwaar: regressies zijn de treden onder de oefening, progressies de treden erboven.
 * Een oefening komt zo nooit als voorstel voor zichzelf terug. Daarnaast per klacht een alternatief.
 *
 * Dit is het voorstel van het systeem; de studio neemt het over en past het aan in Beheer →
 * Oefeningen. De trainer beslist: dit is naslag, geen voorschrift.
 */
import { exerciseKey } from '../utils/exerciseKey';

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

/** Een oefening uit de database (met gifje), met een korte aanwijzing. Zonder oefening: alleen een aanwijzing (bijv. "tempo"). */
export interface ExerciseRef {
  exercise: string;
  note: string;
}

/** "Leg Press Machine · kleine diepte" */
export function refText(ref: ExerciseRef): string {
  if (ref.exercise && ref.note) return `${ref.exercise} · ${ref.note}`;
  return ref.exercise || ref.note;
}

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
  regressions: ExerciseRef[];
  progressions: ExerciseRef[];
  alternatives: Partial<Record<ComplaintKey, ExerciseRef>>;
}

/** Trede op de ladder: oefening, niveau (1 = makkelijkst) en optioneel een aanwijzing. */
type Rung = [exercise: string, level: number, note?: string];

interface Family {
  family: string;
  /** Trefwoorden in de naam (klein geschreven). De eerste familie die past, wint. */
  match: RegExp;
  ladder: Rung[];
  /** Makkelijker of zwaarder zonder andere oefening (tempo, uitslag, pauze). */
  easier: string[];
  harder: string[];
  alternatives: Partial<Record<ComplaintKey, [exercise: string, note: string]>>;
}

/** Volgorde telt: specifiekere patronen (split squat, hip thrust, pulldown) staan voor algemenere. */
const FAMILIES: Family[] = [
  {
    family: 'Heupbrug / hip thrust',
    match: /hip ?th?rust|hiptrust|glute bridge|bridge/,
    ladder: [
      ['Glute Bridge', 1],
      ['Hip Thrust Machine', 2],
      ['Dumbbell Hip Thrust', 2],
      ['Single Leg Glute Bridge', 3],
      ['Barbell Hip Thrust', 4],
    ],
    easier: ['Zonder gewicht, kleinere uitslag'],
    harder: ['Pauze van 2 tellen bovenin', 'Band om de knieën'],
    alternatives: {
      zwanger: ['Glute Bridge', 'met resistance band, geen stang op de buik; na het 1e trimester niet lang op de rug'],
      rug: ['Glute Bridge', 'bekken kantelen, niet overstrekken bovenin'],
      knie: ['Glute Bridge', 'voeten verder van het lichaam, minder kniebuiging'],
      nek: ['Hip Thrust Machine', 'bovenrug stabiel, kin naar de borst'],
      heup: ['Glute Bridge', 'kleinere uitslag'],
    },
  },
  {
    family: 'Lunge / split squat',
    match: /lunge|split squat|bulgarian|step[- ]?up/,
    ladder: [
      ['Dumbbell Step-Up', 1, 'lage box'],
      ['Dumbbell Lunge', 2, 'stap naar achter (reverse)'],
      ['Barbell Lunge', 3],
      ['Dumbbell Walking Lunge', 3],
      ['Bulgarian Split Squat', 4],
    ],
    easier: ['Met steun (hand tegen muur of rek)', 'Kleinere pas, minder diep'],
    harder: ['Voorvoet op een verhoging (deficit)', 'Pauze onderin'],
    alternatives: {
      knie: ['Dumbbell Step-Up', 'lage box, knie boven de voet'],
      rug: ['Dumbbell Lunge', 'dumbbells naast het lichaam, geen stang op de rug'],
      heup: ['Dumbbell Step-Up', 'lage box, steun vasthouden'],
      zwanger: ['Dumbbell Lunge', 'op de plek met steun voor het evenwicht, niet springen'],
      pols: ['Goblet Squat', 'gewicht tegen de borst in plaats van in de handen'],
      enkel: ['Dumbbell Lunge', 'op de plek in plaats van lopend'],
    },
  },
  {
    family: 'Squat-patroon',
    match: /squat|goblet|leg press|wall sit|sissy/,
    ladder: [
      ['Leg Press Machine', 1],
      ['Bodyweight Squat', 1, 'tot op een bank (box squat)'],
      ['Cable Squat', 2],
      ['Goblet Squat', 2],
      ['Kettlebell Goblet Squat', 2],
      ['Dumbbell Squat', 3],
      ['Barbell Front Squat', 4],
      ['Barbell Back Squat', 4],
    ],
    easier: ['Minder diep, tot op een bank', 'Met steun (TRX of rek vasthouden)'],
    harder: ['Tempo: 3 tellen omlaag', 'Pauze van 2 tellen onderin'],
    alternatives: {
      knie: ['Leg Press Machine', 'kleine diepte, knieën in lijn met de voeten'],
      rug: ['Goblet Squat', 'of Leg Press Machine; geen stang op de rug'],
      heup: ['Bodyweight Squat', 'minder diep, voeten iets breder en licht uitgedraaid'],
      zwanger: ['Goblet Squat', 'niet te diep, met steun; uitademen bij omhoog komen'],
      schouder: ['Goblet Squat', 'in plaats van een stang op de rug'],
      pols: ['Kettlebell Goblet Squat', 'kettlebell aan de horens'],
      enkel: ['Goblet Squat', 'hakken licht verhoogd (plaatje onder de hakken)'],
    },
  },
  {
    family: 'Heupscharnier (hinge)',
    match: /deadlift|\brdl\b|romanian|good ?morning|swing|hinge|pull[- ]?through/,
    ladder: [
      ['Cable Pull Through (Hip Hinge)', 1],
      ['Dumbbell Romanian Deadlift', 2],
      ['Dumbbell Sumo Deadlift', 2],
      ['Kettlebell Swing', 3],
      ['Barbell Romanian Deadlift', 3],
      ['Barbell Good Morning', 3],
      ['Barbell Deadlift', 4],
    ],
    easier: ['Hip hinge met een stok langs de rug', 'Vanaf een verhoging'],
    harder: ['Op één been (single leg)', 'Pauze net onder de knie'],
    alternatives: {
      rug: ['Glute Bridge', 'of Cable Pull Through met licht gewicht'],
      knie: ['Dumbbell Romanian Deadlift', 'knieën licht gebogen, geen diepe kniebuiging'],
      zwanger: ['Cable Pull Through (Hip Hinge)', 'licht, niet persen'],
      pols: ['Dumbbell Romanian Deadlift', 'met lifting straps'],
      schouder: ['Cable Pull Through (Hip Hinge)', 'gewicht laag houden'],
      heup: ['Glute Bridge', 'kleinere uitslag'],
    },
  },
  {
    family: 'Duwen horizontaal (borst)',
    match: /push[- ]?up|press[- ]?up|bench|chest|floor press|\bdips?\b|\bfly\b|flye|pec|crossover/,
    ladder: [
      ['Incline Push-Up (handen op bank)', 1],
      ['Chest Press Machine', 1],
      ['Push-Up', 2],
      ['Dumbbell Chest Press', 2],
      ['Incline Dumbbell Chest Press', 2],
      ['Barbell Bench Press', 3],
      ['Decline Push-Up (voeten op bank)', 3],
      ['Diamond Push-Up', 4],
      ['Dip (tricep / borst)', 4],
    ],
    easier: ['Op de knieën', 'Kleinere uitslag'],
    harder: ['Pauze onderin', 'Met gewichtsvest'],
    alternatives: {
      schouder: ['Dumbbell Chest Press', 'neutrale greep, ellebogen op 45°, kleinere uitslag'],
      pols: ['Push-Up', 'op dumbbells of push-up grips (rechte pols)'],
      zwanger: ['Incline Push-Up (handen op bank)', 'na het 1e trimester niet plat op de rug'],
      elleboog: ['Chest Press Machine', 'kleinere uitslag'],
      rug: ['Incline Push-Up (handen op bank)', 'buik en billen aangespannen'],
      nek: ['Chest Press Machine', 'hoofd tegen de steun'],
    },
  },
  {
    family: 'Duwen verticaal (schouder)',
    match: /overhead|shoulder press|\bohp\b|military|arnold|landmine|pike/,
    ladder: [
      ['Shoulder Press Machine', 1],
      ['Dumbbell Shoulder Press', 2, 'zittend met rugsteun'],
      ['Arnold Press', 3],
      ['Barbell Overhead Press (OHP)', 4],
    ],
    easier: ['Lichter, halve beweging'],
    harder: ['Staand in plaats van zittend', 'Eén arm tegelijk'],
    alternatives: {
      schouder: ['Shoulder Press Machine', 'neutrale greep, onder de pijngrens blijven'],
      rug: ['Dumbbell Shoulder Press', 'zittend met rugsteun'],
      nek: ['Shoulder Press Machine', 'schouders laag houden'],
      zwanger: ['Dumbbell Shoulder Press', 'zittend met rugsteun, niet persen'],
      pols: ['Dumbbell Shoulder Press', 'neutrale greep'],
      elleboog: ['Shoulder Press Machine', 'lichter'],
    },
  },
  {
    family: 'Schouder zijwaarts / voorwaarts',
    match: /lateral raise|side raise|front raise|y[- ]?raise|upright row/,
    ladder: [
      ['Lateral Raise Machine', 1],
      ['Cable Lateral Raise', 2],
      ['Dumbbell Lateral Raise', 2],
      ['Dumbbell Front Raise', 2],
    ],
    easier: ['Lichter, arm iets gebogen'],
    harder: ['Pauze bovenin', 'Tempo: 3 tellen omlaag'],
    alternatives: {
      schouder: ['Cable Lateral Raise', 'tot schouderhoogte, niet hoger'],
      nek: ['Lateral Raise Machine', 'schouders laag'],
      zwanger: ['Lateral Raise Machine', 'zittend'],
    },
  },
  {
    family: 'Trekken verticaal (lat)',
    match: /pull[- ]?up|chin[- ]?up|pulldown|pull[- ]?down|\blat pull/,
    ladder: [
      ['Lat Pulldown', 1],
      ['Cable Lat Pulldown', 1],
      ['Assisted Pull-Up', 2, 'met band of machine'],
      ['Chin-Up', 3],
      ['Pull-Up', 4],
    ],
    easier: ['Lichter, trekken tot de kin', 'Halve beweging'],
    harder: ['Negatieve pull-up (3–5 tellen omlaag)', 'Pauze met de stang bij de borst'],
    alternatives: {
      schouder: ['Lat Pulldown', 'neutrale greep, niet achter de nek'],
      rug: ['Lat Pulldown', 'zittend, rechte rug'],
      elleboog: ['Lat Pulldown', 'neutrale greep, minder gewicht'],
      pols: ['Lat Pulldown', 'met straps of neutrale greep'],
      zwanger: ['Lat Pulldown', 'zittend, rustig'],
      nek: ['Lat Pulldown', 'schouders laag, kin licht ingetrokken'],
    },
  },
  {
    family: 'Trekken horizontaal (roeien)',
    match: /\brows?\b|rowing|face pull|rear delt|reverse fly|pull[- ]?apart/,
    ladder: [
      ['Seated Row Machine', 1],
      ['Cable Seated Row', 1],
      ['TRX Row', 2],
      ['Inverted Row (TRX / Roeien laag)', 2],
      ['Single Arm Dumbbell Row', 2],
      ['Dumbbell Bent-Over Row', 3],
      ['Barbell Bent-Over Row', 3],
      ['Pendlay Row', 4],
    ],
    easier: ['Lichaam meer rechtop (TRX)', 'Lichter'],
    harder: ['Pauze met het gewicht tegen het lichaam', 'Tempo: 3 tellen terug'],
    alternatives: {
      rug: ['Seated Row Machine', 'borststeun, rechte rug'],
      schouder: ['Cable Seated Row', 'neutrale greep, niet voorbij de pijngrens'],
      elleboog: ['Seated Row Machine', 'neutrale greep, minder gewicht'],
      pols: ['Cable Seated Row', 'met straps of neutrale greep'],
      zwanger: ['Seated Row Machine', 'niet voorover gebogen'],
      nek: ['Seated Row Machine', 'schouders laag'],
    },
  },
  {
    family: 'Core / buik',
    match:
      /plank|dead ?bug|crunch|sit[- ]?up|bicycle|leg raise|russian twist|bird ?dog|hollow|mountain climber|rollout|pallof|\babs?\b|buik|flutter|v[- ]?up|toe touch|woodchop|side bend/,
    ladder: [
      ['Dead Bug', 1],
      ['Crunch', 1],
      ['Plank', 2],
      ['Zijplank (Side Plank)', 2],
      ['Leg Raise (liggend)', 2],
      ['Mountain Climber', 3],
      ['Hanging Leg Raise', 4],
    ],
    easier: ['Op de knieën', 'Korter aanhouden'],
    harder: ['Arm of been optillen', 'Langer aanhouden'],
    alternatives: {
      rug: ['Dead Bug', 'in plaats van sit-ups en crunches'],
      zwanger: ['Zijplank (Side Plank)', 'op de knieën; geen crunches, na het 1e trimester niet lang op de rug'],
      nek: ['Dead Bug', 'hoofd op de grond'],
      pols: ['Plank', 'op de onderarmen'],
      schouder: ['Dead Bug', 'in plaats van plank'],
      heup: ['Dead Bug', 'knieën gebogen'],
    },
  },
  {
    family: 'Biceps',
    match: /curl/,
    ladder: [
      ['Bicep Curl Machine', 1],
      ['Cable Bicep Curl', 1],
      ['Dumbbell Bicep Curl', 2],
      ['Hammer Curl', 2],
      ['Incline Dumbbell Curl', 3],
      ['EZ-Bar Curl', 3],
      ['Barbell Bicep Curl', 3],
    ],
    easier: ['Lichter of met elastiek', 'Zittend met rugsteun'],
    harder: ['Tempo: 3 tellen omlaag', 'Pauze halverwege'],
    alternatives: {
      elleboog: ['Cable Bicep Curl', 'kleinere uitslag'],
      pols: ['Hammer Curl', 'neutrale greep'],
      schouder: ['Bicep Curl Machine', 'arm gesteund'],
      zwanger: ['Dumbbell Bicep Curl', 'zittend, licht'],
    },
  },
  {
    family: 'Triceps',
    match: /tricep|skull ?crusher|pushdown|push[- ]?down|kickback|extension/,
    ladder: [
      ['Tricep Extension Machine', 1],
      ['Cable Tricep Pushdown (Rope)', 1],
      ['Cable Tricep Pushdown (Stang)', 1],
      ['Dumbbell Tricep Kickback', 2],
      ['Dumbbell Overhead Tricep Extension', 2],
      ['Skullcrusher (EZ-bar / Barbell)', 3],
      ['Dip (tricep / borst)', 4],
    ],
    easier: ['Lichter of met elastiek'],
    harder: ['Tempo: 3 tellen terug', 'Pauze gestrekt'],
    alternatives: {
      elleboog: ['Cable Tricep Pushdown (Rope)', 'kleinere uitslag'],
      schouder: ['Cable Tricep Pushdown (Rope)', 'in plaats van boven het hoofd'],
      pols: ['Cable Tricep Pushdown (Rope)', 'neutrale greep'],
      zwanger: ['Tricep Extension Machine', 'zittend'],
    },
  },
  {
    family: 'Kuiten',
    match: /calf|kuit/,
    ladder: [
      ['Calf Raise Machine (Seated)', 1],
      ['Bodyweight Calf Raise', 1],
      ['Calf Raise Machine (Standing)', 2],
      ['Dumbbell Calf Raise (Standing)', 2],
    ],
    easier: ['Met steun, op twee benen'],
    harder: ['Op één been', 'Op een verhoging met pauze onderin'],
    alternatives: {
      enkel: ['Calf Raise Machine (Seated)', 'kleinere uitslag'],
      knie: ['Calf Raise Machine (Seated)', ''],
      zwanger: ['Bodyweight Calf Raise', 'met steun voor het evenwicht'],
    },
  },
  {
    family: 'Dragen (carry)',
    match: /carry|farmer|suitcase|waiter/,
    ladder: [['Farmers Walk', 2]],
    easier: ['Lichter, kortere afstand'],
    harder: ['Zwaarder', 'Eén kant (suitcase carry)'],
    alternatives: {
      rug: ['Farmers Walk', 'lichter, rechtop, twee kanten gelijk'],
      pols: ['Farmers Walk', 'met straps'],
      schouder: ['Farmers Walk', 'gewicht laag langs het lichaam'],
      zwanger: ['Farmers Walk', 'licht, rustig lopen'],
    },
  },
  {
    family: 'Heupspieren met band',
    match: /band walk|lateral walk|monster walk|clamshell|abduct|adduct|side step|mini[- ]?band|kickback machine|glute kickback/,
    ladder: [
      ['Hip Abductor Machine', 1],
      ['Monster Walk', 2],
      ['Cable Glute Kickback', 2],
    ],
    easier: ['Band boven de knieën in plaats van bij de enkels', 'Kleinere stappen'],
    harder: ['Band bij de enkels of voeten', 'Dieper in de knieën', 'Zwaardere band'],
    alternatives: {
      knie: ['Hip Abductor Machine', 'band boven de knieën, hoog blijven staan'],
      heup: ['Hip Abductor Machine', 'kleinere uitslag'],
      zwanger: ['Hip Abductor Machine', 'zittend'],
    },
  },
  {
    family: 'Springen en conditie',
    match:
      /jump|burpee|battle rope|wall ball|box jump|skater|sprint|rope|skipping|jumping jack|thruster|slam|bike|fiets|crosstrainer|elliptical|loopband|treadmill|roei|rowing machine/,
    ladder: [
      ['Stationary Bike / Fiets', 1],
      ['Crosstrainer / Elliptical', 1],
      ['Roeiapparaat / Rowing Machine', 2],
      ['Battle Rope Waves', 3],
      ['Mountain Climber', 3],
      ['Burpee', 4],
    ],
    easier: ['Zonder sprong', 'Lager tempo, kleinere beweging'],
    harder: ['Hoger tempo of langere set', 'Zwaardere bal'],
    alternatives: {
      knie: ['Stationary Bike / Fiets', 'of zonder springen: step-up'],
      zwanger: ['Crosstrainer / Elliptical', 'niet springen, rustig tempo'],
      rug: ['Stationary Bike / Fiets', 'lagere intensiteit'],
      enkel: ['Stationary Bike / Fiets', 'of roeiapparaat'],
      schouder: ['Stationary Bike / Fiets', 'geen armen boven het hoofd'],
    },
  },
];

/** Algemeen advies per klacht als de oefening geen eigen alternatief heeft (alleen een aanwijzing). */
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

function findFamily(exerciseName: string): { fam: Family; level: number | null } | null {
  const key = exerciseKey(exerciseName);
  for (const fam of FAMILIES) {
    const rung = fam.ladder.find(([ex]) => exerciseKey(ex) === key);
    if (rung) return { fam, level: rung[1] };
  }
  const n = exerciseName.toLowerCase();
  const fam = FAMILIES.find((f) => f.match.test(n));
  return fam ? { fam, level: null } : null;
}

const toRef = ([exercise, , note]: Rung): ExerciseRef => ({ exercise, note: note ?? '' });

/** Het standaardvoorstel voor een oefening, of null als de soort oefening niet herkend wordt. */
export function standardAdvice(exerciseName: string): StandardAdvice | null {
  const found = findFamily(exerciseName);
  if (!found) return null;
  const { fam, level } = found;
  const self = exerciseKey(exerciseName);
  const others = fam.ladder.filter(([ex]) => exerciseKey(ex) !== self);
  // Onbekend niveau (oefening niet in de ladder): de onderste treden zijn makkelijker, de bovenste zwaarder.
  const pivot = level ?? 2.5;
  const lower = others.filter(([, l]) => l < pivot).sort((a, b) => b[1] - a[1]);
  const higher = others.filter(([, l]) => l > pivot).sort((a, b) => a[1] - b[1]);
  const alternatives: Partial<Record<ComplaintKey, ExerciseRef>> = {};
  for (const [k, v] of Object.entries(fam.alternatives) as [ComplaintKey, [string, string]][]) {
    // Nooit de oefening zelf als alternatief: dan blijft alleen de aanwijzing over.
    alternatives[k] = exerciseKey(v[0]) === self ? { exercise: '', note: v[1] } : { exercise: v[0], note: v[1] };
  }
  return {
    family: fam.family,
    regressions: [...lower.slice(0, 3).map(toRef), ...fam.easier.map((note) => ({ exercise: '', note }))],
    progressions: [...higher.slice(0, 3).map(toRef), ...fam.harder.map((note) => ({ exercise: '', note }))],
    alternatives,
  };
}

/**
 * Een alternatief voor deze oefening bij een klacht (vrije tekst of vaste klacht). Eerst het
 * alternatief van de soort oefening, anders het algemene advies voor die klacht; null als de klacht
 * niet herkend wordt (dan kan de trainer het slimme voorstel vragen).
 */
export function standardAlternative(exerciseName: string, complaint: string): ExerciseRef | null {
  const key = complaintKeyOf(complaint);
  if (!key) return null;
  return standardAdvice(exerciseName)?.alternatives[key] ?? { exercise: '', note: GENERIC[key] };
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
