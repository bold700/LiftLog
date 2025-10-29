import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Switch,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useWorkoutStore } from '../../src/store/useWorkout';
import { i18n } from '../../src/i18n';
import { format } from 'date-fns';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';

export default function ShareScreen() {
  const { exercises, profile, getSetsForExercise } = useWorkoutStore();
  const [shareWithTrainer, setShareWithTrainer] = useState(true);
  const [selectedExercises, setSelectedExercises] = useState<string[]>([]);
  const [startDate, setStartDate] = useState(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)); // 30 days ago
  const [endDate, setEndDate] = useState(new Date());

  const handleToggleExercise = (exerciseId: string) => {
    setSelectedExercises((prev) =>
      prev.includes(exerciseId)
        ? prev.filter((id) => id !== exerciseId)
        : [...prev, exerciseId]
    );
  };

  const handleSelectAll = () => {
    if (selectedExercises.length === exercises.length) {
      setSelectedExercises([]);
    } else {
      setSelectedExercises(exercises.map((e) => e.id));
    }
  };

  const generateCSV = async () => {
    if (selectedExercises.length === 0) {
      Alert.alert(i18n.t('error'), 'Selecteer minimaal één oefening');
      return;
    }

    try {
      let csv = 'Exercise,Date,Weight (kg),Reps,RPE,PR\n';

      for (const exerciseId of selectedExercises) {
        const sets = await getSetsForExercise(exerciseId);
        const exercise = exercises.find((e) => e.id === exerciseId);

        const filteredSets = sets.filter((set) => {
          const setDate = new Date(set.performed_at);
          return setDate >= startDate && setDate <= endDate;
        });

        for (const set of filteredSets) {
          csv += `"${exercise?.name || 'Unknown'}",${format(new Date(set.performed_at), 'yyyy-MM-dd')},${set.weight_kg},${set.reps},${set.rpe || ''},${set.is_pr ? 'Yes' : 'No'}\n`;
        }
      }

      const fileUri = FileSystem.documentDirectory + `liftlog_export_${format(new Date(), 'yyyyMMdd')}.csv`;
      await FileSystem.writeAsStringAsync(fileUri, csv);

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri);
      } else {
        Alert.alert(i18n.t('export_csv'), `CSV opgeslagen: ${fileUri}`);
      }
    } catch (error) {
      console.error('Export error:', error);
      Alert.alert(i18n.t('error'), 'Kon CSV niet exporteren');
    }
  };

  const handleGenerateLink = async () => {
    if (!shareWithTrainer) {
      Alert.alert('Info', 'Trainer sharing is uitgeschakeld');
      return;
    }

    // In production, this would call a Supabase Edge Function
    Alert.alert(
      'Info',
      'Deelbare link functionaliteit vereist Supabase Edge Function setup. Zie README voor instructies.'
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        <Text style={styles.sectionTitle}>{i18n.t('share_period')}</Text>
        <View style={styles.dateInfo}>
          <Text style={styles.dateText}>
            {format(startDate, 'dd MMM yyyy')} - {format(endDate, 'dd MMM yyyy')}
          </Text>
        </View>

        <View style={styles.toggleContainer}>
          <Text style={styles.toggleLabel}>{i18n.t('share_with_trainer')}</Text>
          <Switch
            value={shareWithTrainer}
            onValueChange={setShareWithTrainer}
            trackColor={{ false: '#374151', true: '#00D3FF' }}
            thumbColor="#F3F4F6"
          />
        </View>

        <View style={styles.exercisesHeader}>
          <Text style={styles.sectionTitle}>{i18n.t('share_exercises')}</Text>
          <TouchableOpacity onPress={handleSelectAll}>
            <Text style={styles.selectAllText}>
              {selectedExercises.length === exercises.length ? i18n.t('deselect_all') : i18n.t('select_all')}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.exercisesList}>
          {exercises.map((exercise) => (
            <TouchableOpacity
              key={exercise.id}
              style={[
                styles.exerciseCheckbox,
                selectedExercises.includes(exercise.id) && styles.exerciseCheckboxSelected,
              ]}
              onPress={() => handleToggleExercise(exercise.id)}
            >
              <View
                style={[
                  styles.checkbox,
                  selectedExercises.includes(exercise.id) && styles.checkboxSelected,
                ]}
              >
                {selectedExercises.includes(exercise.id) && (
                  <Text style={styles.checkmark}>✓</Text>
                )}
              </View>
              <Text
                style={[
                  styles.exerciseCheckboxText,
                  selectedExercises.includes(exercise.id) && styles.exerciseCheckboxTextSelected,
                ]}
              >
                {exercise.name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.actions}>
          <TouchableOpacity style={styles.exportButton} onPress={generateCSV}>
            <Text style={styles.exportButtonText}>{i18n.t('export_csv')}</Text>
          </TouchableOpacity>

          {shareWithTrainer && (
            <TouchableOpacity style={styles.linkButton} onPress={handleGenerateLink}>
              <Text style={styles.linkButtonText}>{i18n.t('generate_link')}</Text>
            </TouchableOpacity>
          )}
        </View>
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
  sectionTitle: {
    color: '#F3F4F6',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 16,
    marginTop: 8,
  },
  dateInfo: {
    backgroundColor: '#111827',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  dateText: {
    color: '#F3F4F6',
    fontSize: 16,
  },
  toggleContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#111827',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  toggleLabel: {
    color: '#F3F4F6',
    fontSize: 16,
    fontWeight: '600',
  },
  exercisesHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  selectAllText: {
    color: '#00D3FF',
    fontSize: 14,
    fontWeight: '600',
  },
  exercisesList: {
    gap: 8,
    marginBottom: 24,
  },
  exerciseCheckbox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111827',
    borderRadius: 12,
    padding: 16,
  },
  exerciseCheckboxSelected: {
    backgroundColor: '#1F2937',
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#6B7280',
    marginRight: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxSelected: {
    borderColor: '#00D3FF',
    backgroundColor: '#00D3FF',
  },
  checkmark: {
    color: '#0B0F14',
    fontSize: 16,
    fontWeight: '700',
  },
  exerciseCheckboxText: {
    color: '#F3F4F6',
    fontSize: 16,
  },
  exerciseCheckboxTextSelected: {
    color: '#00D3FF',
    fontWeight: '600',
  },
  actions: {
    gap: 12,
    marginTop: 24,
  },
  exportButton: {
    backgroundColor: '#374151',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  exportButtonText: {
    color: '#F3F4F6',
    fontSize: 16,
    fontWeight: '700',
  },
  linkButton: {
    backgroundColor: '#00D3FF',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  linkButtonText: {
    color: '#0B0F14',
    fontSize: 16,
    fontWeight: '700',
  },
});

