import React from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import { VictoryChart, VictoryLine, VictoryAxis, VictoryTheme } from 'victory-native';
import { SetLog } from '../types';
import { format } from 'date-fns';

interface ChartProps {
  data: SetLog[];
  type: 'load' | 'volume';
  unit?: 'kg' | 'lb';
}

const screenWidth = Dimensions.get('window').width;

export function Chart({ data, type, unit = 'kg' }: ChartProps) {
  if (data.length === 0) {
    return null;
  }

  // Group by date and calculate values
  const groupedData = data.reduce((acc, set) => {
    const date = format(new Date(set.performed_at), 'yyyy-MM-dd');
    if (!acc[date]) {
      acc[date] = [];
    }
    acc[date].push(set);
    return acc;
  }, {} as Record<string, SetLog[]>);

  const chartData = Object.entries(groupedData)
    .map(([date, sets]) => {
      if (type === 'load') {
        // Load = weight × reps
        const maxLoad = Math.max(...sets.map(s => s.weight_kg * s.reps));
        return { x: date, y: maxLoad };
      } else {
        // Volume = sum(weight × reps)
        const volume = sets.reduce((sum, s) => sum + s.weight_kg * s.reps, 0);
        return { x: date, y: volume };
      }
    })
    .sort((a, b) => a.x.localeCompare(b.x));

  return (
    <View style={styles.container}>
      <VictoryChart
        theme={VictoryTheme.material}
        width={screenWidth - 32}
        height={200}
        padding={{ left: 50, right: 20, top: 20, bottom: 50 }}
      >
        <VictoryAxis
          style={{
            axis: { stroke: '#6B7280' },
            tickLabels: { fill: '#9CA3AF', fontSize: 10 },
          }}
          tickFormat={(t) => format(new Date(t), 'dd/MM')}
        />
        <VictoryAxis
          dependentAxis
          style={{
            axis: { stroke: '#6B7280' },
            tickLabels: { fill: '#9CA3AF', fontSize: 10 },
          }}
        />
        <VictoryLine
          data={chartData}
          style={{
            data: { stroke: '#00D3FF', strokeWidth: 2 },
          }}
          interpolation="monotoneX"
        />
      </VictoryChart>
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
});


