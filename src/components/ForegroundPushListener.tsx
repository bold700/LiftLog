/**
 * Toont een binnenkomende pushmelding als de app open staat (dan laat het toestel hem niet zien).
 * Staat naast LeaderboardAutoSync in App: geen eigen scherm, alleen een luisteraar.
 */
import { useEffect } from 'react';
import { useNotify } from '../context/NotifyContext';
import { useProfile } from '../context/ProfileContext';
import { onForegroundPush } from '../services/pushService';

export function ForegroundPushListener() {
  const notify = useNotify();
  const userId = useProfile()?.profile?.userId;

  useEffect(() => {
    if (!userId) return;
    return onForegroundPush((title, body) => {
      const text = [title, body].filter(Boolean).join(': ');
      if (text) notify?.info(text);
    });
  }, [userId, notify]);

  return null;
}
