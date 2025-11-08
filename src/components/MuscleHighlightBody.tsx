import { useMemo } from 'react';
import { Box, Typography } from '@mui/material';
import { findExerciseMetadata } from '../data/exerciseMetadata';
import exerciseMuscleMapping from '../data/exerciseMuscleMapping.json';

// Import Primary SVG bestanden (voorkant)
import ChestPrimarySvg from '../assets/body/Chest Primary.svg';
import BicepsPrimarySvg from '../assets/body/Biceps Primary.svg';
import UnderarmsPrimarySvg from '../assets/body/Underarms Primary.svg';
import ShouldersPrimarySvg from '../assets/body/Shoulders Primary.svg';
import TrapsPrimarySvg from '../assets/body/Traps Primary.svg';
import AbsPrimarySvg from '../assets/body/Abs Primary.svg';
import ObliquesPrimarySvg from '../assets/body/Obliques Primary.svg';
import QuadsPrimarySvg from '../assets/body/Quads Primary.svg';
import CalvesPrimarySvg from '../assets/body/Calves Primary.svg';

// Import Secondary SVG bestanden (voorkant)
import ChestSecondarySvg from '../assets/body/Chest Secundary.svg';
import BicepsSecondarySvg from '../assets/body/Biceps Secundary.svg';
import UnderarmsSecondarySvg from '../assets/body/Underarms Secundary.svg';
import ShouldersSecondarySvg from '../assets/body/Shoulders Secundary.svg';
import TrapsSecondarySvg from '../assets/body/Traps Secundary.svg';
import AbsSecondarySvg from '../assets/body/Abs Secundary.svg';
import ObliquesSecondarySvg from '../assets/body/Obliques Secundary.svg';
import QuadsSecondarySvg from '../assets/body/Quads Secundary.svg';
import CalvesSecondarySvg from '../assets/body/Calves Secundary.svg';

// Import Primary SVG bestanden (achterkant)
import BodyBackLatsPrimarySvg from '../assets/body/Body Back Lats Primary.svg';
import BodyBackUpperBackPrimarySvg from '../assets/body/Body Back Upper Back Primary.svg';
import BodyBackLowerBackPrimarySvg from '../assets/body/Body Back Lower Back Primary.svg';
import BodyBackTrapsPrimarySvg from '../assets/body/Body Back Traps Primary.svg';
import BodyBackShouldersPrimarySvg from '../assets/body/Body Back Shoulders Primary.svg';
import BodyBackGlutealsPrimarySvg from '../assets/body/Body Back Gluteals Primary.svg';
import BodyBackHamstringsPrimarySvg from '../assets/body/Body Back Hamstrings Primary.svg';
import BodyBackCalvesPrimarySvg from '../assets/body/Body Back Calves Primary.svg';
import BodyBackQuadsPrimarySvg from '../assets/body/Body Back Quads Primary.svg';
import BodyBackObliquesPrimarySvg from '../assets/body/Body Back Obliques Primary.svg';
import BodyBackTricpesPrimarySvg from '../assets/body/Body Back Tricpes Primary.svg';
import BodyBackUnderarmPrimarySvg from '../assets/body/Body Back Underarm Primary.svg';

// Import Secondary SVG bestanden (achterkant)
import BodyBackLatsSecondarySvg from '../assets/body/Body Back Lats Secondary.svg';
import BodyBackUpperBackSecondarySvg from '../assets/body/Body Back Upper Back Secondary.svg';
import BodyBackLowerBackSecondarySvg from '../assets/body/Body Back Lower Back Secondary.svg';
import BodyBackTrapsSecondarySvg from '../assets/body/Body Back Traps Secondary.svg';
import BodyBackShouldersSecondarySvg from '../assets/body/Body Back Shoulders Secondary.svg';
import BodyBackGlutealsSecondarySvg from '../assets/body/Body Back Gluteals Secondary.svg';
import BodyBackHamstringsSecondarySvg from '../assets/body/Body Back Hamstrings Secondary.svg';
import BodyBackCalvesSecondarySvg from '../assets/body/Body Back Calves Secondary.svg';
import BodyBackQuadsSecondarySvg from '../assets/body/Body Back Quads Secondary.svg';
import BodyBackObliquesSecondarySvg from '../assets/body/Body Back Obliques Secondary.svg';
import BodyBackTricpesSecondarySvg from '../assets/body/Body Back Tricpes Secondary.svg';
import BodyBackUnderarmSecondarySvg from '../assets/body/Body Back Underarm Secondary.svg';

// Basis body SVG's
import BodyBackSvg from '../assets/body/Body Back.svg';
import ChestSvg from '../assets/body/Chest.svg'; // Gebruikt als base voor voorkant body outline

interface MuscleHighlightBodyProps {
  exerciseName: string | null;
}

// Mapping van JSON mapping namen naar SVG imports (voorkant)
const frontMuscleToSvg: Record<string, { primary: string; secondary: string }> = {
  'Chest Primary': { primary: ChestPrimarySvg, secondary: ChestSecondarySvg },
  'Chest Secondary': { primary: ChestPrimarySvg, secondary: ChestSecondarySvg },
  'Biceps Primary': { primary: BicepsPrimarySvg, secondary: BicepsSecondarySvg },
  'Biceps Secondary': { primary: BicepsPrimarySvg, secondary: BicepsSecondarySvg },
  'Triceps Primary': { primary: UnderarmsPrimarySvg, secondary: UnderarmsSecondarySvg },
  'Triceps Secondary': { primary: UnderarmsPrimarySvg, secondary: UnderarmsSecondarySvg },
  'Shoulders Primary': { primary: ShouldersPrimarySvg, secondary: ShouldersSecondarySvg },
  'Shoulders Secondary': { primary: ShouldersPrimarySvg, secondary: ShouldersSecondarySvg },
  'Traps Primary': { primary: TrapsPrimarySvg, secondary: TrapsSecondarySvg },
  'Traps Secondary': { primary: TrapsPrimarySvg, secondary: TrapsSecondarySvg },
  'Abs Primary': { primary: AbsPrimarySvg, secondary: AbsSecondarySvg },
  'Abs Secondary': { primary: AbsPrimarySvg, secondary: AbsSecondarySvg },
  'Obliques Primary': { primary: ObliquesPrimarySvg, secondary: ObliquesSecondarySvg },
  'Obliques Secondary': { primary: ObliquesPrimarySvg, secondary: ObliquesSecondarySvg },
  'Quads Primary': { primary: QuadsPrimarySvg, secondary: QuadsSecondarySvg },
  'Quads Secondary': { primary: QuadsPrimarySvg, secondary: QuadsSecondarySvg },
  'Calves Primary': { primary: CalvesPrimarySvg, secondary: CalvesSecondarySvg },
  'Calves Secondary': { primary: CalvesPrimarySvg, secondary: CalvesSecondarySvg },
  'Underarms Primary': { primary: UnderarmsPrimarySvg, secondary: UnderarmsSecondarySvg },
  'Underarms Secondary': { primary: UnderarmsPrimarySvg, secondary: UnderarmsSecondarySvg },
};

// Mapping van JSON mapping namen naar SVG imports (achterkant)
const backMuscleToSvg: Record<string, { primary: string; secondary: string }> = {
  'Body Back Lats Primary': { primary: BodyBackLatsPrimarySvg, secondary: BodyBackLatsSecondarySvg },
  'Body Back Lats Secondary': { primary: BodyBackLatsPrimarySvg, secondary: BodyBackLatsSecondarySvg },
  'Body Back Upper Back Primary': { primary: BodyBackUpperBackPrimarySvg, secondary: BodyBackUpperBackSecondarySvg },
  'Body Back Upper Back Secondary': { primary: BodyBackUpperBackPrimarySvg, secondary: BodyBackUpperBackSecondarySvg },
  'Body Back Lower Back Primary': { primary: BodyBackLowerBackPrimarySvg, secondary: BodyBackLowerBackSecondarySvg },
  'Body Back Lower Back Secondary': { primary: BodyBackLowerBackPrimarySvg, secondary: BodyBackLowerBackSecondarySvg },
  'Body Back Traps Primary': { primary: BodyBackTrapsPrimarySvg, secondary: BodyBackTrapsSecondarySvg },
  'Body Back Traps Secondary': { primary: BodyBackTrapsPrimarySvg, secondary: BodyBackTrapsSecondarySvg },
  'Body Back Shoulders Primary': { primary: BodyBackShouldersPrimarySvg, secondary: BodyBackShouldersSecondarySvg },
  'Body Back Shoulders Secondary': { primary: BodyBackShouldersPrimarySvg, secondary: BodyBackShouldersSecondarySvg },
  'Body Back Gluteals Primary': { primary: BodyBackGlutealsPrimarySvg, secondary: BodyBackGlutealsSecondarySvg },
  'Body Back Gluteals Secondary': { primary: BodyBackGlutealsPrimarySvg, secondary: BodyBackGlutealsSecondarySvg },
  'Body Back Hamstrings Primary': { primary: BodyBackHamstringsPrimarySvg, secondary: BodyBackHamstringsSecondarySvg },
  'Body Back Hamstrings Secondary': { primary: BodyBackHamstringsPrimarySvg, secondary: BodyBackHamstringsSecondarySvg },
  'Body Back Calves Primary': { primary: BodyBackCalvesPrimarySvg, secondary: BodyBackCalvesSecondarySvg },
  'Body Back Calves Secondary': { primary: BodyBackCalvesPrimarySvg, secondary: BodyBackCalvesSecondarySvg },
  'Body Back Quads Primary': { primary: BodyBackQuadsPrimarySvg, secondary: BodyBackQuadsSecondarySvg },
  'Body Back Quads Secondary': { primary: BodyBackQuadsPrimarySvg, secondary: BodyBackQuadsSecondarySvg },
  'Body Back Obliques Primary': { primary: BodyBackObliquesPrimarySvg, secondary: BodyBackObliquesSecondarySvg },
  'Body Back Obliques Secondary': { primary: BodyBackObliquesPrimarySvg, secondary: BodyBackObliquesSecondarySvg },
  'Body Back Tricpes Primary': { primary: BodyBackTricpesPrimarySvg, secondary: BodyBackTricpesSecondarySvg },
  'Body Back Tricpes Secondary': { primary: BodyBackTricpesPrimarySvg, secondary: BodyBackTricpesSecondarySvg },
  'Body Back Underarm Primary': { primary: BodyBackUnderarmPrimarySvg, secondary: BodyBackUnderarmSecondarySvg },
  'Body Back Underarm Secondary': { primary: BodyBackUnderarmPrimarySvg, secondary: BodyBackUnderarmSecondarySvg },
};

/**
 * Haal spieren op uit JSON mapping en scheid ze in voorkant en achterkant
 */
const getMusclesFromMapping = (exerciseName: string) => {
  const mappingData = exerciseMuscleMapping as Record<string, { primary: string[]; secondary: string[] }>;
  
  // Eerst: gebruik metadata om de echte naam te vinden (voor alternatieve namen zoals "Crunches" → "Crunch")
  const metadata = findExerciseMetadata(exerciseName);
  const actualExerciseName = metadata ? metadata.name : exerciseName;
  
  // Probeer exacte match met de echte naam
  let mapping = mappingData[actualExerciseName];
  
  // Als geen exacte match, probeer met originele naam
  if (!mapping) {
    mapping = mappingData[exerciseName];
  }
  
  // Als geen exacte match, probeer case-insensitive match
  if (!mapping) {
    const exerciseNameLower = actualExerciseName.toLowerCase();
    for (const key in mappingData) {
      if (key.toLowerCase() === exerciseNameLower) {
        mapping = mappingData[key];
        break;
      }
    }
  }
  
  // Als nog steeds geen match, probeer met originele naam (case-insensitive)
  if (!mapping) {
    const exerciseNameLower = exerciseName.toLowerCase();
    for (const key in mappingData) {
      if (key.toLowerCase() === exerciseNameLower) {
        mapping = mappingData[key];
        break;
      }
    }
  }
  
  if (!mapping) {
    console.warn(`Geen mapping gevonden voor oefening: "${exerciseName}"`);
    return {
      frontPrimary: [],
      frontSecondary: [],
      backPrimary: [],
      backSecondary: [],
    };
  }
  
  const frontPrimary: string[] = [];
  const frontSecondary: string[] = [];
  const backPrimary: string[] = [];
  const backSecondary: string[] = [];
  
  // Bepaal welke spieren op voorkant, achterkant, of beide moeten worden getoond
  const determineMuscleLocation = (muscle: string): { front: boolean; back: boolean } => {
    // Als expliciet "Body Back" in de naam staat, alleen achterkant
    if (muscle.includes('Body Back')) {
      return { front: false, back: true };
    }
    
    // Triceps zijn altijd aan de achterkant (van de arm)
    if (muscle.includes('Triceps')) {
      return { front: false, back: true };
    }
    
    // Alle andere spieren (Chest, Shoulders zonder "Body Back", Biceps, Abs, etc.) zijn voorkant
    return { front: true, back: false };
  };
  
  // Verwerk primary spieren
  if (mapping.primary) {
    mapping.primary.forEach(muscle => {
      const location = determineMuscleLocation(muscle);
      
      if (location.back) {
        // Map naar achterkant - controleer of we de naam moeten aanpassen
        if (muscle.includes('Triceps')) {
          const backMuscle = muscle.replace('Triceps', 'Body Back Tricpes');
          backPrimary.push(backMuscle);
        } else {
          backPrimary.push(muscle);
        }
      }
      
      if (location.front) {
        frontPrimary.push(muscle);
      }
    });
  }
  
  // Verwerk secondary spieren
  if (mapping.secondary) {
    mapping.secondary.forEach(muscle => {
      const location = determineMuscleLocation(muscle);
      
      if (location.back) {
        // Map naar achterkant - controleer of we de naam moeten aanpassen
        if (muscle.includes('Triceps')) {
          const backMuscle = muscle.replace('Triceps', 'Body Back Tricpes');
          backSecondary.push(backMuscle);
        } else {
          backSecondary.push(muscle);
        }
      }
      
      if (location.front) {
        frontSecondary.push(muscle);
      }
    });
  }
  
  // Debug: log de resultaten
  console.log(`Mapping voor "${exerciseName}":`, {
    actualExerciseName,
    frontPrimary,
    frontSecondary,
    backPrimary,
    backSecondary,
    mapping
  });
  
  return {
    frontPrimary,
    frontSecondary,
    backPrimary,
    backSecondary,
  };
};

/**
 * Render een lichaamsdeel (voorkant of achterkant) met de juiste spieren
 */
const renderBodySide = (
  muscles: string[],
  isPrimary: boolean,
  isBack: boolean,
  zIndex: number
) => {
  const muscleMap = isBack ? backMuscleToSvg : frontMuscleToSvg;
  const svgs: { svg: string; opacity: number }[] = [];
  
  muscles.forEach(muscle => {
    const svgMapping = muscleMap[muscle];
    if (svgMapping) {
      // Bepaal of deze spier primary of secondary is op basis van de naam
      // Check expliciet voor "Primary" en niet "Secondary" in de naam
      const isMusclePrimary = /Primary/.test(muscle) && !/Secondary/.test(muscle);
      const isMuscleSecondary = /Secondary/.test(muscle);
      
      // Kies de juiste SVG op basis van de spier naam
      let svg: string | undefined;
      let opacity: number;
      
      if (isMusclePrimary) {
        // Voor Primary spieren: gebruik altijd de Primary SVG met volledige opacity
        svg = svgMapping.primary;
        opacity = 1.0; // Primary spieren zijn volledig zichtbaar
        console.log(`[PRIMARY] ${muscle}: Using PRIMARY SVG (${svg}) with opacity 1.0`);
      } else if (isMuscleSecondary) {
        // Voor Secondary spieren: gebruik altijd de Secondary SVG met lagere opacity
        svg = svgMapping.secondary;
        opacity = 0.6; // Secondary spieren zijn 60% zichtbaar
        console.log(`[SECONDARY] ${muscle}: Using SECONDARY SVG (${svg}) with opacity 0.6`);
      } else {
        // Fallback: gebruik primary als default
        svg = svgMapping.primary;
        opacity = isPrimary ? 1.0 : 0.6;
        console.log(`[FALLBACK] ${muscle}: Using PRIMARY SVG (${svg}) with opacity ${opacity}`);
      }
      
      if (svg && !svgs.some(s => s.svg === svg)) {
        svgs.push({ svg, opacity });
        console.log(`Rendering ${isBack ? 'achterkant' : 'voorkant'}: ${muscle} → ${svg} (opacity: ${opacity}, isMusclePrimary: ${isMusclePrimary}, isMuscleSecondary: ${isMuscleSecondary})`);
      } else if (!svg) {
        console.error(`Geen SVG gevonden voor spier: ${muscle}, isMusclePrimary: ${isMusclePrimary}, isMuscleSecondary: ${isMuscleSecondary}`);
      }
    } else {
      console.warn(`Geen SVG mapping gevonden voor spier: "${muscle}" (${isBack ? 'achterkant' : 'voorkant'})`);
    }
  });
  
  if (svgs.length === 0 && muscles.length > 0) {
    console.warn(`Geen SVG's gevonden voor spieren:`, muscles);
  }
  
  return svgs.map(({ svg, opacity }, index) => (
    <Box
      key={`${isBack ? 'back' : 'front'}-${index}-${muscles[index] || index}`}
      component="img"
      src={svg}
      alt={`${muscles[index] || 'muscle'}`}
      sx={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        objectFit: 'contain',
        objectPosition: 'center',
        zIndex: zIndex,
        opacity: opacity,
        pointerEvents: 'none',
      }}
    />
  ));
};

export const MuscleHighlightBody: React.FC<MuscleHighlightBodyProps> = ({ exerciseName }) => {
  const { muscles, metadata } = useMemo(() => {
    if (!exerciseName) {
      return {
        muscles: {
          frontPrimary: [],
          frontSecondary: [],
          backPrimary: [],
          backSecondary: [],
        },
        metadata: null,
      };
    }
    
    const metadata = findExerciseMetadata(exerciseName);
    const muscles = getMusclesFromMapping(exerciseName);
    
    // Debug logging
    console.log('MuscleHighlightBody - Oefening:', exerciseName);
    console.log('MuscleHighlightBody - Spieren:', muscles);
    
    return { muscles, metadata };
  }, [exerciseName]);

  if (!exerciseName) {
    return null;
  }

  return (
    <Box 
      sx={{ 
        display: 'flex', 
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        width: '100%',
        mb: 2,
        gap: 2
      }}
    >
      {/* Beide lichaamsdelen naast elkaar */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: { xs: 'column', md: 'row' },
          gap: { xs: 1.5, sm: 2, md: 3 },
          justifyContent: 'center',
          alignItems: 'center',
          width: '100%',
          flexWrap: { xs: 'nowrap', md: 'wrap' },
        }}
      >
        {/* Voorkant */}
        <Box
          sx={{
            position: 'relative',
            width: { xs: '240px', sm: '280px', md: '320px', lg: '350px' },
            height: { xs: '420px', sm: '500px', md: '560px', lg: '600px' },
            overflow: 'visible',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          {/* Basis voorkant body - onderste laag */}
          <Box
            component="img"
            src={ChestSvg}
            alt="body front"
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
          
          {/* Primary spiergroepen voorkant - midden laag */}
          {renderBodySide(muscles.frontPrimary, true, false, 10)}
          
          {/* Secondary spiergroepen voorkant - bovenste laag */}
          {renderBodySide(muscles.frontSecondary, false, false, 20)}
        </Box>

        {/* Achterkant */}
        <Box
          sx={{
            position: 'relative',
            width: { xs: '240px', sm: '280px', md: '320px', lg: '350px' },
            height: { xs: '420px', sm: '500px', md: '560px', lg: '600px' },
            overflow: 'visible',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          {/* Basis achterkant body - onderste laag */}
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
          
          {/* Primary spiergroepen achterkant - midden laag */}
          {renderBodySide(muscles.backPrimary, true, true, 10)}
          
          {/* Secondary spiergroepen achterkant - bovenste laag */}
          {renderBodySide(muscles.backSecondary, false, true, 20)}
        </Box>
      </Box>

      {/* Beschrijving van spiergroepen */}
      {metadata && (
        <Box sx={{ width: '100%', mt: 1 }}>
          {metadata.primaryMuscles.length > 0 && (
            <Box sx={{ mb: 1.5 }}>
              <Typography variant="body2" fontWeight={600} color="text.primary" gutterBottom>
                Primaire spiergroepen:
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {metadata.primaryMuscles.join(', ')}
              </Typography>
            </Box>
          )}
          {metadata.secondaryMuscles.length > 0 && (
            <Box>
              <Typography variant="body2" fontWeight={600} color="text.primary" gutterBottom>
                Secundaire spiergroepen:
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {metadata.secondaryMuscles.join(', ')}
              </Typography>
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
};

