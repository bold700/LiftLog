import { z } from 'zod';

export const ExerciseSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  name: z.string().min(2),
  muscle_group: z.enum(['legs', 'push', 'pull', 'core', 'other']),
  created_at: z.string(),
});

export const SessionSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  started_at: z.string(),
  ended_at: z.string().nullable(),
  notes: z.string().optional(),
});

export const SetLogSchema = z.object({
  id: z.string().uuid(),
  session_id: z.string().uuid(),
  exercise_id: z.string().uuid(),
  performed_at: z.string(),
  weight_kg: z.number().nonnegative(),
  reps: z.number().int().positive(),
  rpe: z.number().min(1).max(10).optional(),
  is_pr: z.boolean().default(false),
  synced_at: z.string().nullable(),
});

export const ProfileSchema = z.object({
  id: z.string().uuid(),
  full_name: z.string().optional(),
  unit: z.enum(['kg', 'lb']).default('kg'),
  created_at: z.string(),
});

export type ExerciseType = z.infer<typeof ExerciseSchema>;
export type SessionType = z.infer<typeof SessionSchema>;
export type SetLogType = z.infer<typeof SetLogSchema>;
export type ProfileType = z.infer<typeof ProfileSchema>;


