import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Card,
  CardContent,
  Box,
  Typography,
  TextField,
  Autocomplete,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
} from '@mui/material';
import { addExercise, getExerciseNames, getAllExercisesByName } from '../utils/storage';
import { Exercise } from '../types';
import { getExerciseNames as getDbExerciseNames } from '../data/exercises';
import exerciseMuscleMapping from '../data/exerciseMuscleMapping.json';
import { findExerciseMetadata } from '../data/exerciseMetadata';
import { GREEN_TINTS } from './MuscleFrequencyBody';

// Import body SVG's
import BodyBackSvg from '../assets/body/Body Back.svg';
import BodyFrontSvg from '../assets/body/Body Front.svg';

// Import Material Web Components buttons
import '@material/web/button/filled-button.js';
import '@material/web/button/text-button.js';
import '@material/web/icon/icon.js';

interface AddPageProps {
  onExerciseAdded?: () => void;
}

// Mapping van spiergroep display namen naar mapping namen
const muscleDisplayToMapping: Record<string, string[]> = {
  'Borst': ['Chest Primary', 'Chest Secondary'],
  'Biceps': ['Biceps Primary', 'Biceps Secondary'],
  'Triceps': ['Triceps Primary', 'Triceps Secondary', 'Body Back Tricpes Primary', 'Body Back Tricpes Secondary'],
  'Schouders': ['Shoulders Primary', 'Shoulders Secondary', 'Body Back Shoulders Primary', 'Body Back Shoulders Secondary'],
  'Traps': ['Traps Primary', 'Traps Secondary', 'Body Back Traps Primary', 'Body Back Traps Secondary'],
  'Lats': ['Body Back Lats Primary', 'Body Back Lats Secondary'],
  'Upper Back': ['Body Back Upper Back Primary', 'Body Back Upper Back Secondary'],
  'Lower Back': ['Body Back Lower Back Primary', 'Body Back Lower Back Secondary'],
  'Buikspieren': ['Abs Primary', 'Abs Secondary'],
  'Obliques': ['Obliques Primary', 'Obliques Secondary', 'Body Back Obliques Primary', 'Body Back Obliques Secondary'],
  'Quadriceps': ['Quads Primary', 'Quads Secondary', 'Body Back Quads Primary', 'Body Back Quads Secondary'],
  'Kuiten': ['Calves Primary', 'Calves Secondary', 'Body Back Calves Primary', 'Body Back Calves Secondary'],
  'Hamstrings': ['Body Back Hamstrings Primary', 'Body Back Hamstrings Secondary'],
  'Gluteals': ['Body Back Gluteals Primary', 'Body Back Gluteals Secondary'],
  'Underarms': ['Underarms Primary', 'Underarms Secondary', 'Body Back Underarm Primary', 'Body Back Underarm Secondary'],
};

// Mapping van spiergroep namen naar Level 1 SVG imports (voorkant)
import ChestLevel1 from '../assets/body/levels/front levels/Chest Primary Level 1.svg';
import BicepsLevel1 from '../assets/body/levels/front levels/Biceps Primary Level 1.svg';
// Triceps zit niet op voorkant, alleen op achterkant
import ShouldersLevel1 from '../assets/body/levels/front levels/Shoulders Primary Level 1.svg';
import AbsLevel1 from '../assets/body/levels/front levels/Abs Primary Level 1.svg';
import ObliquesLevel1 from '../assets/body/levels/front levels/Obliques Primary Level 1.svg';
import QuadsLevel1 from '../assets/body/levels/front levels/Quads Primary Level 1.svg';
import CalvesLevel1 from '../assets/body/levels/front levels/Calves Primary Level 1.svg';
import TrapsLevel1 from '../assets/body/levels/front levels/Traps Primary Level 1.svg';
import UnderarmsLevel1 from '../assets/body/levels/front levels/Underarms Primary Level 1.svg';

// Mapping van spiergroep namen naar Level 1 SVG imports (achterkant)
import BodyBackLatsLevel1 from '../assets/body/levels/back levels/Body Back Lats Level 1.svg';
import BodyBackTrapsLevel1 from '../assets/body/levels/back levels/Body Back Traps Level 1.svg';
import BodyBackShouldersLevel1 from '../assets/body/levels/back levels/Body Back Shoulders Level 1.svg';
import BodyBackUpperBackLevel1 from '../assets/body/levels/back levels/Body Back Upper Back Level 1.svg';
import BodyBackLowerBackLevel1 from '../assets/body/levels/back levels/Body Back Lower Back Level 1.svg';
import BodyBackHamstringsLevel1 from '../assets/body/levels/back levels/Body Back Hamstrings Level 1.svg';
import BodyBackGlutealsLevel1 from '../assets/body/levels/back levels/Body Back Gluteals Level 1.svg';
import BodyBackCalvesLevel1 from '../assets/body/levels/back levels/Body Back Calves Level 1.svg';
import BodyBackQuadsLevel1 from '../assets/body/levels/back levels/Body Back Quads Level 1.svg';
import BodyBackObliquesLevel1 from '../assets/body/levels/back levels/Body Back Obliques Level 1.svg';
import BodyBackTricpesLevel1 from '../assets/body/levels/back levels/Body Back Tricpes Level 1.svg';
import BodyBackUnderarmLevel1 from '../assets/body/levels/back levels/Body Back Underarm Level 1.svg';

// Mapping van spiergroep display namen naar Level 1 SVG's (voorkant)
// Alleen spiergroepen die daadwerkelijk op de voorkant zitten
const frontMuscleToSvg: Record<string, string> = {
  'Borst': ChestLevel1,
  'Biceps': BicepsLevel1,
  'Schouders': ShouldersLevel1,
  'Buikspieren': AbsLevel1,
  'Obliques': ObliquesLevel1,
  'Quadriceps': QuadsLevel1,
  'Kuiten': CalvesLevel1,
  'Traps': TrapsLevel1,
  'Underarms': UnderarmsLevel1,
};

// Lijst van spiergroepen die op de voorkant zitten
const frontMuscleGroups = ['Borst', 'Biceps', 'Schouders', 'Buikspieren', 'Obliques', 'Quadriceps', 'Kuiten', 'Traps', 'Underarms'];

// Mapping van spiergroep display namen naar Level 1 SVG's (achterkant)
const backMuscleToSvg: Record<string, string> = {
  'Traps': BodyBackTrapsLevel1,
  'Lats': BodyBackLatsLevel1,
  'Upper Back': BodyBackUpperBackLevel1,
  'Lower Back': BodyBackLowerBackLevel1,
  'Hamstrings': BodyBackHamstringsLevel1,
  'Gluteals': BodyBackGlutealsLevel1,
  'Schouders': BodyBackShouldersLevel1,
  'Kuiten': BodyBackCalvesLevel1,
  'Quadriceps': BodyBackQuadsLevel1,
  'Obliques': BodyBackObliquesLevel1,
  'Triceps': BodyBackTricpesLevel1,
  'Underarms': BodyBackUnderarmLevel1,
};

// Lijst van spiergroepen die op de achterkant zitten
const backMuscleGroups = ['Traps', 'Lats', 'Upper Back', 'Lower Back', 'Hamstrings', 'Gluteals', 'Triceps', 'Kuiten', 'Quadriceps', 'Obliques', 'Schouders', 'Underarms'];

// Lijst van alle beschikbare spiergroepen voor dropdown
const allMuscleGroups = [
  'Borst',
  'Biceps',
  'Triceps',
  'Schouders',
  'Buikspieren',
  'Obliques',
  'Quadriceps',
  'Kuiten',
  'Traps',
  'Lats',
  'Upper Back',
  'Lower Back',
  'Hamstrings',
  'Gluteals',
  'Underarms',
];

// Helper functie om spiergroep mapping naam naar display naam te converteren
const mappingNameToDisplayName = (mappingName: string): string | null => {
  const normalized = mappingName.toLowerCase();
  
  if (normalized.includes('chest')) return 'Borst';
  if (normalized.includes('biceps')) return 'Biceps';
  if (normalized.includes('triceps') || normalized.includes('tricpes')) return 'Triceps';
  if (normalized.includes('shoulder')) return 'Schouders';
  if (normalized.includes('abs')) return 'Buikspieren';
  if (normalized.includes('oblique')) return 'Obliques';
  if (normalized.includes('quad')) return 'Quadriceps';
  if (normalized.includes('calves') || normalized.includes('calf')) return 'Kuiten';
  // Onderscheid maken tussen verschillende rug spiergroepen
  if (normalized.includes('upper back')) return 'Upper Back';
  if (normalized.includes('lower back')) return 'Lower Back';
  if (normalized.includes('lat') && !normalized.includes('lateral')) return 'Lats';
  if (normalized.includes('trap')) return 'Traps';
  if (normalized.includes('hamstring')) return 'Hamstrings';
  if (normalized.includes('gluteal')) return 'Gluteals';
  if (normalized.includes('underarm')) return 'Underarms';
  
  return null;
};

// Helper functie om spiergroepen uit een oefening te halen
const getMuscleGroupsFromExercise = (exerciseName: string): string[] => {
  const mappingData = exerciseMuscleMapping as Record<string, { primary: string[]; secondary: string[] }>;
  
  // Gebruik metadata om de echte naam te vinden
  const metadata = findExerciseMetadata(exerciseName);
  const actualExerciseName = metadata ? metadata.name : exerciseName;
  
  // Zoek mapping
  let mapping = mappingData[actualExerciseName];
  
  // Probeer case-insensitive match
  if (!mapping) {
    const exerciseNameLower = actualExerciseName.toLowerCase();
    for (const key in mappingData) {
      if (key.toLowerCase() === exerciseNameLower) {
        mapping = mappingData[key];
        break;
      }
    }
  }
  
  if (!mapping) {
    mapping = mappingData[exerciseName];
  }
  
  if (!mapping) return [];
  
  // Combineer primary en secondary muscles
  const allMuscles = [...(mapping.primary || []), ...(mapping.secondary || [])];
  
  // Converteer naar display namen en verwijder duplicaten
  const displayNames = allMuscles
    .map(mappingNameToDisplayName)
    .filter((name): name is string => name !== null);
  
  return [...new Set(displayNames)];
};

// Helper functie om de primaire spiergroep uit een oefening te halen (voor automatische filter)
const getPrimaryMuscleGroupFromExercise = (exerciseName: string): string | null => {
  const mappingData = exerciseMuscleMapping as Record<string, { primary: string[]; secondary: string[] }>;
  
  // Gebruik metadata om de echte naam te vinden
  const metadata = findExerciseMetadata(exerciseName);
  const actualExerciseName = metadata ? metadata.name : exerciseName;
  
  // Zoek mapping
  let mapping = mappingData[actualExerciseName];
  
  // Probeer case-insensitive match
  if (!mapping) {
    const exerciseNameLower = actualExerciseName.toLowerCase();
    for (const key in mappingData) {
      if (key.toLowerCase() === exerciseNameLower) {
        mapping = mappingData[key];
        break;
      }
    }
  }
  
  if (!mapping) {
    mapping = mappingData[exerciseName];
  }
  
  if (!mapping || !mapping.primary || mapping.primary.length === 0) return null;
  
  // Neem de eerste primaire spiergroep
  const primaryMuscle = mapping.primary[0];
  const displayName = mappingNameToDisplayName(primaryMuscle);
  
  return displayName;
};

export const AddPage = ({ onExerciseAdded }: AddPageProps) => {
  const [exerciseName, setExerciseName] = useState('');
  const [weight, setWeight] = useState('');
  const [sets, setSets] = useState('');
  const [reps, setReps] = useState('');
  const [notes, setNotes] = useState('');
  const [exerciseSuggestions, setExerciseSuggestions] = useState<string[]>([]);
  const [selectedMuscleGroup, setSelectedMuscleGroup] = useState<string | null>(null);
  const [exerciseMuscleGroups, setExerciseMuscleGroups] = useState<string[]>([]);
  const cancelButtonRef = useRef<any>(null);
  const addButtonRef = useRef<any>(null);
  
  // Bepaal welke spiergroepen getoond moeten worden (handmatig geselecteerd OF automatisch van oefening)
  const displayedMuscleGroups = useMemo(() => {
    if (selectedMuscleGroup) {
      return [selectedMuscleGroup];
    }
    return exerciseMuscleGroups;
  }, [selectedMuscleGroup, exerciseMuscleGroups]);
  
  // Update spiergroepen wanneer oefening wordt geselecteerd
  useEffect(() => {
    if (exerciseName.trim()) {
      const muscleGroups = getMuscleGroupsFromExercise(exerciseName.trim());
      setExerciseMuscleGroups(muscleGroups);
    } else {
      setExerciseMuscleGroups([]);
    }
  }, [exerciseName]);

  // Filter oefeningen op basis van geselecteerde spiergroep
  const filteredExercises = useMemo(() => {
    // Haal altijd alle oefeningen op (zowel uit database als user exercises)
    const allExercises = getDbExerciseNames();
    const userExercises = getExerciseNames();
    const allExerciseNames = [...new Set([...allExercises, ...userExercises])].sort();

    if (!selectedMuscleGroup) {
      return allExerciseNames;
    }

    const mappingNames = muscleDisplayToMapping[selectedMuscleGroup] || [];
    const mappingData = exerciseMuscleMapping as Record<string, { primary: string[]; secondary: string[] }>;
    
    return allExerciseNames.filter(exerciseName => {
      // Gebruik metadata om de echte naam te vinden
      const metadata = findExerciseMetadata(exerciseName);
      const actualExerciseName = metadata ? metadata.name : exerciseName;
      
      // Zoek mapping
      let mapping = mappingData[actualExerciseName];
      
      // Probeer case-insensitive match
      if (!mapping) {
        const exerciseNameLower = actualExerciseName.toLowerCase();
        for (const key in mappingData) {
          if (key.toLowerCase() === exerciseNameLower) {
            mapping = mappingData[key];
            break;
          }
        }
      }
      
      if (!mapping) {
        mapping = mappingData[exerciseName];
      }
      
      if (!mapping) return false;
      
      // Check of de oefening deze spiergroep heeft (primary of secondary)
      const allMuscles = [...(mapping.primary || []), ...(mapping.secondary || [])];
      return mappingNames.some(mappingName => {
        const baseName = mappingName.replace(' Primary', '').replace(' Secondary', '');
        return allMuscles.some(muscle => {
          const muscleBase = muscle.replace(' Primary', '').replace(' Secondary', '');
          return muscleBase === baseName || muscle.includes(baseName);
        });
      });
    });
  }, [selectedMuscleGroup]);

  // Exercise suggestions worden nu dynamisch berekend via filteredExercises
  // Deze state wordt niet meer gebruikt maar houden we voor compatibiliteit
  useEffect(() => {
    // Lege effect - filteredExercises wordt nu via useMemo berekend
  }, []);

  const handleAddExercise = useCallback(async () => {
    // Je moet minimaal een oefening OF een notitie hebben
    const hasExercise = exerciseName.trim() && weight.trim();
    const hasNotes = notes.trim();
    
    if (!hasExercise && !hasNotes) return;

    const exercise: Exercise = {
      id: Date.now().toString(),
      name: exerciseName.trim() || undefined,
      weight: weight.trim() ? parseFloat(weight) : undefined,
      date: new Date().toISOString(),
      sets: sets ? parseInt(sets) : undefined,
      reps: reps ? parseInt(reps) : undefined,
      notes: notes.trim() || undefined,
    };

    addExercise(exercise);
    
    setExerciseName('');
    setWeight('');
    setSets('');
    setReps('');
    setNotes('');
    setSelectedMuscleGroup(null);
    
    if (onExerciseAdded) {
      onExerciseAdded();
    }
  }, [exerciseName, weight, sets, reps, notes, onExerciseAdded]);

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleAddExercise();
    }
  };

  const handleBodyClick = (area: string, isBack: boolean) => {
    const muscles = bodyAreaToMuscle[area] || [];
    if (muscles.length > 0) {
      // Als dezelfde spiergroep al geselecteerd is, deselecteer
      if (selectedMuscleGroup === muscles[0]) {
        setSelectedMuscleGroup(null);
      } else {
        setSelectedMuscleGroup(muscles[0]);
      }
    }
  };

  // Update disabled state and add event listeners for Material Web Components buttons
  useEffect(() => {
    const cancelButton = cancelButtonRef.current;
    const addButton = addButtonRef.current;

    // Update disabled state
    if (addButton) {
      // Knop is actief als er een oefening + gewicht is OF alleen een notitie
      const hasExercise = exerciseName.trim() && weight.trim();
      const hasNotes = notes.trim();
      const isDisabled = !hasExercise && !hasNotes;
      addButton.disabled = isDisabled;
      
      const updateDisabled = () => {
        const hasExercise = exerciseName.trim() && weight.trim();
        const hasNotes = notes.trim();
        const isDisabled = !hasExercise && !hasNotes;
        addButton.disabled = isDisabled;
      };
      
      const intervalId = setInterval(updateDisabled, 100);
      (addButton as any)._intervalId = intervalId;
    }

    if (cancelButton) {
      const cancelClickHandler = () => {
        setExerciseName('');
        setWeight('');
        setSets('');
        setReps('');
        setNotes('');
        setSelectedMuscleGroup(null);
      };
      cancelButton.addEventListener('click', cancelClickHandler);
      (cancelButton as any)._clickHandler = cancelClickHandler;
    }
    if (addButton) {
      const addClickHandler = async () => {
        const hasExercise = exerciseName.trim() && weight.trim();
        const hasNotes = notes.trim();
        if (hasExercise || hasNotes) {
          await handleAddExercise();
        }
      };
      addButton.addEventListener('click', addClickHandler);
      (addButton as any)._clickHandler = addClickHandler;
    }

    return () => {
      if (cancelButton && (cancelButton as any)._clickHandler) {
        cancelButton.removeEventListener('click', (cancelButton as any)._clickHandler);
        delete (cancelButton as any)._clickHandler;
      }
      if (addButton) {
        if ((addButton as any)._clickHandler) {
          addButton.removeEventListener('click', (addButton as any)._clickHandler);
          delete (addButton as any)._clickHandler;
        }
        if ((addButton as any)._intervalId) {
          clearInterval((addButton as any)._intervalId);
          delete (addButton as any)._intervalId;
        }
      }
    };
  }, [exerciseName, weight, notes, handleAddExercise]);

  return (
    <Box sx={{ maxWidth: 800, mx: 'auto', pb: 10 }}>
      <Card sx={{ mb: 3, backgroundColor: '#FEF2E5', borderRadius: '16px' }} elevation={0}>
        <CardContent>
          <Typography variant="h5" gutterBottom sx={{ mb: 3, fontWeight: 600 }}>
            Nieuwe Oefening
          </Typography>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <Autocomplete
              freeSolo={!selectedMuscleGroup}
              options={filteredExercises}
              value={exerciseName}
              onChange={(_, newValue) => {
                if (!newValue || typeof newValue !== 'string') {
                  setExerciseName('');
                  setSelectedMuscleGroup(null);
                  // Reset velden wanneer oefening wordt gewist
                  setWeight('');
                  setSets('');
                  setReps('');
                  setNotes('');
                  return;
                }

                // Als er een filter is ingesteld, controleer of de oefening in de gefilterde lijst staat
                if (selectedMuscleGroup) {
                  const isValidExercise = filteredExercises.some(ex => 
                    ex.toLowerCase() === newValue.toLowerCase()
                  );
                  
                  if (!isValidExercise) {
                    // Oefening hoort niet bij de geselecteerde filter, reset de filter
                    setSelectedMuscleGroup(null);
                  }
                }

                setExerciseName(newValue);
                
                // Stel automatisch de filter in op de primaire spiergroep van de geselecteerde oefening
                const primaryMuscleGroup = getPrimaryMuscleGroupFromExercise(newValue);
                if (primaryMuscleGroup) {
                  setSelectedMuscleGroup(primaryMuscleGroup);
                }

                // Haal de laatste oefening op en vul de velden in
                const lastExercises = getAllExercisesByName(newValue);
                if (lastExercises.length > 0) {
                  // Sorteer op datum (nieuwste eerst) en neem de laatste
                  const sortedExercises = [...lastExercises].sort((a, b) => 
                    new Date(b.date).getTime() - new Date(a.date).getTime()
                  );
                  const lastExercise = sortedExercises[0];
                  
                  // Vul alleen in als de velden leeg zijn (optioneel: altijd invullen)
                  if (lastExercise.weight !== undefined && lastExercise.weight !== null) {
                    setWeight(lastExercise.weight.toString());
                  }
                  if (lastExercise.sets !== undefined && lastExercise.sets !== null) {
                    setSets(lastExercise.sets.toString());
                  }
                  if (lastExercise.reps !== undefined && lastExercise.reps !== null) {
                    setReps(lastExercise.reps.toString());
                  }
                  if (lastExercise.notes) {
                    setNotes(lastExercise.notes);
                  }
                }
              }}
              onInputChange={(_, newValue) => {
                setExerciseName(newValue);
                // Als het veld wordt leeggemaakt, reset ook de filter
                if (!newValue.trim()) {
                  setSelectedMuscleGroup(null);
                }
              }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Oefening"
                  placeholder={selectedMuscleGroup ? `Filter: ${selectedMuscleGroup}` : "Bijv. Bench Press"}
                  onKeyPress={handleKeyPress}
                  autoFocus
                />
              )}
            />

            {/* Dropdown voor spiergroep selectie */}
            <FormControl fullWidth>
              <InputLabel id="muscle-group-select-label" shrink>
                Filter op spiergroep (optioneel)
              </InputLabel>
              <Select
                labelId="muscle-group-select-label"
                id="muscle-group-select"
                value={selectedMuscleGroup || ''}
                label="Filter op spiergroep (optioneel)"
                onChange={(e) => {
                  const value = e.target.value;
                  setSelectedMuscleGroup(value === '' ? null : value);
                }}
                displayEmpty
              >
                <MenuItem value="">
                  <em>Geen filter</em>
                </MenuItem>
                {allMuscleGroups.map((muscle) => (
                  <MenuItem key={muscle} value={muscle}>
                    {muscle}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <Box sx={{ display: 'flex', gap: 2 }}>
              <TextField
                label="Gewicht (kg)"
                type="number"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                onKeyPress={handleKeyPress}
                sx={{ flex: 1 }}
                inputProps={{ min: 0, step: 0.5 }}
              />
              
              <TextField
                label="Sets"
                type="number"
                value={sets}
                onChange={(e) => setSets(e.target.value)}
                onKeyPress={handleKeyPress}
                sx={{ flex: 1 }}
                inputProps={{ min: 1 }}
              />
              
              <TextField
                label="Reps"
                type="number"
                value={reps}
                onChange={(e) => setReps(e.target.value)}
                onKeyPress={handleKeyPress}
                sx={{ flex: 1 }}
                inputProps={{ min: 1 }}
              />
            </Box>

            <TextField
              label="Notitie (optioneel)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onKeyPress={handleKeyPress}
              multiline
              rows={2}
              placeholder="Bijv. last van mn schouder, ging goed, was te zwaar"
            />
          </Box>

          {/* Body SVG's voor visuele weergave */}
          <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', mt: 2, overflowX: 'auto' }}>
              {/* Voorkant */}
              <Box
                sx={{
                  position: 'relative',
                  width: { xs: '150px', sm: '180px', md: '200px' },
                  height: { xs: '225px', sm: '270px', md: '300px' },
                  minWidth: { xs: '150px', sm: '180px', md: '200px' },
                  borderRadius: '8px',
                  overflow: 'hidden',
                  flexShrink: 0,
                }}
              >
                {/* Base body outline */}
                <Box
                  component="img"
                  src={BodyFrontSvg}
                  alt="body front"
                  sx={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    objectFit: 'contain',
                    pointerEvents: 'none',
                    zIndex: 1,
                  }}
                />
                
                {/* Visuele overlay voor spiergroepen - gebruik Level 1 SVG alleen als het voorkant spiergroepen zijn */}
                {displayedMuscleGroups
                  .filter(muscle => frontMuscleGroups.includes(muscle) && frontMuscleToSvg[muscle])
                  .map((muscle, index) => (
                    <Box
                      key={`front-${muscle}-${index}`}
                      component="img"
                      src={frontMuscleToSvg[muscle]}
                      alt={muscle}
                      sx={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        objectFit: 'contain',
                        pointerEvents: 'none',
                        zIndex: 2 + index,
                      }}
                    />
                  ))}
                
                <Typography variant="caption" sx={{ position: 'absolute', bottom: -20, left: '50%', transform: 'translateX(-50%)', whiteSpace: 'nowrap', zIndex: 3 }}>
                  Voorkant
                </Typography>
              </Box>

              {/* Achterkant */}
              <Box
                sx={{
                  position: 'relative',
                  width: { xs: '150px', sm: '180px', md: '200px' },
                  height: { xs: '225px', sm: '270px', md: '300px' },
                  minWidth: { xs: '150px', sm: '180px', md: '200px' },
                  borderRadius: '8px',
                  overflow: 'hidden',
                  flexShrink: 0,
                }}
              >
                {/* Base body outline */}
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
                    pointerEvents: 'none',
                    zIndex: 1,
                  }}
                />
                
                {/* Visuele overlay voor spiergroepen - gebruik Level 1 SVG alleen als het achterkant spiergroepen zijn */}
                {displayedMuscleGroups
                  .filter(muscle => backMuscleGroups.includes(muscle) && backMuscleToSvg[muscle])
                  .map((muscle, index) => (
                    <Box
                      key={`back-${muscle}-${index}`}
                      component="img"
                      src={backMuscleToSvg[muscle]}
                      alt={muscle}
                      sx={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        objectFit: 'contain',
                        pointerEvents: 'none',
                        zIndex: 2 + index,
                      }}
                    />
                  ))}
                
                <Typography variant="caption" sx={{ position: 'absolute', bottom: -20, left: '50%', transform: 'translateX(-50%)', whiteSpace: 'nowrap', zIndex: 3 }}>
                  Achterkant
                </Typography>
              </Box>
            </Box>

          <Box sx={{ display: 'flex', gap: 2, mt: 3, justifyContent: 'flex-end' }}>
            {/* @ts-ignore - Material Web Components are web components */}
            <md-text-button ref={cancelButtonRef}>
              Wissen
            </md-text-button>
            {/* @ts-ignore - Material Web Components are web components */}
            <md-filled-button ref={addButtonRef}>
              {/* @ts-ignore */}
              <md-icon slot="start">add</md-icon>
              Toevoegen
            </md-filled-button>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
};
