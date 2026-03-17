import { useMemo } from 'react';
import { Typography, Box } from '@mui/material';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { getAllExercises } from '../utils/storage';
import { findExerciseMetadata } from '../data/exerciseMetadata';
import { normalizeMuscleName, getDisplayName } from '../utils/muscleNames';
import { MuscleFrequencyBody, GREEN_TINTS } from './MuscleFrequencyBody';
import { PageLayout, ContentCard, OutlineCard, PageTitle } from './layout';

export const SpiergroepenPage = () => {
  const insights = useMemo(() => {
    const exercises = getAllExercises();
    
    // Tel primary muscles (zelfde als MuscleFrequencyBody)
    const muscleCounts: Record<string, number> = {};
    const movementTypeCounts: Record<string, number> = {};
    let pushCount = 0;
    let pullCount = 0;
    
    exercises.forEach(exercise => {
      // Sla oefeningen zonder naam over (alleen notities)
      if (!exercise.name) return;
      
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
      exercisesWithMetadata: exercises.filter(ex => ex.name && findExerciseMetadata(ex.name) !== null).length,
    };
  }, []);

  // Kleuren voor pie charts - gebruik dezelfde kleuren als de level SVG's
  const COLORS_PRIMARY = GREEN_TINTS; // ['#D0EABF', '#A5C392', '#799A64', '#4B6738', '#293B1D']
  const COLORS_PUSH_PULL = [GREEN_TINTS[4], GREEN_TINTS[2]]; // Level 5 en Level 3
  const COLORS_MOVEMENT = [GREEN_TINTS[4], GREEN_TINTS[3], GREEN_TINTS[2], GREEN_TINTS[1]]; // Level 5, 4, 3, 2

  return (
    <PageLayout>
      <ContentCard>
        <PageTitle>Inzichten</PageTitle>

        <OutlineCard sx={{ '& .MuiCardContent-root': { pt: 2, px: 2 } }}>
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
        </OutlineCard>

        {insights.pushPullRatio && (insights.pushPullRatio.push > 0 || insights.pushPullRatio.pull > 0) && (
          <OutlineCard>
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
          </OutlineCard>
        )}

        {Object.keys(insights.movementTypeCounts).length > 0 && (
          <OutlineCard>
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
          </OutlineCard>
        )}
      </ContentCard>
    </PageLayout>
  );
};

