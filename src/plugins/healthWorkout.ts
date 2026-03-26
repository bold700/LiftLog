import { registerPlugin } from '@capacitor/core';
import { Capacitor } from '@capacitor/core';

/** Samenvatting van Gezondheid-data tussen start en einde sessie (iOS HealthKit). */
export interface AppleHealthWorkoutSummary {
  startDate: string;
  endDate: string;
  durationSeconds: number;
  heartRateAvgBpm?: number;
  heartRateMinBpm?: number;
  heartRateMaxBpm?: number;
  activeEnergyKcal?: number;
  basalEnergyKcal?: number;
  stepCount?: number;
  distanceMeters?: number;
  /** 0–1 (HealthKit percentage unit) */
  oxygenSaturationAvgFraction?: number;
  respiratoryRateAvg?: number;
  hrvSdnnAvgMs?: number;
  savedWorkoutToAppleHealth?: boolean;
}

export interface HealthWorkoutPlugin {
  requestAuthorization(): Promise<{ completed: boolean; success: boolean }>;
  startSession(): Promise<{ startDate: string }>;
  getSession(): Promise<{ active: boolean; startDate?: string }>;
  endSession(options?: {
    saveWorkoutToAppleHealth?: boolean;
  }): Promise<AppleHealthWorkoutSummary>;
  cancelSession(): Promise<void>;
}

const webStub: HealthWorkoutPlugin = {
  async requestAuthorization() {
    return { completed: true, success: false };
  },
  async startSession() {
    throw new Error('Apple Gezondheid is alleen beschikbaar in de iOS-app.');
  },
  async getSession() {
    return { active: false };
  },
  async endSession() {
    throw new Error('Apple Gezondheid is alleen beschikbaar in de iOS-app.');
  },
  async cancelSession() {
    /* no-op */
  },
};

export const HealthWorkout = registerPlugin<HealthWorkoutPlugin>('HealthWorkout', {
  web: () => webStub,
});

export function isIosNativeHealthAvailable(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';
}
