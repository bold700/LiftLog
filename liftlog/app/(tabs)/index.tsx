import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useWorkoutStore } from '../../src/store/useWorkout';
import { SetCard } from '../../src/components/SetCard';
import { PRBadge } from '../../src/components/PRBadge';
import { Empty } from '../../src/components/Empty';
import { i18n } from '../../src/i18n';
import { formatWeight, convertWeight } from '../../src/utils/unitConversion';
import { format } from 'date-fns';
import { nl, enUS } from 'date-fns/locale';

export default function TodayScreen() {
  const {
    currentSession,
    currentSets,
    exercises,
    profile,
    startSession,
    addSet,
    undoLastSet,
    finishSession,
    getLastSetForExercise,
  } = useWorkoutStore();

  const [showSetCard, setShowSetCard] = useState(false);
  const [selectedExerciseId, setSelectedExerciseId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [previousSet, setPreviousSet] = useState<any>(null);

  const unit = profile?.unit || 'kg';
  const dateLocale = i18n.getCurrentLocale() === 'nl' ? nl : enUS;

  const handleStartWorkout = async () => {
    if (!profile) return;
    setLoading(true);
    try {
      await startSession(profile.id);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectExercise = async (exerciseId: string) => {
    setSelectedExerciseId(exerciseId);
    const lastSet = await getLastSetForExercise(exerciseId);
    setPreviousSet(lastSet);
    setShowSetCard(true);
  };

  const handleSaveSet = async (weight: number, reps: number, rpe?: number) => {
    if (!currentSession || !selectedExerciseId) return;

    setLoading(true);
    try {
      await addSet({
        session_id: currentSession.id,
        exercise_id: selectedExerciseId,
        weight_kg: weight,
        reps,
        rpe,
      });
      setShowSetCard(false);
      setSelectedExerciseId(null);
      setPreviousSet(null);
    } finally {
      setLoading(false);
    }
  };

  const handleFinishWorkout = async () => {
    if (!currentSession) return;
    setLoading(true);
    try {
      await finishSession();
    } finally {
      setLoading(false);
    }
  };

  const getExerciseName = (exerciseId: string) => {
    return exercises.find((e) => e.id === exerciseId)?.name || 'Unknown';
  };

  const getSetsByExercise = () => {
    const grouped = currentSets.reduce((acc, set) => {
      if (!acc[set.exercise_id]) {
        acc[set.exercise_id] = [];
      }
      acc[set.exercise_id].push(set);
      return acc;
    }, {} as Record<string, typeof currentSets>);

    return Object.entries(grouped).map(([exerciseId, sets]) => ({
      exerciseId,
      sets,
      name: getExerciseName(exerciseId),
    }));
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {!currentSession ? (
          <View style={styles.emptyState}>
            <Text style={styles.welcomeText}>{i18n.t('today')}</Text>
            <Text style={styles.subtitle}>
              {format(new Date(), 'EEEE d MMMM', { locale: dateLocale })}
            </Text>
            <TouchableOpacity
              style={styles.startButton}
              onPress={handleStartWorkout}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#0B0F14" />
              ) : (
                <Text style={styles.startButtonText}>{i18n.t('start_workout')}</Text>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <View style={styles.sessionHeader}>
              <Text style={styles.sessionTitle}>
                {i18n.t('today')} • {format(new Date(currentSession.started_at), 'HH:mm', { locale: dateLocale })}
              </Text>
              <TouchableOpacity
                style={styles.finishButton}
                onPress={handleFinishWorkout}
                disabled={loading}
              >
                <Text style={styles.finishButtonText}>{i18n.t('finish_workout')}</Text>
              </TouchableOpacity>
            </View>

            {currentSets.length === 0 ? (
              <Empty message={i18n.t('no_sets')} />
            ) : (
              <View style={styles.setsContainer}>
                {getSetsByExercise().map((group) => (
                  <View key={group.exerciseId} style={styles.exerciseGroup}>
                    <Text style={styles.exerciseName}>{group.name}</Text>
                    {group.sets.map((set) => (
                      <View key={set.id} style={styles.setRow}>
                        <Text style={styles.setText}>
                          {formatWeight(set.weight_kg, unit)} × {set.reps}
                          {set.rpe && ` @${set.rpe}`}
                        </Text>
                        <PRBadge isPR={set.is_pr} />
                      </View>
                    ))}
                  </View>
                ))}
              </View>
            )}

            <View style={styles.actions}>
              {currentSets.length > 0 && (
                <TouchableOpacity
                  style={styles.undoButton}
                  onPress={undoLastSet}
                  disabled={loading}
                >
                  <Text style={styles.undoButtonText}>{i18n.t('undo_last_set')}</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={styles.addButton}
                onPress={() => {
                  // Show exercise picker
                  setShowSetCard(true);
                }}
              >
                <Text style={styles.addButtonText}>{i18n.t('add_set')}</Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        <Modal
          visible={showSetCard}
          animationType="slide"
          transparent
          onRequestClose={() => setShowSetCard(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              {!selectedExerciseId ? (
                <ScrollView>
                  <Text style={styles.modalTitle}>{i18n.t('exercises')}</Text>
                  {exercises.map((exercise) => (
                    <TouchableOpacity
                      key={exercise.id}
                      style={styles.exerciseOption}
                      onPress={() => handleSelectExercise(exercise.id)}
                    >
                      <Text style={styles.exerciseOptionText}>{exercise.name}</Text>
                    </TouchableOpacity>
                  ))}
                  <TouchableOpacity
                    style={styles.cancelModalButton}
                    onPress={() => setShowSetCard(false)}
                  >
                    <Text style={styles.cancelModalText}>{i18n.t('cancel')}</Text>
                  </TouchableOpacity>
                </ScrollView>
              ) : (
                <SetCard
                  exerciseId={selectedExerciseId}
                  previousSet={previousSet}
                  onSave={handleSaveSet}
                  onCancel={() => {
                    setShowSetCard(false);
                    setSelectedExerciseId(null);
                    setPreviousSet(null);
                  }}
                />
              )}
            </View>
          </View>
        </Modal>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B0F14',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 64,
  },
  welcomeText: {
    color: '#F3F4F6',
    fontSize: 32,
    fontWeight: '700',
    marginBottom: 8,
  },
  subtitle: {
    color: '#9CA3AF',
    fontSize: 18,
    marginBottom: 32,
    textTransform: 'capitalize',
  },
  startButton: {
    backgroundColor: '#00D3FF',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 12,
    minWidth: 200,
    alignItems: 'center',
  },
  startButtonText: {
    color: '#0B0F14',
    fontSize: 18,
    fontWeight: '700',
  },
  sessionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  sessionTitle: {
    color: '#F3F4F6',
    fontSize: 20,
    fontWeight: '600',
  },
  finishButton: {
    backgroundColor: '#374151',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  finishButtonText: {
    color: '#F3F4F6',
    fontSize: 14,
    fontWeight: '600',
  },
  setsContainer: {
    marginBottom: 24,
  },
  exerciseGroup: {
    backgroundColor: '#111827',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  exerciseName: {
    color: '#00D3FF',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  setRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  setText: {
    color: '#F3F4F6',
    fontSize: 16,
  },
  actions: {
    gap: 12,
  },
  undoButton: {
    backgroundColor: '#374151',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  undoButtonText: {
    color: '#9CA3AF',
    fontSize: 16,
    fontWeight: '600',
  },
  addButton: {
    backgroundColor: '#00D3FF',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  addButtonText: {
    color: '#0B0F14',
    fontSize: 16,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#111827',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 16,
    maxHeight: '80%',
  },
  modalTitle: {
    color: '#F3F4F6',
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 16,
  },
  exerciseOption: {
    backgroundColor: '#1F2937',
    padding: 16,
    borderRadius: 8,
    marginBottom: 8,
  },
  exerciseOptionText: {
    color: '#F3F4F6',
    fontSize: 16,
  },
  cancelModalButton: {
    marginTop: 16,
    padding: 16,
    alignItems: 'center',
  },
  cancelModalText: {
    color: '#9CA3AF',
    fontSize: 16,
  },
});


