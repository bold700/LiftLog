/**
 * Publieke ranglijst in Firestore: naam-label + zwaarste oefening + gewicht (geen sets/reps).
 */
import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  getDocs,
  getDocsFromServer,
  serverTimestamp,
  type Timestamp,
} from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../firebase/config';
import type { LeaderboardVisibility } from '../types';
import {
  computeLocalLeaderboardMetrics,
  computePointsForPeriod,
  type BestLift,
  type PointsBreakdown,
} from '../utils/leaderboardLocalStats';

const EMPTY_PTS: PointsBreakdown = { points: 0, frequency: 0, volume: 0, progressionKg: 0 };
function parsePts(v: unknown): PointsBreakdown {
  if (!v || typeof v !== 'object') return { ...EMPTY_PTS };
  const o = v as Record<string, unknown>;
  const n = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : Number(x) || 0);
  return { points: n(o.points), frequency: n(o.frequency), volume: n(o.volume), progressionKg: n(o.progressionKg) };
}

export const LEADERBOARD_PUBLIC_SYNCED_EVENT = 'leaderboardPublicSynced';

const COLLECTION = 'leaderboardPublic';

export interface PublicLeaderboardEntry {
  userId: string;
  displayLabel: string;
  visibility: 'anonymous' | 'named';
  /** Profielfoto-URL (leeg bij anoniem). */
  photoURL: string | null;
  /** Legacy: zwaarste enkele log (blijft gesynchroniseerd voor oude clients). */
  exerciseName7d: string;
  weightKg7d: number;
  exerciseName30d: string;
  weightKg30d: number;
  /** Alle logs met gewicht in de periode, hoog → laag. */
  lifts7d: BestLift[];
  lifts30d: BestLift[];
  /** Puntensysteem (frequentie + volume + progressie). */
  pts7d: PointsBreakdown;
  pts30d: PointsBreakdown;
  updatedAt: string;
}

function displayLabelForSync(
  visibility: LeaderboardVisibility,
  displayName: string | null
): { visibility: 'anonymous' | 'named'; label: string } | null {
  if (visibility === 'hidden') return null;
  if (visibility === 'anonymous') {
    return { visibility: 'anonymous', label: 'Anoniem' };
  }
  const name = displayName?.trim();
  return { visibility: 'named', label: name || 'Sporter' };
}

export async function syncMyLeaderboardPublic(opts: {
  uid: string;
  leaderboardVisibility: LeaderboardVisibility | undefined;
  displayName: string | null;
  photoURL?: string | null;
}): Promise<void> {
  if (!isFirebaseConfigured() || !db) return;
  const visibility = opts.leaderboardVisibility ?? 'named';
  const labelInfo = displayLabelForSync(visibility, opts.displayName);
  const ref = doc(db, COLLECTION, opts.uid);
  if (!labelInfo) {
    try {
      await deleteDoc(ref);
    } catch {
      /* document bestaat mogelijk niet */
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(LEADERBOARD_PUBLIC_SYNCED_EVENT));
    }
    return;
  }
  const metrics = computeLocalLeaderboardMetrics();
  await setDoc(
    ref,
    {
      userId: opts.uid,
      displayLabel: labelInfo.label,
      visibility: labelInfo.visibility,
      // Foto alleen bij 'named' delen (bij anoniem geen herkenbare foto)
      photoURL: labelInfo.visibility === 'named' ? opts.photoURL ?? '' : '',
      exerciseName7d: metrics.best7d?.exerciseName ?? '',
      weightKg7d: metrics.best7d?.weightKg ?? 0,
      exerciseName30d: metrics.best30d?.exerciseName ?? '',
      weightKg30d: metrics.best30d?.weightKg ?? 0,
      lifts7d: metrics.lifts7d,
      lifts30d: metrics.lifts30d,
      pts7d: computePointsForPeriod(7),
      pts30d: computePointsForPeriod(30),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(LEADERBOARD_PUBLIC_SYNCED_EVENT));
  }
}

function parseLiftArray(v: unknown): BestLift[] {
  if (!Array.isArray(v)) return [];
  const out: BestLift[] = [];
  for (const item of v) {
    const o = item as Record<string, unknown>;
    const n =
      o.exerciseName != null
        ? String(o.exerciseName).trim()
        : o.name != null
          ? String(o.name).trim()
          : '';
    const w = Number(o.weightKg ?? o.kg);
    if (!n || !Number.isFinite(w) || w <= 0) continue;
    out.push({ exerciseName: n, weightKg: Math.round(w * 10) / 10 });
  }
  return out;
}

function tsToIso(v: unknown): string {
  if (v && typeof (v as Timestamp).toDate === 'function') {
    return (v as Timestamp).toDate().toISOString();
  }
  return new Date().toISOString();
}

/** Oude documenten (volume/sessions) nog leesbaar: fallback naar lege oefening. */
export async function fetchPublicLeaderboard(): Promise<PublicLeaderboardEntry[]> {
  if (!isFirebaseConfigured() || !db) return [];
  const col = collection(db, COLLECTION);
  let snap;
  try {
    snap = await getDocsFromServer(col);
  } catch {
    snap = await getDocs(col);
  }
  const rows: PublicLeaderboardEntry[] = [];
  for (const d of snap.docs) {
    const data = d.data() as Record<string, unknown>;
    const vis = data.visibility === 'named' ? 'named' : 'anonymous';
    const ex7 = data.exerciseName7d != null ? String(data.exerciseName7d) : '';
    const wt7 = Number(data.weightKg7d);
    const ex30 = data.exerciseName30d != null ? String(data.exerciseName30d) : '';
    const wt30 = Number(data.weightKg30d);
    let lifts7d = parseLiftArray(data.lifts7d);
    let lifts30d = parseLiftArray(data.lifts30d);
    if (lifts7d.length === 0 && ex7 && Number.isFinite(wt7) && wt7 > 0) {
      lifts7d = [{ exerciseName: ex7, weightKg: wt7 }];
    }
    if (lifts30d.length === 0 && ex30 && Number.isFinite(wt30) && wt30 > 0) {
      lifts30d = [{ exerciseName: ex30, weightKg: wt30 }];
    }
    rows.push({
      userId: d.id,
      displayLabel: String(data.displayLabel ?? 'Sporter'),
      visibility: vis,
      photoURL: data.photoURL ? String(data.photoURL) : null,
      exerciseName7d: ex7,
      weightKg7d: Number.isFinite(wt7) ? wt7 : 0,
      exerciseName30d: ex30,
      weightKg30d: Number.isFinite(wt30) ? wt30 : 0,
      lifts7d,
      lifts30d,
      pts7d: parsePts(data.pts7d),
      pts30d: parsePts(data.pts30d),
      updatedAt: tsToIso(data.updatedAt),
    });
  }
  return rows;
}
