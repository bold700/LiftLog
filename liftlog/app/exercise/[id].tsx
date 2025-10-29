import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useWorkoutStore } from '../../src/store/useWorkout';
import { SetCard } from '../../src/components/SetCard';
import { PRBadge } from '../../src/components/PRBadge';
import { Chart } from '../../src/components/Chart';
import { Empty } from '../../src/components/Empty';
import { i18n } from '../../src/i18n';
import { formatWeight } from '../../src/utils/unitConversion';
import { calculate1RM } from '../../src/utils/oneRM';
import { getMaxForExercise } from '../../src/utils/pr';
import { format } from 'date-fns';

export default function ExerciseDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { exercises, profile, getSetsForExercise, getLastSetForExercise, addSet, currentSession } = useWorkoutStore();
  
  const [sets, setSets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showSetCard, setShowSetCard] = useState(false);
  const [previousSet, setPreviousSet] = useState<any>(null);

  const exercise = exercises.find((e) => e.id === id);
  const unit = profile?.unit || 'kg';

  useEffect(() => {
    loadSets();
  }, [id]);

  const loadSets = async () => {
    if (!id) return;
    setLoading(true);
    try {
      const exerciseSets = await getSetsForExercise(id);
      setSets(exerciseSets);
      const lastSet = await getLastSetForExercise(id);
      setPreviousSet(lastSet);
    } finally {
      setLoading(false);
    }
  };

  const handleAddSet = async (weight: number, reps: number, rpe?: number) => {
    if (!currentSession || !id) {
      // Start session first
      if (profile) {
        await useWorkoutStore.getState().startSession(profile.id);
        const newSession = useWorkoutStore.getState().currentSession;
        if (newSession) {
          await useWorkoutStore.getState().addSet({
            session_id: newSession.id,
            exercise_id: id,
            weight_kg: weight,
            reps,
            rpe,
          });
        }
      }
    } else {
      await addSet({
        session_id: currentSession.id,
        exercise_id: id,
        weight_kg: weight,
        reps,
        rpe,
      });
    }
    setShowSetCard(false);
    await loadSets();
  };

  if (!exercise) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.backButton}>←</Text>
          </TouchableOpacity>
        </View>
        <Empty message={i18n.t('no_data')} />
      </SafeAreaView>
    );
  }

  const { maxWeight, maxReps } = getMaxForExercise(sets);
  const maxSet = sets.find((s) => s.weight_kg === maxWeight && s.reps === maxReps);
  const latest5Sets = sets.slice(0, 5);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.backButton}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{exercise.name}</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color="#00D3FF" />
        </View>
      ) : (
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
          {/* Stats */}
          <View style={styles.statsContainer}>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Max Gewicht</Text>
              <Text style={styles.statValue}>
                {maxWeight > 0 ? formatWeight(maxWeight, unit) : '-'}
              </Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Max Reps</Text>
              <Text style={styles.statValue}>{maxReps > 0 ? maxReps : '-'}</Text>
            </View>
            {maxSet && (
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>{i18n.t('est')} 1RM</Text>
                <Text style={styles.statValue}>
                  {formatWeight(calculate1RM(maxSet.weight_kg, maxSet.reps), unit)}
                </Text>
              </View>
            )}
          </View>

          {/* Charts */}
          {sets.length > 0 && (
            <>
              <Text style={styles.sectionTitle}>{i18n.t('load_chart')}</Text>
              <Chart data={sets} type="load" unit={unit} />
              <Text style={styles.sectionTitle}>{i18n.t('volume_chart')}</Text>
              <Chart data={sets} type="volume" unit={unit} />
            </>
          )}

          {/* Last 5 Sessions */}
          <Text style={styles.sectionTitle}>{i18n.t('last_5_sessions')}</Text>
          {latest5Sets.length === 0 ? (
            <Empty message={i18n.t('no_sets')} />
          ) : (
            <View style={styles.setsList}>
              {latest5Sets.map((set) => (
                <View key={set.id} style={styles.setRow}>
                  <View style={styles.setInfo}>
                    <Text style={styles.setText}>
                      {formatWeight(set.weight_kg, unit)} × {set.reps}
                      {set.rpe && ` @${set.rpe}`}
                    </Text>
                    <Text style={styles.setDate}>
                      {format(new Date(set.performed_at), 'dd MMM yyyy HH:mm')}
                    </Text>
                  </View>
                  <PRBadge isPR={set.is_pr} />
                </View>
              ))}
            </View>
          )}

          {/* Add Set Button */}
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => setShowSetCard(true)}
          >
            <Text style={styles.addButtonText}>{i18n.t('add_set')}</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      {/* Set Card Modal */}
      {showSetCard && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <SetCard
              exerciseId={id}
              previousSet={previousSet}
              onSave={handleAddSet}
              onCancel={() => setShowSetCard(false)}
            />
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B0F14',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  backButton: {
    color: '#00D3FF',
    fontSize: 24,
    fontWeight: '700',
    width: 40,
  },
  headerTitle: {
    color: '#F3F4F6',
    fontSize: 20,
    fontWeight: '600',
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
  statsContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#111827',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  statLabel: {
    color: '#9CA3AF',
    fontSize: 12,
    marginBottom: 8,
  },
  statValue: {
    color: '#00D3FF',
    fontSize: 20,
    fontWeight: '700',
  },
  sectionTitle: {
    color: '#F3F4F6',
    fontSize: 18,
    fontWeight: '600',
    marginTop: 24,
    marginBottom: 12,
  },
  setsList: {
    backgroundColor: '#111827',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  setRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1F2937',
  },
  setInfo: {
    flex: 1,
  },
  setText: {
    color: '#F3F4F6',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  setDate: {
    color: '#6B7280',
    fontSize: 12,
  },
  addButton: {
    backgroundColor: '#00D3FF',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 24,
  },
  addButtonText: {
    color: '#0B0F14',
    fontSize: 16,
    fontWeight: '700',
  },
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#111827',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
  },
});


