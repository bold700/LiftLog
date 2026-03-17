// Database met fitness oefeningen
// Primaire bron: mega_exercise_db.json (AALO + uitgebreide bibliotheek, 160 oefeningen met equipment).
// Legacy: onderstaande lijst voor oefeningen die nog niet in de mega-DB zitten (bijv. oude logs).

import {
  getMegaExerciseData,
  getMegaExerciseByName,
  getMegaExerciseNames,
} from './megaExerciseDb';

export type ExerciseEquipment = 'machine' | 'free_weight' | 'cable' | 'bodyweight' | 'other';

export interface ExerciseData {
  name: string;
  category: string;
  muscles?: string[];
  /** Voor filter op voorkeur klant (bijv. alleen machines). */
  equipment?: ExerciseEquipment;
}

export const exerciseDatabase: ExerciseData[] = [
  // CHEST
  { name: 'Barbell Bench Press', category: 'Chest' },
  { name: 'Incline Dumbbell Bench Press', category: 'Chest' },
  { name: 'Pec Deck', category: 'Chest' },
  { name: 'Cable Crossover', category: 'Chest' },
  { name: 'Incline Barbell Bench Press', category: 'Chest' },
  { name: 'Dumbbell Bench Press', category: 'Chest' },
  { name: 'Dumbbell Fly', category: 'Chest' },
  { name: 'Incline Dumbbell Fly', category: 'Chest' },
  { name: 'Butterfly Dumbbells', category: 'Chest' },
  { name: 'Chest Press Machine', category: 'Chest' },
  { name: 'Seated Chest Press', category: 'Chest' },
  { name: 'Barbell Declined Bench Press', category: 'Chest' },
  { name: 'Dumbbell Declined Bench Press', category: 'Chest' },
  { name: 'Push Ups', category: 'Chest' },
  
  // TRICEPS
  { name: 'Lying Triceps Extension', category: 'Triceps' },
  { name: 'Triceps Pressdown', category: 'Triceps' },
  { name: 'Cable Rope Pushdown', category: 'Triceps' },
  { name: 'Dumbbell Overhead Triceps Extension', category: 'Triceps' },
  { name: 'Close Grip Bench Press', category: 'Triceps' },
  { name: 'Kickback', category: 'Triceps' },
  { name: 'Tricep Kickback Dumbbels', category: 'Triceps' },
  { name: 'Reverse Grip Cable Triceps Extension with Barbell', category: 'Triceps' },
  { name: 'Single-Arm Cable Triceps Extension', category: 'Triceps' },
  { name: 'Single-Arm Cable Triceps Extension with Supinated Grip', category: 'Triceps' },
  { name: 'Lying Dumbbell Triceps Extension', category: 'Triceps' },
  { name: 'Seated Barbell French Press', category: 'Triceps' },
  { name: 'Bench Dips', category: 'Triceps' },
  { name: 'Parallel Dip Bar', category: 'Triceps' },
  
  // CALVES
  { name: 'Seated Calf Raise', category: 'Calves' },
  { name: 'Standing Calf Raise', category: 'Calves' },
  
  // BACK
  { name: 'Dumbbell Bent-Over Row (Single Arm)', category: 'Back' },
  { name: 'One Arm Row Dumbbel', category: 'Back' },
  { name: 'Wide-Grip Pulldown', category: 'Back' },
  { name: 'Seated Cable Row', category: 'Back' },
  { name: 'Horizontal Row Machine', category: 'Back' },
  { name: 'Close-Grip Pulldown', category: 'Back' },
  { name: 'Barbell Row', category: 'Back' },
  { name: 'Behind-Neck Pulldown', category: 'Back' },
  { name: 'Reverse-Grip Pulldown', category: 'Back' },
  { name: 'Rope Pulldown', category: 'Back' },
  { name: 'T-Bar Rows', category: 'Back' },
  { name: 'Barbell Bent Over Rows Supinated Grip', category: 'Back' },
  { name: 'Pull Up', category: 'Back' },
  { name: 'Behind the Neck Pull Up', category: 'Back' },
  { name: 'Pull Up with a Supinated Grip', category: 'Back' },
  { name: 'Straight Arm Lat Pulldown', category: 'Back' },
  { name: 'Dumbbell Bent Over Rows', category: 'Back' },
  { name: 'Dumbbell Pullover', category: 'Back' },
  { name: 'Barbell Pullover', category: 'Back' },
  { name: 'Barbell Deadlift', category: 'Back' },
  { name: 'Barbell Sumo Deadlift', category: 'Back' },
  { name: 'Trap Bar Deadlift', category: 'Back' },
  { name: 'Dumbbell Deadlift', category: 'Back' },
  { name: 'Barbell Shrug', category: 'Back' },
  { name: 'Dumbbell Shrugs', category: 'Back' },
  
  // BICEPS
  { name: 'Barbell Curl', category: 'Biceps' },
  { name: 'Alternating Dumbbell Curl', category: 'Biceps' },
  { name: 'Rope Cable Curl', category: 'Biceps' },
  { name: 'EZ Barbell Curl', category: 'Biceps' },
  { name: 'EZ Barbell Preacher Curl', category: 'Biceps' },
  { name: 'Hammer Curl', category: 'Biceps' },
  { name: 'Incline Dumbbell Curl', category: 'Biceps' },
  { name: 'Dumbbell Concentration Curl', category: 'Biceps' },
  { name: 'Single-Arm Low Pulley Cable Curl', category: 'Biceps' },
  { name: 'Straight Bar Low Pulley Cable Curl', category: 'Biceps' },
  { name: 'Standing High Pulley Cable Curl', category: 'Biceps' },
  { name: 'Seated Barbell Wrist Curl', category: 'Biceps' },
  { name: 'Seated Barbell Wrist Extension', category: 'Biceps' },
  { name: 'Reverse Barbell Curl', category: 'Biceps' },
  
  // ABDOMINALS
  { name: 'Crunch', category: 'Abdominals' },
  { name: 'Oblique Crunch', category: 'Abdominals' },
  { name: 'Bicycle Kick', category: 'Abdominals' },
  { name: 'Crunch Machine', category: 'Abdominals' },
  { name: 'Rope Ab Pulldown', category: 'Abdominals' },
  { name: 'Plank', category: 'Abdominals' },
  { name: 'Hanging Leg Raise', category: 'Abdominals' },
  { name: 'Bent Knee Reverse Crunch', category: 'Abdominals' },
  { name: 'Long Arm Crunch', category: 'Abdominals' },
  { name: 'Plank Get Ups', category: 'Abdominals' },
  
  // SHOULDERS
  { name: 'Dumbbell Shoulder Press', category: 'Shoulders' },
  { name: 'Dumbbell Lateral Raise', category: 'Shoulders' },
  { name: 'Side Raise Seated', category: 'Shoulders' },
  { name: 'Dumbbell Front Raise', category: 'Shoulders' },
  { name: 'High Cable Rear Delt Fly', category: 'Shoulders' },
  { name: 'Reverse Pectoral Fly Machine', category: 'Shoulders' },
  { name: 'Face Pull', category: 'Shoulders' },
  { name: 'Smith Machine Shoulder Press', category: 'Shoulders' },
  { name: 'Barbell Upright Row', category: 'Shoulders' },
  { name: 'Bent-Over Lateral Raise', category: 'Shoulders' },
  { name: 'Cable One-Arm Lateral Raise', category: 'Shoulders' },
  { name: 'Dumbbell Push Press', category: 'Shoulders' },
  { name: 'Barbell Push Press', category: 'Shoulders' },
  { name: 'Single-Arm Cable Front Raise', category: 'Shoulders' },
  { name: 'Barbell Front Raise', category: 'Shoulders' },
  { name: 'Seated Barbell Shoulder Press', category: 'Shoulders' },
  { name: 'Seated Behind the Neck Barbell Shoulder Press', category: 'Shoulders' },
  { name: 'Standing Barbell Shoulder Press', category: 'Shoulders' },
  { name: 'Standing Behind the Neck Barbell Shoulder Press', category: 'Shoulders' },
  { name: 'Alternate Dumbbell Front Raise Neutral Grip', category: 'Shoulders' },
  { name: 'One-Arm Low-Pulley Front Raise Neutral Grip', category: 'Shoulders' },
  { name: 'Two-Handed Dumbbell Front Raise', category: 'Shoulders' },
  
  // LEGS
  { name: 'Squat', category: 'Legs' },
  { name: 'Leg Press', category: 'Legs' },
  { name: 'Leg Extension', category: 'Legs' },
  { name: 'Lunge', category: 'Legs' },
  { name: 'Lying Leg Curl', category: 'Legs' },
  { name: 'Hack Squat', category: 'Legs' },
  { name: 'Seated Leg Curl', category: 'Legs' },
  { name: 'Single Leg Extension', category: 'Legs' },
  { name: 'Front Squat', category: 'Legs' },
  { name: 'Dumbbell Stiff-Leg Deadlift', category: 'Legs' },
  { name: 'Barbell Stiff-Leg Deadlift', category: 'Legs' },
  { name: 'Dumbbell Goblet Squat', category: 'Legs' },
  { name: 'Knee Tuck Jumps', category: 'Legs' },
  { name: 'Burpees', category: 'Legs' },
  { name: 'Bodyweight Squat', category: 'Legs' },
  { name: '1.5 Rep Bodyweight Squats', category: 'Legs' },
  { name: 'Medicine Ball Squat', category: 'Legs' },
  { name: 'Barbell Bulgarian Split Squat', category: 'Legs' },
  { name: 'Bodyweight Bulgarian Split Squat', category: 'Legs' },
  { name: 'Mini-Band Air Squat', category: 'Legs' },
  { name: 'Jump Squat', category: 'Legs' },
  { name: 'Wall Sit', category: 'Legs' },
  { name: 'Medicine Ball Deadlift', category: 'Legs' },
  { name: 'Single Leg Bodyweight Deadlift', category: 'Legs' },
  { name: 'Kettlebell Sumo Deadlift', category: 'Legs' },
  { name: 'Good Morning', category: 'Legs' },
  { name: 'Bodyweight Glute Bridge', category: 'Legs' },
  { name: 'Single Leg Glute Bridge', category: 'Legs' },
  { name: 'Banded Glute Bridge', category: 'Legs' },
  { name: 'Duck Walk', category: 'Legs' },
  { name: 'Bird Dog', category: 'Legs' },
  { name: 'Groiners', category: 'Legs' },
  { name: 'Fire Hydrants', category: 'Legs' },
  { name: 'Smith Machine Hip Thrust', category: 'Legs' },
  { name: 'Barbell Hip Thrust', category: 'Legs' },
  { name: 'Band Seated Hip Abduction', category: 'Legs' },
  { name: 'Seated Hip Abduction Machine', category: 'Legs' },
  { name: 'Standing Cable Abduction', category: 'Legs' },
  { name: 'Bodyweight Frog Pump', category: 'Legs' },
  { name: 'Smith Machine Frog Pump', category: 'Legs' },
  { name: 'Banded Clams', category: 'Legs' },
  { name: 'Side Lying Leg Raise', category: 'Legs' },
  { name: 'Glute Ham Raise', category: 'Legs' },
  { name: 'Dumbbell Step Up', category: 'Legs' },
  { name: 'Lateral Mini-Band Walk', category: 'Legs' },
  { name: 'Standing Knee Raise', category: 'Legs' },
  { name: 'Kettlebell Swings', category: 'Legs' },
  { name: 'Standing Cable Kickback', category: 'Legs' },
  { name: 'Donkey Kicks', category: 'Legs' },
  { name: 'Side Lying Hip Raise', category: 'Legs' },
  { name: 'Squat Sit to Reach', category: 'Legs' },
];

// Helper: equipment uit naam afleiden (voor oefeningen zonder equipment-veld of user-oefeningen)
function inferEquipmentFromName(name: string): ExerciseEquipment {
  const n = name.toLowerCase();
  if (/\bmachine\b|leg Press|pec deck|leg extension|leg curl|hack squat|horizontal row machine|crunch machine|reverse pectoral fly|smith machine|seated hip abduction|glute ham raise|seated calf raise|seated chest press|chest press machine/i.test(n)) return 'machine';
  if (/\bcable\b|pulldown|pulley|rope cable|cable rope|face pull/i.test(n)) return 'cable';
  if (/\bbodyweight\b|push up|pull up|plank|dips|hanging leg raise|burpee|wall sit|donkey kick|bird dog|duck walk|fire hydrant|groiner|frog pump|banded |mini-band|side lying leg raise/i.test(n)) return 'bodyweight';
  if (/\bbarbell\b|dumbbell\b|dumbbel\b|kettlebell|ez barbell|medicine ball|t-bar/i.test(n)) return 'free_weight';
  return 'other';
}

/** Gecombineerde lijst: mega-DB (primair) + legacy-oefeningen die niet in mega zitten. */
function getCombinedDatabase(): ExerciseData[] {
  const mega = getMegaExerciseData();
  const megaNames = new Set(mega.map((e) => e.name));
  const legacyOnly = exerciseDatabase.filter((e) => !megaNames.has(e.name));
  return [...mega, ...legacyOnly];
}

/** Bepaalt equipment voor een oefening (mega-DB → legacy → inferentie). */
export function getExerciseEquipment(exerciseName: string): ExerciseEquipment {
  const mega = getMegaExerciseByName(exerciseName);
  if (mega?.equipment) return mega.equipment;
  const legacy = exerciseDatabase.find((e) => e.name === exerciseName);
  if (legacy?.equipment) return legacy.equipment;
  return inferEquipmentFromName(exerciseName);
}

// Helper functies (gebruiken gecombineerde bron)
export const getExerciseNames = (): string[] => {
  const megaNames = new Set(getMegaExerciseNames());
  const legacyOnly = exerciseDatabase.filter((e) => !megaNames.has(e.name)).map((e) => e.name);
  return [...getMegaExerciseNames(), ...legacyOnly].sort();
};

export const getExercisesByCategory = (category: string): ExerciseData[] => {
  return getCombinedDatabase().filter((ex) => ex.category === category);
};

/** Filter oefeningnamen op equipment (voor schema-stap 3: "klant wil alleen machines"). */
export function getExerciseNamesByEquipment(
  equipmentFilter: ExerciseEquipment | 'all',
  includeUserNames: string[]
): string[] {
  const combined = getCombinedDatabase();
  const dbNames = combined
    .filter(
      (ex) =>
        equipmentFilter === 'all' ||
        (ex.equipment ?? inferEquipmentFromName(ex.name)) === equipmentFilter
    )
    .map((ex) => ex.name);
  const userFiltered =
    equipmentFilter === 'all'
      ? includeUserNames
      : includeUserNames.filter((name) => getExerciseEquipment(name) === equipmentFilter);
  return [...new Set([...dbNames, ...userFiltered])].sort();
}

export const searchExercises = (query: string): ExerciseData[] => {
  const lowerQuery = query.toLowerCase();
  return getCombinedDatabase().filter(
    (ex) =>
      ex.name.toLowerCase().includes(lowerQuery) ||
      ex.category.toLowerCase().includes(lowerQuery) ||
      ex.muscles?.some((m) => m.toLowerCase().includes(lowerQuery))
  );
};

export const getCategories = (): string[] => {
  const categories = new Set(getCombinedDatabase().map((ex) => ex.category));
  return Array.from(categories).sort();
};
