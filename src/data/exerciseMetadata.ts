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
  // CHEST
  {
    name: 'Barbell Bench Press',
    primaryMuscles: ['Borst (pectoralis major)'],
    secondaryMuscles: ['Schouders (voorste deltoid)', 'Triceps brachii'],
    movementType: 'Push',
    exerciseType: 'Barbell',
    alternativeNames: ['Bench Press', 'Bankdrukken'],
  },
  {
    name: 'Incline Dumbbell Bench Press',
    primaryMuscles: ['Borst (bovenkant pectoralis)'],
    secondaryMuscles: ['Schouders (voorste deltoid)', 'Triceps'],
    movementType: 'Push',
    exerciseType: 'Dumbbell',
    alternativeNames: ['Incline Dumbbell Press'],
  },
  {
    name: 'Pec Deck',
    primaryMuscles: ['Borst'],
    secondaryMuscles: ['Schouders (voorzijde)'],
    movementType: 'Isolatie',
    exerciseType: 'Machine',
    alternativeNames: ['Pec Deck', 'Butterfly Machine'],
  },
  {
    name: 'Cable Crossover',
    primaryMuscles: ['Borst'],
    secondaryMuscles: ['Schouders (voorzijde)'],
    movementType: 'Isolatie',
    exerciseType: 'Kabel',
    alternativeNames: ['Cable Flyes', 'Cable Fly'],
  },
  {
    name: 'Incline Barbell Bench Press',
    primaryMuscles: ['Borst (bovenkant pectoralis)'],
    secondaryMuscles: ['Schouders (voorste deltoid)', 'Triceps'],
    movementType: 'Push',
    exerciseType: 'Barbell',
    alternativeNames: ['Incline Bench Press'],
  },
  {
    name: 'Dumbbell Bench Press',
    primaryMuscles: ['Borst'],
    secondaryMuscles: ['Schouders', 'Triceps'],
    movementType: 'Push',
    exerciseType: 'Dumbbell',
    alternativeNames: ['Dumbbell Press'],
  },
  {
    name: 'Dumbbell Fly',
    primaryMuscles: ['Borst'],
    secondaryMuscles: ['Schouders (voorzijde)'],
    movementType: 'Isolatie',
    exerciseType: 'Dumbbell',
    alternativeNames: ['Dumbbell Flyes', 'Chest Fly'],
  },
  {
    name: 'Incline Dumbbell Fly',
    primaryMuscles: ['Borst (bovenkant)'],
    secondaryMuscles: ['Schouders (voorzijde)'],
    movementType: 'Isolatie',
    exerciseType: 'Dumbbell',
    alternativeNames: ['Incline Flyes'],
  },
  {
    name: 'Chest Press Machine',
    primaryMuscles: ['Borst'],
    secondaryMuscles: ['Schouders', 'Triceps'],
    movementType: 'Push',
    exerciseType: 'Machine',
    alternativeNames: ['Machine Chest Press'],
  },
  {
    name: 'Barbell Declined Bench Press',
    primaryMuscles: ['Borst (onderkant pectoralis)'],
    secondaryMuscles: ['Schouders', 'Triceps'],
    movementType: 'Push',
    exerciseType: 'Barbell',
    alternativeNames: ['Decline Bench Press'],
  },
  {
    name: 'Dumbbell Declined Bench Press',
    primaryMuscles: ['Borst (onderkant pectoralis)'],
    secondaryMuscles: ['Schouders', 'Triceps'],
    movementType: 'Push',
    exerciseType: 'Dumbbell',
    alternativeNames: ['Decline Dumbbell Press'],
  },
  {
    name: 'Push Ups',
    primaryMuscles: ['Borst', 'Triceps'],
    secondaryMuscles: ['Schouders', 'Core'],
    movementType: 'Push',
    exerciseType: 'Lichaamsgewicht',
    alternativeNames: ['Push-ups', 'Push Up'],
  },
  
  // TRICEPS
  {
    name: 'Lying Triceps Extension',
    primaryMuscles: ['Triceps brachii'],
    secondaryMuscles: ['Onderarmen'],
    movementType: 'Isolatie',
    exerciseType: 'Barbell/Dumbbell',
    alternativeNames: ['Skullcrusher', 'Lying Extension'],
  },
  {
    name: 'Triceps Pressdown',
    primaryMuscles: ['Triceps brachii'],
    secondaryMuscles: [],
    movementType: 'Isolatie',
    exerciseType: 'Kabel',
    alternativeNames: ['Cable Pushdown', 'Triceps Pushdown'],
  },
  {
    name: 'Cable Rope Pushdown',
    primaryMuscles: ['Triceps brachii'],
    secondaryMuscles: [],
    movementType: 'Isolatie',
    exerciseType: 'Kabel',
    alternativeNames: ['Rope Pushdown'],
  },
  {
    name: 'Dumbbell Overhead Triceps Extension',
    primaryMuscles: ['Triceps brachii'],
    secondaryMuscles: ['Onderarmen'],
    movementType: 'Isolatie',
    exerciseType: 'Dumbbell',
    alternativeNames: ['Overhead Extension'],
  },
  {
    name: 'Close Grip Bench Press',
    primaryMuscles: ['Triceps'],
    secondaryMuscles: ['Borst', 'Schouders'],
    movementType: 'Push',
    exerciseType: 'Barbell',
    alternativeNames: ['Close Grip Press'],
  },
  {
    name: 'Kickback',
    primaryMuscles: ['Triceps brachii'],
    secondaryMuscles: ['Onderarmen'],
    movementType: 'Isolatie',
    exerciseType: 'Dumbbell',
    alternativeNames: ['Triceps Kickback'],
  },
  {
    name: 'Reverse Grip Cable Triceps Extension with Barbell',
    primaryMuscles: ['Triceps brachii'],
    secondaryMuscles: [],
    movementType: 'Isolatie',
    exerciseType: 'Kabel',
    alternativeNames: ['Reverse Grip Pushdown'],
  },
  {
    name: 'Single-Arm Cable Triceps Extension',
    primaryMuscles: ['Triceps brachii'],
    secondaryMuscles: [],
    movementType: 'Isolatie',
    exerciseType: 'Kabel',
    alternativeNames: ['Single Arm Pushdown'],
  },
  {
    name: 'Single-Arm Cable Triceps Extension with Supinated Grip',
    primaryMuscles: ['Triceps brachii'],
    secondaryMuscles: [],
    movementType: 'Isolatie',
    exerciseType: 'Kabel',
    alternativeNames: ['Single Arm Reverse Pushdown'],
  },
  {
    name: 'Lying Dumbbell Triceps Extension',
    primaryMuscles: ['Triceps brachii'],
    secondaryMuscles: ['Onderarmen'],
    movementType: 'Isolatie',
    exerciseType: 'Dumbbell',
    alternativeNames: ['Lying Dumbbell Extension'],
  },
  {
    name: 'Seated Barbell French Press',
    primaryMuscles: ['Triceps brachii'],
    secondaryMuscles: ['Onderarmen'],
    movementType: 'Isolatie',
    exerciseType: 'Barbell',
    alternativeNames: ['Seated French Press'],
  },
  {
    name: 'Bench Dips',
    primaryMuscles: ['Triceps'],
    secondaryMuscles: ['Schouders', 'Borst'],
    movementType: 'Push',
    exerciseType: 'Lichaamsgewicht',
    alternativeNames: ['Dips'],
  },
  {
    name: 'Parallel Dip Bar',
    primaryMuscles: ['Triceps', 'Borst'],
    secondaryMuscles: ['Schouders'],
    movementType: 'Push',
    exerciseType: 'Lichaamsgewicht',
    alternativeNames: ['Dips', 'Parallel Dips'],
  },
  
  // CALVES
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
  
  // BACK
  {
    name: 'Dumbbell Bent-Over Row (Single Arm)',
    primaryMuscles: ['Rug (latissimus dorsi)'],
    secondaryMuscles: ['Biceps', 'Rhomboids'],
    movementType: 'Pull',
    exerciseType: 'Dumbbell',
    alternativeNames: ['Single Arm Row', 'One-Arm Row'],
  },
  {
    name: 'Wide-Grip Pulldown',
    primaryMuscles: ['Rug (latissimus dorsi)'],
    secondaryMuscles: ['Biceps'],
    movementType: 'Pull',
    exerciseType: 'Machine/Kabel',
    alternativeNames: ['Wide Grip Lat Pulldown'],
  },
  {
    name: 'Seated Cable Row',
    primaryMuscles: ['Rug (middenrug)'],
    secondaryMuscles: ['Biceps', 'Rhomboids'],
    movementType: 'Pull',
    exerciseType: 'Kabel',
    alternativeNames: ['Cable Row', 'Seated Row'],
  },
  {
    name: 'Close-Grip Pulldown',
    primaryMuscles: ['Rug (latissimus dorsi)'],
    secondaryMuscles: ['Biceps'],
    movementType: 'Pull',
    exerciseType: 'Machine/Kabel',
    alternativeNames: ['Close Grip Lat Pulldown'],
  },
  {
    name: 'Barbell Row',
    primaryMuscles: ['Rug (lats, middenrug)'],
    secondaryMuscles: ['Biceps', 'Trapezius'],
    movementType: 'Pull',
    exerciseType: 'Barbell',
    alternativeNames: ['Bent-over Row'],
  },
  {
    name: 'Behind-Neck Pulldown',
    primaryMuscles: ['Rug (latissimus dorsi)'],
    secondaryMuscles: ['Biceps'],
    movementType: 'Pull',
    exerciseType: 'Machine/Kabel',
    alternativeNames: ['Behind Neck Lat Pulldown'],
  },
  {
    name: 'Reverse-Grip Pulldown',
    primaryMuscles: ['Rug (latissimus dorsi)'],
    secondaryMuscles: ['Biceps'],
    movementType: 'Pull',
    exerciseType: 'Machine/Kabel',
    alternativeNames: ['Reverse Grip Lat Pulldown'],
  },
  {
    name: 'Rope Pulldown',
    primaryMuscles: ['Rug (latissimus dorsi)'],
    secondaryMuscles: ['Biceps'],
    movementType: 'Pull',
    exerciseType: 'Machine/Kabel',
    alternativeNames: ['Rope Lat Pulldown'],
  },
  {
    name: 'T-Bar Rows',
    primaryMuscles: ['Rug (lats, middenrug)'],
    secondaryMuscles: ['Biceps', 'Trapezius'],
    movementType: 'Pull',
    exerciseType: 'Barbell/Machine',
    alternativeNames: ['T-Bar Row'],
  },
  {
    name: 'Barbell Bent Over Rows Supinated Grip',
    primaryMuscles: ['Rug (lats, middenrug)'],
    secondaryMuscles: ['Biceps', 'Trapezius'],
    movementType: 'Pull',
    exerciseType: 'Barbell',
    alternativeNames: ['Underhand Row'],
  },
  {
    name: 'Pull Up',
    primaryMuscles: ['Rug (latissimus dorsi)'],
    secondaryMuscles: ['Biceps', 'Schouders (achterkant)'],
    movementType: 'Pull',
    exerciseType: 'Lichaamsgewicht',
    alternativeNames: ['Pull-up', 'Pullups'],
  },
  {
    name: 'Behind the Neck Pull Up',
    primaryMuscles: ['Rug (latissimus dorsi)'],
    secondaryMuscles: ['Biceps', 'Schouders'],
    movementType: 'Pull',
    exerciseType: 'Lichaamsgewicht',
    alternativeNames: ['Behind Neck Pull-up'],
  },
  {
    name: 'Pull Up with a Supinated Grip',
    primaryMuscles: ['Biceps', 'Rug (latissimus)'],
    secondaryMuscles: ['Onderarmen'],
    movementType: 'Pull',
    exerciseType: 'Lichaamsgewicht',
    alternativeNames: ['Chin-up', 'Chin Up'],
  },
  {
    name: 'Straight Arm Lat Pulldown',
    primaryMuscles: ['Rug (latissimus dorsi)'],
    secondaryMuscles: ['Schouders'],
    movementType: 'Pull',
    exerciseType: 'Kabel',
    alternativeNames: ['Straight Arm Pulldown'],
  },
  {
    name: 'Dumbbell Bent Over Rows',
    primaryMuscles: ['Rug (lats, rhomboïden)'],
    secondaryMuscles: ['Biceps'],
    movementType: 'Pull',
    exerciseType: 'Dumbbell',
    alternativeNames: ['Dumbbell Row'],
  },
  {
    name: 'Dumbbell Pullover',
    primaryMuscles: ['Rug (latissimus dorsi)'],
    secondaryMuscles: ['Borst', 'Triceps'],
    movementType: 'Pull',
    exerciseType: 'Dumbbell',
    alternativeNames: ['Pullover'],
  },
  {
    name: 'Barbell Pullover',
    primaryMuscles: ['Rug (latissimus dorsi)'],
    secondaryMuscles: ['Borst', 'Triceps'],
    movementType: 'Pull',
    exerciseType: 'Barbell',
    alternativeNames: ['Barbell Pullover'],
  },
  {
    name: 'Barbell Deadlift',
    primaryMuscles: ['Hamstrings', 'Bilspieren', 'Onderrug'],
    secondaryMuscles: ['Rug (latissimus dorsi)', 'Quadriceps', 'Trapezius'],
    movementType: 'Hinge',
    exerciseType: 'Barbell',
    alternativeNames: ['Deadlift'],
  },
  {
    name: 'Barbell Sumo Deadlift',
    primaryMuscles: ['Hamstrings', 'Bilspieren', 'Onderrug'],
    secondaryMuscles: ['Rug', 'Quadriceps'],
    movementType: 'Hinge',
    exerciseType: 'Barbell',
    alternativeNames: ['Sumo Deadlift'],
  },
  {
    name: 'Trap Bar Deadlift',
    primaryMuscles: ['Hamstrings', 'Bilspieren', 'Onderrug'],
    secondaryMuscles: ['Quadriceps', 'Trapezius'],
    movementType: 'Hinge',
    exerciseType: 'Trap Bar',
    alternativeNames: ['Hex Bar Deadlift'],
  },
  {
    name: 'Dumbbell Deadlift',
    primaryMuscles: ['Hamstrings', 'Bilspieren', 'Onderrug'],
    secondaryMuscles: ['Rug', 'Quadriceps'],
    movementType: 'Hinge',
    exerciseType: 'Dumbbell',
    alternativeNames: ['Dumbbell Deadlift'],
  },
  {
    name: 'Barbell Shrug',
    primaryMuscles: ['Bovenrug (trapezius)'],
    secondaryMuscles: ['Nek', 'Onderarmen'],
    movementType: 'Isolatie',
    exerciseType: 'Barbell',
    alternativeNames: ['Shrugs'],
  },
  {
    name: 'Dumbbell Shrugs',
    primaryMuscles: ['Bovenrug (trapezius)'],
    secondaryMuscles: ['Nek', 'Onderarmen'],
    movementType: 'Isolatie',
    exerciseType: 'Dumbbell',
    alternativeNames: ['Dumbbell Shrug'],
  },
  
  // BICEPS
  {
    name: 'Barbell Curl',
    primaryMuscles: ['Biceps brachii'],
    secondaryMuscles: ['Brachialis', 'Onderarmen'],
    movementType: 'Isolatie',
    exerciseType: 'Barbell',
    alternativeNames: ['Biceps Curl', 'Armcurl'],
  },
  {
    name: 'Alternating Dumbbell Curl',
    primaryMuscles: ['Biceps brachii'],
    secondaryMuscles: ['Brachialis'],
    movementType: 'Isolatie',
    exerciseType: 'Dumbbell',
    alternativeNames: ['Alternating Curl'],
  },
  {
    name: 'Rope Cable Curl',
    primaryMuscles: ['Biceps brachii'],
    secondaryMuscles: ['Brachialis'],
    movementType: 'Isolatie',
    exerciseType: 'Kabel',
    alternativeNames: ['Cable Rope Curl'],
  },
  {
    name: 'EZ Barbell Curl',
    primaryMuscles: ['Biceps brachii'],
    secondaryMuscles: ['Brachialis'],
    movementType: 'Isolatie',
    exerciseType: 'EZ Bar',
    alternativeNames: ['EZ Bar Curl'],
  },
  {
    name: 'EZ Barbell Preacher Curl',
    primaryMuscles: ['Biceps brachii'],
    secondaryMuscles: ['Brachialis', 'Onderarmen'],
    movementType: 'Isolatie',
    exerciseType: 'EZ Bar',
    alternativeNames: ['Preacher Curl'],
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
    name: 'Incline Dumbbell Curl',
    primaryMuscles: ['Biceps brachii'],
    secondaryMuscles: ['Brachialis'],
    movementType: 'Isolatie',
    exerciseType: 'Dumbbell',
    alternativeNames: ['Incline Curl'],
  },
  {
    name: 'Dumbbell Concentration Curl',
    primaryMuscles: ['Biceps brachii'],
    secondaryMuscles: ['Brachialis'],
    movementType: 'Isolatie',
    exerciseType: 'Dumbbell',
    alternativeNames: ['Concentration Curl'],
  },
  {
    name: 'Single-Arm Low Pulley Cable Curl',
    primaryMuscles: ['Biceps brachii'],
    secondaryMuscles: ['Brachialis'],
    movementType: 'Isolatie',
    exerciseType: 'Kabel',
    alternativeNames: ['Single Arm Cable Curl'],
  },
  {
    name: 'Straight Bar Low Pulley Cable Curl',
    primaryMuscles: ['Biceps brachii'],
    secondaryMuscles: ['Brachialis'],
    movementType: 'Isolatie',
    exerciseType: 'Kabel',
    alternativeNames: ['Cable Bar Curl'],
  },
  {
    name: 'Standing High Pulley Cable Curl',
    primaryMuscles: ['Biceps brachii'],
    secondaryMuscles: ['Brachialis'],
    movementType: 'Isolatie',
    exerciseType: 'Kabel',
    alternativeNames: ['High Cable Curl'],
  },
  {
    name: 'Seated Barbell Wrist Curl',
    primaryMuscles: ['Onderarmen (flexoren)'],
    secondaryMuscles: [],
    movementType: 'Isolatie',
    exerciseType: 'Barbell',
    alternativeNames: ['Wrist Curl'],
  },
  {
    name: 'Seated Barbell Wrist Extension',
    primaryMuscles: ['Onderarmen (extensoren)'],
    secondaryMuscles: [],
    movementType: 'Isolatie',
    exerciseType: 'Barbell',
    alternativeNames: ['Reverse Wrist Curl'],
  },
  {
    name: 'Reverse Barbell Curl',
    primaryMuscles: ['Onderarmen'],
    secondaryMuscles: ['Brachialis'],
    movementType: 'Isolatie',
    exerciseType: 'Barbell',
    alternativeNames: ['Reverse Curl'],
  },
  
  // ABDOMINALS
  {
    name: 'Crunch',
    primaryMuscles: ['Buikspieren (rectus abdominis)'],
    secondaryMuscles: ['Obliques (licht)'],
    movementType: 'Core',
    exerciseType: 'Lichaamsgewicht',
    alternativeNames: ['Crunches'],
  },
  {
    name: 'Oblique Crunch',
    primaryMuscles: ['Obliques'],
    secondaryMuscles: ['Buikspieren'],
    movementType: 'Core',
    exerciseType: 'Lichaamsgewicht',
    alternativeNames: ['Side Crunch'],
  },
  {
    name: 'Crunch Machine',
    primaryMuscles: ['Buikspieren'],
    secondaryMuscles: [],
    movementType: 'Core',
    exerciseType: 'Machine',
    alternativeNames: ['Ab Machine'],
  },
  {
    name: 'Rope Ab Pulldown',
    primaryMuscles: ['Buikspieren'],
    secondaryMuscles: [],
    movementType: 'Core',
    exerciseType: 'Kabel',
    alternativeNames: ['Cable Crunch'],
  },
  {
    name: 'Plank',
    primaryMuscles: ['Core (rechte buikspier)', 'Transverse abdominis'],
    secondaryMuscles: ['Obliques', 'Glutes', 'Lage rug'],
    movementType: 'Core',
    exerciseType: 'Lichaamsgewicht',
    alternativeNames: ['High Plank'],
  },
  {
    name: 'Hanging Leg Raise',
    primaryMuscles: ['Onderste buikspieren', 'Heupbuigers'],
    secondaryMuscles: ['Obliques'],
    movementType: 'Core',
    exerciseType: 'Lichaamsgewicht',
    alternativeNames: ['Hanging Knee Raise'],
  },
  {
    name: 'Bent Knee Reverse Crunch',
    primaryMuscles: ['Onderste buikspieren'],
    secondaryMuscles: ['Obliques'],
    movementType: 'Core',
    exerciseType: 'Lichaamsgewicht',
    alternativeNames: ['Reverse Crunch'],
  },
  {
    name: 'Long Arm Crunch',
    primaryMuscles: ['Buikspieren'],
    secondaryMuscles: [],
    movementType: 'Core',
    exerciseType: 'Lichaamsgewicht',
    alternativeNames: ['Extended Arm Crunch'],
  },
  {
    name: 'Plank Get Ups',
    primaryMuscles: ['Core', 'Schouders'],
    secondaryMuscles: ['Obliques'],
    movementType: 'Core',
    exerciseType: 'Lichaamsgewicht',
    alternativeNames: ['Plank Up-Down'],
  },
  
  // SHOULDERS
  {
    name: 'Dumbbell Shoulder Press',
    primaryMuscles: ['Schouders (deltoids)'],
    secondaryMuscles: ['Triceps'],
    movementType: 'Push',
    exerciseType: 'Dumbbell',
    alternativeNames: ['Shoulder Press'],
  },
  {
    name: 'Dumbbell Lateral Raise',
    primaryMuscles: ['Schouders (laterale deltoid)'],
    secondaryMuscles: ['Trapezius'],
    movementType: 'Isolatie',
    exerciseType: 'Dumbbell',
    alternativeNames: ['Lateral Raise', 'Side Raise'],
  },
  {
    name: 'Dumbbell Front Raise',
    primaryMuscles: ['Schouders (voorste deltoid)'],
    secondaryMuscles: ['Schouders (laterale deltoid)'],
    movementType: 'Isolatie',
    exerciseType: 'Dumbbell',
    alternativeNames: ['Front Raise'],
  },
  {
    name: 'High Cable Rear Delt Fly',
    primaryMuscles: ['Schouders (achterste deltoid)'],
    secondaryMuscles: ['Bovenrug'],
    movementType: 'Isolatie',
    exerciseType: 'Kabel',
    alternativeNames: ['Rear Delt Fly', 'Reverse Fly'],
  },
  {
    name: 'Smith Machine Shoulder Press',
    primaryMuscles: ['Schouders (deltoids)'],
    secondaryMuscles: ['Triceps'],
    movementType: 'Push',
    exerciseType: 'Smith Machine',
    alternativeNames: ['Smith Shoulder Press'],
  },
  {
    name: 'Barbell Upright Row',
    primaryMuscles: ['Bovenrug/Schouders (trapezius, delts)'],
    secondaryMuscles: ['Biceps'],
    movementType: 'Pull',
    exerciseType: 'Barbell',
    alternativeNames: ['Upright Row'],
  },
  {
    name: 'Bent-Over Lateral Raise',
    primaryMuscles: ['Schouders (achterste deltoid)'],
    secondaryMuscles: ['Bovenrug'],
    movementType: 'Isolatie',
    exerciseType: 'Dumbbell',
    alternativeNames: ['Rear Delt Fly', 'Bent-over Lateral Raise'],
  },
  {
    name: 'Cable One-Arm Lateral Raise',
    primaryMuscles: ['Schouders (laterale deltoid)'],
    secondaryMuscles: ['Trapezius'],
    movementType: 'Isolatie',
    exerciseType: 'Kabel',
    alternativeNames: ['Single Arm Lateral Raise'],
  },
  {
    name: 'Dumbbell Push Press',
    primaryMuscles: ['Schouders (deltoids)'],
    secondaryMuscles: ['Triceps', 'Benen'],
    movementType: 'Push',
    exerciseType: 'Dumbbell',
    alternativeNames: ['Push Press'],
  },
  {
    name: 'Barbell Push Press',
    primaryMuscles: ['Schouders (deltoids)'],
    secondaryMuscles: ['Triceps', 'Benen'],
    movementType: 'Push',
    exerciseType: 'Barbell',
    alternativeNames: ['Push Press'],
  },
  {
    name: 'Single-Arm Cable Front Raise',
    primaryMuscles: ['Schouders (voorste deltoid)'],
    secondaryMuscles: [],
    movementType: 'Isolatie',
    exerciseType: 'Kabel',
    alternativeNames: ['Single Arm Front Raise'],
  },
  {
    name: 'Barbell Front Raise',
    primaryMuscles: ['Schouders (voorste deltoid)'],
    secondaryMuscles: [],
    movementType: 'Isolatie',
    exerciseType: 'Barbell',
    alternativeNames: ['Front Raise'],
  },
  {
    name: 'Seated Barbell Shoulder Press',
    primaryMuscles: ['Schouders (deltoids)'],
    secondaryMuscles: ['Triceps'],
    movementType: 'Push',
    exerciseType: 'Barbell',
    alternativeNames: ['Seated Shoulder Press'],
  },
  {
    name: 'Seated Behind the Neck Barbell Shoulder Press',
    primaryMuscles: ['Schouders (deltoids)'],
    secondaryMuscles: ['Triceps'],
    movementType: 'Push',
    exerciseType: 'Barbell',
    alternativeNames: ['Behind Neck Press'],
  },
  {
    name: 'Standing Barbell Shoulder Press',
    primaryMuscles: ['Schouders (deltoids)'],
    secondaryMuscles: ['Triceps', 'Core'],
    movementType: 'Push',
    exerciseType: 'Barbell',
    alternativeNames: ['Standing Press', 'Military Press'],
  },
  {
    name: 'Standing Behind the Neck Barbell Shoulder Press',
    primaryMuscles: ['Schouders (deltoids)'],
    secondaryMuscles: ['Triceps', 'Core'],
    movementType: 'Push',
    exerciseType: 'Barbell',
    alternativeNames: ['Standing Behind Neck Press'],
  },
  {
    name: 'Alternate Dumbbell Front Raise Neutral Grip',
    primaryMuscles: ['Schouders (voorste deltoid)'],
    secondaryMuscles: [],
    movementType: 'Isolatie',
    exerciseType: 'Dumbbell',
    alternativeNames: ['Alternating Front Raise'],
  },
  {
    name: 'One-Arm Low-Pulley Front Raise Neutral Grip',
    primaryMuscles: ['Schouders (voorste deltoid)'],
    secondaryMuscles: [],
    movementType: 'Isolatie',
    exerciseType: 'Kabel',
    alternativeNames: ['Low Pulley Front Raise'],
  },
  {
    name: 'Two-Handed Dumbbell Front Raise',
    primaryMuscles: ['Schouders (voorste deltoid)'],
    secondaryMuscles: [],
    movementType: 'Isolatie',
    exerciseType: 'Dumbbell',
    alternativeNames: ['Two Arm Front Raise'],
  },
  
  // LEGS - Laat me de belangrijkste legs oefeningen toevoegen
  {
    name: 'Squat',
    primaryMuscles: ['Quadriceps', 'Bilspieren'],
    secondaryMuscles: ['Hamstrings', 'Kuiten', 'Core'],
    movementType: 'Squat',
    exerciseType: 'Barbell',
    alternativeNames: ['Back Squat', 'Barbell Squat'],
  },
  {
    name: 'Leg Press',
    primaryMuscles: ['Quadriceps', 'Bilspieren'],
    secondaryMuscles: ['Hamstrings'],
    movementType: 'Squat',
    exerciseType: 'Machine',
    alternativeNames: ['Leg Press Machine'],
  },
  {
    name: 'Leg Extension',
    primaryMuscles: ['Quadriceps'],
    secondaryMuscles: [],
    movementType: 'Isolatie',
    exerciseType: 'Machine',
    alternativeNames: ['Leg Extension Machine'],
  },
  {
    name: 'Lunge',
    primaryMuscles: ['Quadriceps'],
    secondaryMuscles: ['Bilspieren', 'Hamstrings'],
    movementType: 'Squat',
    exerciseType: 'Lichaamsgewicht/Dumbbell',
    alternativeNames: ['Lunges'],
  },
  {
    name: 'Lying Leg Curl',
    primaryMuscles: ['Hamstrings'],
    secondaryMuscles: ['Kuiten'],
    movementType: 'Isolatie',
    exerciseType: 'Machine',
    alternativeNames: ['Leg Curl', 'Hamstring Curl'],
  },
  {
    name: 'Hack Squat',
    primaryMuscles: ['Quadriceps', 'Bilspieren'],
    secondaryMuscles: ['Hamstrings'],
    movementType: 'Squat',
    exerciseType: 'Machine',
    alternativeNames: ['Hack Squat Machine'],
  },
  {
    name: 'Seated Leg Curl',
    primaryMuscles: ['Hamstrings'],
    secondaryMuscles: ['Kuiten'],
    movementType: 'Isolatie',
    exerciseType: 'Machine',
    alternativeNames: ['Seated Hamstring Curl'],
  },
  {
    name: 'Single Leg Extension',
    primaryMuscles: ['Quadriceps'],
    secondaryMuscles: [],
    movementType: 'Isolatie',
    exerciseType: 'Machine',
    alternativeNames: ['Single Leg Extension Machine'],
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
    name: 'Dumbbell Stiff-Leg Deadlift',
    primaryMuscles: ['Hamstrings', 'Bilspieren'],
    secondaryMuscles: ['Onderrug'],
    movementType: 'Hinge',
    exerciseType: 'Dumbbell',
    alternativeNames: ['Stiff Leg Deadlift'],
  },
  {
    name: 'Barbell Stiff-Leg Deadlift',
    primaryMuscles: ['Hamstrings', 'Bilspieren'],
    secondaryMuscles: ['Onderrug'],
    movementType: 'Hinge',
    exerciseType: 'Barbell',
    alternativeNames: ['Stiff Leg Deadlift'],
  },
  {
    name: 'Dumbbell Goblet Squat',
    primaryMuscles: ['Quadriceps'],
    secondaryMuscles: ['Bilspieren', 'Core'],
    movementType: 'Squat',
    exerciseType: 'Dumbbell',
    alternativeNames: ['Goblet Squat'],
  },
  {
    name: 'Knee Tuck Jumps',
    primaryMuscles: ['Quadriceps', 'Bilspieren'],
    secondaryMuscles: ['Kuiten', 'Core'],
    movementType: 'Cardio',
    exerciseType: 'Lichaamsgewicht',
    alternativeNames: ['Knee Tucks'],
  },
  {
    name: 'Burpees',
    primaryMuscles: ['Full body'],
    secondaryMuscles: [],
    movementType: 'Cardio',
    exerciseType: 'Lichaamsgewicht',
    alternativeNames: ['Burpee'],
  },
  {
    name: 'Bodyweight Squat',
    primaryMuscles: ['Quadriceps', 'Bilspieren'],
    secondaryMuscles: ['Hamstrings'],
    movementType: 'Squat',
    exerciseType: 'Lichaamsgewicht',
    alternativeNames: ['Air Squat', 'Body Squat'],
  },
  {
    name: '1.5 Rep Bodyweight Squats',
    primaryMuscles: ['Quadriceps', 'Bilspieren'],
    secondaryMuscles: ['Hamstrings'],
    movementType: 'Squat',
    exerciseType: 'Lichaamsgewicht',
    alternativeNames: ['One and a Half Squat'],
  },
  {
    name: 'Medicine Ball Squat',
    primaryMuscles: ['Quadriceps', 'Bilspieren'],
    secondaryMuscles: ['Core'],
    movementType: 'Squat',
    exerciseType: 'Medicine Ball',
    alternativeNames: ['MB Squat'],
  },
  {
    name: 'Barbell Bulgarian Split Squat',
    primaryMuscles: ['Quadriceps'],
    secondaryMuscles: ['Bilspieren', 'Hamstrings'],
    movementType: 'Squat',
    exerciseType: 'Barbell',
    alternativeNames: ['Bulgarian Split Squat'],
  },
  {
    name: 'Bodyweight Bulgarian Split Squat',
    primaryMuscles: ['Quadriceps'],
    secondaryMuscles: ['Bilspieren'],
    movementType: 'Squat',
    exerciseType: 'Lichaamsgewicht',
    alternativeNames: ['Bulgarian Lunge'],
  },
  {
    name: 'Mini-Band Air Squat',
    primaryMuscles: ['Quadriceps', 'Bilspieren'],
    secondaryMuscles: ['Hamstrings'],
    movementType: 'Squat',
    exerciseType: 'Resistance Band',
    alternativeNames: ['Banded Squat'],
  },
  {
    name: 'Jump Squat',
    primaryMuscles: ['Quadriceps', 'Bilspieren'],
    secondaryMuscles: ['Kuiten'],
    movementType: 'Cardio',
    exerciseType: 'Lichaamsgewicht',
    alternativeNames: ['Jumping Squat'],
  },
  {
    name: 'Wall Sit',
    primaryMuscles: ['Quadriceps'],
    secondaryMuscles: ['Bilspieren'],
    movementType: 'Isolatie',
    exerciseType: 'Lichaamsgewicht',
    alternativeNames: ['Wall Sit'],
  },
  {
    name: 'Medicine Ball Deadlift',
    primaryMuscles: ['Hamstrings', 'Bilspieren'],
    secondaryMuscles: ['Onderrug'],
    movementType: 'Hinge',
    exerciseType: 'Medicine Ball',
    alternativeNames: ['MB Deadlift'],
  },
  {
    name: 'Single Leg Bodyweight Deadlift',
    primaryMuscles: ['Hamstrings', 'Bilspieren'],
    secondaryMuscles: ['Core'],
    movementType: 'Hinge',
    exerciseType: 'Lichaamsgewicht',
    alternativeNames: ['Single Leg RDL'],
  },
  {
    name: 'Kettlebell Sumo Deadlift',
    primaryMuscles: ['Hamstrings', 'Bilspieren'],
    secondaryMuscles: ['Onderrug'],
    movementType: 'Hinge',
    exerciseType: 'Kettlebell',
    alternativeNames: ['KB Sumo Deadlift'],
  },
  {
    name: 'Good Morning',
    primaryMuscles: ['Hamstrings', 'Erector spinae'],
    secondaryMuscles: ['Bilspieren', 'Rugstrekkers'],
    movementType: 'Hinge',
    exerciseType: 'Barbell',
    alternativeNames: ['Good Mornings'],
  },
  {
    name: 'Bodyweight Glute Bridge',
    primaryMuscles: ['Bilspieren'],
    secondaryMuscles: ['Hamstrings'],
    movementType: 'Hinge',
    exerciseType: 'Lichaamsgewicht',
    alternativeNames: ['Glute Bridge'],
  },
  {
    name: 'Single Leg Glute Bridge',
    primaryMuscles: ['Bilspieren'],
    secondaryMuscles: ['Hamstrings'],
    movementType: 'Hinge',
    exerciseType: 'Lichaamsgewicht',
    alternativeNames: ['Single Leg Bridge'],
  },
  {
    name: 'Banded Glute Bridge',
    primaryMuscles: ['Bilspieren'],
    secondaryMuscles: ['Hamstrings'],
    movementType: 'Hinge',
    exerciseType: 'Resistance Band',
    alternativeNames: ['Banded Bridge'],
  },
  {
    name: 'Duck Walk',
    primaryMuscles: ['Quadriceps', 'Bilspieren'],
    secondaryMuscles: ['Kuiten'],
    movementType: 'Squat',
    exerciseType: 'Lichaamsgewicht',
    alternativeNames: ['Duck Walk'],
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
    name: 'Groiners',
    primaryMuscles: ['Heupbuigers', 'Quadriceps'],
    secondaryMuscles: ['Bilspieren'],
    movementType: 'Mobiliteit',
    exerciseType: 'Lichaamsgewicht',
    alternativeNames: ['Groiners'],
  },
  {
    name: 'Fire Hydrants',
    primaryMuscles: ['Bilspieren'],
    secondaryMuscles: ['Heupabductoren'],
    movementType: 'Isolatie',
    exerciseType: 'Lichaamsgewicht',
    alternativeNames: ['Fire Hydrant'],
  },
  {
    name: 'Smith Machine Hip Thrust',
    primaryMuscles: ['Bilspieren'],
    secondaryMuscles: ['Hamstrings'],
    movementType: 'Hinge',
    exerciseType: 'Smith Machine',
    alternativeNames: ['Hip Thrust'],
  },
  {
    name: 'Barbell Hip Thrust',
    primaryMuscles: ['Bilspieren (gluteus maximus)'],
    secondaryMuscles: ['Hamstrings', 'Quadriceps'],
    movementType: 'Hinge',
    exerciseType: 'Barbell',
    alternativeNames: ['Hip Thrust'],
  },
  {
    name: 'Band Seated Hip Abduction',
    primaryMuscles: ['Bilspieren (gluteus medius)'],
    secondaryMuscles: [],
    movementType: 'Isolatie',
    exerciseType: 'Resistance Band',
    alternativeNames: ['Seated Hip Abduction'],
  },
  {
    name: 'Seated Hip Abduction Machine',
    primaryMuscles: ['Bilspieren (gluteus medius)'],
    secondaryMuscles: [],
    movementType: 'Isolatie',
    exerciseType: 'Machine',
    alternativeNames: ['Hip Abduction Machine'],
  },
  {
    name: 'Standing Cable Abduction',
    primaryMuscles: ['Bilspieren (gluteus medius)'],
    secondaryMuscles: [],
    movementType: 'Isolatie',
    exerciseType: 'Kabel',
    alternativeNames: ['Cable Hip Abduction'],
  },
  {
    name: 'Bodyweight Frog Pump',
    primaryMuscles: ['Bilspieren'],
    secondaryMuscles: ['Hamstrings'],
    movementType: 'Hinge',
    exerciseType: 'Lichaamsgewicht',
    alternativeNames: ['Frog Pump'],
  },
  {
    name: 'Smith Machine Frog Pump',
    primaryMuscles: ['Bilspieren'],
    secondaryMuscles: ['Hamstrings'],
    movementType: 'Hinge',
    exerciseType: 'Smith Machine',
    alternativeNames: ['Frog Pump'],
  },
  {
    name: 'Banded Clams',
    primaryMuscles: ['Bilspieren (gluteus medius)'],
    secondaryMuscles: [],
    movementType: 'Isolatie',
    exerciseType: 'Resistance Band',
    alternativeNames: ['Clamshells', 'Clams'],
  },
  {
    name: 'Side Lying Leg Raise',
    primaryMuscles: ['Heupabductoren'],
    secondaryMuscles: ['Core'],
    movementType: 'Isolatie',
    exerciseType: 'Lichaamsgewicht',
    alternativeNames: ['Side Leg Raise'],
  },
  {
    name: 'Glute Ham Raise',
    primaryMuscles: ['Hamstrings', 'Bilspieren'],
    secondaryMuscles: ['Onderrug'],
    movementType: 'Hinge',
    exerciseType: 'Machine',
    alternativeNames: ['GHR', 'Glute Ham Raise'],
  },
  {
    name: 'Dumbbell Step Up',
    primaryMuscles: ['Quadriceps', 'Bilspieren'],
    secondaryMuscles: ['Hamstrings'],
    movementType: 'Squat',
    exerciseType: 'Dumbbell',
    alternativeNames: ['Step Up'],
  },
  {
    name: 'Lateral Mini-Band Walk',
    primaryMuscles: ['Bilspieren (gluteus medius)'],
    secondaryMuscles: [],
    movementType: 'Isolatie',
    exerciseType: 'Resistance Band',
    alternativeNames: ['Lateral Band Walk'],
  },
  {
    name: 'Standing Knee Raise',
    primaryMuscles: ['Heupbuigers'],
    secondaryMuscles: ['Core'],
    movementType: 'Mobiliteit',
    exerciseType: 'Lichaamsgewicht',
    alternativeNames: ['Knee Raise'],
  },
  {
    name: 'Kettlebell Swings',
    primaryMuscles: ['Bilspieren', 'Hamstrings'],
    secondaryMuscles: ['Onderrug', 'Quadriceps', 'Schouders'],
    movementType: 'Hinge',
    exerciseType: 'Kettlebell',
    alternativeNames: ['KB Swings', 'Kettlebell Swing'],
  },
  {
    name: 'Standing Cable Kickback',
    primaryMuscles: ['Bilspieren'],
    secondaryMuscles: ['Hamstrings'],
    movementType: 'Isolatie',
    exerciseType: 'Kabel',
    alternativeNames: ['Cable Kickback'],
  },
  {
    name: 'Donkey Kicks',
    primaryMuscles: ['Bilspieren'],
    secondaryMuscles: ['Hamstrings'],
    movementType: 'Isolatie',
    exerciseType: 'Lichaamsgewicht',
    alternativeNames: ['Donkey Kick'],
  },
  {
    name: 'Side Lying Hip Raise',
    primaryMuscles: ['Bilspieren (gluteus medius)'],
    secondaryMuscles: [],
    movementType: 'Isolatie',
    exerciseType: 'Lichaamsgewicht',
    alternativeNames: ['Side Hip Raise'],
  },
  {
    name: 'Squat Sit to Reach',
    primaryMuscles: ['Quadriceps', 'Bilspieren'],
    secondaryMuscles: ['Core'],
    movementType: 'Squat',
    exerciseType: 'Lichaamsgewicht',
    alternativeNames: ['Squat to Reach'],
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

