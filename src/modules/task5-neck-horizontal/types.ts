export type SteeringSensitivity = 'low' | 'normal' | 'high';

export type TurnDirection = 'left' | 'right' | 'center';

export interface TargetCoin {
  id: string;
  side: 'left' | 'right';
  x: number; // 0..1 normalized center X
  y: number; // 0..1 normalized center Y
  radius: number; // normalized radius
  collected: boolean;
  value: number;
}

export interface DroneState {
  x: number; // Current smoothed horizontal position 0.1..0.9
  targetX: number; // Raw target horizontal position
  y: number; // Constant flight lane Y coordinate
  tiltAngle: number; // Banking angle when turning (-1..1)
  radius: number;
}

export interface NeckRecord {
  id: number;
  side: 'left' | 'right';
  angleDegrees: number;
  timestamp: number;
}

export interface NeckHorizontalTelemetry {
  currentYawRatio: number; // ~0.5 neutral, <0.5 left, >0.5 right
  currentAngleDegrees: number; // Current rotation in degrees (0..75)
  currentTurnDirection: TurnDirection;
  peakLeftAngle: number; // Max degrees turned left
  peakRightAngle: number; // Max degrees turned right
  symmetryBalance: number; // 0..100%
  coinsCollected: number;
  targetCoinsGoal: number; // e.g. 15
  totalScore: number;
  streak: number;
  droneX: number;
  targetSide: 'left' | 'right';
  feedbackMessage: string;
  reps: NeckRecord[];
  isTrackingValid: boolean;
}

export interface StoredNeckData {
  lastSessionDate: string;
  coinsCollected: number;
  peakLeftRotation: number;
  peakRightRotation: number;
  symmetryBalance: number;
  totalScore: number;
  repsCount: number;
}

export interface NeckParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  size: number;
  alpha: number;
  life: number;
  maxLife: number;
}

export interface FloatingText {
  text: string;
  x: number;
  y: number;
  alpha: number;
  life: number;
  maxLife: number;
  color: string;
}
