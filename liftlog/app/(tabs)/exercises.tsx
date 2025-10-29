import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useWorkoutStore } from '../../src/store/useWorkout';
import { ExerciseRow } from '../../src/components/ExerciseRow';
import { Empty } from '../../src/components/Empty';
import { PRBadge } from '../../src/components/PRBadge';
import { i18n } from '../../src/i18n';
import { formatWeight } from '../../src/utils/unitConversion';
import { MuscleGroup } from '../../src/types';
import { getMaxForExercise } from '../../src/utils/pr';

const MUSCLE_GROUPS: { value: MuscleGroup; label: string }[] = [
  { value: 'legs', label: i18n.t('legs') },
  { value: 'push', label: i18n.t('push') },
  { value: 'pull', label: i18n.t('pull') },
  { value: 'core', label: i18n.t('core') },
  { value: 'other', label: i18n.t('other') },
];

export default function ExercisesScreen() {
  const router = useRouter();
  const { exercises, profile, createExercise, getSetsForExercise, getLastSetForExercise } = useWorkoutStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMuscle, setFilterMuscle] = useState<MuscleGroup | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newExerciseName, setNewExerciseName] = useState('');
  const [newExerciseMuscle, setNewExerciseMuscle] = useState<MuscleGroup>('other');
  const [loading, setLoading] = useState(false);
  const [exerciseLastSets, setExerciseLastSets] = useState<Record<string, any>>({});

  const unit = profile?.unit || 'kg';

  useEffect(() => {
    loadLastSets();
  }, [exercises]);

  const loadLastSets = async () => {
    const lastSets: Record<string, any> = {};
    for (const exercise of exercises) {
      const lastSet = await getLastSetForExercise(exercise.id);
      if (lastSet) {
        lastSets[exercise.id] = lastSet;
      }
    }
    setExerciseLastSets(lastSets);
  };

  const filteredExercises = exercises.filter((exercise) => {
    const matchesSearch = exercise.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesMuscle = !filterMuscle || exercise.muscle_group === filterMuscle;
    return matchesSearch && matchesMuscle;
  });

  const handleCreateExercise = async () => {
    if (!newExerciseName.trim() || !profile) return;

    setLoading(true);
    try {
      await createExercise({
        user_id: profile.id,
        name: newExerciseName.trim(),
        muscle_group: newExerciseMuscle,
      });
      setShowAddModal(false);
      setNewExerciseName('');
      setNewExerciseMuscle('other');
    } finally {
      setLoading(false);
    }
  };

  const getLastSetInfo = (exerciseId: string): string | undefined => {
    const lastSet = exerciseLastSets[exerciseId];
    if (!lastSet) return undefined;
    return `${formatWeight(lastSet.weight_kg, unit)} × ${lastSet.reps}`;
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TextInput
          style={styles.searchInput}
          placeholder={i18n.t('search')}
          placeholderTextColor="#6B7280"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => setShowAddModal(true)}
        >
          <Text style={styles.addButtonText}>+</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        horizontal
        style={styles.filterScroll}
        contentContainerStyle={styles.filterContainer}
        showsHorizontalScrollIndicator={false}
      >
        <TouchableOpacity
          style={[styles.filterChip, !filterMuscle && styles.filterChipActive]}
          onPress={() => setFilterMuscle(null)}
        >
          <Text style={[styles.filterChipText, !filterMuscle && styles.filterChipTextActive]}>
            {i18n.t('all')}
          </Text>
        </TouchableOpacity>
        {MUSCLE_GROUPS.map((group) => (
          <TouchableOpacity
            key={group.value}
            style={[styles.filterChip, filterMuscle === group.value && styles.filterChipActive]}
            onPress={() => setFilterMuscle(group.value)}
          >
            <Text
              style={[
                styles.filterChipText,
                filterMuscle === group.value && styles.filterChipTextActive,
              ]}
            >
              {group.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {filteredExercises.length === 0 ? (
          <Empty message={i18n.t('no_data')} />
        ) : (
          filteredExercises.map((exercise) => (
            <ExerciseRow
              key={exercise.id}
              exercise={exercise}
              lastSetInfo={getLastSetInfo(exercise.id)}
              onPress={() => router.push(`/exercise/${exercise.id}`)}
            />
          ))
        )}
      </ScrollView>

      <Modal
        visible={showAddModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowAddModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{i18n.t('add_exercise')}</Text>

            <Text style={styles.label}>{i18n.t('exercise_name')}</Text>
            <TextInput
              style={styles.input}
              value={newExerciseName}
              onChangeText={setNewExerciseName}
              placeholder="Bijv. Squat"
              placeholderTextColor="#6B7280"
              autoFocus
            />

            <Text style={styles.label}>{i18n.t('muscle_group')}</Text>
            <View style={styles.muscleGroupContainer}>
              {MUSCLE_GROUPS.map((group) => (
                <TouchableOpacity
                  key={group.value}
                  style={[
                    styles.muscleGroupChip,
                    newExerciseMuscle === group.value && styles.muscleGroupChipActive,
                  ]}
                  onPress={() => setNewExerciseMuscle(group.value)}
                >
                  <Text
                    style={[
                      styles.muscleGroupChipText,
                      newExerciseMuscle === group.value && styles.muscleGroupChipTextActive,
                    ]}
                  >
                    {group.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setShowAddModal(false)}
              >
                <Text style={styles.cancelText}>{i18n.t('cancel')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.createButton, !newExerciseName.trim() && styles.createButtonDisabled]}
                onPress={handleCreateExercise}
                disabled={!newExerciseName.trim() || loading}
              >
                {loading ? (
                  <ActivityIndicator color="#0B0F14" />
                ) : (
                  <Text style={styles.createText}>{i18n.t('create')}</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
    padding: 16,
    gap: 12,
  },
  searchInput: {
    flex: 1,
    backgroundColor: '#111827',
    borderRadius: 8,
    padding: 12,
    color: '#F3F4F6',
    fontSize: 16,
  },
  addButton: {
    width: 48,
    height: 48,
    backgroundColor: '#00D3FF',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButtonText: {
    color: '#0B0F14',
    fontSize: 24,
    fontWeight: '700',
  },
  filterScroll: {
    maxHeight: 60,
  },
  filterContainer: {
    paddingHorizontal: 16,
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#111827',
    borderWidth: 1,
    borderColor: '#374151',
  },
  filterChipActive: {
    backgroundColor: '#00D3FF',
    borderColor: '#00D3FF',
  },
  filterChipText: {
    color: '#9CA3AF',
    fontSize: 14,
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: '#0B0F14',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#111827',
    borderRadius: 20,
    padding: 24,
    width: '90%',
    maxWidth: 400,
  },
  modalTitle: {
    color: '#F3F4F6',
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 24,
  },
  label: {
    color: '#D1D5DB',
    fontSize: 14,
    marginBottom: 8,
    marginTop: 16,
  },
  input: {
    backgroundColor: '#1F2937',
    borderRadius: 8,
    padding: 12,
    color: '#F3F4F6',
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#374151',
  },
  muscleGroupContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  muscleGroupChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#1F2937',
    borderWidth: 1,
    borderColor: '#374151',
  },
  muscleGroupChipActive: {
    backgroundColor: '#00D3FF',
    borderColor: '#00D3FF',
  },
  muscleGroupChipText: {
    color: '#9CA3AF',
    fontSize: 14,
    fontWeight: '600',
  },
  muscleGroupChipTextActive: {
    color: '#0B0F14',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
  cancelButton: {
    flex: 1,
    padding: 14,
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#374151',
  },
  cancelText: {
    color: '#9CA3AF',
    fontSize: 16,
    fontWeight: '600',
  },
  createButton: {
    flex: 1,
    padding: 14,
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: '#00D3FF',
  },
  createButtonDisabled: {
    opacity: 0.5,
  },
  createText: {
    color: '#0B0F14',
    fontSize: 16,
    fontWeight: '700',
  },
});

