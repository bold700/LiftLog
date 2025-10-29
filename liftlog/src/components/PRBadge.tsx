import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { i18n } from '../i18n';

interface PRBadgeProps {
  isPR?: boolean;
}

export function PRBadge({ isPR }: PRBadgeProps) {
  if (!isPR) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.text}>{i18n.t('pr_badge')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#00D3FF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginLeft: 8,
  },
  text: {
    color: '#0B0F14',
    fontSize: 12,
    fontWeight: '700',
  },
});


