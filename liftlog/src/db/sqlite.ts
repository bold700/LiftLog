import * as SQLite from 'expo-sqlite';
import { Exercise, Session, SetLog, Profile } from '../types';

let db: SQLite.SQLiteDatabase | null = null;

export async function initDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (db) return db;

  db = await SQLite.openDatabaseAsync('liftlog.db');

  // Create tables
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY,
      full_name TEXT,
      unit TEXT DEFAULT 'kg',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS exercises (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      muscle_group TEXT DEFAULT 'other',
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      notes TEXT,
      FOREIGN KEY (user_id) REFERENCES profiles(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS set_logs (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      exercise_id TEXT NOT NULL,
      performed_at TEXT NOT NULL,
      weight_kg REAL NOT NULL,
      reps INTEGER NOT NULL,
      rpe REAL,
      is_pr INTEGER DEFAULT 0,
      synced_at TEXT,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
      FOREIGN KEY (exercise_id) REFERENCES exercises(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_set_logs_exercise ON set_logs(exercise_id);
    CREATE INDEX IF NOT EXISTS idx_set_logs_session ON set_logs(session_id);
    CREATE INDEX IF NOT EXISTS idx_set_logs_performed ON set_logs(performed_at);
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
  `);

  return db;
}

export function getDatabase(): SQLite.SQLiteDatabase {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

// Profile operations
export async function getProfile(userId: string): Promise<Profile | null> {
  const database = getDatabase();
  const result = await database.getFirstAsync<Profile>(
    'SELECT * FROM profiles WHERE id = ?',
    [userId]
  );
  return result || null;
}

export async function upsertProfile(profile: Profile): Promise<void> {
  const database = getDatabase();
  await database.runAsync(
    'INSERT OR REPLACE INTO profiles (id, full_name, unit, created_at) VALUES (?, ?, ?, ?)',
    [profile.id, profile.full_name || null, profile.unit, profile.created_at]
  );
}

// Exercise operations
export async function getExercises(userId: string): Promise<Exercise[]> {
  const database = getDatabase();
  return await database.getAllAsync<Exercise>(
    'SELECT * FROM exercises WHERE user_id = ? ORDER BY name ASC',
    [userId]
  );
}

export async function getExercise(id: string): Promise<Exercise | null> {
  const database = getDatabase();
  const result = await database.getFirstAsync<Exercise>(
    'SELECT * FROM exercises WHERE id = ?',
    [id]
  );
  return result || null;
}

export async function insertExercise(exercise: Exercise): Promise<void> {
  const database = getDatabase();
  await database.runAsync(
    'INSERT INTO exercises (id, user_id, name, muscle_group, created_at) VALUES (?, ?, ?, ?, ?)',
    [exercise.id, exercise.user_id, exercise.name, exercise.muscle_group, exercise.created_at]
  );
}

// Session operations
export async function getActiveSession(userId: string): Promise<Session | null> {
  const database = getDatabase();
  const result = await database.getFirstAsync<Session>(
    'SELECT * FROM sessions WHERE user_id = ? AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1',
    [userId]
  );
  return result || null;
}

export async function insertSession(session: Session): Promise<void> {
  const database = getDatabase();
  await database.runAsync(
    'INSERT INTO sessions (id, user_id, started_at, ended_at, notes) VALUES (?, ?, ?, ?, ?)',
    [session.id, session.user_id, session.started_at, session.ended_at || null, session.notes || null]
  );
}

export async function updateSession(session: Partial<Session> & { id: string }): Promise<void> {
  const database = getDatabase();
  const updates: string[] = [];
  const values: any[] = [];

  if (session.ended_at !== undefined) {
    updates.push('ended_at = ?');
    values.push(session.ended_at);
  }
  if (session.notes !== undefined) {
    updates.push('notes = ?');
    values.push(session.notes);
  }

  if (updates.length > 0) {
    values.push(session.id);
    await database.runAsync(
      `UPDATE sessions SET ${updates.join(', ')} WHERE id = ?`,
      values
    );
  }
}

export async function getSessions(userId: string, limit?: number): Promise<Session[]> {
  const database = getDatabase();
  const limitClause = limit ? `LIMIT ${limit}` : '';
  return await database.getAllAsync<Session>(
    `SELECT * FROM sessions WHERE user_id = ? ORDER BY started_at DESC ${limitClause}`,
    [userId]
  );
}

// Set log operations
export async function getSetsForSession(sessionId: string): Promise<SetLog[]> {
  const database = getDatabase();
  return await database.getAllAsync<SetLog>(
    'SELECT * FROM set_logs WHERE session_id = ? ORDER BY performed_at ASC',
    [sessionId]
  );
}

export async function getSetsForExercise(exerciseId: string, limit?: number): Promise<SetLog[]> {
  const database = getDatabase();
  const limitClause = limit ? `LIMIT ${limit}` : '';
  return await database.getAllAsync<SetLog>(
    `SELECT * FROM set_logs WHERE exercise_id = ? ORDER BY performed_at DESC ${limitClause}`,
    [exerciseId]
  );
}

export async function getAllSetsForExercise(exerciseId: string): Promise<SetLog[]> {
  const database = getDatabase();
  return await database.getAllAsync<SetLog>(
    'SELECT * FROM set_logs WHERE exercise_id = ? ORDER BY performed_at DESC',
    [exerciseId]
  );
}

export async function insertSetLog(setLog: SetLog): Promise<void> {
  const database = getDatabase();
  await database.runAsync(
    'INSERT INTO set_logs (id, session_id, exercise_id, performed_at, weight_kg, reps, rpe, is_pr, synced_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [
      setLog.id,
      setLog.session_id,
      setLog.exercise_id,
      setLog.performed_at,
      setLog.weight_kg,
      setLog.reps,
      setLog.rpe || null,
      setLog.is_pr ? 1 : 0,
      setLog.synced_at || null,
    ]
  );
}

export async function deleteSetLog(id: string): Promise<void> {
  const database = getDatabase();
  await database.runAsync('DELETE FROM set_logs WHERE id = ?', [id]);
}

export async function getUnsyncedSetLogs(): Promise<SetLog[]> {
  const database = getDatabase();
  return await database.getAllAsync<SetLog>(
    'SELECT * FROM set_logs WHERE synced_at IS NULL'
  );
}

export async function getUnsyncedSessions(): Promise<Session[]> {
  const database = getDatabase();
  return await database.getAllAsync<Session>(
    'SELECT * FROM sessions WHERE id NOT IN (SELECT DISTINCT session_id FROM set_logs WHERE synced_at IS NOT NULL) OR id IN (SELECT DISTINCT session_id FROM set_logs WHERE synced_at IS NULL)'
  );
}

export async function markSetLogSynced(id: string): Promise<void> {
  const database = getDatabase();
  await database.runAsync(
    'UPDATE set_logs SET synced_at = ? WHERE id = ?',
    [new Date().toISOString(), id]
  );
}

// Sync operations
export async function getLastSyncTime(): Promise<Date | null> {
  const database = getDatabase();
  const result = await database.getFirstAsync<{ max_synced: string | null }>(
    'SELECT MAX(synced_at) as max_synced FROM set_logs WHERE synced_at IS NOT NULL'
  );
  return result?.max_synced ? new Date(result.max_synced) : null;
}


