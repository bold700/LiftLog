import { useMemo, useEffect, useState } from 'react';
import { Box } from '@mui/material';
import { getAllExercises } from '../utils/storage';
import { findExerciseMetadata } from '../data/exerciseMetadata';
import exerciseMuscleMapping from '../data/exerciseMuscleMapping.json';

// Import Level SVG bestanden - Level 1 (lichtste) tot Level 5 (donkerste)
import ChestLevel1 from '../assets/body/levels/Chest Primary Level 1.svg';
import ChestLevel2 from '../assets/body/levels/Chest Primary Level 2.svg';
import ChestLevel3 from '../assets/body/levels/Chest Primary Level 3.svg';
import ChestLevel4 from '../assets/body/levels/Chest Primary Level 4.svg';
import ChestLevel5 from '../assets/body/levels/Chest Primary Level 5.svg';

import BicepsLevel1 from '../assets/body/levels/Biceps Primary Level 1.svg';
import BicepsLevel2 from '../assets/body/levels/Biceps Primary Level 2.svg';
import BicepsLevel3 from '../assets/body/levels/Biceps Primary Level 3.svg';
import BicepsLevel4 from '../assets/body/levels/Biceps Primary Level 4.svg';
import BicepsLevel5 from '../assets/body/levels/Biceps Primary Level 5.svg';

import UnderarmsLevel1 from '../assets/body/levels/Underarms Primary Level 1.svg';
import UnderarmsLevel2 from '../assets/body/levels/Underarms Primary Level 2.svg';
import UnderarmsLevel3 from '../assets/body/levels/Underarms Primary Level 3.svg';
import UnderarmsLevel4 from '../assets/body/levels/Underarms Primary Level 4.svg';
import UnderarmsLevel5 from '../assets/body/levels/Underarms Primary Level 5.svg';

import ShouldersLevel1 from '../assets/body/levels/Shoulders Primary Level 1.svg';
import ShouldersLevel2 from '../assets/body/levels/Shoulders Primary Level 2.svg';
import ShouldersLevel3 from '../assets/body/levels/Shoulders Primary Level 3.svg';
import ShouldersLevel4 from '../assets/body/levels/Shoulders Primary Level 4.svg';
import ShouldersLevel5 from '../assets/body/levels/Shoulders Primary Level 5.svg';

import TrapsLevel1 from '../assets/body/levels/Traps Primary Level 1.svg';
import TrapsLevel2 from '../assets/body/levels/Traps Primary Level 2.svg';
import TrapsLevel3 from '../assets/body/levels/Traps Primary Level 3.svg';
import TrapsLevel4 from '../assets/body/levels/Traps Primary Level 4.svg';
import TrapsLevel5 from '../assets/body/levels/Traps Primary Level 5.svg';

import AbsLevel1 from '../assets/body/levels/Abs Primary Level 1.svg';
import AbsLevel2 from '../assets/body/levels/Abs Primary Level 2.svg';
import AbsLevel3 from '../assets/body/levels/Abs Primary Level 3.svg';
import AbsLevel4 from '../assets/body/levels/Abs Primary Level 4.svg';
import AbsLevel5 from '../assets/body/levels/Abs Primary Level 5.svg';

import ObliquesLevel1 from '../assets/body/levels/Obliques Primary Level 1.svg';
import ObliquesLevel2 from '../assets/body/levels/Obliques Primary Level 2.svg';
import ObliquesLevel3 from '../assets/body/levels/Obliques Primary Level 3.svg';
import ObliquesLevel4 from '../assets/body/levels/Obliques Primary Level 4.svg';
import ObliquesLevel5 from '../assets/body/levels/Obliques Primary Level 5.svg';

import QuadsLevel1 from '../assets/body/levels/Quads Primary Level 1.svg';
import QuadsLevel2 from '../assets/body/levels/Quads Primary Level 2.svg';
import QuadsLevel3 from '../assets/body/levels/Quads Primary Level 3.svg';
import QuadsLevel4 from '../assets/body/levels/Quads Primary Level 4.svg';
import QuadsLevel5 from '../assets/body/levels/Quads Primary Level 5.svg';

import CalvesLevel1 from '../assets/body/levels/Calves Primary Level 1.svg';
import CalvesLevel2 from '../assets/body/levels/Calves Primary Level 2.svg';
import CalvesLevel3 from '../assets/body/levels/Calves Primary Level 3.svg';
import CalvesLevel4 from '../assets/body/levels/Calves Primary Level 4.svg';
import CalvesLevel5 from '../assets/body/levels/Calves Primary Level 5.svg';

// Import achterkant level SVG bestanden
import BodyBackLatsLevel1 from '../assets/body/Body Back Lats Level 1.svg';
import BodyBackLatsLevel2 from '../assets/body/Body Back Lats Level 2.svg';
import BodyBackLatsLevel3 from '../assets/body/Body Back Lats Level 3.svg';
import BodyBackLatsLevel4 from '../assets/body/Body Back Lats Level 4.svg';
import BodyBackLatsLevel5 from '../assets/body/Body Back Lats Level 5.svg';

import BodyBackUpperBackLevel1 from '../assets/body/Body Back Upper Back Level 1.svg';
import BodyBackUpperBackLevel2 from '../assets/body/Body Back Upper Back Level 2.svg';
import BodyBackUpperBackLevel3 from '../assets/body/Body Back Upper Back Level 3.svg';
import BodyBackUpperBackLevel4 from '../assets/body/Body Back Upper Back Level 4.svg';
import BodyBackUpperBackLevel5 from '../assets/body/Body Back Upper Back Level 5.svg';

import BodyBackLowerBackLevel1 from '../assets/body/Body Back Lower Back Level 1.svg';
import BodyBackLowerBackLevel2 from '../assets/body/Body Back Lower Back Level 2.svg';
import BodyBackLowerBackLevel3 from '../assets/body/Body Back Lower Back Level 3.svg';
import BodyBackLowerBackLevel4 from '../assets/body/Body Back Lower Back Level 4.svg';
import BodyBackLowerBackLevel5 from '../assets/body/Body Back Lower Back Level 5.svg';

import BodyBackTrapsLevel1 from '../assets/body/Body Back Traps Level 1.svg';
import BodyBackTrapsLevel2 from '../assets/body/Body Back Traps Level 2.svg';
import BodyBackTrapsLevel3 from '../assets/body/Body Back Traps Level 3.svg';
import BodyBackTrapsLevel4 from '../assets/body/Body Back Traps Level 4.svg';
import BodyBackTrapsLevel5 from '../assets/body/Body Back Traps Level 5.svg';

import BodyBackShouldersLevel1 from '../assets/body/Body Back Shoulders Level 1.svg';
import BodyBackShouldersLevel2 from '../assets/body/Body Back Shoulders Level 2.svg';
import BodyBackShouldersLevel3 from '../assets/body/Body Back Shoulders Level 3.svg';
import BodyBackShouldersLevel4 from '../assets/body/Body Back Shoulders Level 4.svg';
import BodyBackShouldersLevel5 from '../assets/body/Body Back Shoulders Level 5.svg';

import BodyBackGlutealsLevel1 from '../assets/body/Body Back Gluteals Level 1.svg';
import BodyBackGlutealsLevel2 from '../assets/body/Body Back Gluteals Level 2.svg';
import BodyBackGlutealsLevel3 from '../assets/body/Body Back Gluteals Level 3.svg';
import BodyBackGlutealsLevel4 from '../assets/body/Body Back Gluteals Level 4.svg';
import BodyBackGlutealsLevel5 from '../assets/body/Body Back Gluteals Level 5.svg';

import BodyBackHamstringsLevel1 from '../assets/body/Body Back Hamstrings Level 1.svg';
import BodyBackHamstringsLevel2 from '../assets/body/Body Back Hamstrings Level 2.svg';
import BodyBackHamstringsLevel3 from '../assets/body/Body Back Hamstrings Level 3.svg';
import BodyBackHamstringsLevel4 from '../assets/body/Body Back Hamstrings Level 4.svg';
import BodyBackHamstringsLevel5 from '../assets/body/Body Back Hamstrings Level 5.svg';

import BodyBackCalvesLevel1 from '../assets/body/Body Back Calves Level 1.svg';
import BodyBackCalvesLevel2 from '../assets/body/Body Back Calves Level 2.svg';
import BodyBackCalvesLevel3 from '../assets/body/Body Back Calves Level 3.svg';
import BodyBackCalvesLevel4 from '../assets/body/Body Back Calves Level 4.svg';
import BodyBackCalvesLevel5 from '../assets/body/Body Back Calves Level 5.svg';

import BodyBackQuadsLevel1 from '../assets/body/Body Back Quads Level 1.svg';
import BodyBackQuadsLevel2 from '../assets/body/Body Back Quads Level 2.svg';
import BodyBackQuadsLevel3 from '../assets/body/Body Back Quads Level 3.svg';
import BodyBackQuadsLevel4 from '../assets/body/Body Back Quads Level 4.svg';
import BodyBackQuadsLevel5 from '../assets/body/Body Back Quads Level 5.svg';

import BodyBackObliquesLevel1 from '../assets/body/Body Back Obliques Level 1.svg';
import BodyBackObliquesLevel2 from '../assets/body/Body Back Obliques Level 2.svg';
import BodyBackObliquesLevel3 from '../assets/body/Body Back Obliques Level 3.svg';
import BodyBackObliquesLevel4 from '../assets/body/Body Back Obliques Level 4.svg';
import BodyBackObliquesLevel5 from '../assets/body/Body Back Obliques Level 5.svg';

import BodyBackTricpesLevel1 from '../assets/body/Body Back Tricpes Level 1.svg';
import BodyBackTricpesLevel2 from '../assets/body/Body Back Tricpes Level 2.svg';
import BodyBackTricpesLevel3 from '../assets/body/Body Back Tricpes Level 3.svg';
import BodyBackTricpesLevel4 from '../assets/body/Body Back Tricpes Level 4.svg';
import BodyBackTricpesLevel5 from '../assets/body/Body Back Tricpes Level 5.svg';

import BodyBackUnderarmLevel1 from '../assets/body/Body Back Underarm Level 1.svg';
import BodyBackUnderarmLevel2 from '../assets/body/Body Back Underarm Level 2.svg';
import BodyBackUnderarmLevel3 from '../assets/body/Body Back Underarm Level 3.svg';
import BodyBackUnderarmLevel4 from '../assets/body/Body Back Underarm Level 4.svg';
import BodyBackUnderarmLevel5 from '../assets/body/Body Back Underarm Level 5.svg';

// Basis achterkant body SVG
import BodyBackSvg from '../assets/body/Body Back.svg';

// Groentinten - level 1 (lichtste) tot level 5 (donkerste)
export const GREEN_TINTS = ['#D0EABF', '#A5C392', '#799A64', '#4B6738', '#3D532E'];

// Mapping van spiergroep namen naar level SVG arrays (level 1-5)
const muscleGroupToLevelSvgs: Record<string, string[]> = {
  // Borst
  'Borst': [ChestLevel1, ChestLevel2, ChestLevel3, ChestLevel4, ChestLevel5],
  'Borst (pectoralis major)': [ChestLevel1, ChestLevel2, ChestLevel3, ChestLevel4, ChestLevel5],
  'Borst (bovenkant pectoralis)': [ChestLevel1, ChestLevel2, ChestLevel3, ChestLevel4, ChestLevel5],
  
  // Biceps
  'Biceps': [BicepsLevel1, BicepsLevel2, BicepsLevel3, BicepsLevel4, BicepsLevel5],
  'Biceps brachii': [BicepsLevel1, BicepsLevel2, BicepsLevel3, BicepsLevel4, BicepsLevel5],
  'Bicep': [BicepsLevel1, BicepsLevel2, BicepsLevel3, BicepsLevel4, BicepsLevel5],
  
  // Triceps
  'Triceps': [UnderarmsLevel1, UnderarmsLevel2, UnderarmsLevel3, UnderarmsLevel4, UnderarmsLevel5],
  'Triceps brachii': [UnderarmsLevel1, UnderarmsLevel2, UnderarmsLevel3, UnderarmsLevel4, UnderarmsLevel5],
  'Tricep': [UnderarmsLevel1, UnderarmsLevel2, UnderarmsLevel3, UnderarmsLevel4, UnderarmsLevel5],
  
  // Schouders
  'Schouders': [ShouldersLevel1, ShouldersLevel2, ShouldersLevel3, ShouldersLevel4, ShouldersLevel5],
  'Schouders (deltoids)': [ShouldersLevel1, ShouldersLevel2, ShouldersLevel3, ShouldersLevel4, ShouldersLevel5],
  'Schouders (voorste deltoid)': [ShouldersLevel1, ShouldersLevel2, ShouldersLevel3, ShouldersLevel4, ShouldersLevel5],
  'Schouders (voorzijde)': [ShouldersLevel1, ShouldersLevel2, ShouldersLevel3, ShouldersLevel4, ShouldersLevel5],
  'Schouders (achterzijde)': [ShouldersLevel1, ShouldersLevel2, ShouldersLevel3, ShouldersLevel4, ShouldersLevel5],
  'Schouders (zijkant)': [ShouldersLevel1, ShouldersLevel2, ShouldersLevel3, ShouldersLevel4, ShouldersLevel5],
  'Schouders (laterale deltoid)': [ShouldersLevel1, ShouldersLevel2, ShouldersLevel3, ShouldersLevel4, ShouldersLevel5],
  
  // Rug/Traps
  'Rug': [TrapsLevel1, TrapsLevel2, TrapsLevel3, TrapsLevel4, TrapsLevel5],
  'Trapezius': [TrapsLevel1, TrapsLevel2, TrapsLevel3, TrapsLevel4, TrapsLevel5],
  'Traps': [TrapsLevel1, TrapsLevel2, TrapsLevel3, TrapsLevel4, TrapsLevel5],
  'Latissimus dorsi': [TrapsLevel1, TrapsLevel2, TrapsLevel3, TrapsLevel4, TrapsLevel5],
  'Lats': [TrapsLevel1, TrapsLevel2, TrapsLevel3, TrapsLevel4, TrapsLevel5],
  
  // Buik
  'Buik': [AbsLevel1, AbsLevel2, AbsLevel3, AbsLevel4, AbsLevel5],
  'Buikspieren': [AbsLevel1, AbsLevel2, AbsLevel3, AbsLevel4, AbsLevel5],
  'Buikspieren (rectus abdominis)': [AbsLevel1, AbsLevel2, AbsLevel3, AbsLevel4, AbsLevel5],
  'Core': [AbsLevel1, AbsLevel2, AbsLevel3, AbsLevel4, AbsLevel5],
  'Abdominals': [AbsLevel1, AbsLevel2, AbsLevel3, AbsLevel4, AbsLevel5],
  
  // Obliques
  'Obliques': [ObliquesLevel1, ObliquesLevel2, ObliquesLevel3, ObliquesLevel4, ObliquesLevel5],
  'Oblique': [ObliquesLevel1, ObliquesLevel2, ObliquesLevel3, ObliquesLevel4, ObliquesLevel5],
  
  // Quadriceps
  'Quadriceps': [QuadsLevel1, QuadsLevel2, QuadsLevel3, QuadsLevel4, QuadsLevel5],
  'Quads': [QuadsLevel1, QuadsLevel2, QuadsLevel3, QuadsLevel4, QuadsLevel5],
  'Quad': [QuadsLevel1, QuadsLevel2, QuadsLevel3, QuadsLevel4, QuadsLevel5],
  
  // Kuiten
  'Kuiten': [CalvesLevel1, CalvesLevel2, CalvesLevel3, CalvesLevel4, CalvesLevel5],
  'Calves': [CalvesLevel1, CalvesLevel2, CalvesLevel3, CalvesLevel4, CalvesLevel5],
  'Calf': [CalvesLevel1, CalvesLevel2, CalvesLevel3, CalvesLevel4, CalvesLevel5],
  
  // Achterkant spieren
  'Body Back Lats Primary': [BodyBackLatsLevel1, BodyBackLatsLevel2, BodyBackLatsLevel3, BodyBackLatsLevel4, BodyBackLatsLevel5],
  'Body Back Lats Secondary': [BodyBackLatsLevel1, BodyBackLatsLevel2, BodyBackLatsLevel3, BodyBackLatsLevel4, BodyBackLatsLevel5],
  'Body Back Upper Back Primary': [BodyBackUpperBackLevel1, BodyBackUpperBackLevel2, BodyBackUpperBackLevel3, BodyBackUpperBackLevel4, BodyBackUpperBackLevel5],
  'Body Back Upper Back Secondary': [BodyBackUpperBackLevel1, BodyBackUpperBackLevel2, BodyBackUpperBackLevel3, BodyBackUpperBackLevel4, BodyBackUpperBackLevel5],
  'Body Back Lower Back Primary': [BodyBackLowerBackLevel1, BodyBackLowerBackLevel2, BodyBackLowerBackLevel3, BodyBackLowerBackLevel4, BodyBackLowerBackLevel5],
  'Body Back Lower Back Secondary': [BodyBackLowerBackLevel1, BodyBackLowerBackLevel2, BodyBackLowerBackLevel3, BodyBackLowerBackLevel4, BodyBackLowerBackLevel5],
  'Body Back Traps Primary': [BodyBackTrapsLevel1, BodyBackTrapsLevel2, BodyBackTrapsLevel3, BodyBackTrapsLevel4, BodyBackTrapsLevel5],
  'Body Back Traps Secondary': [BodyBackTrapsLevel1, BodyBackTrapsLevel2, BodyBackTrapsLevel3, BodyBackTrapsLevel4, BodyBackTrapsLevel5],
  'Body Back Shoulders Primary': [BodyBackShouldersLevel1, BodyBackShouldersLevel2, BodyBackShouldersLevel3, BodyBackShouldersLevel4, BodyBackShouldersLevel5],
  'Body Back Shoulders Secondary': [BodyBackShouldersLevel1, BodyBackShouldersLevel2, BodyBackShouldersLevel3, BodyBackShouldersLevel4, BodyBackShouldersLevel5],
  'Body Back Gluteals Primary': [BodyBackGlutealsLevel1, BodyBackGlutealsLevel2, BodyBackGlutealsLevel3, BodyBackGlutealsLevel4, BodyBackGlutealsLevel5],
  'Body Back Gluteals Secondary': [BodyBackGlutealsLevel1, BodyBackGlutealsLevel2, BodyBackGlutealsLevel3, BodyBackGlutealsLevel4, BodyBackGlutealsLevel5],
  'Body Back Hamstrings Primary': [BodyBackHamstringsLevel1, BodyBackHamstringsLevel2, BodyBackHamstringsLevel3, BodyBackHamstringsLevel4, BodyBackHamstringsLevel5],
  'Body Back Hamstrings Secondary': [BodyBackHamstringsLevel1, BodyBackHamstringsLevel2, BodyBackHamstringsLevel3, BodyBackHamstringsLevel4, BodyBackHamstringsLevel5],
  'Body Back Calves Primary': [BodyBackCalvesLevel1, BodyBackCalvesLevel2, BodyBackCalvesLevel3, BodyBackCalvesLevel4, BodyBackCalvesLevel5],
  'Body Back Calves Secondary': [BodyBackCalvesLevel1, BodyBackCalvesLevel2, BodyBackCalvesLevel3, BodyBackCalvesLevel4, BodyBackCalvesLevel5],
  'Body Back Quads Primary': [BodyBackQuadsLevel1, BodyBackQuadsLevel2, BodyBackQuadsLevel3, BodyBackQuadsLevel4, BodyBackQuadsLevel5],
  'Body Back Quads Secondary': [BodyBackQuadsLevel1, BodyBackQuadsLevel2, BodyBackQuadsLevel3, BodyBackQuadsLevel4, BodyBackQuadsLevel5],
  'Body Back Obliques Primary': [BodyBackObliquesLevel1, BodyBackObliquesLevel2, BodyBackObliquesLevel3, BodyBackObliquesLevel4, BodyBackObliquesLevel5],
  'Body Back Obliques Secondary': [BodyBackObliquesLevel1, BodyBackObliquesLevel2, BodyBackObliquesLevel3, BodyBackObliquesLevel4, BodyBackObliquesLevel5],
  'Body Back Tricpes Primary': [BodyBackTricpesLevel1, BodyBackTricpesLevel2, BodyBackTricpesLevel3, BodyBackTricpesLevel4, BodyBackTricpesLevel5],
  'Body Back Tricpes Secondary': [BodyBackTricpesLevel1, BodyBackTricpesLevel2, BodyBackTricpesLevel3, BodyBackTricpesLevel4, BodyBackTricpesLevel5],
  'Body Back Underarm Primary': [BodyBackUnderarmLevel1, BodyBackUnderarmLevel2, BodyBackUnderarmLevel3, BodyBackUnderarmLevel4, BodyBackUnderarmLevel5],
  'Body Back Underarm Secondary': [BodyBackUnderarmLevel1, BodyBackUnderarmLevel2, BodyBackUnderarmLevel3, BodyBackUnderarmLevel4, BodyBackUnderarmLevel5],
};

/**
 * Normaliseer spiergroep naam om verschillende varianten naar dezelfde base naam te mappen
 */
const normalizeMuscleName = (muscleName: string): string => {
  const normalized = muscleName.toLowerCase().trim();
  
  // Map naar base spiergroep namen
  if (normalized.includes('borst') || normalized.includes('chest') || normalized.includes('pectoral')) {
    return 'Borst';
  }
  if (normalized.includes('biceps') || normalized.includes('bicep')) {
    return 'Biceps';
  }
  if (normalized.includes('triceps') || normalized.includes('tricep')) {
    return 'Triceps';
  }
  if (normalized.includes('schouder') || normalized.includes('shoulder') || normalized.includes('deltoid')) {
    return 'Schouders';
  }
  if (normalized.includes('rug') || normalized.includes('back') || normalized.includes('lat') || normalized.includes('trapezius') || normalized.includes('rhomboid')) {
    return 'Traps';
  }
  if (normalized.includes('buik') || normalized.includes('abdom') || normalized.includes('core') || normalized.includes('rectus')) {
    return 'Buik';
  }
  if (normalized.includes('oblique')) {
    return 'Obliques';
  }
  if (normalized.includes('quad') || normalized.includes('thigh')) {
    return 'Quadriceps';
  }
  if (normalized.includes('kuit') || normalized.includes('calf') || normalized.includes('soleus') || normalized.includes('gastrocnemius')) {
    return 'Kuiten';
  }
  
  return muscleName;
};

/**
 * Map interne naam naar weergave naam
 */
export const getDisplayName = (muscleName: string): string => {
  const displayNames: Record<string, string> = {
    'Borst': 'Borst',
    'Biceps': 'Biceps',
    'Triceps': 'Triceps',
    'Schouders': 'Schouders',
    'Traps': 'Rug/Traps',
    'Buik': 'Buikspieren',
    'Obliques': 'Obliques',
    'Quadriceps': 'Quadriceps',
    'Quads': 'Quadriceps',
    'Kuiten': 'Kuiten',
  };
  
  return displayNames[muscleName] || muscleName;
};

/**
 * Krijg het level (1-5) voor een gegeven frequentie
 * Meest getraind = level 5 (donkerste)
 * Minder getraind = lichtere levels
 */
const getLevelForFrequency = (frequency: number, maxFrequency: number, sortedFrequencies: number[]): number => {
  if (frequency === 0) return 0;
  if (maxFrequency === 0) return 1;
  
  // Vind de positie van deze frequentie in de gesorteerde lijst (hoog naar laag)
  const rank = sortedFrequencies.indexOf(frequency);
  
  // Map rank naar level (1-5)
  // Rank 0 (meest getraind) = level 5 (donkerste)
  // Lagere rank = lichtere levels
  const level = Math.floor((rank / Math.max(1, sortedFrequencies.length - 1)) * 4) + 1;
  
  return Math.max(1, Math.min(5, level));
};

/**
 * Krijg de kleur voor een gegeven frequentie (voor pie charts)
 */
export const getColorForFrequency = (frequency: number, maxFrequency: number, sortedFrequencies: number[]): string => {
  const level = getLevelForFrequency(frequency, maxFrequency, sortedFrequencies);
  if (level === 0) return 'transparent';
  return GREEN_TINTS[level - 1]; // level 1-5 -> index 0-4
};

export const MuscleFrequencyBody = () => {
  // State om component te forceren om te re-renderen bij updates
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    // Luister naar storage events voor updates
    const handleStorageChange = () => {
      setRefreshKey(prev => prev + 1);
    };
    window.addEventListener('storage', handleStorageChange);
    
    // Ook luisteren naar custom storage events (voor updates binnen dezelfde tab)
    const handleCustomStorageChange = () => {
      setRefreshKey(prev => prev + 1);
    };
    window.addEventListener('workoutUpdated', handleCustomStorageChange);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('workoutUpdated', handleCustomStorageChange);
    };
  }, []);

  const { frontFrequencies, backFrequencies, frontSvgMap, backSvgMap } = useMemo(() => {
    const exercises = getAllExercises();
    const mappingData = exerciseMuscleMapping as Record<string, { primary: string[]; secondary: string[] }>;
    
    const frontFreq: Record<string, number> = {};
    const backFreq: Record<string, number> = {};
    
    // Tel frequenties van primary muscles per oefening
    exercises.forEach(exercise => {
      // Gebruik metadata om de echte naam te vinden (voor alternatieve namen)
      const metadata = findExerciseMetadata(exercise.name);
      const actualExerciseName = metadata ? metadata.name : exercise.name;
      
      // Zoek mapping in exerciseMuscleMapping.json
      let mapping = mappingData[actualExerciseName];
      
      // Als geen exacte match, probeer case-insensitive
      if (!mapping) {
        const exerciseNameLower = actualExerciseName.toLowerCase();
        for (const key in mappingData) {
          if (key.toLowerCase() === exerciseNameLower) {
            mapping = mappingData[key];
            break;
          }
        }
      }
      
      // Als nog steeds geen match, probeer met originele naam
      if (!mapping) {
        mapping = mappingData[exercise.name];
      }
      
      if (mapping && mapping.primary) {
        mapping.primary.forEach(muscle => {
          // Bepaal of spier voorkant of achterkant is
          if (muscle.includes('Body Back')) {
            // Achterkant spier
            backFreq[muscle] = (backFreq[muscle] || 0) + 1;
          } else if (muscle.includes('Triceps')) {
            // Triceps zijn aan de achterkant
            const backMuscle = muscle.replace('Triceps', 'Body Back Tricpes');
            backFreq[backMuscle] = (backFreq[backMuscle] || 0) + 1;
          } else {
            // Voorkant spier
            frontFreq[muscle] = (frontFreq[muscle] || 0) + 1;
          }
        });
      }
    });
    
    // Map voorkant spiergroepen naar level SVG arrays
    const frontSvgMapping: Record<string, { levelSvgs: string[]; frequency: number }> = {};
    Object.entries(frontFreq).forEach(([muscle, frequency]) => {
      let levelSvgsArray: string[] | undefined;
      
      for (const [key, levelSvgs] of Object.entries(muscleGroupToLevelSvgs)) {
        if (key === muscle || normalizeMuscleName(key) === normalizeMuscleName(muscle)) {
          levelSvgsArray = levelSvgs;
          break;
        }
      }
      
      if (levelSvgsArray) {
        frontSvgMapping[muscle] = { levelSvgs: levelSvgsArray, frequency };
      }
    });
    
    // Map achterkant spiergroepen naar level SVG arrays
    const backSvgMapping: Record<string, { levelSvgs: string[]; frequency: number }> = {};
    Object.entries(backFreq).forEach(([muscle, frequency]) => {
      let levelSvgsArray: string[] | undefined;
      
      for (const [key, levelSvgs] of Object.entries(muscleGroupToLevelSvgs)) {
        if (key === muscle) {
          levelSvgsArray = levelSvgs;
          break;
        }
      }
      
      if (levelSvgsArray) {
        backSvgMapping[muscle] = { levelSvgs: levelSvgsArray, frequency };
      }
    });
    
    return { 
      frontFrequencies: frontFreq, 
      backFrequencies: backFreq, 
      frontSvgMap: frontSvgMapping,
      backSvgMap: backSvgMapping
    };
  }, [refreshKey]);

  // Combineer alle frequenties voor ranking
  const allFrequencies = { ...frontFrequencies, ...backFrequencies };
  const maxFrequency = Math.max(...Object.values(allFrequencies), 0);
  // Sorteer frequenties van hoog naar laag voor ranking
  const sortedFrequencies = Array.from(new Set(Object.values(allFrequencies)))
    .sort((a, b) => b - a)
    .filter(f => f > 0);

  // Helper functie om een lichaamsdeel te renderen
  const renderBodySide = (
    svgMap: Record<string, { levelSvgs: string[]; frequency: number }>
  ) => {
    return Object.entries(svgMap)
      .sort(([, a], [, b]) => b.frequency - a.frequency) // Sorteer van hoog naar laag
      .map(([muscle, { levelSvgs, frequency }]) => {
        const level = getLevelForFrequency(frequency, maxFrequency, sortedFrequencies);
        const svg = level > 0 ? levelSvgs[level - 1] : null; // level 1-5 -> index 0-4
        
        if (!svg) return null;
        
        return (
          <Box
            key={muscle}
            sx={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              zIndex: sortedFrequencies.length - sortedFrequencies.indexOf(frequency),
            }}
          >
            {/* Level SVG - al gekleurd */}
            <Box
              component="img"
              src={svg}
              alt={muscle}
              sx={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                objectFit: 'contain',
                objectPosition: 'center',
                pointerEvents: 'none',
              }}
            />
          </Box>
        );
      });
  };

  return (
    <Box 
      sx={{ 
        display: 'flex', 
        flexDirection: 'row',
        justifyContent: 'center', 
        alignItems: 'center', 
        width: '100%',
        gap: 3,
        flexWrap: 'wrap',
      }}
    >
      {/* Voorkant */}
      <Box
        sx={{
          position: 'relative',
          width: '350px',
          height: '350px',
          overflow: 'visible',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        {renderBodySide(frontSvgMap)}
      </Box>

      {/* Achterkant */}
      <Box
        sx={{
          position: 'relative',
          width: '350px',
          height: '350px',
          overflow: 'visible',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        {/* Basis achterkant body */}
        <Box
          component="img"
          src={BodyBackSvg}
          alt="body back"
          sx={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            objectPosition: 'center',
            zIndex: 1,
          }}
        />
        {renderBodySide(backSvgMap)}
      </Box>
    </Box>
  );
};

