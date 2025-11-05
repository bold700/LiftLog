import { useMemo } from 'react';
import {
  Card,
  CardContent,
  Typography,
  Box,
} from '@mui/material';
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { getAllExercises } from '../utils/storage';
import { findExerciseMetadata } from '../data/exerciseMetadata';
import { MuscleFrequencyBody, GREEN_TINTS } from './MuscleFrequencyBody';

// Helper functie om spiergroep naam te normaliseren (zelfde als in MuscleFrequencyBody)
const normalizeMuscleName = (muscleName: string): string => {
  const normalized = muscleName.toLowerCase().trim();
  
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

// Helper functie om weergave naam te krijgen (zelfde als in MuscleFrequencyBody)
const getDisplayName = (muscleName: string): string => {
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

export const SpiergroepenPage = () => {
  // Nieuwe inzichten: gebruik primaryMuscles uit metadata (zelfde als MuscleFrequencyBody)
  const insights = useMemo(() => {
    const exercises = getAllExercises();
    
    // Tel primary muscles (zelfde als MuscleFrequencyBody)
    const muscleCounts: Record<string, number> = {};
    const movementTypeCounts: Record<string, number> = {};
    let pushCount = 0;
    let pullCount = 0;
    
    exercises.forEach(exercise => {
      const metadata = findExerciseMetadata(exercise.name);
      if (metadata) {
        // Tel primary muscles (zelfde logica als MuscleFrequencyBody)
        if (metadata.primaryMuscles) {
          metadata.primaryMuscles.forEach(muscle => {
            const normalized = normalizeMuscleName(muscle);
            muscleCounts[normalized] = (muscleCounts[normalized] || 0) + 1;
          });
        }
        
        // Tel bewegingstypes
        movementTypeCounts[metadata.movementType] = (movementTypeCounts[metadata.movementType] || 0) + 1;
        
        // Tel push/pull
        if (metadata.movementType === 'Push') pushCount++;
        if (metadata.movementType === 'Pull') pullCount++;
      }
    });
    
    // Sorteer spiergroepen op frequentie en map naar display namen
    const topMuscles = Object.entries(muscleCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([muscle, count]) => ({ muscle: getDisplayName(muscle), count }));
    
    // Bereken push/pull ratio
    const totalPushPull = pushCount + pullCount;
    const pushPullRatio = totalPushPull > 0 
      ? {
          push: Math.round((pushCount / totalPushPull) * 100),
          pull: Math.round((pullCount / totalPushPull) * 100),
        }
      : null;
    
    return {
      topPrimaryMuscles: topMuscles,
      topSecondaryMuscles: [],
      movementTypeCounts,
      pushPullRatio,
      pushCount,
      pullCount,
      totalExercises: exercises.length,
      exercisesWithMetadata: exercises.filter(ex => findExerciseMetadata(ex.name) !== null).length,
    };
  }, []);

  // Kleuren voor pie charts - gebruik dezelfde kleuren als de level SVG's
  const COLORS_PRIMARY = GREEN_TINTS; // ['#D0EABF', '#A5C392', '#799A64', '#4B6738', '#293B1D']
  const COLORS_PUSH_PULL = [GREEN_TINTS[4], GREEN_TINTS[2]]; // Level 5 en Level 3
  const COLORS_MOVEMENT = [GREEN_TINTS[4], GREEN_TINTS[3], GREEN_TINTS[2], GREEN_TINTS[1]]; // Level 5, 4, 3, 2

  return (
    <Box sx={{ maxWidth: 1200, mx: 'auto', pb: 10 }}>
      {/* Logo bovenaan */}
      <Box sx={{ display: 'flex', justifyContent: 'center', mb: 4 }}>
        <Box
          component="svg"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 1260.31 837.16"
          sx={{
            height: { xs: 60, sm: 80 },
            width: 'auto',
            color: 'text.primary',
          }}
        >
          <path
            fill="currentColor"
            d="M1260.31,837.16,887,0H746L445.75,673.28,145.49,0H0L373,836.4l-.34.76H518.84l-.34-.76,85.21-195,423.83,4,87.27,191.81ZM665.08,507.72l151.41-339.5,151.4,339.5Z"
          />
        </Box>
      </Box>

      {/* Spiergroep Inzichten */}
      <Card sx={{ mb: 3, backgroundColor: '#FEF2E5', borderRadius: '16px' }} elevation={0}>
        <CardContent>
          <Typography variant="h5" gutterBottom sx={{ mb: 3, fontWeight: 600 }}>
            Spiergroep Inzichten
          </Typography>

          {/* Body SVG en Pie Chart in één card */}
          <Card sx={{ mb: 3, backgroundColor: 'transparent', borderRadius: '16px', border: '1px solid #D2C5B4' }} elevation={0}>
            <CardContent sx={{ '&:last-child': { pb: 2 }, pt: 2, px: 2 }}>
              <Typography variant="h6" gutterBottom sx={{ mb: 2 }}>
                Meest Getrainde Spiergroepen
              </Typography>
              
              {/* Body SVG */}
              <Box sx={{ mb: 0, pb: 0, lineHeight: 0, display: 'flex', justifyContent: 'center' }}>
                <MuscleFrequencyBody />
              </Box>
              
              {/* Pie Chart */}
              {insights.topPrimaryMuscles.length > 0 && (
                <Box sx={{ width: '100%', height: 200, mt: '-40px', pt: 0 }}>
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie
                        data={insights.topPrimaryMuscles.slice(0, 5).map(({ muscle, count }) => ({
                          name: muscle,
                          value: count,
                        }))}
                        cx="50%"
                        cy="50%"
                        labelLine={{ stroke: '#3D532E', strokeWidth: 1 }}
                        label={({ name, value, cx, cy, midAngle, outerRadius }) => {
                          const RADIAN = Math.PI / 180;
                          const radius = outerRadius + 20;
                          const x = cx + radius * Math.cos(-midAngle * RADIAN);
                          const y = cy + radius * Math.sin(-midAngle * RADIAN);
                          return (
                            <text
                              x={x}
                              y={y}
                              fill="#3D532E"
                              textAnchor={x > cx ? 'start' : 'end'}
                              dominantBaseline="central"
                              style={{ fontSize: '12px', fontWeight: 500 }}
                            >
                              {`${name} ${value}x`}
                            </text>
                          );
                        }}
                        outerRadius={60}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {insights.topPrimaryMuscles.slice(0, 5).map((_, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS_PRIMARY[index % COLORS_PRIMARY.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </Box>
              )}
            </CardContent>
          </Card>

          {/* Push/Pull Ratio Pie Chart */}
          {insights.pushPullRatio && (insights.pushPullRatio.push > 0 || insights.pushPullRatio.pull > 0) && (
            <Card sx={{ mb: 3, backgroundColor: 'transparent', borderRadius: '16px', border: '1px solid #D2C5B4' }} elevation={0}>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Push/Pull Ratio
                </Typography>
                <Box sx={{ width: '100%', height: 200, mt: 2 }}>
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie
                        data={[
                          { name: 'Push', value: insights.pushPullRatio.push },
                          { name: 'Pull', value: insights.pushPullRatio.pull },
                        ]}
                        cx="50%"
                        cy="50%"
                        labelLine={{ stroke: '#3D532E', strokeWidth: 1 }}
                        label={({ name, value, cx, cy, midAngle, outerRadius }) => {
                          const RADIAN = Math.PI / 180;
                          const radius = outerRadius + 20;
                          const x = cx + radius * Math.cos(-midAngle * RADIAN);
                          const y = cy + radius * Math.sin(-midAngle * RADIAN);
                          return (
                            <text
                              x={x}
                              y={y}
                              fill="#3D532E"
                              textAnchor={x > cx ? 'start' : 'end'}
                              dominantBaseline="central"
                              style={{ fontSize: '12px', fontWeight: 500 }}
                            >
                              {`${name} ${value}%`}
                            </text>
                          );
                        }}
                        outerRadius={60}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {[
                          { name: 'Push', value: insights.pushPullRatio.push },
                          { name: 'Pull', value: insights.pushPullRatio.pull },
                        ].map((_, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS_PUSH_PULL[index % COLORS_PUSH_PULL.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </Box>
              </CardContent>
            </Card>
          )}

          {/* Bewegingstype Verdeling Pie Chart */}
          {Object.keys(insights.movementTypeCounts).length > 0 && (
            <Card sx={{ mb: 3, backgroundColor: 'transparent', borderRadius: '16px', border: '1px solid #D2C5B4' }} elevation={0}>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Bewegingstype Verdeling
                </Typography>
                <Box sx={{ width: '100%', height: 200, mt: 2 }}>
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie
                        data={Object.entries(insights.movementTypeCounts)
                          .sort(([, a], [, b]) => b - a)
                          .map(([type, count]) => ({
                            name: type,
                            value: count,
                          }))}
                        cx="50%"
                        cy="50%"
                        labelLine={{ stroke: '#3D532E', strokeWidth: 1 }}
                        label={({ name, value, cx, cy, midAngle, outerRadius }) => {
                          const RADIAN = Math.PI / 180;
                          const radius = outerRadius + 20;
                          const x = cx + radius * Math.cos(-midAngle * RADIAN);
                          const y = cy + radius * Math.sin(-midAngle * RADIAN);
                          return (
                            <text
                              x={x}
                              y={y}
                              fill="#3D532E"
                              textAnchor={x > cx ? 'start' : 'end'}
                              dominantBaseline="central"
                              style={{ fontSize: '12px', fontWeight: 500 }}
                            >
                              {`${name} ${value}x`}
                            </text>
                          );
                        }}
                        outerRadius={60}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {Object.entries(insights.movementTypeCounts)
                          .sort(([, a], [, b]) => b - a)
                          .map((_, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS_MOVEMENT[index % COLORS_MOVEMENT.length]} />
                          ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </Box>
              </CardContent>
            </Card>
          )}
        </CardContent>
      </Card>
    </Box>
  );
};

