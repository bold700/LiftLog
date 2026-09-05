/**
 * Importeer de groepslessen (26-weken raster per les) als groepsles-workouts in Firestore.
 *
 * Bron: scripts/groepslessen/trainingen-sgt-2026.json (uit de PDF gehaald) of een map met
 * CSV-exports uit Google Sheets (één CSV per tabblad, bestandsnaam = naam van de les).
 *
 * Per tabblad ontstaat één workout met audience "group", per week één dag ("Week 1" … "Week 26").
 * Elke regel in het raster wordt een oefening. Regels die een trainingsvorm beschrijven
 * ("10x10x8", "Tabata", "AMRAP 17min", "8 reps beastmode") worden een notitie bij die week.
 * Supersets ("hiptrust-facepull") worden twee oefeningen met een verwijzing naar elkaar.
 *
 * Gebruik:
 *   # Alleen kijken wat eruit komt (schrijft scripts/groepslessen/out/*.json + rapport, geen Firestore):
 *   node scripts/import-groepslessen.mjs --dry-run
 *
 *   # Echt importeren (vereist service account, zie scripts/delete-all-accounts.cjs):
 *   GOOGLE_APPLICATION_CREDENTIALS=./service-account.json \
 *     node scripts/import-groepslessen.mjs --trainer-email trainer@voorbeeld.nl --start 2026-09-07
 *
 * Opties:
 *   --dry-run               Niets naar Firestore schrijven, alleen output + rapport.
 *   --trainer-email <mail>  E-mail van de trainer (eigenaar van de workouts). Of:
 *   --trainer-uid <uid>     Firebase Auth uid van de trainer.
 *   --start <YYYY-MM-DD>    Datum van Week 1 (standaard: 2026-09-07). Bepaalt "deze week" in de app.
 *   --json <pad>            Ander JSON-bronbestand (standaard scripts/groepslessen/trainingen-sgt-2026.json).
 *   --csv <map>             Map met CSV-exports uit Google Sheets (één per tabblad) i.p.v. de JSON.
 *   --only <naam>           Alleen het tabblad met deze naam importeren.
 *   --emit-app-data         Schrijf src/data/groepslessenSgt2026.json, de bron voor de importknop in
 *                           de app (Beheer → Groepslessen importeren). Geen Firestore nodig.
 *
 * Bij opnieuw draaien worden dezelfde workout-id's gebruikt (schema_sgt2026_<tab>), dus bestaande
 * imports worden bijgewerkt in plaats van gedupliceerd.
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join, basename, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import { buildExerciseCatalog, loadMegaExerciseNamesFromDisk, normalizeExerciseKey } from '../api/exerciseCatalog.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, 'groepslessen');
const DEFAULT_JSON = join(DATA_DIR, 'trainingen-sgt-2026.json');
const OUT_DIR = join(DATA_DIR, 'out');
const APP_DATA_FILE = join(__dirname, '../src/data/groepslessenSgt2026.json');
const DEFAULT_START = '2026-09-07';
const DEFAULT_SETS = 3;
const DEFAULT_REPS = 12;

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = { dryRun: false, start: DEFAULT_START, json: DEFAULT_JSON, csv: null, only: null, emitAppData: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '--dry-run') args.dryRun = true;
    else if (a === '--trainer-email') args.trainerEmail = next();
    else if (a === '--trainer-uid') args.trainerUid = next();
    else if (a === '--start') args.start = next();
    else if (a === '--json') args.json = resolvePath(next());
    else if (a === '--csv') args.csv = resolvePath(next());
    else if (a === '--only') args.only = next();
    else if (a === '--emit-app-data') args.emitAppData = true;
    else if (a === '--help' || a === '-h') {
      console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0]);
      process.exit(0);
    } else {
      console.error(`Onbekende optie: ${a}`);
      process.exit(1);
    }
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.start)) {
    console.error('--start moet YYYY-MM-DD zijn');
    process.exit(1);
  }
  return args;
}

// ---------------------------------------------------------------------------
// Bron inlezen: JSON (uit PDF) of CSV-map (uit Google Sheets)
// ---------------------------------------------------------------------------

/** @returns {{ name: string, weeks: Record<string, string[]> }[]} */
function loadTabsFromJson(path) {
  const doc = JSON.parse(readFileSync(path, 'utf8'));
  return (doc.tabs || []).map((t) => ({ name: String(t.name), weeks: t.weeks || {} }));
}

/** Eenvoudige CSV-parser (komma's, dubbele quotes, newlines binnen quotes). */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else inQuotes = false;
      } else cell += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

/**
 * Sheet-layout: rijen met "Week 1 … Week 10" als kop, daaronder per kolom de oefeningen,
 * daarna weer een koprij "Week 11 …" enz.
 */
function loadTabsFromCsvDir(dir) {
  const files = readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.csv')).sort();
  return files.map((f) => {
    const rows = parseCsv(readFileSync(join(dir, f), 'utf8'));
    const weeks = {};
    let colToWeek = {};
    for (const row of rows) {
      const isHeader = row.some((c) => /^\s*week\s*\d+\s*$/i.test(c || ''));
      if (isHeader) {
        colToWeek = {};
        row.forEach((c, ci) => {
          const m = /^\s*week\s*(\d+)\s*$/i.exec(c || '');
          if (m) colToWeek[ci] = `Week ${Number(m[1])}`;
        });
        continue;
      }
      row.forEach((c, ci) => {
        const week = colToWeek[ci];
        const val = (c || '').trim();
        if (!week || !val) return;
        (weeks[week] ||= []).push(...val.split(/\n/).map((s) => s.trim()).filter(Boolean));
      });
    }
    return { name: basename(f, '.csv').trim(), weeks };
  });
}

// ---------------------------------------------------------------------------
// Vertaaltabel: gym-jargon uit het raster → nette oefeningnaam.
// Waar mogelijk de naam uit de app-catalogus (src/data/mega_exercise_db.json), zodat
// spiergroepen en afbeeldingen kloppen. Anders een duidelijke eigen naam.
// ---------------------------------------------------------------------------

const ALIASES = {
  // Benen / heupen
  squat: 'Barbell Back Squat',
  squats: 'Barbell Back Squat',
  'squat full': 'Barbell Back Squat',
  'squat stang': 'Barbell Back Squat',
  'squat db': 'Dumbbell Squat',
  'db squat': 'Dumbbell Squat',
  'db squats': 'Dumbbell Squat',
  'squat pulses': 'Squat Pulses',
  'sumo squat': 'Sumo Squat',
  'squat to chair': 'Squat to Chair (Stoel-squat)',
  'chair squat': 'Squat to Chair (Stoel-squat)',
  'box squat': 'Box Squat',
  'goblet squat': 'Goblet Squat',
  'gobl squat': 'Goblet Squat',
  'squat goblet': 'Goblet Squat',
  globet: 'Goblet Squat',
  'goblet squats': 'Goblet Squat',
  'goblet squat verhoogd': 'Goblet Squat (voeten verhoogd)',
  'goblet squat voeten verhoogd': 'Goblet Squat (voeten verhoogd)',
  'goblet verhoogd': 'Goblet Squat (voeten verhoogd)',
  'gobl squat verhoogd': 'Goblet Squat (voeten verhoogd)',
  'optrekken squat voeten op bench': 'Goblet Squat (voeten verhoogd)',
  'db sissy squat': 'Sissy Squat (dumbbell)',
  'jump squat': 'Jump Squat',
  'jump squats': 'Jump Squat',
  'squat jumps': 'Jump Squat',
  'jumping squats': 'Jump Squat',
  'box jumping squats': 'Jump Squat',
  'pistol squat': 'Pistol Squat',
  'pist squat': 'Pistol Squat',
  'wall sit': 'Wall Sit',
  wallsit: 'Wall Sit',
  'wallsit 1 been': 'Wall Sit (1 been)',
  'squat press': 'Thruster (Squat + Press)',
  'squat + press': 'Thruster (Squat + Press)',
  'squat+press': 'Thruster (Squat + Press)',
  thrusters: 'Thruster (Squat + Press)',
  thruster: 'Thruster (Squat + Press)',
  trusters: 'Thruster (Squat + Press)',
  'db thruster': 'Thruster (Squat + Press)',
  'db thrusters': 'Thruster (Squat + Press)',
  'db thruters': 'Thruster (Squat + Press)',
  'db trusthers': 'Thruster (Squat + Press)',
  'dumbbell thrusters': 'Thruster (Squat + Press)',
  'thrusters (squat + press)': 'Thruster (Squat + Press)',
  'overhead press into squat': 'Thruster (Squat + Press)',
  'db clean press': 'Dumbbell Clean & Press',
  deadlift: 'Barbell Deadlift',
  deadlifts: 'Barbell Deadlift',
  'deadlift full': 'Barbell Deadlift',
  'deadlift stang': 'Barbell Deadlift',
  'deadlift lichte stang': 'Barbell Deadlift (lichte stang)',
  'deadlift db': 'Dumbbell Deadlift',
  'deadlift dbs': 'Dumbbell Deadlift',
  'deadlifts dbs': 'Dumbbell Deadlift',
  'db deadlift': 'Dumbbell Deadlift',
  'deadlift ktbs': 'Kettlebell Deadlift',
  'bungee deadlift': 'Bungee Deadlift',
  'sumo deadlift': 'Dumbbell Sumo Deadlift',
  'sumo deadl': 'Dumbbell Sumo Deadlift',
  rdl: 'Barbell Romanian Deadlift',
  rdls: 'Barbell Romanian Deadlift',
  'one leg deadlift': 'Single Leg Deadlift',
  'good morning': 'Barbell Good Morning',
  goodmorning: 'Barbell Good Morning',
  'good morning elastiek': 'Good Morning (elastiek)',
  'hip thrust': 'Barbell Hip Thrust',
  'hip thrusts': 'Barbell Hip Thrust',
  hipthrust: 'Barbell Hip Thrust',
  hiptrust: 'Barbell Hip Thrust',
  'hip trust': 'Barbell Hip Thrust',
  hiptust: 'Barbell Hip Thrust',
  'hiptrust 2 sec hold': 'Barbell Hip Thrust (2 sec hold)',
  'hiptrust o l': 'Single Leg Glute Bridge',
  'one leg hiptrust': 'Single Leg Glute Bridge',
  'single leg hipbridge': 'Single Leg Glute Bridge',
  hipbridge: 'Glute Bridge',
  'hipbridge blok + gewicht': 'Glute Bridge (blok + gewicht)',
  'glute bridge': 'Glute Bridge',
  'glute bridge march': 'Bridge March',
  'bridge march': 'Bridge March',
  lunge: 'Dumbbell Lunge',
  lunges: 'Dumbbell Lunge',
  'front lunge': 'Dumbbell Lunge',
  'front lunges': 'Dumbbell Lunge',
  'lunges front': 'Dumbbell Lunge',
  'lunges voorw': 'Dumbbell Lunge',
  'lunge 1 been voor hoog': 'Dumbbell Lunge (voorste voet verhoogd)',
  'walking lunge': 'Dumbbell Walking Lunge',
  'walking lunges': 'Dumbbell Walking Lunge',
  'walk lunge': 'Dumbbell Walking Lunge',
  'walk lunges': 'Dumbbell Walking Lunge',
  'walk lung': 'Dumbbell Walking Lunge',
  'wwalk lunges': 'Dumbbell Walking Lunge',
  'lunges walking': 'Dumbbell Walking Lunge',
  'walking lunges sandbag': 'Walking Lunge (sandbag)',
  'lunge walking rotatie bal tegen richting': 'Walking Lunge met rotatie (bal)',
  'reversed lunge': 'Reverse Lunge',
  'reversed lunges': 'Reverse Lunge',
  'rev lunge': 'Reverse Lunge',
  'rev lunges': 'Reverse Lunge',
  'reversed lunge db': 'Reverse Lunge',
  'lunge achterw': 'Reverse Lunge',
  'lunges backwards': 'Reverse Lunge',
  'backw lunges': 'Reverse Lunge',
  'back w lunge': 'Reverse Lunge',
  'jump lunges': 'Jump Lunge',
  'jumping lunges': 'Jump Lunge',
  'j l': 'Jump Lunge',
  'side lunge': 'Side Lunge',
  'lunge tik teen': 'Lunge met teen-tik',
  'lunge step op draai': 'Step-Up met rotatie',
  'lunge step up': 'Step-Up met rotatie',
  'lunge op bank indraaien': 'Step-Up met rotatie',
  'split squat': 'Split Squat',
  splitsquat: 'Split Squat',
  splitsquad: 'Split Squat',
  'spl squat': 'Split Squat',
  'db split squat': 'Split Squat',
  'splitsquat stang': 'Split Squat (stang)',
  bulgarian: 'Bulgarian Split Squat',
  bulgarians: 'Bulgarian Split Squat',
  'bulg split squat': 'Bulgarian Split Squat',
  'bulg splitsquat': 'Bulgarian Split Squat',
  'bulg spl squat': 'Bulgarian Split Squat',
  'blugarian spl squat': 'Bulgarian Split Squat',
  'bulgarian splistquat': 'Bulgarian Split Squat',
  'bulgarian splitsquat tik teen': 'Bulgarian Split Squat (teen-tik)',
  'bulgarians knie op de grond': 'Bulgarian Split Squat (knie op de grond)',
  'step up': 'Dumbbell Step-Up',
  'step ups': 'Dumbbell Step-Up',
  stepup: 'Dumbbell Step-Up',
  'step up bosu bal knie voor': 'Step-Up op Bosu (knie voor)',
  'bosu lunge op bosu': 'Lunge op Bosu',
  'hamstring curl': 'Hamstring Curl',
  hamstringcurl: 'Hamstring Curl',
  'hamstr curl': 'Hamstring Curl',
  'hamsting curl': 'Hamstring Curl',
  'hamstring curl staand': 'Hamstring Curl (staand)',
  'calf raises': 'Bodyweight Calf Raise',
  'calf raises met gewicht': 'Dumbbell Calf Raise (Standing)',
  'db calf raises': 'Dumbbell Calf Raise (Standing)',
  'heel raises': 'Bodyweight Calf Raise',
  abductie: 'Hip Abductor Machine',
  'cable abductie': 'Cable Hip Abduction',
  abductive: 'Hip Abductor Machine',
  'side step': 'Lateral Mini-Band Walk',
  'side steps': 'Lateral Mini-Band Walk',
  'side step miniband': 'Lateral Mini-Band Walk',
  kikkers: 'Frog Jump (Kikkers)',
  kikker: 'Frog Jump (Kikkers)',
  'kb swing': 'Kettlebell Swing',
  'ktb swing': 'Kettlebell Swing',
  'ktb swing full': 'Kettlebell Swing',
  'full ktb swing': 'Kettlebell Swing',
  'kettlebell swing': 'Kettlebell Swing',
  swing: 'Kettlebell Swing',
  swings: 'Kettlebell Swing',
  ktb: 'Kettlebell Swing',
  'cable pull trough': 'Cable Pull Through (Hip Hinge)',
  'cable pullthru': 'Cable Pull Through (Hip Hinge)',
  'cable kickback': 'Cable Glute Kickback',
  'cable kickbackv': 'Cable Glute Kickback',
  'kickback triceps/bil': 'Kickback (triceps of bil)',
  copenhagen: 'Copenhagen Plank',
  'single leg stand': 'Single Leg Stand (balans)',
  'single leg stand bosu bal': 'Single Leg Stand op Bosu',
  'single leg stand bosu gewicht': 'Single Leg Stand op Bosu (gewicht)',
  'single leg stand gewicht door geven bosu bal': 'Single Leg Stand op Bosu (gewicht doorgeven)',
  'standing march gew hoog': 'Standing March (gewicht hoog)',
  'knie hand lift knie': 'Knie-hand lift',
  'knie blok navel': 'Knie naar navel (blok)',
  'gorilla snatches rotatie': 'Gorilla Snatch met rotatie',
  'plate burpees': 'Plate Burpee',
  // Rug
  'bent over row': 'Barbell Bent-Over Row',
  'bent over rows': 'Barbell Bent-Over Row',
  'b o r': 'Barbell Bent-Over Row',
  bor: 'Barbell Bent-Over Row',
  'barbell b o r': 'Barbell Bent-Over Row',
  'bb bent over row': 'Barbell Bent-Over Row',
  'b o r stang': 'Barbell Bent-Over Row',
  'bo row': 'Barbell Bent-Over Row',
  'b o r dbs': 'Dumbbell Bent-Over Row',
  'bent over db rows': 'Dumbbell Bent-Over Row',
  'bo row db': 'Dumbbell Bent-Over Row',
  row: 'Seated Row Machine',
  rows: 'Seated Row Machine',
  roas: 'Seated Row Machine',
  'seated row': 'Seated Row Machine',
  'seating row': 'Seated Row Machine',
  'seat row': 'Seated Row Machine',
  'row seated': 'Seated Row Machine',
  'row seated breed': 'Seated Row Machine (brede greep)',
  'row breed': 'Seated Row Machine (brede greep)',
  'back row': 'Seated Row Machine',
  'seated row elastiek': 'Seated Row (elastiek)',
  'row rotatie': 'Row met rotatie',
  'one arm row': 'Single Arm Dumbbell Row',
  'oe arm row': 'Single Arm Dumbbell Row',
  'o a r': 'Single Arm Dumbbell Row',
  'o a r pulley machine': 'Cable Row Standing (1-arm)',
  'o a pulley row': 'Cable Row Standing (1-arm)',
  'o a row pulley': 'Cable Row Standing (1-arm)',
  't bar row': 'T-Bar Row',
  't bar row chestup': 'T-Bar Row (chest supported)',
  'lat pulldown': 'Lat Pulldown',
  'lat pull down': 'Lat Pulldown',
  'latt pull down': 'Lat Pulldown',
  'latt puldown': 'Lat Pulldown',
  'latt pulld': 'Lat Pulldown',
  'lat pull dwon': 'Lat Pulldown',
  'lat pull': 'Lat Pulldown',
  'latpull down one arm': 'Lat Pulldown (1-arm)',
  'one arm latt pull down knie': 'Lat Pulldown (1-arm, knielend)',
  'latt puldown rev grip': 'Lat Pulldown (reverse grip)',
  'pull up': 'Pull-Up',
  'pull ups': 'Pull-Up',
  pullup: 'Pull-Up',
  'pull up stang': 'Pull-Up',
  'one arm pull up': 'Pull-Up (1-arm assist)',
  optrekken: 'Pull-Up',
  opterkken: 'Pull-Up',
  'pull ups band': 'Pull-Up (met band)',
  'pullup supported': 'Pull-Up (supported)',
  'chin up': 'Chin-Up',
  'australian pull up': 'Inverted Row (TRX / Roeien laag)',
  'australian pull up step': 'Inverted Row (TRX / Roeien laag)',
  'pull over': 'Dumbbell Pullover',
  pullover: 'Dumbbell Pullover',
  'face pull': 'Cable Face Pull',
  facepull: 'Cable Face Pull',
  'rev fly': 'Dumbbell Rear Delt Raise',
  'reverse fly': 'Dumbbell Rear Delt Raise',
  'reversed fly': 'Dumbbell Rear Delt Raise',
  'reversed flys': 'Dumbbell Rear Delt Raise',
  'reverse fly dumbbells': 'Dumbbell Rear Delt Raise',
  'rear delt fly': 'Dumbbell Rear Delt Raise',
  'rear delt fly bankje': 'Dumbbell Rear Delt Raise (op bankje)',
  'chest supported reversed fly': 'Dumbbell Rear Delt Raise (chest supported)',
  'rev fly cable': 'Reverse Fly Machine (Rear Delt)',
  hyperextensie: 'Hyperextension (roman chair)',
  'hyper extension': 'Hyperextension (roman chair)',
  'hyper ext': 'Hyperextension (roman chair)',
  hyperext: 'Hyperextension (roman chair)',
  'bck extension plated': 'Hyperextension (roman chair)',
  superman: 'Superman',
  'superman hold': 'Superman (hold)',
  'superman pulses': 'Superman (pulses)',
  superwoman: 'Superman',
  visje: 'Superman (Visje)',
  'bird dog': 'Bird Dog',
  // Borst
  bankdrukken: 'Barbell Bench Press',
  'bench press': 'Barbell Bench Press',
  'bench press db': 'Dumbbell Chest Press',
  'chest press': 'Chest Press Machine',
  chestpress: 'Chest Press Machine',
  'chest press mach': 'Chest Press Machine',
  'chest press machine': 'Chest Press Machine',
  'bench press machine': 'Chest Press Machine',
  'chestpress incline': 'Incline Chest Press Machine',
  'chest press dumbbells': 'Dumbbell Chest Press',
  'dumbbell chest press': 'Dumbbell Chest Press',
  'db press': 'Dumbbell Chest Press',
  'sb press': 'Dumbbell Chest Press',
  'db press incline': 'Incline Dumbbell Chest Press',
  fly: 'Dumbbell Flye',
  'fly db': 'Dumbbell Flye',
  'db fly': 'Dumbbell Flye',
  'fly bench': 'Dumbbell Flye',
  'cable fly': 'Cable Crossover',
  'fly pulley': 'Cable Crossover',
  'pulley fly': 'Cable Crossover',
  'fly mid cable': 'Cable Crossover',
  'fly hoog': 'Cable Fly (Hoog naar laag)',
  'fly laag pulley': 'Cable Fly (Laag naar hoog)',
  'fly pulley laag': 'Cable Fly (Laag naar hoog)',
  'fly onder': 'Cable Fly (Laag naar hoog)',
  'push up': 'Push-Up',
  'push ups': 'Push-Up',
  pushup: 'Push-Up',
  pushups: 'Push-Up',
  'push up slow': 'Push-Up (langzaam)',
  'neg push up': 'Negative Push-Up',
  'nega push up': 'Negative Push-Up',
  'negative push up': 'Negative Push-Up',
  'negative pushup': 'Negative Push-Up',
  'wall push up': 'Wall Push-Up',
  'incline push up': 'Incline Push-Up (handen op bank)',
  'incline push up bankje': 'Incline Push-Up (handen op bank)',
  'decline push up': 'Decline Push-Up (voeten op bank)',
  'decline pushup': 'Decline Push-Up (voeten op bank)',
  'decl push up': 'Decline Push-Up (voeten op bank)',
  'diamond pushup': 'Diamond Push-Up',
  'decline diamond pushup': 'Diamond Push-Up (decline)',
  'mountain push up': 'Mountain Push-Up (pike)',
  dips: 'Dip (tricep / borst)',
  dip: 'Dip (tricep / borst)',
  'tricep dips': 'Dip (tricep / borst)',
  'dips hoog': 'Bench Dip (hoog)',
  'dips verhoogd': 'Bench Dip (hoog)',
  'pulley van je afduwen': 'Cable Press (van je af duwen)',
  'landmine press': 'Landmine Press',
  // Schouders
  'overhead press': 'Barbell Overhead Press (OHP)',
  'overheadpress': 'Barbell Overhead Press (OHP)',
  'overhead presd': 'Barbell Overhead Press (OHP)',
  'overhead pess': 'Barbell Overhead Press (OHP)',
  'overhead shoulder press': 'Dumbbell Shoulder Press',
  'overhead press zittend': 'Dumbbell Shoulder Press',
  'shoulder press': 'Dumbbell Shoulder Press',
  shoulderpress: 'Dumbbell Shoulder Press',
  shuolderpress: 'Dumbbell Shoulder Press',
  'm shoulder press': 'Shoulder Press Machine',
  'db shoulder press': 'Dumbbell Shoulder Press',
  'shoulderpress seated': 'Dumbbell Shoulder Press',
  'shoulderpress seating': 'Dumbbell Shoulder Press',
  'seat shoulderpress': 'Dumbbell Shoulder Press',
  'seated shoulderpress': 'Dumbbell Shoulder Press',
  'overh press': 'Dumbbell Shoulder Press',
  'military press': 'Barbell Overhead Press (OHP)',
  'mill press': 'Barbell Overhead Press (OHP)',
  'arnold press': 'Arnold Press',
  'side raise': 'Dumbbell Lateral Raise',
  sideraise: 'Dumbbell Lateral Raise',
  'lateral raise': 'Dumbbell Lateral Raise',
  'side raise seated': 'Side Raise Seated',
  'seat side raise': 'Side Raise Seated',
  'open side raise': 'Dumbbell Lateral Raise (open)',
  'front side raise': 'Front & Side Raise',
  'b o side raise': 'Bent-Over Lateral Raise',
  'bo sideraise': 'Bent-Over Lateral Raise',
  'bo siderai': 'Bent-Over Lateral Raise',
  'bent over side raise': 'Bent-Over Lateral Raise',
  'y side raise': 'Y-Raise',
  'y raise': 'Y-Raise',
  'front raise': 'Dumbbell Front Raise',
  frontraise: 'Dumbbell Front Raise',
  'cable front raise': 'Cable Front Raise',
  'overhead front raise': 'Dumbbell Front Raise (overhead)',
  'full can': 'Full Can',
  fullcan: 'Full Can',
  'upr row': 'Barbell Upright Row',
  uprow: 'Barbell Upright Row',
  'around the world': 'Around the World',
  'shoulders front/side/full c': 'Shoulders (front / side / full can)',
  // Armen
  'bicep curl': 'Dumbbell Bicep Curl',
  'biceps curl': 'Dumbbell Bicep Curl',
  'bicep curls': 'Dumbbell Bicep Curl',
  'cicep curl': 'Dumbbell Bicep Curl',
  bicep: 'Dumbbell Bicep Curl',
  biceps: 'Dumbbell Bicep Curl',
  curl: 'Dumbbell Bicep Curl',
  'bicep ez': 'EZ-Bar Curl',
  'ez curl': 'EZ-Bar Curl',
  'ez curl bicep': 'EZ-Bar Curl',
  'ez curl bicep curl': 'EZ-Bar Curl',
  'ez cun bicep curl': 'EZ-Bar Curl',
  'bicep ez curl': 'EZ-Bar Curl',
  'bicep curl ez': 'EZ-Bar Curl',
  'bicep curl ez curl': 'EZ-Bar Curl',
  'bicep curls ez bar': 'EZ-Bar Curl',
  'bicep ez curl': 'EZ-Bar Curl',
  'pulley bicep curl': 'Cable Bicep Curl',
  'bicep pulley curl': 'Cable Bicep Curl',
  'cable bicep curl': 'Cable Bicep Curl',
  'hammer curl': 'Hammer Curl',
  hammercurl: 'Hammer Curl',
  hammer: 'Hammer Curl',
  'bicep hammer': 'Hammer Curl',
  'hammer pulley': 'Cable Hammer Curl (Rope)',
  'seating db arl': 'Dumbbell Bicep Curl (zittend)',
  'tricep push down': 'Cable Tricep Pushdown (Stang)',
  'tricep pushdown': 'Cable Tricep Pushdown (Stang)',
  'tricep puch down': 'Cable Tricep Pushdown (Stang)',
  'tr pushdown': 'Cable Tricep Pushdown (Stang)',
  'push down': 'Cable Tricep Pushdown (Stang)',
  'tricep overhead ext': 'Dumbbell Overhead Tricep Extension',
  'tricep overhead extensie': 'Dumbbell Overhead Tricep Extension',
  'tricep overhead': 'Dumbbell Overhead Tricep Extension',
  'tricep overh ext': 'Dumbbell Overhead Tricep Extension',
  'triceps overhead ext': 'Dumbbell Overhead Tricep Extension',
  'tricep overhead staand': 'Dumbbell Overhead Tricep Extension',
  'tricep seated overhead': 'Dumbbell Overhead Tricep Extension',
  'tricep one arm overhead': 'Dumbbell Overhead Tricep Extension (1-arm)',
  'overhead extensie': 'Dumbbell Overhead Tricep Extension',
  'overhead extensie staand': 'Dumbbell Overhead Tricep Extension',
  'overh ext': 'Dumbbell Overhead Tricep Extension',
  'standing tricep extensie': 'Dumbbell Overhead Tricep Extension',
  'tricep ext': 'Tricep Extension Machine',
  triceps: 'Cable Tricep Pushdown (Stang)',
  'skull crushers': 'Skullcrusher (EZ-bar / Barbell)',
  skullcrushers: 'Skullcrusher (EZ-bar / Barbell)',
  'skull crush': 'Skullcrusher (EZ-bar / Barbell)',
  'skull crushers ez stang': 'Skullcrusher (EZ-bar / Barbell)',
  'ez curl skull crushers': 'Skullcrusher (EZ-bar / Barbell)',
  kickback: 'Dumbbell Tricep Kickback',
  kickbacks: 'Dumbbell Tricep Kickback',
  'tricep kickback': 'Dumbbell Tricep Kickback',
  'kickback triceps': 'Dumbbell Tricep Kickback',
  // Core
  plank: 'Plank',
  'plank laag': 'Plank',
  'plank hoog laag': 'Plank (hoog-laag)',
  'plank laag hoog': 'Plank (hoog-laag)',
  'plank bal': 'Plank op bal',
  'plank bal voeten': 'Plank (voeten op bal)',
  'voeten op de bal': 'Plank (voeten op bal)',
  'plank voeten op bal in uit': 'Plank (voeten op bal, in-uit)',
  'voeten op bal inrollen': 'Plank (voeten op bal, inrollen)',
  'plank bal rollout': 'Plank op bal (rollout)',
  'plank rotatie': 'Plank met rotatie',
  'plank roteren': 'Plank met rotatie',
  'plank draai': 'Plank met rotatie',
  'plank heupen': 'Plank (heupen draaien)',
  'plank shoulder tap': 'Plank Shoulder Tap',
  'plank shoulder taps': 'Plank Shoulder Tap',
  'shoulder tap plank': 'Plank Shoulder Tap',
  'shoulder taps': 'Plank Shoulder Tap',
  'plank & press': 'Plank & Press',
  'plank + row': 'Plank Row',
  'plank + rgw': 'Plank Row',
  'plank strek': 'Plank (strekken)',
  'plank w smal': 'Plank (smal-wijd)',
  'plank smal wijd': 'Plank (smal-wijd)',
  'plank gewicht + leg raises': 'Plank met gewicht + Leg Raise',
  'reversed plank': 'Reverse Plank',
  'side plank': 'Zijplank (Side Plank)',
  'side plank knie gebogen': 'Zijplank (knie gebogen)',
  'side plank rotatie': 'Zijplank met rotatie',
  'side plank roteren': 'Zijplank met rotatie',
  'side plank indraaien': 'Zijplank met rotatie',
  'side plank hip dips': 'Zijplank Hip Dips',
  'side plank hipdips': 'Zijplank Hip Dips',
  'side planke dips': 'Zijplank Hip Dips',
  'hip dips': 'Zijplank Hip Dips',
  'side plank abductie': 'Zijplank met abductie',
  'sit up': 'Sit-Up',
  'sit ups': 'Sit-Up',
  situp: 'Sit-Up',
  situps: 'Sit-Up',
  's it u p s': 'Sit-Up',
  'weighted sit ups': 'Sit-Up (met gewicht)',
  'sit ups bal gooien': 'Sit-Up (bal gooien)',
  'sit up bal gooien': 'Sit-Up (bal gooien)',
  'situps gooi de bal over': 'Sit-Up (bal gooien)',
  'situps bal': 'Sit-Up (bal gooien)',
  'situp bal muur': 'Sit-Up (bal tegen muur)',
  'sit up twist db': 'Sit-Up met twist (dumbbell)',
  'sit up crunch': 'Sit-Up / Crunch',
  crunches: 'Crunch',
  crunch: 'Crunch',
  'weighted crunch': 'Crunch (met gewicht)',
  'crunches benen hoog': 'Crunch (benen hoog)',
  'crunch benen hoog': 'Crunch (benen hoog)',
  'cruches benen hoog': 'Crunch (benen hoog)',
  'crunches schuin': 'Schuine Crunch',
  'schuine crunch': 'Schuine Crunch',
  'dubbel crunch': 'Dubbele Crunch',
  'rev crunch': 'Reverse Crunch',
  'rev crunsh': 'Reverse Crunch',
  'v crunch': 'V-Crunch',
  'chest lift flitterkicks': 'Chest Lift + Flutter Kicks',
  'flutter kicks': 'Flutter Kicks',
  'bic kicks': 'Bicycle Kick',
  'bicycle kicks': 'Bicycle Kick',
  sciccors: 'Scissors (benen)',
  'leg raise': 'Leg Raise (liggend)',
  'leg raises': 'Leg Raise (liggend)',
  legraise: 'Leg Raise (liggend)',
  leegraise: 'Leg Raise (liggend)',
  'legraise + gewicht': 'Leg Raise (met gewicht)',
  'leg raise over weight': 'Leg Raise (over gewicht)',
  'single legraise': 'Leg Raise (1 been)',
  'hanging legraise': 'Hanging Leg Raise',
  'leg raises hanging': 'Hanging Leg Raise',
  'dead bug': 'Dead Bug',
  deadbug: 'Dead Bug',
  'rus twist': 'Russian Twist',
  'russ twist': 'Russian Twist',
  'russ twis': 'Russian Twist',
  'russian twist': 'Russian Twist',
  'russian twists': 'Russian Twist',
  'reps buik': 'Buikspieroefeningen',
  wieltje: 'Ab Wheel Rollout (Wieltje)',
  'wieltje/bal': 'Ab Wheel Rollout (Wieltje) of bal',
  kaarsje: 'Kaarsje (Candlestick)',
  banaan: 'Hollow Hold (Banaan)',
  'v hold': 'V-Hold',
  'ab press': 'Ab Press',
  'side bends': 'Dumbbell Side Bend',
  'side bent': 'Dumbbell Side Bend',
  'side bents': 'Dumbbell Side Bend',
  sturen: 'Sturen (plate rotatie)',
  'rot balgrond': 'Rotatie met bal (grond)',
  'bal roteren op de grond': 'Rotatie met bal (grond)',
  'bal gooien rotatie grond': 'Rotatie met bal (grond)',
  'slamball grond rotatie': 'Rotatie met bal (grond)',
  'rotate ball muur': 'Rotatie met bal (muur)',
  'rotatie bal muur': 'Rotatie met bal (muur)',
  'bal tegen muur': 'Rotatie met bal (muur)',
  'wallball muur rotatie': 'Rotatie met bal (muur)',
  'wallball grand rotatie': 'Rotatie met bal (grond)',
  'wall rotatie': 'Rotatie met bal (muur)',
  'landmine rotatie': 'Landmine Rotatie',
  'rotatie pulley handvat': 'Cable Woodchop',
  'rotatie handvat pulley': 'Cable Woodchop',
  'rotatie pulley of lunge pall of press': 'Pallof Press',
  'lunge pulley of rotation pulley': 'Pallof Press (of lunge)',
  'rotatie over de bank met gewicht': 'Rotatie over de bank (gewicht)',
  'beer positie knie draai': 'Bear Position (knie draaien)',
  'beer position blok -> draaien': 'Bear Position (blok draaien)',
  'core movement': 'Core movement',
  kegel: 'Kegel',
  spider: 'Spiderman Plank',
  spiders: 'Spiderman Plank',
  spiderman: 'Spiderman Plank',
  'mountain climber': 'Mountain Climber',
  'mountain climbers': 'Mountain Climber',
  'mount climbers': 'Mountain Climber',
  'mount cimbers': 'Mountain Climber',
  'mount climb': 'Mountain Climber',
  'mount climb schuin': 'Mountain Climber (schuin)',
  'enkels tikken': 'Enkels tikken (Ankle Taps)',
  'enkels aantikken': 'Enkels tikken (Ankle Taps)',
  'enkel tik': 'Enkels tikken (Ankle Taps)',
  'schenen tikken': 'Enkels tikken (Ankle Taps)',
  'schenen aantikken': 'Enkels tikken (Ankle Taps)',
  'tenen tikken': 'Tenen tikken (Toe Taps)',
  // Conditie / functioneel
  burpee: 'Burpee',
  burpees: 'Burpee',
  'burpees grond hoog': 'Burpee (grond-hoog)',
  'burpee + push up': 'Burpee met push-up',
  wallball: 'Wall Ball',
  wallbal: 'Wall Ball',
  walbal: 'Wall Ball',
  wallbals: 'Wall Ball',
  walballs: 'Wall Ball',
  walbals: 'Wall Ball',
  wallballs: 'Wall Ball',
  'wall ball': 'Wall Ball',
  'wall balls': 'Wall Ball',
  slamball: 'Slam Ball',
  slambal: 'Slam Ball',
  slammball: 'Slam Ball',
  'ball slam': 'Slam Ball',
  slamcarry: 'Slam Ball Carry',
  'slam corny': 'Slam Ball Carry',
  slamcorny: 'Slam Ball Carry',
  'slamball carny': 'Slam Ball Carry',
  'm slamcarry': 'Slam Ball Carry',
  touwen: 'Battle Rope Waves',
  'touwtje springen': 'Jump Rope (Touwtje springen)',
  'touwtje spri': 'Jump Rope (Touwtje springen)',
  'touwtje spr': 'Jump Rope (Touwtje springen)',
  'steouwtje springen': 'Jump Rope (Touwtje springen)',
  'jump jacks': 'Jumping Jacks',
  'jumping jacks': 'Jumping Jacks',
  farmerswalk: "Farmer's Carry",
  'farmer walk': "Farmer's Carry",
  farmers: "Farmer's Carry",
  'farmers carry': "Farmer's Carry",
  'farmer s carry': "Farmer's Carry",
  run: 'Run',
  rennen: 'Run',
  'mtr run': 'Run',
  'm run': 'Run',
  'run einde straat': 'Run (einde straat)',
  sprint: 'Sprint',
  'band pull apart': 'Band Pull-Apart',
  parcour: 'Parcours',
  'gym race': 'Gym Race',
  gymrace: 'Gym Race',
  // Restjes uit het raster (typo's, afkortingen, samengevoegde regels)
  'kickback bicep curl voor mannen': 'Dumbbell Tricep Kickback / Bicep Curl (mannen)',
  'bench press machine chest press': 'Chest Press Machine',
  'bck extension': 'Hyperextension (roman chair)',
  'rotatie pulley of lunge': 'Pallof Press',
  'lunge step up bank draai': 'Step-Up met rotatie',
  clamshelfs: 'Clamshell',
  clumshelfs: 'Clamshell',
  'hiptrust kb swing': 'Hip Thrust + Kettlebell Swing',
  chestress: 'Chest Press Machine',
  'mount push up': 'Mountain Push-Up (pike)',
  dealift: 'Barbell Deadlift',
  'reversed fly s': 'Dumbbell Rear Delt Raise',
};

/** Regels die geen oefening zijn maar de trainingsvorm van de week beschrijven. */
const FORMAT_PATTERNS = [
  /^\d+\s*x\s*\d+(\s*x\s*\d+)?$/i, // 10x10x8, 4x8
  /^\d+(\s*-\s*\d+){2,}$/, // 15-12-9-6-3
  /^\d+x$/i, // 4x
  /^c4x$/i,
  /^\d+$/, // 15
  /^\d+\s*(min|minuten)(\s*lang)?:?$/i,
  /^\d+\s*x\s*\d+\s*(sec|min)(\s+\d+\s*rust)?$/i, // 3x60 sec, 4x30 sec 15 rust
  /^\d+\s*x\s*\d+\s*hh$/i, // 4x20 hh
  /^tabata/i,
  /^am+p?rap/i,
  /^emom/i,
  /^\d+\s*reps?\s+(beastmode|super zwaar)/i,
  /^parcour/i,
  /^gym ?race/i,
  /^alles\s+\d+x$/i,
  /^\d+\s*tot\s*\d+\s*rondes$/i,
  /^rust\s+plek/i,
  /^(vrouwen|mannen)(\s+training)?$/i,
  /^klassikaal$/i,
  /^core movement$/i,
  /^evt\b/i,
  /^\d+\s*nip\?$/i,
  /^run\s+\d+\/\d+\s+rondes/i,
  /^-+$/,
  /^plank\\$/,
];

const UNITS = /^(m|mtr|meter|sec|min)$/i;

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

const catalog = buildExerciseCatalog(loadMegaExerciseNamesFromDisk());
const aliasMap = new Map(Object.entries(ALIASES).map(([k, v]) => [normalizeExerciseKey(k), v]));

/** Woorden met koppelteken die geen superset zijn. */
function protectHyphens(s) {
  return s
    .replace(/\bstep-up/gi, 'step up')
    .replace(/\bpush-up/gi, 'push up')
    .replace(/\bpull-up/gi, 'pull up')
    .replace(/\bchin-up/gi, 'chin up')
    .replace(/\bsit-up/gi, 'sit up')
    .replace(/\bt-bar/gi, 't bar')
    .replace(/\bside-step/gi, 'side step')
    .replace(/\bbent-over/gi, 'bent over')
    .replace(/\bv-crunch/gi, 'v crunch')
    .replace(/\by-side/gi, 'y side')
    .replace(/\by-raise/gi, 'y raise')
    .replace(/\bhip-dips/gi, 'hip dips')
    .replace(/\bknie-hand/gi, 'knie hand')
    .replace(/\bknie-draai/gi, 'knie draai')
    .replace(/\bknie-blok/gi, 'knie blok')
    .replace(/\bbal-\s*in/gi, 'bal in')
    .replace(/\bez-bar/gi, 'ez bar')
    .replace(/\bhip-bridge/gi, 'hipbridge')
    .replace(/\bbal\s*-\s*muur/gi, 'bal muur')
    .replace(/\bball\s*-\s*muur/gi, 'ball muur')
    .replace(/\bstep up\s*-\s*bank/gi, 'step up bank')
    .replace(/\bfront\/side\/full c\b/gi, 'front/side/full c')
    .replace(/\bo\.l\.\//gi, 'o.l.-')
    .replace(/-\s*>/g, '->');
}

function titleCase(s) {
  return s
    .split(/\s+/)
    .map((w) => (w.length > 2 && /^[a-z]/.test(w) ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

const report = { resolved: new Map(), unresolved: new Map(), formats: new Map() };

/** Zet een schoongemaakte naam om in een catalogus-/nette naam. */
function resolveName(rawName) {
  const cleaned = String(rawName).replace(/[’'`]/g, '');
  const key = normalizeExerciseKey(cleaned);
  if (!key) return null;
  const keySpaced = key.replace(/\s*[-\/]\s*/g, ' ').replace(/\s+/g, ' ').trim();
  const candidates = [key, keySpaced, key.replace(/s$/, ''), keySpaced.replace(/s$/, '')];
  for (const k of candidates) {
    const hit = aliasMap.get(k);
    if (hit) return { name: hit, via: 'alias' };
  }
  const fromCatalog = catalog.resolve(cleaned);
  if (fromCatalog) return { name: fromCatalog, via: 'catalog' };
  return null;
}

function isKnownExercise(name) {
  return resolveName(name) != null;
}

/**
 * Eén oefening-regel → { name, reps?, notes? }.
 * Haalt reps vooraan ("20 lunges"), achteraan ("burpees 10", "burpees (10)") en afstanden/tijden eruit.
 */
function parseExercise(text) {
  let s = text.trim().replace(/^-\s*/, '').replace(/[:]+$/, '').trim();
  const notes = [];
  let reps;

  // Notities tussen haakjes, tenzij het alleen een getal is (= reps).
  s = s.replace(/\(([^)]*)\)?/g, (_, inner) => {
    const t = inner.trim();
    if (/^\d+$/.test(t)) reps = Number(t);
    else if (t) notes.push(t);
    return ' ';
  });

  // "500 m" / "250 mtr" zonder oefening = looprondje
  const distanceOnly = /^(\d+(?:\s*\/\s*\d+)?)\s*(m|mtr|meter)$/i.exec(s);
  if (distanceOnly) {
    notes.push(`${distanceOnly[1].replace(/\s+/g, '')} m`);
    s = 'run';
  }

  // "10x3 shoulders …" → notitie 10x3
  const setsReps = /^(\d+\s*x\s*\d+)\s+(.+)$/i.exec(s);
  if (setsReps) {
    notes.push(setsReps[1].replace(/\s+/g, ''));
    s = setsReps[2];
  }

  // "3-6-9-12 squats" → notitie
  const ladder = /^(\d+(?:-\d+){2,})\s+(.+)$/.exec(s);
  if (ladder) {
    notes.push(ladder[1]);
    s = ladder[2];
  }

  // Vooraan: "20 lunges", "250/500 mtr run", "50 m lunges", "1 min plank", "10x burpees"
  const lead = /^(\d+(?:\s*\/\s*\d+)?)\s*(m|mtr|meter|sec|min)?\s+(.+)$/i.exec(s);
  if (lead) {
    const amount = lead[1].replace(/\s+/g, '');
    const unit = lead[2];
    if (unit) notes.push(`${amount} ${unit.toLowerCase() === 'mtr' || unit.toLowerCase() === 'meter' ? 'm' : unit.toLowerCase()}`);
    else if (amount.includes('/')) notes.push(`${amount} reps`);
    else reps = Number(amount);
    s = lead[3];
  } else {
    const leadGlued = /^(\d+)([a-z].+)$/i.exec(s); // "15bankdrukken"
    if (leadGlued) {
      reps = Number(leadGlued[1]);
      s = leadGlued[2];
    }
  }

  // Achteraan: "burpees 10", "wall sit 30x60 se", "plank 1 min", "mountain climbers 60"
  const trailUnit = /^(.+?)\s+(\d+(?:\s*x\s*\d+)?)\s*(m|mtr|sec|se|min)$/i.exec(s);
  const trailNum = /^(.+?)\s+(\d+)$/.exec(s);
  const trailX = /^(.+?)\s+(\d+)x$/i.exec(s);
  if (trailUnit) {
    notes.push(`${trailUnit[2].replace(/\s+/g, '')} ${trailUnit[3].toLowerCase().replace(/^se$/, 'sec').replace(/^mtr$/, 'm')}`);
    s = trailUnit[1];
  } else if (trailX) {
    notes.push(`${trailX[2]}x`);
    s = trailX[1];
  } else if (trailNum && !/^\d/.test(trailNum[1])) {
    reps = Number(trailNum[2]);
    s = trailNum[1];
  }

  // "20 dips hoog 4/5 rondes"
  const rondes = /^(.+?)\s+(\d+\/\d+\s+rondes)$/i.exec(s);
  if (rondes) {
    notes.push(rondes[2]);
    s = rondes[1];
  }

  s = s.replace(/\s+/g, ' ').trim().replace(/[?]+$/, '').trim();
  if (reps != null && reps > 100) {
    notes.push(`${reps} (afstand/aantal)`);
    reps = undefined;
  }
  return { name: s, reps, notes };
}

/** Superset-splitsing: alleen als beide helften herkenbare oefeningen zijn. */
function splitSuperset(name) {
  const protectedName = protectHyphens(name);
  if (/\d\s*\/\s*\d/.test(protectedName) || protectedName.includes('->')) return [protectedName];
  // Staat de hele regel al in de vertaaltabel? Dan is het één oefening (bijv. "burpee + push up").
  if (resolveName(protectedName)?.via === 'alias') return [protectedName];
  const parts = protectedName.split(/\s*[-\/+]\s*/).map((p) => p.trim()).filter(Boolean);
  if (parts.length === 2 && parts.every((p) => isKnownExercise(parseExercise(p).name))) return parts;
  return [protectedName];
}

function isFormatLine(line) {
  const t = line.trim();
  return FORMAT_PATTERNS.some((re) => re.test(t));
}

/**
 * Regels van één week → { notes, exercises }.
 * @param {string[]} lines
 */
function parseWeek(lines) {
  const notes = [];
  const exercises = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (isFormatLine(line)) {
      if (!/^-+$/.test(line) && !/^plank\\$/.test(line)) {
        notes.push(line.replace(/:$/, ''));
        report.formats.set(line.toLowerCase(), (report.formats.get(line.toLowerCase()) ?? 0) + 1);
      }
      continue;
    }

    const parsed = parseExercise(line);
    if (!parsed.name) {
      // Alleen een toelichting (bijv. "(lunge of gewicht)") → notitie bij de vorige oefening.
      const prev = exercises[exercises.length - 1];
      if (prev && parsed.notes.length) prev.notes = [prev.notes, ...parsed.notes].filter(Boolean).join(' · ');
      continue;
    }
    const parts = splitSuperset(parsed.name);
    const isSuperset = parts.length === 2;
    const names = [];
    const partExercises = parts.map((part) => {
      const p = isSuperset ? parseExercise(part) : { name: part, reps: undefined, notes: [] };
      const resolved = resolveName(p.name);
      const finalName = resolved?.name ?? titleCase(p.name);
      const bucket = resolved ? report.resolved : report.unresolved;
      const k = p.name.toLowerCase();
      const entry = bucket.get(k) ?? { to: finalName, via: resolved?.via ?? 'none', count: 0 };
      entry.count += 1;
      bucket.set(k, entry);
      names.push(finalName);
      return {
        name: finalName,
        reps: p.reps ?? parsed.reps,
        notes: [...parsed.notes, ...p.notes],
      };
    });

    partExercises.forEach((ex, i) => {
      const exNotes = [...ex.notes];
      if (isSuperset) exNotes.push(`Superset met ${names[1 - i]}`);
      const timed = ex.notes.some((n) => /^\d+(\/\d+)?(x\d+)? ?(m|sec|min)$/.test(n));
      exercises.push({
        exerciseId: ex.name,
        exerciseName: ex.name,
        setsTarget: DEFAULT_SETS,
        repsTarget: ex.reps ?? (timed ? 1 : DEFAULT_REPS),
        notes: exNotes.join(' · '),
      });
    });
  }
  const counted = [];
  for (const n of notes) {
    const hit = counted.find((c) => c.text === n);
    if (hit) hit.count += 1;
    else counted.push({ text: n, count: 1 });
  }
  const noteText = counted.map((c) => (c.count > 1 ? `${c.text} (${c.count}×)` : c.text)).join(' · ');
  return { notes: noteText, exercises };
}

function slug(s) {
  return String(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function addDays(dateStr, days) {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Tabblad → Schema (zelfde vorm als src/types Schema). */
function buildSchema(tab, { trainerId, start }) {
  const weekKeys = Object.keys(tab.weeks).sort((a, b) => Number(a.replace(/\D/g, '')) - Number(b.replace(/\D/g, '')));
  const days = weekKeys.map((week) => {
    const { notes, exercises } = parseWeek(tab.weeks[week] || []);
    const day = { dayLabel: week, exercises };
    if (notes) day.notes = notes;
    return day;
  });
  const weeks = days.length;
  return {
    id: `schema_sgt2026_${slug(tab.name)}`,
    name: tab.name,
    trainerId,
    clientId: null,
    audience: 'group',
    participantIds: [],
    createdAt: new Date().toISOString(),
    days,
    startDate: start,
    endDate: weeks > 0 ? addDays(start, weeks * 7 - 1) : null,
    formule7: null,
    isFormule7Template: false,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function resolveTrainerId(args) {
  if (args.trainerUid) return args.trainerUid;
  if (args.dryRun && !args.trainerEmail) return 'TRAINER_UID';
  if (!args.trainerEmail) {
    console.error('Geef --trainer-email of --trainer-uid op (eigenaar van de workouts).');
    process.exit(1);
  }
  const admin = await initAdmin();
  const user = await admin.auth().getUserByEmail(args.trainerEmail);
  return user.uid;
}

let _admin = null;
async function initAdmin() {
  if (_admin) return _admin;
  const admin = (await import('firebase-admin')).default;
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!credPath || !existsSync(resolvePath(credPath))) {
    console.error('FOUT: Zet GOOGLE_APPLICATION_CREDENTIALS naar het pad van je Firebase service account JSON.');
    console.error('Voorbeeld: export GOOGLE_APPLICATION_CREDENTIALS=./service-account.json');
    process.exit(1);
  }
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(JSON.parse(readFileSync(resolvePath(credPath), 'utf8'))),
    });
  }
  _admin = admin;
  return admin;
}

function printReport(schemas) {
  const totalEx = schemas.reduce((n, s) => n + s.days.reduce((m, d) => m + d.exercises.length, 0), 0);
  console.log('\nWorkouts:');
  for (const s of schemas) {
    const ex = s.days.reduce((m, d) => m + d.exercises.length, 0);
    console.log(`  ${s.name.padEnd(28)} ${String(s.days.length).padStart(2)} weken  ${String(ex).padStart(4)} oefeningen  (${s.startDate} t/m ${s.endDate})`);
  }
  const resolvedCount = [...report.resolved.values()].reduce((n, e) => n + e.count, 0);
  const unresolvedCount = [...report.unresolved.values()].reduce((n, e) => n + e.count, 0);
  console.log(`\nOefeningen totaal: ${totalEx}`);
  console.log(`  herkend via vertaaltabel/catalogus: ${resolvedCount}`);
  console.log(`  niet herkend (naam netjes overgenomen): ${unresolvedCount}`);
  if (report.unresolved.size) {
    console.log('\nNiet herkende namen (bron → in app):');
    [...report.unresolved.entries()]
      .sort((a, b) => b[1].count - a[1].count)
      .forEach(([k, e]) => console.log(`  ${String(e.count).padStart(3)}× ${k}  →  ${e.to}`));
  }
  const viaCatalog = [...report.resolved.entries()].filter(([, e]) => e.via === 'catalog');
  if (viaCatalog.length) {
    console.log('\nVia catalogus (fuzzy) herkend, even nakijken:');
    viaCatalog.sort((a, b) => b[1].count - a[1].count).forEach(([k, e]) => console.log(`  ${String(e.count).padStart(3)}× ${k}  →  ${e.to}`));
  }
  console.log(`\nWeek-notities (trainingsvormen): ${[...report.formats.values()].reduce((a, b) => a + b, 0)} regels, bijv. ${[...report.formats.keys()].slice(0, 8).join(', ')}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  let tabs = args.csv ? loadTabsFromCsvDir(args.csv) : loadTabsFromJson(args.json);
  if (args.only) tabs = tabs.filter((t) => t.name.toLowerCase() === args.only.toLowerCase());
  if (tabs.length === 0) {
    console.error('Geen tabbladen gevonden.');
    process.exit(1);
  }

  const trainerId = await resolveTrainerId(args);
  const schemas = tabs.map((t) => buildSchema(t, { trainerId, start: args.start }));

  mkdirSync(OUT_DIR, { recursive: true });
  for (const s of schemas) writeFileSync(join(OUT_DIR, `${s.id}.json`), JSON.stringify(s, null, 2));
  const mapping = {
    resolved: Object.fromEntries([...report.resolved.entries()].sort()),
    unresolved: Object.fromEntries([...report.unresolved.entries()].sort()),
  };
  writeFileSync(join(OUT_DIR, 'mapping-rapport.json'), JSON.stringify(mapping, null, 2));
  printReport(schemas);
  console.log(`\nJSON per workout + mapping-rapport.json staan in ${OUT_DIR}`);

  if (args.emitAppData) {
    const appData = {
      source: 'Trainingen_SGT_2026.pdf',
      generatedAt: new Date().toISOString().slice(0, 10),
      defaultStart: args.start,
      lessons: schemas.map((s) => ({ key: s.id.replace(/^schema_sgt2026_/, ''), name: s.name, days: s.days })),
    };
    writeFileSync(APP_DATA_FILE, JSON.stringify(appData));
    console.log(`App-data geschreven naar ${APP_DATA_FILE} (${schemas.length} lessen).`);
    return;
  }

  if (args.dryRun) {
    console.log('\n--dry-run: niets naar Firestore geschreven.');
    return;
  }

  const admin = await initAdmin();
  const db = admin.firestore();
  const batch = db.batch();
  for (const s of schemas) {
    batch.set(db.collection('workouts').doc(s.id), { ...s, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
  }
  await batch.commit();
  console.log(`\n✅ ${schemas.length} groepsles-workout(s) geschreven naar Firestore (collectie workouts, trainer ${trainerId}).`);
}

main().catch((err) => {
  console.error('Import mislukt:', err?.message ?? err);
  process.exit(1);
});
