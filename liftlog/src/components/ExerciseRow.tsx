import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Exercise } from '../types';
import { i18n } from '../i18n';

interface ExerciseRowProps {
  exercise: Exercise;
  onPress: () => void;
  lastSetInfo?: string;
}

const getMuscleGroupLabel = (group: string): string => {
  const labels: Record<string, string> = {
    legs: i18n.t('legs'),
    push: i18n.t('push'),
    pull: i18n.t('pull'),
    core: i18n.t('core'),
    other: i18n.t('other'),
  };
  return labels[group] || group;
};

export function ExerciseRow({ exercise, onPress, lastSetInfo }: ExerciseRowProps) {
  return (
    <TouchableOpacity style={styles.container} onPress={onPress}>
      <View style={styles.content}>
        <Text style={styles.name}>{exercise.name}</Text>
        <View style={styles.meta}>
          <Text style={styles.muscleGroup}>
            {getMuscleGroupLabel(exercise.muscle_group)}
          </Text>
          {lastSetInfo && <Text style={styles.lastSet}> • {lastSetInfo}</Text>}
        </View>
      </View>
      <Text style={styles.chevron}>›</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#111827',
    borderRadius: 12,
    padding: 16,
    marginVertical: 4,
  },
  content: {
    flex: 1,
  },
  name: {
    color: '#F3F4F6',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  muscleGroup: {
    color: '#9CA3AF',
    fontSize: 14,
  },
  lastSet: {
    color: '#6B7280',
    fontSize: 14,
  },
  chevron: {
    color: '#6B7280',
    fontSize: 24,
    marginLeft: 12,
  },
});

