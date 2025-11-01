// Metadata voor oefeningen met spiergroepen, bewegingstype, etc.

export interface ExerciseMetadata {
  name: string;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  movementType: 'Push' | 'Pull' | 'Hinge' | 'Squat' | 'Isolatie' | 'Core' | 'Rotatie' | 'Cardio' | 'Mobiliteit' | 'Carry';
  exerciseType: string;
  alternativeNames: string[];
}

export const exerciseMetadata: ExerciseMetadata[] = [
  {
    name: 'Bench Press',
    primaryMuscles: ['Borst (pectoralis major)'],
    secondaryMuscles: ['Schouders (voorste deltoid)', 'Triceps brachii'],
    movementType: 'Push',
    exerciseType: 'Barbell (halter)',
    alternativeNames: ['Bankdrukken', 'Bench Press'],
  },
  {
    name: 'Incline Bench Press',
    primaryMuscles: ['Borst (bovenkant pectoralis)'],
    secondaryMuscles: ['Schouders (voorste deltoid)', 'Triceps'],
    movementType: 'Push',
    exerciseType: 'Barbell',
    alternativeNames: ['Schuine Bankdrukken', 'Incline Bench Press'],
  },
  {
    name: 'Dumbbell Bench Press',
    primaryMuscles: ['Borst'],
    secondaryMuscles: ['Schouders', 'Triceps'],
    movementType: 'Push',
    exerciseType: 'Dumbbell',
    alternativeNames: ['Dumbbell Borstdruk', 'Dumbbell Press'],
  },
  {
    name: 'Push-up',
    primaryMuscles: ['Borst', 'Triceps'],
    secondaryMuscles: ['Schouders', 'Core'],
    movementType: 'Push',
    exerciseType: 'Lichaamsgewicht',
    alternativeNames: ['Opdrukken', 'Push-up'],
  },
  {
    name: 'Dip',
    primaryMuscles: ['Triceps', 'Borst'],
    secondaryMuscles: ['Schouders'],
    movementType: 'Push',
    exerciseType: 'Lichaamsgewicht',
    alternativeNames: ['Dips', 'Parallel Bar Dips', 'Triceps Dips'],
  },
  {
    name: 'Chest Fly',
    primaryMuscles: ['Borst'],
    secondaryMuscles: ['Schouders (voorzijde)'],
    movementType: 'Isolatie',
    exerciseType: 'Dumbbell',
    alternativeNames: ['Dumbbell Fly', 'Flyes', 'Chest Fly'],
  },
  {
    name: 'Cable Crossover',
    primaryMuscles: ['Borst'],
    secondaryMuscles: ['Schouders (voorzijde)'],
    movementType: 'Isolatie',
    exerciseType: 'Kabel (machine)',
    alternativeNames: ['Cable Flyes', 'Cable Fly'],
  },
  {
    name: 'Chest Press',
    primaryMuscles: ['Borst'],
    secondaryMuscles: ['Schouders', 'Triceps'],
    movementType: 'Push',
    exerciseType: 'Machine',
    alternativeNames: ['Machine Borstdruk', 'Chest Press'],
  },
  {
    name: 'Pull-up',
    primaryMuscles: ['Rug (latissimus dorsi)'],
    secondaryMuscles: ['Biceps', 'Schouders (achterkant)'],
    movementType: 'Pull',
    exerciseType: 'Lichaamsgewicht',
    alternativeNames: ['Optrekken aan stang', 'Pull-up'],
  },
  {
    name: 'Chin-up',
    primaryMuscles: ['Biceps', 'Rug (latissimus)'],
    secondaryMuscles: ['Onderarmen', 'Schouders'],
    movementType: 'Pull',
    exerciseType: 'Lichaamsgewicht',
    alternativeNames: ['Kinoptrekken', 'Chin-up'],
  },
  {
    name: 'Lat Pulldown',
    primaryMuscles: ['Rug (latissimus dorsi)'],
    secondaryMuscles: ['Biceps'],
    movementType: 'Pull',
    exerciseType: 'Machine/Kabel',
    alternativeNames: ['Lat Pulldown machine'],
  },
  {
    name: 'Barbell Row',
    primaryMuscles: ['Rug (lats, middenrug)'],
    secondaryMuscles: ['Biceps', 'Trapezius'],
    movementType: 'Pull',
    exerciseType: 'Barbell',
    alternativeNames: ['Barbell Bent-over Row', 'Barbell Row'],
  },
  {
    name: 'Dumbbell Row',
    primaryMuscles: ['Rug (lats, rhomboïden)'],
    secondaryMuscles: ['Biceps'],
    movementType: 'Pull',
    exerciseType: 'Dumbbell',
    alternativeNames: ['One-Arm Dumbbell Row', 'Dumbbell Row'],
  },
  {
    name: 'Cable Row',
    primaryMuscles: ['Rug (middenrug)'],
    secondaryMuscles: ['Biceps', 'Rhomboïden'],
    movementType: 'Pull',
    exerciseType: 'Kabel',
    alternativeNames: ['Seated Cable Row', 'Cable Row'],
  },
  {
    name: 'Deadlift',
    primaryMuscles: ['Hamstrings', 'Bilspieren', 'Onderrug'],
    secondaryMuscles: ['Rug (latissimus dorsi)', 'Quadriceps', 'Trapezius'],
    movementType: 'Hinge',
    exerciseType: 'Barbell',
    alternativeNames: ['Deadlift'],
  },
  {
    name: 'Barbell Shrug',
    primaryMuscles: ['Bovenrug (trapezius)'],
    secondaryMuscles: ['Nek', 'Onderarmen'],
    movementType: 'Isolatie',
    exerciseType: 'Barbell',
    alternativeNames: ['Schouderophalen', 'Barbell Shrug'],
  },
  {
    name: 'Face Pull',
    primaryMuscles: ['Schouders (achterste deltoid)'],
    secondaryMuscles: ['Bovenrug (rhomboïden, trapezius)'],
    movementType: 'Pull',
    exerciseType: 'Kabel/Weerstandsband',
    alternativeNames: ['Face Pull'],
  },
  {
    name: 'Squat',
    primaryMuscles: ['Quadriceps', 'Bilspieren'],
    secondaryMuscles: ['Hamstrings', 'Kuiten', 'Core'],
    movementType: 'Squat',
    exerciseType: 'Barbell',
    alternativeNames: ['Back Squat (Halter Squat)', 'Squat', 'Barbell Squat'],
  },
  {
    name: 'Front Squat',
    primaryMuscles: ['Quadriceps'],
    secondaryMuscles: ['Bilspieren', 'Hamstrings'],
    movementType: 'Squat',
    exerciseType: 'Barbell',
    alternativeNames: ['Front Squat'],
  },
  {
    name: 'Leg Press',
    primaryMuscles: ['Quadriceps', 'Bilspieren'],
    secondaryMuscles: ['Hamstrings'],
    movementType: 'Squat',
    exerciseType: 'Machine',
    alternativeNames: ['Leg Press machine'],
  },
  {
    name: 'Lunge',
    primaryMuscles: ['Quadriceps'],
    secondaryMuscles: ['Bilspieren', 'Hamstrings'],
    movementType: 'Squat',
    exerciseType: 'Lichaamsgewicht/Dumbbell',
    alternativeNames: ['Uitvalspas', 'Uitstap', 'Lunge'],
  },
  {
    name: 'Bulgarian Split Squat',
    primaryMuscles: ['Quadriceps'],
    secondaryMuscles: ['Bilspieren', 'Hamstrings'],
    movementType: 'Squat',
    exerciseType: 'Dumbbell/Barbell',
    alternativeNames: ['Bulgarian Lunge', 'Bulgarian Split Squat'],
  },
  {
    name: 'Romanian Deadlift',
    primaryMuscles: ['Hamstrings', 'Bilspieren'],
    secondaryMuscles: ['Onderrug'],
    movementType: 'Hinge',
    exerciseType: 'Barbell/Dumbbell',
    alternativeNames: ['RDL', 'Romanian Deadlift'],
  },
  {
    name: 'Leg Extension',
    primaryMuscles: ['Quadriceps'],
    secondaryMuscles: [],
    movementType: 'Isolatie',
    exerciseType: 'Machine',
    alternativeNames: ['Leg Extension'],
  },
  {
    name: 'Leg Curl',
    primaryMuscles: ['Hamstrings'],
    secondaryMuscles: ['Kuiten'],
    movementType: 'Isolatie',
    exerciseType: 'Machine',
    alternativeNames: ['Hamstring Curl', 'Leg Curl'],
  },
  {
    name: 'Hip Thrust',
    primaryMuscles: ['Bilspieren (gluteus maximus)'],
    secondaryMuscles: ['Hamstrings', 'Quadriceps'],
    movementType: 'Hinge',
    exerciseType: 'Barbell/Lichaamsgewicht',
    alternativeNames: ['Glute Bridge', 'Hip Thrust'],
  },
  {
    name: 'Calf Raise',
    primaryMuscles: ['Kuiten (gastrocnemius, soleus)'],
    secondaryMuscles: [],
    movementType: 'Isolatie',
    exerciseType: 'Lichaamsgewicht/Machine',
    alternativeNames: ['Kuitheffing', 'Calf Raise'],
  },
  {
    name: 'Kettlebell Swing',
    primaryMuscles: ['Bilspieren', 'Hamstrings'],
    secondaryMuscles: ['Onderrug', 'Quadriceps', 'Schouders'],
    movementType: 'Hinge',
    exerciseType: 'Kettlebell',
    alternativeNames: ['Kettlebell Swing'],
  },
  {
    name: 'Step-up',
    primaryMuscles: ['Quadriceps', 'Bilspieren'],
    secondaryMuscles: ['Hamstrings'],
    movementType: 'Squat',
    exerciseType: 'Lichaamsgewicht/Dumbbell',
    alternativeNames: ['Step-up'],
  },
  {
    name: 'Overhead Press',
    primaryMuscles: ['Schouders (deltoids)'],
    secondaryMuscles: ['Triceps', 'Bovenborst'],
    movementType: 'Push',
    exerciseType: 'Barbell',
    alternativeNames: ['Military Press', 'Schouderdruk', 'Overhead Press'],
  },
  {
    name: 'Dumbbell Shoulder Press',
    primaryMuscles: ['Schouders (deltoids)'],
    secondaryMuscles: ['Triceps'],
    movementType: 'Push',
    exerciseType: 'Dumbbell',
    alternativeNames: ['Schouderdruk (zittend/staand)', 'Dumbbell Shoulder Press'],
  },
  {
    name: 'Lateral Raise',
    primaryMuscles: ['Schouders (laterale deltoid)'],
    secondaryMuscles: ['Trapezius', 'Schouders (voor/achter)'],
    movementType: 'Isolatie',
    exerciseType: 'Dumbbell',
    alternativeNames: ['Zijwaartse Schouderhef', 'Side Lateral Raise', 'Lateral Raise'],
  },
  {
    name: 'Front Raise',
    primaryMuscles: ['Schouders (voorste deltoid)'],
    secondaryMuscles: ['Schouders (laterale deltoid)'],
    movementType: 'Isolatie',
    exerciseType: 'Dumbbell/Plate',
    alternativeNames: ['Voorwaartse Schouderhef', 'Front Raise'],
  },
  {
    name: 'Reverse Fly',
    primaryMuscles: ['Schouders (achterste deltoid)'],
    secondaryMuscles: ['Bovenrug (rhomboïden, trapezius)'],
    movementType: 'Isolatie',
    exerciseType: 'Dumbbell/Kabel',
    alternativeNames: ['Rear Delt Fly', 'Bent-over Lateral Raise', 'Reverse Fly'],
  },
  {
    name: 'Upright Row',
    primaryMuscles: ['Bovenrug/Schouders (trapezius, delts)'],
    secondaryMuscles: ['Biceps'],
    movementType: 'Pull',
    exerciseType: 'Barbell/Dumbbell',
    alternativeNames: ['Opwaartse Roei', 'Upright Row'],
  },
  {
    name: 'Dumbbell Shrug',
    primaryMuscles: ['Trapezius (bovenrug)'],
    secondaryMuscles: ['Nek', 'Onderarmen'],
    movementType: 'Isolatie',
    exerciseType: 'Dumbbell',
    alternativeNames: ['Schouderophalen (dumbbell)', 'Dumbbell Shrug'],
  },
  {
    name: 'Biceps Curl',
    primaryMuscles: ['Biceps brachii'],
    secondaryMuscles: ['Brachialis', 'Onderarmen'],
    movementType: 'Isolatie',
    exerciseType: 'Barbell/Dumbbell',
    alternativeNames: ['Armcurl', 'Biceps Curl'],
  },
  {
    name: 'Hammer Curl',
    primaryMuscles: ['Brachialis', 'Brachioradialis'],
    secondaryMuscles: ['Biceps'],
    movementType: 'Isolatie',
    exerciseType: 'Dumbbell',
    alternativeNames: ['Hammer Curl'],
  },
  {
    name: 'Triceps Pushdown',
    primaryMuscles: ['Triceps brachii'],
    secondaryMuscles: [],
    movementType: 'Isolatie',
    exerciseType: 'Kabel',
    alternativeNames: ['Cable Pushdown', 'Triceps Pushdown'],
  },
  {
    name: 'Overhead Tricep Extension',
    primaryMuscles: ['Triceps brachii'],
    secondaryMuscles: ['Onderarmen'],
    movementType: 'Isolatie',
    exerciseType: 'Dumbbell/Kabel',
    alternativeNames: ['Triceps Extensie (Overhead)', 'Overhead Tricep Extension'],
  },
  {
    name: 'Skullcrusher',
    primaryMuscles: ['Triceps brachii'],
    secondaryMuscles: ['Onderarmen'],
    movementType: 'Isolatie',
    exerciseType: 'Barbell',
    alternativeNames: ['Lying Triceps Extension', 'Skullcrusher'],
  },
  {
    name: 'Wrist Curl',
    primaryMuscles: ['Onderarmen (flexoren)'],
    secondaryMuscles: [],
    movementType: 'Isolatie',
    exerciseType: 'Dumbbell/Barbell',
    alternativeNames: ['Pols Curl', 'Wrist Curl'],
  },
  {
    name: 'Plank',
    primaryMuscles: ['Core (rechte buikspier)', 'Transverse abdominis'],
    secondaryMuscles: ['Obliques', 'Glutes', 'Lage rug'],
    movementType: 'Core',
    exerciseType: 'Lichaamsgewicht',
    alternativeNames: ['Plank', 'High Plank', 'Elleboog Plank'],
  },
  {
    name: 'Side Plank',
    primaryMuscles: ['Obliques'],
    secondaryMuscles: ['Schouders', 'Heup (gluteus medius)'],
    movementType: 'Core',
    exerciseType: 'Lichaamsgewicht',
    alternativeNames: ['Zijwaartse plank', 'Side Plank'],
  },
  {
    name: 'Crunch',
    primaryMuscles: ['Buikspieren (rectus abdominis)'],
    secondaryMuscles: ['Obliques (licht)'],
    movementType: 'Core',
    exerciseType: 'Lichaamsgewicht',
    alternativeNames: ['Crunch'],
  },
  {
    name: 'Sit-up',
    primaryMuscles: ['Buikspieren', 'Heupbuigers'],
    secondaryMuscles: ['Obliques'],
    movementType: 'Core',
    exerciseType: 'Lichaamsgewicht',
    alternativeNames: ['Sit-up'],
  },
  {
    name: 'Leg Raise',
    primaryMuscles: ['Onderste buikspieren', 'Heupbuigers'],
    secondaryMuscles: ['Quadriceps'],
    movementType: 'Core',
    exerciseType: 'Lichaamsgewicht',
    alternativeNames: ['Beenheffen', 'Hanging Leg Raise', 'Leg Raise'],
  },
  {
    name: 'Russian Twist',
    primaryMuscles: ['Obliques'],
    secondaryMuscles: ['Buikspieren'],
    movementType: 'Rotatie',
    exerciseType: 'Lichaamsgewicht/Medicine Ball',
    alternativeNames: ['Russian Twist'],
  },
  {
    name: 'Hyperextension',
    primaryMuscles: ['Erector spinae (onderrug)', 'Lage rug'],
    secondaryMuscles: ['Bilspieren', 'Hamstrings'],
    movementType: 'Hinge',
    exerciseType: 'Lichaamsgewicht/Machine',
    alternativeNames: ['Rugextensie', 'Back Extension', 'Hyperextension', 'Lower Back Extension'],
  },
  {
    name: 'Jump Rope',
    primaryMuscles: ['Cardio (benen)'],
    secondaryMuscles: [],
    movementType: 'Cardio',
    exerciseType: 'Lichaamsgewicht',
    alternativeNames: ['Touwtjespringen', 'Springtouw', 'Jump Rope'],
  },
  {
    name: 'Running',
    primaryMuscles: ['Cardio (benen)'],
    secondaryMuscles: [],
    movementType: 'Cardio',
    exerciseType: 'Lichaamsgewicht',
    alternativeNames: ['Hardlopen', 'Joggen', 'Rennen', 'Running'],
  },
  {
    name: 'Stationary Bike',
    primaryMuscles: ['Cardio (benen: quadriceps, hamstrings)'],
    secondaryMuscles: [],
    movementType: 'Cardio',
    exerciseType: 'Machine',
    alternativeNames: ['Fietsen (stationaire bike)', 'Hometrainer', 'Stationary Bike'],
  },
  {
    name: 'Burpee',
    primaryMuscles: ['Full body (borst, benen, core)'],
    secondaryMuscles: [],
    movementType: 'Cardio',
    exerciseType: 'Lichaamsgewicht',
    alternativeNames: ['Burpee'],
  },
  {
    name: 'Jumping Jack',
    primaryMuscles: ['Full body (benen, schouders)'],
    secondaryMuscles: [],
    movementType: 'Cardio',
    exerciseType: 'Lichaamsgewicht',
    alternativeNames: ['Jumping Jack'],
  },
  // Nieuwe Borst oefeningen
  {
    name: 'Decline Bench Press',
    primaryMuscles: ['Borst (onderkant pectoralis)'],
    secondaryMuscles: ['Schouders (voorste deltoid)', 'Triceps'],
    movementType: 'Push',
    exerciseType: 'Barbell',
    alternativeNames: ['Decline Bench Press', 'Decline Bankdrukken'],
  },
  {
    name: 'Incline Dumbbell Press',
    primaryMuscles: ['Borst (bovenkant pectoralis)'],
    secondaryMuscles: ['Schouders (voorste deltoid)', 'Triceps'],
    movementType: 'Push',
    exerciseType: 'Dumbbell',
    alternativeNames: ['Incline Dumbbell Press', 'Schuine Dumbbell Press'],
  },
  {
    name: 'Parallel Bar Dips',
    primaryMuscles: ['Triceps'],
    secondaryMuscles: ['Borst', 'Schouders'],
    movementType: 'Push',
    exerciseType: 'Lichaamsgewicht',
    alternativeNames: ['Triceps Dips', 'Parallel Bar Dips', 'Dips'],
  },
  {
    name: 'Pec Deck',
    primaryMuscles: ['Borst'],
    secondaryMuscles: ['Schouders (voorzijde)'],
    movementType: 'Isolatie',
    exerciseType: 'Machine',
    alternativeNames: ['Pec Deck', 'Butterfly Machine'],
  },
  // Nieuwe Rug oefeningen
  {
    name: 'T-Bar Row',
    primaryMuscles: ['Rug (lats, middenrug)'],
    secondaryMuscles: ['Biceps', 'Trapezius'],
    movementType: 'Pull',
    exerciseType: 'Barbell/Machine',
    alternativeNames: ['T-Bar Row', 'T-Bar Roei'],
  },
  {
    name: 'Good Morning',
    primaryMuscles: ['Hamstrings', 'Erector spinae'],
    secondaryMuscles: ['Bilspieren', 'Rugstrekkers'],
    movementType: 'Hinge',
    exerciseType: 'Barbell',
    alternativeNames: ['Good Morning'],
  },
  // Nieuwe Benen oefeningen
  {
    name: 'Walking Lunge',
    primaryMuscles: ['Quadriceps', 'Bilspieren'],
    secondaryMuscles: ['Hamstrings'],
    movementType: 'Squat',
    exerciseType: 'Lichaamsgewicht/Dumbbell',
    alternativeNames: ['Walking Lunges', 'Wandelende Uitvalspas'],
  },
  {
    name: 'Goblet Squat',
    primaryMuscles: ['Quadriceps'],
    secondaryMuscles: ['Bilspieren', 'Core'],
    movementType: 'Squat',
    exerciseType: 'Dumbbell/Kettlebell',
    alternativeNames: ['Goblet Squat'],
  },
  {
    name: 'Bodyweight Squat',
    primaryMuscles: ['Quadriceps', 'Bilspieren'],
    secondaryMuscles: ['Hamstrings'],
    movementType: 'Squat',
    exerciseType: 'Lichaamsgewicht',
    alternativeNames: ['Bodyweight Squat', 'Body Squat'],
  },
  {
    name: 'Seated Calf Raise',
    primaryMuscles: ['Kuiten (soleus)'],
    secondaryMuscles: [],
    movementType: 'Isolatie',
    exerciseType: 'Machine',
    alternativeNames: ['Seated Calf Raises'],
  },
  {
    name: 'Standing Calf Raise',
    primaryMuscles: ['Kuiten (gastrocnemius)'],
    secondaryMuscles: [],
    movementType: 'Isolatie',
    exerciseType: 'Machine/Lichaamsgewicht',
    alternativeNames: ['Standing Calf Raises'],
  },
  // Nieuwe Schouder oefeningen
  {
    name: 'Rear Delt Fly',
    primaryMuscles: ['Schouders (achterste deltoid)'],
    secondaryMuscles: ['Bovenrug (rhomboïden, trapezius)'],
    movementType: 'Isolatie',
    exerciseType: 'Dumbbell/Kabel',
    alternativeNames: ['Rear Delt Fly', 'Reverse Fly', 'Bent-over Lateral Raise'],
  },
  // Nieuwe Arm oefeningen
  {
    name: 'Concentration Curl',
    primaryMuscles: ['Biceps brachii'],
    secondaryMuscles: ['Brachialis'],
    movementType: 'Isolatie',
    exerciseType: 'Dumbbell',
    alternativeNames: ['Concentration Curl'],
  },
  {
    name: 'Preacher Curl',
    primaryMuscles: ['Biceps brachii'],
    secondaryMuscles: ['Brachialis', 'Onderarmen'],
    movementType: 'Isolatie',
    exerciseType: 'Barbell/Dumbbell',
    alternativeNames: ['Preacher Curl'],
  },
  {
    name: 'Triceps Kickback',
    primaryMuscles: ['Triceps brachii'],
    secondaryMuscles: ['Onderarmen'],
    movementType: 'Isolatie',
    exerciseType: 'Dumbbell',
    alternativeNames: ['Triceps Kickback', 'Kickback'],
  },
  {
    name: 'Reverse Wrist Curl',
    primaryMuscles: ['Onderarmen (extensoren)'],
    secondaryMuscles: [],
    movementType: 'Isolatie',
    exerciseType: 'Dumbbell/Barbell',
    alternativeNames: ['Reverse Wrist Curl'],
  },
  // Nieuwe Core oefeningen
  {
    name: 'Dead Bug',
    primaryMuscles: ['Core (transverse abdominis)', 'Rechte buikspier'],
    secondaryMuscles: ['Obliques'],
    movementType: 'Core',
    exerciseType: 'Lichaamsgewicht',
    alternativeNames: ['Dead Bug'],
  },
  {
    name: 'Bird Dog',
    primaryMuscles: ['Erector spinae', 'Core'],
    secondaryMuscles: ['Bilspieren', 'Schouders'],
    movementType: 'Core',
    exerciseType: 'Lichaamsgewicht',
    alternativeNames: ['Bird Dog'],
  },
  {
    name: 'Hanging Leg Raise',
    primaryMuscles: ['Onderste buikspieren', 'Heupbuigers'],
    secondaryMuscles: ['Obliques'],
    movementType: 'Core',
    exerciseType: 'Lichaamsgewicht',
    alternativeNames: ['Hanging Leg Raise', 'Hanging Knee Raise'],
  },
  // Nieuwe Rotatie oefeningen
  {
    name: 'Cable Woodchop',
    primaryMuscles: ['Obliques'],
    secondaryMuscles: ['Core', 'Diepe buikspieren'],
    movementType: 'Rotatie',
    exerciseType: 'Kabel',
    alternativeNames: ['Cable Woodchop', 'Woodchop'],
  },
  {
    name: 'Medicine Ball Toss',
    primaryMuscles: ['Obliques', 'Core'],
    secondaryMuscles: ['Heupen'],
    movementType: 'Rotatie',
    exerciseType: 'Medicine Ball',
    alternativeNames: ['Rotational Throws', 'Medicine Ball Tosses'],
  },
  {
    name: 'Pallof Press',
    primaryMuscles: ['Core (anti-rotatie)', 'Obliques', 'Transverse abdominis'],
    secondaryMuscles: ['Schouders'],
    movementType: 'Core',
    exerciseType: 'Kabel',
    alternativeNames: ['Pallof Press', 'Anti-Rotation Press'],
  },
  // Nieuwe Carry oefeningen
  {
    name: "Farmer's Walk",
    primaryMuscles: ['Trapezius', 'Core', 'Grip'],
    secondaryMuscles: ['Benen', 'Onderarmen'],
    movementType: 'Carry',
    exerciseType: 'Dumbbell/Kettlebell',
    alternativeNames: ["Farmer's Walk", 'Farmer Walk'],
  },
  {
    name: 'Suitcase Carry',
    primaryMuscles: ['Core (anti-laterale flexie)', 'Obliques'],
    secondaryMuscles: ['Grip', 'Schouders'],
    movementType: 'Carry',
    exerciseType: 'Dumbbell/Kettlebell',
    alternativeNames: ['Suitcase Carry', 'Unilateral Carry'],
  },
  {
    name: 'Overhead Carry',
    primaryMuscles: ['Schouders', 'Core'],
    secondaryMuscles: ['Triceps', 'Onderarmen'],
    movementType: 'Carry',
    exerciseType: 'Barbell/Kettlebell',
    alternativeNames: ['Overhead Carry', 'Waiters Walk'],
  },
  {
    name: 'Zercher Carry',
    primaryMuscles: ['Core', 'Bovenrug'],
    secondaryMuscles: ['Benen', 'Armen'],
    movementType: 'Carry',
    exerciseType: 'Barbell',
    alternativeNames: ['Zercher Carry'],
  },
  // Nieuwe Cardio oefeningen
  {
    name: 'Rowing Machine',
    primaryMuscles: ['Cardio (full body)', 'Benen', 'Rug', 'Armen'],
    secondaryMuscles: [],
    movementType: 'Cardio',
    exerciseType: 'Machine',
    alternativeNames: ['Roeiergometer', 'Rowing', 'Ergometer'],
  },
  // Nieuwe Mobiliteit oefeningen
  {
    name: 'Arm Circles',
    primaryMuscles: ['Mobiliteit (schouders)'],
    secondaryMuscles: [],
    movementType: 'Mobiliteit',
    exerciseType: 'Lichaamsgewicht',
    alternativeNames: ['Armzwaaien', 'Arm Rotations', 'Arm Circles'],
  },
  {
    name: 'Shoulder Dislocates',
    primaryMuscles: ['Mobiliteit (schouders, borst)'],
    secondaryMuscles: [],
    movementType: 'Mobiliteit',
    exerciseType: 'Stok/Weerstandsband',
    alternativeNames: ['Schouder Dislocaties', 'Shoulder Dislocates'],
  },
  {
    name: 'Leg Swings',
    primaryMuscles: ['Mobiliteit (heupen)'],
    secondaryMuscles: [],
    movementType: 'Mobiliteit',
    exerciseType: 'Lichaamsgewicht',
    alternativeNames: ['Beenzwaai', 'Leg Swings'],
  },
  {
    name: 'Hip Circles',
    primaryMuscles: ['Mobiliteit (heupen, bekken)'],
    secondaryMuscles: [],
    movementType: 'Mobiliteit',
    exerciseType: 'Lichaamsgewicht',
    alternativeNames: ['Hip Circles', 'Hip Mobility'],
  },
  {
    name: 'Cat-Cow',
    primaryMuscles: ['Mobiliteit (wervelkolom)'],
    secondaryMuscles: [],
    movementType: 'Mobiliteit',
    exerciseType: 'Lichaamsgewicht',
    alternativeNames: ['Cat-Cow Stretch', 'Cat-Cow'],
  },
];

/**
 * Vind exercise metadata op basis van oefening naam
 * Probeert exact match, dan fuzzy match op alternatieve namen
 */
export const findExerciseMetadata = (exerciseName: string): ExerciseMetadata | null => {
  const normalizedName = exerciseName.trim().toLowerCase();
  
  // Exact match op hoofdnaam
  let match = exerciseMetadata.find(
    meta => meta.name.toLowerCase() === normalizedName
  );
  
  if (match) return match;
  
  // Zoek in alternatieve namen
  for (const meta of exerciseMetadata) {
    const hasMatch = meta.alternativeNames.some(
      alt => alt.toLowerCase() === normalizedName
    );
    if (hasMatch) return meta;
  }
  
  // Fuzzy match - probeer partial matches
  for (const meta of exerciseMetadata) {
    const metaNameLower = meta.name.toLowerCase();
    const altNamesLower = meta.alternativeNames.map(alt => alt.toLowerCase());
    
    // Check of de oefening naam een deel bevat van de metadata naam of vice versa
    if (metaNameLower.includes(normalizedName) || normalizedName.includes(metaNameLower)) {
      return meta;
    }
    
    // Check alternatieve namen
    for (const altName of altNamesLower) {
      if (altName.includes(normalizedName) || normalizedName.includes(altName)) {
        return meta;
      }
    }
  }
  
  return null;
};

/**
 * Haal alle unieke primaire spiergroepen op
 */
export const getAllPrimaryMuscles = (): string[] => {
  const muscles = new Set<string>();
  exerciseMetadata.forEach(meta => {
    meta.primaryMuscles.forEach(muscle => muscles.add(muscle));
  });
  return Array.from(muscles).sort();
};

/**
 * Haal alle unieke secundaire spiergroepen op
 */
export const getAllSecondaryMuscles = (): string[] => {
  const muscles = new Set<string>();
  exerciseMetadata.forEach(meta => {
    meta.secondaryMuscles.forEach(muscle => muscles.add(muscle));
  });
  return Array.from(muscles).sort();
};

/**
 * Haal alle unieke bewegingstypen op
 */
export const getAllMovementTypes = (): string[] => {
  const types = new Set<string>();
  exerciseMetadata.forEach(meta => {
    types.add(meta.movementType);
  });
  return Array.from(types).sort();
};

/**
 * Haal alle oefening namen op (hoofdnaam + alternatieve namen)
 * Dit wordt gebruikt voor de Autocomplete suggesties
 */
export const getAllExerciseNames = (): string[] => {
  const names = new Set<string>();
  exerciseMetadata.forEach(meta => {
    // Voeg hoofdnaam toe
    names.add(meta.name);
    // Voeg alle alternatieve namen toe
    meta.alternativeNames.forEach(alt => names.add(alt));
  });
  return Array.from(names).sort();
};

/**
 * Haal alle oefening metadata op
 */
export const getExerciseMetadataList = (): ExerciseMetadata[] => {
  return exerciseMetadata;
};

