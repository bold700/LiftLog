import { describe, expect, it } from 'vitest';
import { sortClassTypesByWeek } from '../../src/utils/classTypeOrder';

const t = (name: string, slots: [number, string][]) => ({
  name,
  schedule: slots.map(([weekday, startTime]) => ({ weekday, startTime, endTime: '23:00' })),
});

describe('lessoorten op volgorde van de week', () => {
  it('maandag eerst, dan de begintijd, dan de naam; zonder vast moment achteraan', () => {
    const list = [
      t('Favorite Flow', [[5, '09:45']]),
      t('HIIT Condition', [[6, '09:30']]),
      t('Kickboksen', [[4, '19:15']]),
      t('Mix Training', [[2, '20:00'], [2, '19:00']]),
      t('Muscle & bones', [[3, '10:00']]),
      t('Power Strength', [[1, '19:00']]),
      t('Zondagochtend', [[0, '09:00']]),
      t('Personal training', []),
      t('Avondles', [[1, '19:00']]),
    ];
    expect(sortClassTypesByWeek(list).map((x) => x.name)).toEqual([
      'Avondles',
      'Power Strength',
      'Mix Training',
      'Muscle & bones',
      'Kickboksen',
      'Favorite Flow',
      'HIIT Condition',
      'Zondagochtend',
      'Personal training',
    ]);
  });
});
