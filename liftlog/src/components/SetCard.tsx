import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { SetLog } from '../types';
import { formatWeight, convertWeight } from '../utils/unitConversion';
import { useWorkoutStore } from '../store/useWorkout';
import { i18n } from '../i18n';

interface SetCardProps {
  exerciseId: string;
  initialWeight?: number;
  initialReps?: number;
  initialRPE?: number;
  previousSet?: SetLog;
  onSave: (weight: number, reps: number, rpe?: number) => void;
  onCancel: () => void;
}

const WEIGHT_STEP = 2.5;

export function SetCard({
  exerciseId,
  initialWeight,
  initialReps,
  initialRPE,
  previousSet,
  onSave,
  onCancel,
}: SetCardProps) {
  const { profile, getLastSetForExercise } = useWorkoutStore();
  const [weight, setWeight] = useState(initialWeight || previousSet?.weight_kg || 0);
  const [reps, setReps] = useState(initialReps || previousSet?.reps || 5);
  const [rpe, setRpe] = useState<number | undefined>(initialRPE || previousSet?.rpe);
  const [rpeInput, setRpeInput] = useState(rpe?.toString() || '');

  const unit = profile?.unit || 'kg';
  const displayWeight = convertWeight(weight, unit);

  const handleRpeChange = (value: string) => {
    setRpeInput(value);
    const num = parseFloat(value);
    if (!isNaN(num) && num >= 1 && num <= 10) {
      setRpe(num);
    } else if (value === '') {
      setRpe(undefined);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{i18n.t('add_set')}</Text>
        {previousSet && (
          <Text style={styles.previousTime}>
            {i18n.t('previous_time')}: {formatWeight(previousSet.weight_kg, unit)} × {previousSet.reps}
          </Text>
        )}
      </View>

      <View style={styles.row}>
        <View style={styles.inputGroup}>
          <Text style={styles.label}>{i18n.t('weight')}</Text>
          <View style={styles.stepper}>
            <TouchableOpacity
              style={styles.stepperButton}
              onPress={() => setWeight(Math.max(0, weight - WEIGHT_STEP))}
            >
              <Text style={styles.stepperText}>−</Text>
            </TouchableOpacity>
            <Text style={styles.value}>
              {displayWeight.toFixed(1)} {unit}
            </Text>
            <TouchableOpacity
              style={styles.stepperButton}
              onPress={() => setWeight(weight + WEIGHT_STEP)}
            >
              <Text style={styles.stepperText}>+</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>{i18n.t('reps')}</Text>
          <View style={styles.stepper}>
            <TouchableOpacity
              style={styles.stepperButton}
              onPress={() => setReps(Math.max(1, reps - 1))}
            >
              <Text style={styles.stepperText}>−</Text>
            </TouchableOpacity>
            <Text style={styles.value}>{reps}</Text>
            <TouchableOpacity
              style={styles.stepperButton}
              onPress={() => setReps(reps + 1)}
            >
              <Text style={styles.stepperText}>+</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <View style={styles.rpeGroup}>
        <Text style={styles.label}>
          {i18n.t('rpe')} ({i18n.t('optional')})
        </Text>
        <TextInput
          style={styles.rpeInput}
          value={rpeInput}
          onChangeText={handleRpeChange}
          placeholder="1-10"
          keyboardType="numeric"
          placeholderTextColor="#6B7280"
        />
      </View>

      <View style={styles.actions}>
        <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
          <Text style={styles.cancelText}>{i18n.t('cancel')}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.saveButton}
          onPress={() => onSave(weight, reps, rpe)}
        >
          <Text style={styles.saveText}>{i18n.t('save')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#111827',
    borderRadius: 12,
    padding: 16,
    marginVertical: 8,
  },
  header: {
    marginBottom: 16,
  },
  title: {
    color: '#F3F4F6',
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  previousTime: {
    color: '#9CA3AF',
    fontSize: 14,
  },
  row: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 16,
  },
  inputGroup: {
    flex: 1,
  },
  label: {
    color: '#D1D5DB',
    fontSize: 14,
    marginBottom: 8,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1F2937',
    borderRadius: 8,
    padding: 8,
  },
  stepperButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#374151',
    borderRadius: 6,
  },
  stepperText: {
    color: '#00D3FF',
    fontSize: 20,
    fontWeight: '600',
  },
  value: {
    color: '#F3F4F6',
    fontSize: 18,
    fontWeight: '600',
    minWidth: 60,
    textAlign: 'center',
  },
  rpeGroup: {
    marginBottom: 16,
  },
  rpeInput: {
    backgroundColor: '#1F2937',
    borderRadius: 8,
    padding: 12,
    color: '#F3F4F6',
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#374151',
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    padding: 12,
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
  saveButton: {
    flex: 1,
    padding: 12,
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: '#00D3FF',
  },
  saveText: {
    color: '#0B0F14',
    fontSize: 16,
    fontWeight: '600',
  },
});


