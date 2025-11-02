// Database met fitness oefeningen
// Categorieën: Chest, Triceps, Calves, Back, Biceps, Abdominals, Shoulders, Legs

export interface ExerciseData {
  name: string;
  category: string;
  muscles?: string[];
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
  { name: 'Chest Press Machine', category: 'Chest' },
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
  { name: 'Wide-Grip Pulldown', category: 'Back' },
  { name: 'Seated Cable Row', category: 'Back' },
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
  { name: 'Dumbbell Front Raise', category: 'Shoulders' },
  { name: 'High Cable Rear Delt Fly', category: 'Shoulders' },
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

// Helper functies
export const getExerciseNames = (): string[] => {
  return exerciseDatabase.map(ex => ex.name);
};

export const getExercisesByCategory = (category: string): ExerciseData[] => {
  return exerciseDatabase.filter(ex => ex.category === category);
};

export const searchExercises = (query: string): ExerciseData[] => {
  const lowerQuery = query.toLowerCase();
  return exerciseDatabase.filter(ex => 
    ex.name.toLowerCase().includes(lowerQuery) ||
    ex.category.toLowerCase().includes(lowerQuery) ||
    ex.muscles?.some(m => m.toLowerCase().includes(lowerQuery))
  );
};

export const getCategories = (): string[] => {
  const categories = new Set(exerciseDatabase.map(ex => ex.category));
  return Array.from(categories).sort();
};
