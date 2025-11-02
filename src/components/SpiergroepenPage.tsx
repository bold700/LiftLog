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
import { exerciseDatabase } from '../data/exercises';

export const SpiergroepenPage = () => {
  // Nieuwe inzichten: categorieën, bewegingstypes, push/pull ratio
  const insights = useMemo(() => {
    const exercises = getAllExercises();
    
    // Tel categorieën (in plaats van spiergroepen)
    const categoryCounts: Record<string, number> = {};
    const movementTypeCounts: Record<string, number> = {};
    let pushCount = 0;
    let pullCount = 0;
    const unmatchedExercises: string[] = [];
    
    exercises.forEach(exercise => {
      // Vind categorie uit exerciseDatabase
      const exerciseData = exerciseDatabase.find(ex => ex.name === exercise.name);
      if (exerciseData) {
        // Tel categorie
        categoryCounts[exerciseData.category] = (categoryCounts[exerciseData.category] || 0) + 1;
      }
      
      // Gebruik metadata voor movement types en push/pull
      const metadata = findExerciseMetadata(exercise.name);
      if (metadata) {
        // Tel bewegingstypes
        movementTypeCounts[metadata.movementType] = (movementTypeCounts[metadata.movementType] || 0) + 1;
        
        // Tel push/pull
        if (metadata.movementType === 'Push') pushCount++;
        if (metadata.movementType === 'Pull') pullCount++;
      } else {
        if (!exerciseData) {
          unmatchedExercises.push(exercise.name);
        }
      }
    });
    
    // Sorteer categorieën op frequentie
    const topCategories = Object.entries(categoryCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([category, count]) => ({ muscle: category, count }));
    
    // Bereken push/pull ratio
    const totalPushPull = pushCount + pullCount;
    const pushPullRatio = totalPushPull > 0 
      ? {
          push: Math.round((pushCount / totalPushPull) * 100),
          pull: Math.round((pullCount / totalPushPull) * 100),
        }
      : null;
    
    return {
      topPrimaryMuscles: topCategories,
      topSecondaryMuscles: [],
      movementTypeCounts,
      pushPullRatio,
      pushCount,
      pullCount,
      totalExercises: exercises.length,
      exercisesWithMetadata: exercises.filter(ex => findExerciseMetadata(ex.name) !== null).length,
    };
  }, []);

  // Kleuren voor pie charts
  const COLORS_PRIMARY = ['#4E6543', '#5D7A51', '#6C8F5F', '#7BA46D', '#8AB97B'];
  const COLORS_PUSH_PULL = ['#4E6543', '#6C8F5F'];
  const COLORS_MOVEMENT = ['#4E6543', '#5D7A51', '#6C8F5F', '#7BA46D'];

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

          {/* Primaire Spiergroepen Pie Chart */}
          {insights.topPrimaryMuscles.length > 0 && (
            <Card sx={{ mb: 3, backgroundColor: 'transparent', borderRadius: '16px', border: '1px solid #D2C5B4' }} elevation={0}>
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  Meest Getrainde Oefening Groepen
                </Typography>
                <Box sx={{ width: '100%', height: 200, mt: 2 }}>
                  <ResponsiveContainer>
                    <PieChart>
                      <Pie
                        data={insights.topPrimaryMuscles.slice(0, 5).map(({ muscle, count }) => ({
                          name: muscle,
                          value: count,
                        }))}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, value }) => `${name} ${value}x`}
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
              </CardContent>
            </Card>
          )}

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
                        labelLine={false}
                        label={({ name, value }) => `${name} ${value}%`}
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
                        labelLine={false}
                        label={({ name, value }) => `${name} ${value}x`}
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

