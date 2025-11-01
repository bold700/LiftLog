// Utility functies voor ExerciseDB API integratie
// API documentatie: https://www.exercisedb.dev/docs
// Note: ExerciseDB API vereist mogelijk een RapidAPI key voor productie gebruik

const EXERCISEDB_API_BASE = 'https://exercisedb.p.rapidapi.com';

// Naam mapping voor betere matching met ExerciseDB
const exerciseNameMap: Record<string, string> = {
  'Bench Press': 'barbell bench press',
  'Incline Bench Press': 'incline barbell bench press',
  'Decline Bench Press': 'decline barbell bench press',
  'Dumbbell Press': 'dumbbell bench press',
  'Overhead Press': 'barbell shoulder press',
  'Military Press': 'barbell shoulder press',
  'Deadlift': 'barbell deadlift',
  'Barbell Row': 'barbell row',
  'Pull-ups': 'pull ups',
  'Chin-ups': 'chin ups',
  'Squat': 'barbell squat',
  'Front Squat': 'front barbell squat',
  'Romanian Deadlift': 'romanian deadlift',
  'Leg Curl': 'lying leg curl',
  'Calf Raises': 'standing calf raise',
  'Tricep Extension': 'tricep pushdown',
  'Barbell Curl': 'barbell curl',
  'Dumbbell Curl': 'dumbbell curl',
};

export interface ExerciseDBData {
  id?: string;
  name: string;
  bodyPart?: string;
  equipment?: string;
  gifUrl?: string;
  instructions?: string[];
  secondaryMuscles?: string[];
  target?: string;
}

// Cache voor opgehaalde oefening data
const exerciseCache = new Map<string, ExerciseDBData | null>();

/**
 * Haalt oefening data op van ExerciseDB API
 * @param exerciseName - Naam van de oefening
 * @returns ExerciseDBData of null als niet gevonden
 */
export const fetchExerciseData = async (exerciseName: string): Promise<ExerciseDBData | null> => {
  // Check cache eerst
  if (exerciseCache.has(exerciseName)) {
    return exerciseCache.get(exerciseName) || null;
  }

  // Gebruik mapped naam als beschikbaar
  const searchName = exerciseNameMap[exerciseName] || exerciseName;

  try {
    // Haal alle exercises op (kan groot zijn, maar meest betrouwbaar)
    // ExerciseDB API geeft vaak alle exercises terug, dan filteren we lokaal
    const response = await fetch(
      `${EXERCISEDB_API_BASE}/exercises`,
      {
        headers: {
          'X-RapidAPI-Host': 'exercisedb.p.rapidapi.com',
        },
      }
    );

    if (!response.ok) {
      console.warn(`ExerciseDB API error (status ${response.status}):`, response.statusText);
      console.warn('Note: ExerciseDB API vereist mogelijk een RapidAPI key. Zie https://rapidapi.com/justin-WFnsXH_t6/api/exercisedb');
      exerciseCache.set(exerciseName, null);
      return null;
    }

    const data = await response.json();
    
    if (!Array.isArray(data) || data.length === 0) {
      console.warn(`Invalid API response for "${exerciseName}"`);
      exerciseCache.set(exerciseName, null);
      return null;
    }
    
    // Zoek naar beste match
    let exercise: ExerciseDBData | null = null;
    const searchLower = searchName.toLowerCase();
    
    // 1. Exacte match
    exercise = data.find(
      (ex: ExerciseDBData) => ex.name?.toLowerCase() === searchLower
    );
    
    // 2. Exacte match op originele naam
    if (!exercise) {
      exercise = data.find(
        (ex: ExerciseDBData) => ex.name?.toLowerCase() === exerciseName.toLowerCase()
      );
    }
    
    // 3. Partial match (bevat de zoekterm)
    if (!exercise) {
      exercise = data.find(
        (ex: ExerciseDBData) => {
          const exName = ex.name?.toLowerCase() || '';
          return exName.includes(searchLower) || searchLower.includes(exName);
        }
      );
    }
    
    // 4. Woord-voor-woord match (bijv. "bench press" matcht met "barbell bench press")
    if (!exercise) {
      const searchWords = searchLower.split(/\s+/);
      exercise = data.find((ex: ExerciseDBData) => {
        const exName = ex.name?.toLowerCase() || '';
        return searchWords.every(word => exName.includes(word));
      });
    }
    
    if (!exercise || !exercise.gifUrl) {
      console.warn(`No exercise with image found for "${exerciseName}" (searched as "${searchName}")`);
      exerciseCache.set(exerciseName, null);
      return null;
    }

    console.log(`✓ Found exercise: ${exercise.name} (gifUrl: ${exercise.gifUrl?.substring(0, 50)}...)`);
    exerciseCache.set(exerciseName, exercise);
    return exercise;
  } catch (error) {
    console.warn(`Failed to fetch exercise data for "${exerciseName}":`, error);
    exerciseCache.set(exerciseName, null);
    return null;
  }
};

/**
 * Haalt afbeelding URL op voor een oefening
 * @param exerciseName - Naam van de oefening
 * @returns URL string of null
 */
export const getExerciseImageUrl = async (exerciseName: string): Promise<string | null> => {
  const data = await fetchExerciseData(exerciseName);
  
  if (!data) return null;
  
  // ExerciseDB API geeft direct gifUrl
  return data.gifUrl || null;
};

/**
 * Haalt alle beschikbare afbeeldingen op voor een oefening
 * @param exerciseName - Naam van de oefening
 * @returns Array van URL strings
 */
export const getExerciseImageUrls = async (exerciseName: string): Promise<string[]> => {
  const data = await fetchExerciseData(exerciseName);
  
  if (!data) return [];
  
  const images: string[] = [];
  if (data.gifUrl) images.push(data.gifUrl);
  
  return images;
};

