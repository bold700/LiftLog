import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { i18n } from '../i18n';

interface EmptyProps {
  message?: string;
}

export function Empty({ message }: EmptyProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>{message || i18n.t('no_data')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  text: {
    color: '#6B7280',
    fontSize: 16,
    textAlign: 'center',
  },
});


