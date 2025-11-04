import { useMemo, useEffect, useState } from 'react';
import { Box } from '@mui/material';
import { getAllExercises } from '../utils/storage';
import { findExerciseMetadata } from '../data/exerciseMetadata';

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

  const { muscleFrequencies, svgMap } = useMemo(() => {
    const exercises = getAllExercises();
    const frequencies: Record<string, number> = {};
    
    // Tel frequenties van primary muscles
    exercises.forEach(exercise => {
      const metadata = findExerciseMetadata(exercise.name);
      if (metadata && metadata.primaryMuscles) {
        metadata.primaryMuscles.forEach(muscle => {
          const normalized = normalizeMuscleName(muscle);
          frequencies[normalized] = (frequencies[normalized] || 0) + 1;
        });
      }
    });
    
    // Map spiergroepen naar level SVG arrays
    const svgMapping: Record<string, { levelSvgs: string[]; frequency: number }> = {};
    
    Object.entries(frequencies).forEach(([muscle, frequency]) => {
      // Vind de juiste level SVG array voor deze spiergroep
      let levelSvgsArray: string[] | undefined;
      
      for (const [key, levelSvgs] of Object.entries(muscleGroupToLevelSvgs)) {
        if (normalizeMuscleName(key) === muscle) {
          levelSvgsArray = levelSvgs;
          break;
        }
      }
      
      if (levelSvgsArray) {
        svgMapping[muscle] = { levelSvgs: levelSvgsArray, frequency };
      }
    });
    
    return { muscleFrequencies: frequencies, svgMap: svgMapping };
  }, [refreshKey]);

  const maxFrequency = Math.max(...Object.values(muscleFrequencies), 0);
  // Sorteer frequenties van hoog naar laag voor ranking
  const sortedFrequencies = Array.from(new Set(Object.values(muscleFrequencies)))
    .sort((a, b) => b - a)
    .filter(f => f > 0);

  return (
    <Box 
      sx={{ 
        display: 'flex', 
        flexDirection: 'column',
        justifyContent: 'center', 
        alignItems: 'center', 
        width: '100%',
      }}
    >
      <Box
        sx={{
          position: 'relative',
          width: '350px',
          height: '350px',
          overflow: 'visible',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'flex-end',
          mb: 0,
          pb: 0,
        }}
      >
        {/* Render alle spiergroepen met hun frequentie-gebaseerde level SVG's */}
        {Object.entries(svgMap)
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
                }}
              />
            </Box>
          );
        })}
      </Box>
    </Box>
  );
};

