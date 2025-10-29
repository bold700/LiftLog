import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { useWorkoutStore } from '../src/store/useWorkout';
import { supabase } from '../src/api/supabase';
import * as Notifications from 'expo-notifications';
import { initDatabase } from '../src/db/sqlite';

// Configure notification handler
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export default function RootLayout() {
  const { initialize } = useWorkoutStore();

  useEffect(() => {
    async function setup() {
      // Initialize database
      await initDatabase();

      // Check auth
      const { data: { user } } = await supabase.auth.getUser();
      
      if (user) {
        await initialize(user.id);
      } else {
        // For now, create a demo user ID for testing
        // In production, you'd navigate to auth screen
        const demoUserId = 'demo-user-' + Date.now();
        await initialize(demoUserId);
      }

      // Request notification permissions
      const { status } = await Notifications.requestPermissionsAsync();
      if (status === 'granted') {
        // Schedule example notification (can be configured in settings)
        await Notifications.scheduleNotificationAsync({
          content: {
            title: 'LiftLog',
            body: 'Tijd om je training te loggen!',
          },
          trigger: null, // Will be configured in settings
        });
      }
    }

    setup();
  }, []);

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="exercise/[id]" />
      <Stack.Screen name="session/[id]" />
    </Stack>
  );
}


