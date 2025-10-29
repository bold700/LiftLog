import { Tabs } from 'expo-router';
import { StyleSheet } from 'react-native';
import { i18n } from '../../src/i18n';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#00D3FF',
        tabBarInactiveTintColor: '#6B7280',
        tabBarStyle: {
          backgroundColor: '#111827',
          borderTopColor: '#374151',
          borderTopWidth: 1,
        },
        headerStyle: {
          backgroundColor: '#0B0F14',
        },
        headerTintColor: '#F3F4F6',
        headerTitleStyle: {
          fontWeight: '600',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: i18n.t('today'),
          tabBarLabel: i18n.t('today'),
        }}
      />
      <Tabs.Screen
        name="exercises"
        options={{
          title: i18n.t('exercises'),
          tabBarLabel: i18n.t('exercises'),
        }}
      />
      <Tabs.Screen
        name="progress"
        options={{
          title: i18n.t('progress'),
          tabBarLabel: i18n.t('progress'),
        }}
      />
      <Tabs.Screen
        name="share"
        options={{
          title: i18n.t('share'),
          tabBarLabel: i18n.t('share'),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: i18n.t('settings'),
          tabBarLabel: i18n.t('settings'),
        }}
      />
    </Tabs>
  );
}


