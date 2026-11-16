export type TrackedLane = 'left' | 'center' | 'right';

export type SensitivityLevel = 'low' | 'normal' | 'high';

export type SlideItemKind = 'fish' | 'gem' | 'obstacle';

export interface SlideItem {
  id: string;
  kind: SlideItemKind;
  x: number; // 0..1 normalized
  y: number; // 0..1 scrolling down
  radius: number;
  lane: TrackedLane;
  collected: boolean;
  points: number;
}

export interface PenguinState {
  x: number;
  targetX: number;
  y: number;
  vx: number;
  tiltAngle: number;
  flipperAngle: number;
}

export interface FishRecord {
  id: number;
  kind: SlideItemKind;
  lane: TrackedLane;
  shiftCm: number;
  collected: boolean;
  timestamp: number;
}

export interface SlalomBalanceTelemetry {
  currentShiftRatio: number; // Delta X shift (-0.25 .. +0.25)
  currentShiftCm: number; // Current lateral displacement in cm
  peakLeftShiftCm: number;
  peakRightShiftCm: number;
  activeLane: TrackedLane;
  balanceStability: number; // 0..100%
  slalomSymmetry: number; // 0..100%
  fishCollected: number;
  targetFishGoal: number; // 16
  totalScore: number;
  streak: number;
  feedbackMessage: string;
  isTrackingValid: boolean;
  reps: FishRecord[];
}

export interface StoredSlalomBalanceData {
  lastSessionDate: string;
  fishCollected: number;
  peakLeftDisplacementCm: number;
  peakRightDisplacementCm: number;
  stabilityScore: number;
  symmetryScore: number;
  totalScore: number;
}

export interface SnowParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  life: number;
  maxLife: number;
  color: string;
}

export interface FloatingScore {
  text: string;
  x: number;
  y: number;
  alpha: number;
  life: number;
  maxLife: number;
  color: string;
}
