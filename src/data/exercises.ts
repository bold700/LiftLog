// Database met veelvoorkomende fitness oefeningen
// Categorieën: Chest, Back, Shoulders, Arms, Legs, Core, Cardio

export interface ExerciseData {
  name: string;
  category: string;
  muscles?: string[];
}

export const exerciseDatabase: ExerciseData[] = [
  // CHEST
  { name: 'Bench Press', category: 'Chest', muscles: ['Pectoralis Major', 'Triceps', 'Anterior Deltoid'] },
  { name: 'Incline Bench Press', category: 'Chest', muscles: ['Upper Pectoralis', 'Anterior Deltoid'] },
  { name: 'Decline Bench Press', category: 'Chest', muscles: ['Lower Pectoralis'] },
  { name: 'Dumbbell Press', category: 'Chest', muscles: ['Pectoralis Major', 'Anterior Deltoid'] },
  { name: 'Incline Dumbbell Press', category: 'Chest', muscles: ['Upper Pectoralis'] },
  { name: 'Dumbbell Flyes', category: 'Chest', muscles: ['Pectoralis Major'] },
  { name: 'Push-ups', category: 'Chest', muscles: ['Pectoralis Major', 'Triceps', 'Core'] },
  { name: 'Dips', category: 'Chest', muscles: ['Triceps', 'Pectoralis', 'Anterior Deltoid'] },
  { name: 'Cable Flyes', category: 'Chest', muscles: ['Pectoralis Major'] },
  { name: 'Pec Deck', category: 'Chest', muscles: ['Pectoralis Major'] },
  
  // BACK
  { name: 'Deadlift', category: 'Back', muscles: ['Erector Spinae', 'Latissimus Dorsi', 'Hamstrings', 'Glutes'] },
  { name: 'Barbell Row', category: 'Back', muscles: ['Latissimus Dorsi', 'Rhomboids', 'Middle Traps'] },
  { name: 'Dumbbell Row', category: 'Back', muscles: ['Latissimus Dorsi', 'Rhomboids'] },
  { name: 'Pull-ups', category: 'Back', muscles: ['Latissimus Dorsi', 'Biceps', 'Rhomboids'] },
  { name: 'Chin-ups', category: 'Back', muscles: ['Latissimus Dorsi', 'Biceps'] },
  { name: 'Lat Pulldown', category: 'Back', muscles: ['Latissimus Dorsi', 'Biceps'] },
  { name: 'Cable Row', category: 'Back', muscles: ['Latissimus Dorsi', 'Rhomboids', 'Middle Traps'] },
  { name: 'T-Bar Row', category: 'Back', muscles: ['Latissimus Dorsi', 'Rhomboids'] },
  { name: 'Seated Row', category: 'Back', muscles: ['Latissimus Dorsi', 'Rhomboids'] },
  { name: 'Reverse Flyes', category: 'Back', muscles: ['Rear Deltoids', 'Rhomboids'] },
  { name: 'Face Pulls', category: 'Back', muscles: ['Rear Deltoids', 'Rhomboids'] },
  
  // SHOULDERS
  { name: 'Overhead Press', category: 'Shoulders', muscles: ['Deltoids', 'Triceps', 'Core'] },
  { name: 'Military Press', category: 'Shoulders', muscles: ['Deltoids', 'Triceps'] },
  { name: 'Dumbbell Shoulder Press', category: 'Shoulders', muscles: ['Deltoids', 'Triceps'] },
  { name: 'Arnold Press', category: 'Shoulders', muscles: ['Deltoids', 'Rotator Cuff'] },
  { name: 'Lateral Raises', category: 'Shoulders', muscles: ['Lateral Deltoids'] },
  { name: 'Front Raises', category: 'Shoulders', muscles: ['Anterior Deltoids'] },
  { name: 'Rear Delt Flyes', category: 'Shoulders', muscles: ['Rear Deltoids', 'Rhomboids'] },
  { name: 'Upright Row', category: 'Shoulders', muscles: ['Lateral Deltoids', 'Trapezius'] },
  { name: 'Shrugs', category: 'Shoulders', muscles: ['Trapezius'] },
  
  // ARMS - TRICEPS
  { name: 'Tricep Dips', category: 'Arms', muscles: ['Triceps', 'Anterior Deltoid'] },
  { name: 'Close Grip Bench Press', category: 'Arms', muscles: ['Triceps', 'Pectoralis'] },
  { name: 'Tricep Extension', category: 'Arms', muscles: ['Triceps'] },
  { name: 'Overhead Tricep Extension', category: 'Arms', muscles: ['Triceps'] },
  { name: 'Cable Tricep Pushdown', category: 'Arms', muscles: ['Triceps'] },
  { name: 'Skull Crushers', category: 'Arms', muscles: ['Triceps'] },
  { name: 'Diamond Push-ups', category: 'Arms', muscles: ['Triceps', 'Pectoralis'] },
  
  // ARMS - BICEPS
  { name: 'Barbell Curl', category: 'Arms', muscles: ['Biceps'] },
  { name: 'Dumbbell Curl', category: 'Arms', muscles: ['Biceps'] },
  { name: 'Hammer Curl', category: 'Arms', muscles: ['Biceps', 'Brachialis'] },
  { name: 'Cable Curl', category: 'Arms', muscles: ['Biceps'] },
  { name: 'Preacher Curl', category: 'Arms', muscles: ['Biceps'] },
  { name: 'Concentration Curl', category: 'Arms', muscles: ['Biceps'] },
  { name: '21s', category: 'Arms', muscles: ['Biceps'] },
  
  // LEGS - QUADRICEPS
  { name: 'Squat', category: 'Legs', muscles: ['Quadriceps', 'Glutes', 'Hamstrings'] },
  { name: 'Front Squat', category: 'Legs', muscles: ['Quadriceps', 'Core'] },
  { name: 'Leg Press', category: 'Legs', muscles: ['Quadriceps', 'Glutes'] },
  { name: 'Leg Extension', category: 'Legs', muscles: ['Quadriceps'] },
  { name: 'Bulgarian Split Squat', category: 'Legs', muscles: ['Quadriceps', 'Glutes'] },
  { name: 'Lunges', category: 'Legs', muscles: ['Quadriceps', 'Glutes', 'Hamstrings'] },
  { name: 'Walking Lunges', category: 'Legs', muscles: ['Quadriceps', 'Glutes'] },
  { name: 'Goblet Squat', category: 'Legs', muscles: ['Quadriceps', 'Core'] },
  
  // LEGS - HAMSTRINGS & GLUTES
  { name: 'Romanian Deadlift', category: 'Legs', muscles: ['Hamstrings', 'Glutes', 'Erector Spinae'] },
  { name: 'Leg Curl', category: 'Legs', muscles: ['Hamstrings'] },
  { name: 'Stiff Leg Deadlift', category: 'Legs', muscles: ['Hamstrings', 'Glutes'] },
  { name: 'Glute Bridge', category: 'Legs', muscles: ['Glutes', 'Hamstrings'] },
  { name: 'Hip Thrust', category: 'Legs', muscles: ['Glutes', 'Hamstrings'] },
  { name: 'Good Mornings', category: 'Legs', muscles: ['Hamstrings', 'Erector Spinae'] },
  
  // LEGS - CALVES
  { name: 'Calf Raises', category: 'Legs', muscles: ['Gastrocnemius', 'Soleus'] },
  { name: 'Seated Calf Raises', category: 'Legs', muscles: ['Soleus'] },
  { name: 'Standing Calf Raises', category: 'Legs', muscles: ['Gastrocnemius'] },
  
  // CORE
  { name: 'Plank', category: 'Core', muscles: ['Rectus Abdominis', 'Transverse Abdominis'] },
  { name: 'Side Plank', category: 'Core', muscles: ['Obliques', 'Core'] },
  { name: 'Crunches', category: 'Core', muscles: ['Rectus Abdominis'] },
  { name: 'Sit-ups', category: 'Core', muscles: ['Rectus Abdominis'] },
  { name: 'Russian Twists', category: 'Core', muscles: ['Obliques', 'Rectus Abdominis'] },
  { name: 'Leg Raises', category: 'Core', muscles: ['Rectus Abdominis', 'Hip Flexors'] },
  { name: 'Hanging Leg Raises', category: 'Core', muscles: ['Rectus Abdominis', 'Hip Flexors'] },
  { name: 'Mountain Climbers', category: 'Core', muscles: ['Core', 'Shoulders'] },
  { name: 'Ab Wheel Rollout', category: 'Core', muscles: ['Rectus Abdominis', 'Core'] },
  { name: 'Cable Crunch', category: 'Core', muscles: ['Rectus Abdominis'] },
  { name: 'Dead Bug', category: 'Core', muscles: ['Core', 'Transverse Abdominis'] },
  
  // CARDIO / FULL BODY
  { name: 'Burpees', category: 'Cardio', muscles: ['Full Body'] },
  { name: 'Jumping Jacks', category: 'Cardio', muscles: ['Full Body'] },
  { name: 'Box Jumps', category: 'Cardio', muscles: ['Legs', 'Glutes'] },
  { name: 'Battle Ropes', category: 'Cardio', muscles: ['Full Body'] },
  { name: 'Rowing Machine', category: 'Cardio', muscles: ['Full Body'] },
  { name: 'Kettlebell Swing', category: 'Cardio', muscles: ['Glutes', 'Hamstrings', 'Core'] },
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

