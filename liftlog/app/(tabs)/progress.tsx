import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useWorkoutStore } from '../../src/store/useWorkout';
import { Chart } from '../../src/components/Chart';
import { Empty } from '../../src/components/Empty';
import { PRBadge } from '../../src/components/PRBadge';
import { i18n } from '../../src/i18n';
import { formatWeight } from '../../src/utils/unitConversion';
import { calculate1RM } from '../../src/utils/oneRM';
import { format } from 'date-fns';

export default function ProgressScreen() {
  const { exercises, profile } = useWorkoutStore();
  const [allSets, setAllSets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const unit = profile?.unit || 'kg';

  useEffect(() => {
    loadAllSets();
  }, [exercises]);

  const loadAllSets = async () => {
    setLoading(true);
    try {
      const { getSetsForExercise } = useWorkoutStore.getState();
      const allSetsPromises = exercises.map((ex) => getSetsForExercise(ex.id));
      const setsArrays = await Promise.all(allSetsPromises);
      const flatSets = setsArrays.flat();
      setAllSets(flatSets.sort((a, b) => 
        new Date(b.performed_at).getTime() - new Date(a.performed_at).getTime()
      ));
    } finally {
      setLoading(false);
    }
  };

  const prSets = allSets.filter((set) => set.is_pr);
  const setsByExercise = exercises.reduce((acc, exercise) => {
    const exerciseSets = allSets.filter((s) => s.exercise_id === exercise.id);
    if (exerciseSets.length > 0) {
      acc[exercise.id] = {
        exercise,
        sets: exerciseSets,
      };
    }
    return acc;
  }, {} as Record<string, { exercise: any; sets: any[] }>);

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loading}>
          <ActivityIndicator size="large" color="#00D3FF" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {/* Overall Progress Chart */}
        {allSets.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>{i18n.t('load_chart')}</Text>
            <Chart data={allSets} type="load" unit={unit} />
            <Text style={styles.sectionTitle}>{i18n.t('volume_chart')}</Text>
            <Chart data={allSets} type="volume" unit={unit} />
          </>
        )}

        {/* PRs */}
        <Text style={styles.sectionTitle}>{i18n.t('prs')}</Text>
        {prSets.length === 0 ? (
          <Empty message={i18n.t('no_data')} />
        ) : (
          <View style={styles.prContainer}>
            {prSets.slice(0, 10).map((set) => {
              const exercise = exercises.find((e) => e.id === set.exercise_id);
              return (
                <View key={set.id} style={styles.prCard}>
                  <View style={styles.prInfo}>
                    <Text style={styles.prExerciseName}>{exercise?.name || 'Unknown'}</Text>
                    <Text style={styles.prSetInfo}>
                      {formatWeight(set.weight_kg, unit)} × {set.reps}
                      {set.rpe && ` @${set.rpe}`}
                    </Text>
                    <Text style={styles.prDate}>
                      {format(new Date(set.performed_at), 'dd MMM yyyy')}
                    </Text>
                  </View>
                  <PRBadge isPR={true} />
                </View>
              );
            })}
          </View>
        )}

        {/* Exercise Progress */}
        {Object.entries(setsByExercise).length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Progressie per Oefening</Text>
            {Object.entries(setsByExercise).map(([exerciseId, data]) => {
              const maxSet = data.sets.reduce((max, set) => {
                const currentMax = max.weight_kg * max.reps;
                const setMax = set.weight_kg * set.reps;
                return setMax > currentMax ? set : max;
              });

              return (
                <View key={exerciseId} style={styles.exerciseProgressCard}>
                  <Text style={styles.exerciseProgressName}>{data.exercise.name}</Text>
                  <View style={styles.exerciseProgressStats}>
                    <View>
                      <Text style={styles.exerciseProgressLabel}>Max Set</Text>
                      <Text style={styles.exerciseProgressValue}>
                        {formatWeight(maxSet.weight_kg, unit)} × {maxSet.reps}
                      </Text>
                      <Text style={styles.exerciseProgress1RM}>
                        {i18n.t('est')} 1RM: {formatWeight(calculate1RM(maxSet.weight_kg, maxSet.reps), unit)}
                      </Text>
                    </View>
                    <View>
                      <Text style={styles.exerciseProgressLabel}>Totaal Sets</Text>
                      <Text style={styles.exerciseProgressValue}>{data.sets.length}</Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </>
        )}

        {allSets.length === 0 && (
          <Empty message={i18n.t('no_data')} />
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B0F14',
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
  },
  sectionTitle: {
    color: '#F3F4F6',
    fontSize: 20,
    fontWeight: '700',
    marginTop: 24,
    marginBottom: 12,
  },
  prContainer: {
    gap: 12,
  },
  prCard: {
    backgroundColor: '#111827',
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  prInfo: {
    flex: 1,
  },
  prExerciseName: {
    color: '#00D3FF',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  prSetInfo: {
    color: '#F3F4F6',
    fontSize: 16,
    marginBottom: 4,
  },
  prDate: {
    color: '#6B7280',
    fontSize: 12,
  },
  exerciseProgressCard: {
    backgroundColor: '#111827',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  exerciseProgressName: {
    color: '#F3F4F6',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  exerciseProgressStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  exerciseProgressLabel: {
    color: '#9CA3AF',
    fontSize: 12,
    marginBottom: 4,
  },
  exerciseProgressValue: {
    color: '#00D3FF',
    fontSize: 16,
    fontWeight: '700',
  },
  exerciseProgress1RM: {
    color: '#6B7280',
    fontSize: 12,
    marginTop: 4,
  },
});


