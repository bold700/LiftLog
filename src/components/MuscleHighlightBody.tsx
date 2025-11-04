import { useMemo } from 'react';
import { Box, Typography } from '@mui/material';
import { findExerciseMetadata } from '../data/exerciseMetadata';

// Import Primary SVG bestanden
import ChestPrimarySvg from '../assets/body/Chest Primary.svg';
import BicepsPrimarySvg from '../assets/body/Biceps Primary.svg';
import UnderarmsPrimarySvg from '../assets/body/Underarms Primary.svg';
import ShouldersPrimarySvg from '../assets/body/Shoulders Primary.svg';
import TrapsPrimarySvg from '../assets/body/Traps Primary.svg';
import AbsPrimarySvg from '../assets/body/Abs Primary.svg';
import ObliquesPrimarySvg from '../assets/body/Obliques Primary.svg';
import QuadsPrimarySvg from '../assets/body/Quads Primary.svg';
import CalvesPrimarySvg from '../assets/body/Calves Primary.svg';

// Import Secondary SVG bestanden
import ChestSecondarySvg from '../assets/body/Chest Secundary.svg';
import BicepsSecondarySvg from '../assets/body/Biceps Secundary.svg';
import UnderarmsSecondarySvg from '../assets/body/Underarms Secundary.svg';
import ShouldersSecondarySvg from '../assets/body/Shoulders Secundary.svg';
import TrapsSecondarySvg from '../assets/body/Traps Secundary.svg';
import AbsSecondarySvg from '../assets/body/Abs Secundary.svg';
import ObliquesSecondarySvg from '../assets/body/Obliques Secundary.svg';
import QuadsSecondarySvg from '../assets/body/Quads Secundary.svg';
import CalvesSecondarySvg from '../assets/body/Calves Secundary.svg';

interface MuscleHighlightBodyProps {
  exerciseName: string | null;
}

// Mapping van spiergroep namen naar Primary SVG imports
const muscleGroupToPrimarySvg: Record<string, string> = {
  // Borst
  'Borst': ChestPrimarySvg,
  'Borst (pectoralis major)': ChestPrimarySvg,
  'Borst (bovenkant pectoralis)': ChestPrimarySvg,
  
  // Biceps
  'Biceps': BicepsPrimarySvg,
  'Biceps brachii': BicepsPrimarySvg,
  'Bicep': BicepsPrimarySvg,
  
  // Triceps
  'Triceps': UnderarmsPrimarySvg,
  'Triceps brachii': UnderarmsPrimarySvg,
  'Tricep': UnderarmsPrimarySvg,
  
  // Schouders
  'Schouders': ShouldersPrimarySvg,
  'Schouders (deltoids)': ShouldersPrimarySvg,
  'Schouders (voorste deltoid)': ShouldersPrimarySvg,
  'Schouders (voorzijde)': ShouldersPrimarySvg,
  'Schouders (achterzijde)': ShouldersPrimarySvg,
  'Schouders (zijkant)': ShouldersPrimarySvg,
  'Schouders (laterale deltoid)': ShouldersPrimarySvg,
  
  // Rug/Traps
  'Rug': TrapsPrimarySvg,
  'Trapezius': TrapsPrimarySvg,
  'Traps': TrapsPrimarySvg,
  'Latissimus dorsi': TrapsPrimarySvg,
  'Lats': TrapsPrimarySvg,
  
  // Buik
  'Buik': AbsPrimarySvg,
  'Buikspieren': AbsPrimarySvg,
  'Buikspieren (rectus abdominis)': AbsPrimarySvg,
  'Core': AbsPrimarySvg,
  'Abdominals': AbsPrimarySvg,
  
  // Obliques
  'Obliques': ObliquesPrimarySvg,
  'Oblique': ObliquesPrimarySvg,
  
  // Quadriceps
  'Quadriceps': QuadsPrimarySvg,
  'Quads': QuadsPrimarySvg,
  'Quad': QuadsPrimarySvg,
  
  // Kuiten
  'Kuiten': CalvesPrimarySvg,
  'Calves': CalvesPrimarySvg,
  'Calf': CalvesPrimarySvg,
};

// Mapping van spiergroep namen naar Secondary SVG imports
const muscleGroupToSecondarySvg: Record<string, string> = {
  // Borst
  'Borst': ChestSecondarySvg,
  'Borst (pectoralis major)': ChestSecondarySvg,
  'Borst (bovenkant pectoralis)': ChestSecondarySvg,
  
  // Biceps
  'Biceps': BicepsSecondarySvg,
  'Biceps brachii': BicepsSecondarySvg,
  'Bicep': BicepsSecondarySvg,
  
  // Triceps
  'Triceps': UnderarmsSecondarySvg,
  'Triceps brachii': UnderarmsSecondarySvg,
  'Tricep': UnderarmsSecondarySvg,
  
  // Schouders
  'Schouders': ShouldersSecondarySvg,
  'Schouders (deltoids)': ShouldersSecondarySvg,
  'Schouders (voorste deltoid)': ShouldersSecondarySvg,
  'Schouders (voorzijde)': ShouldersSecondarySvg,
  'Schouders (achterzijde)': ShouldersSecondarySvg,
  'Schouders (zijkant)': ShouldersSecondarySvg,
  'Schouders (laterale deltoid)': ShouldersSecondarySvg,
  
  // Rug/Traps
  'Rug': TrapsSecondarySvg,
  'Trapezius': TrapsSecondarySvg,
  'Traps': TrapsSecondarySvg,
  'Latissimus dorsi': TrapsSecondarySvg,
  'Lats': TrapsSecondarySvg,
  
  // Buik
  'Buik': AbsSecondarySvg,
  'Buikspieren': AbsSecondarySvg,
  'Buikspieren (rectus abdominis)': AbsSecondarySvg,
  'Core': AbsSecondarySvg,
  'Abdominals': AbsSecondarySvg,
  
  // Obliques
  'Obliques': ObliquesSecondarySvg,
  'Oblique': ObliquesSecondarySvg,
  
  // Quadriceps
  'Quadriceps': QuadsSecondarySvg,
  'Quads': QuadsSecondarySvg,
  'Quad': QuadsSecondarySvg,
  
  // Kuiten
  'Kuiten': CalvesSecondarySvg,
  'Calves': CalvesSecondarySvg,
  'Calf': CalvesSecondarySvg,
};

/**
 * Zet spiergroep namen om naar Primary SVG imports
 */
const getPrimaryMuscleSvgs = (muscleNames: string[]): string[] => {
  const svgImports = new Set<string>();
  
  muscleNames.forEach(muscleName => {
    const normalizedName = muscleName.toLowerCase().trim();
    let found = false;
    
    // Eerst exacte match proberen
    for (const [key, svgImport] of Object.entries(muscleGroupToPrimarySvg)) {
      if (key.toLowerCase() === normalizedName) {
        svgImports.add(svgImport);
        found = true;
        break;
      }
    }
    
    // Als geen exacte match, probeer partial matches
    if (!found) {
      for (const [key, svgImport] of Object.entries(muscleGroupToPrimarySvg)) {
        const keyLower = key.toLowerCase();
        
        // Check of de key een deel van de muscle name bevat of vice versa
        if (normalizedName.includes(keyLower) || keyLower.includes(normalizedName)) {
          svgImports.add(svgImport);
          found = true;
          break;
        }
      }
    }
    
    // Fallback: probeer op basis van keywords
    if (!found) {
      if (normalizedName.includes('buik') || normalizedName.includes('abdom') || normalizedName.includes('core') || normalizedName.includes('rectus')) {
        svgImports.add(AbsPrimarySvg);
      }
      if (normalizedName.includes('borst') || normalizedName.includes('chest') || normalizedName.includes('pectoral')) {
        svgImports.add(ChestPrimarySvg);
      }
      if (normalizedName.includes('biceps') || normalizedName.includes('bicep')) {
        svgImports.add(BicepsPrimarySvg);
      }
      if (normalizedName.includes('triceps') || normalizedName.includes('tricep')) {
        svgImports.add(UnderarmsPrimarySvg);
      }
      if (normalizedName.includes('schouder') || normalizedName.includes('shoulder') || normalizedName.includes('deltoid')) {
        svgImports.add(ShouldersPrimarySvg);
      }
      if (normalizedName.includes('rug') || normalizedName.includes('back') || normalizedName.includes('lat') || normalizedName.includes('trapezius') || normalizedName.includes('rhomboid')) {
        svgImports.add(TrapsPrimarySvg);
      }
      if (normalizedName.includes('oblique')) {
        svgImports.add(ObliquesPrimarySvg);
      }
      if (normalizedName.includes('quad') || normalizedName.includes('thigh')) {
        svgImports.add(QuadsPrimarySvg);
      }
      if (normalizedName.includes('kuit') || normalizedName.includes('calf') || normalizedName.includes('soleus') || normalizedName.includes('gastrocnemius')) {
        svgImports.add(CalvesPrimarySvg);
      }
    }
  });
  
  return Array.from(svgImports);
};

/**
 * Zet spiergroep namen om naar Secondary SVG imports
 */
const getSecondaryMuscleSvgs = (muscleNames: string[]): string[] => {
  const svgImports = new Set<string>();
  
  muscleNames.forEach(muscleName => {
    const normalizedName = muscleName.toLowerCase().trim();
    let found = false;
    
    // Eerst exacte match proberen
    for (const [key, svgImport] of Object.entries(muscleGroupToSecondarySvg)) {
      if (key.toLowerCase() === normalizedName) {
        svgImports.add(svgImport);
        found = true;
        break;
      }
    }
    
    // Als geen exacte match, probeer partial matches
    if (!found) {
      for (const [key, svgImport] of Object.entries(muscleGroupToSecondarySvg)) {
        const keyLower = key.toLowerCase();
        
        // Check of de key een deel van de muscle name bevat of vice versa
        if (normalizedName.includes(keyLower) || keyLower.includes(normalizedName)) {
          svgImports.add(svgImport);
          found = true;
          break;
        }
      }
    }
    
    // Fallback: probeer op basis van keywords
    if (!found) {
      if (normalizedName.includes('buik') || normalizedName.includes('abdom') || normalizedName.includes('core') || normalizedName.includes('rectus')) {
        svgImports.add(AbsSecondarySvg);
      }
      if (normalizedName.includes('borst') || normalizedName.includes('chest') || normalizedName.includes('pectoral')) {
        svgImports.add(ChestSecondarySvg);
      }
      if (normalizedName.includes('biceps') || normalizedName.includes('bicep')) {
        svgImports.add(BicepsSecondarySvg);
      }
      if (normalizedName.includes('triceps') || normalizedName.includes('tricep')) {
        svgImports.add(UnderarmsSecondarySvg);
      }
      if (normalizedName.includes('schouder') || normalizedName.includes('shoulder') || normalizedName.includes('deltoid')) {
        svgImports.add(ShouldersSecondarySvg);
      }
      if (normalizedName.includes('rug') || normalizedName.includes('back') || normalizedName.includes('lat') || normalizedName.includes('trapezius') || normalizedName.includes('rhomboid')) {
        svgImports.add(TrapsSecondarySvg);
      }
      if (normalizedName.includes('oblique')) {
        svgImports.add(ObliquesSecondarySvg);
      }
      if (normalizedName.includes('quad') || normalizedName.includes('thigh')) {
        svgImports.add(QuadsSecondarySvg);
      }
      if (normalizedName.includes('kuit') || normalizedName.includes('calf') || normalizedName.includes('soleus') || normalizedName.includes('gastrocnemius')) {
        svgImports.add(CalvesSecondarySvg);
      }
    }
  });
  
  return Array.from(svgImports);
};

export const MuscleHighlightBody: React.FC<MuscleHighlightBodyProps> = ({ exerciseName }) => {
  const { primarySvgs, secondarySvgs, metadata } = useMemo(() => {
    if (!exerciseName) {
      return { primarySvgs: [], secondarySvgs: [], metadata: null };
    }
    
    const metadata = findExerciseMetadata(exerciseName);
    
    if (!metadata) {
      return { primarySvgs: [], secondarySvgs: [], metadata: null };
    }
    
    const primarySvgs = getPrimaryMuscleSvgs(metadata.primaryMuscles);
    const secondarySvgs = getSecondaryMuscleSvgs(metadata.secondaryMuscles);
    
    return { primarySvgs, secondarySvgs, metadata };
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
      <Box
        sx={{
          position: 'relative',
          width: '350px',
          height: '600px',
          overflow: 'hidden',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        {/* Primary spiergroepen - volledige kleur (onderste laag) */}
        {primarySvgs.map((svgImport, index) => (
          <Box
            key={`primary-${index}`}
            component="img"
            src={svgImport}
            alt="primary muscle"
            sx={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: '120%',
              height: '120%',
              objectFit: 'contain',
              zIndex: 2,
            }}
          />
        ))}

        {/* Secondary spiergroepen - direct renderen */}
        {secondarySvgs.map((svgImport, index) => (
          <Box
            key={`secondary-${index}`}
            component="img"
            src={svgImport}
            alt="secondary muscle"
            sx={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: '120%',
              height: '120%',
              objectFit: 'contain',
              zIndex: 3,
              opacity: 0.6,
            }}
          />
        ))}
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

