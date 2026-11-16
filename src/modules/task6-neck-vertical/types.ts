export type FlightSensitivity = 'low' | 'normal' | 'high';

export type PitchDirection = 'up' | 'down' | 'neutral';

export type AltitudeBand = 'high' | 'low';

export interface TargetStar {
  id: string;
  altitude: AltitudeBand;
  x: number; // Center X (0.50)
  y: number; // 0.22 for High sky star, 0.78 for Low ocean pearl
  radius: number;
  type: 'star' | 'pearl';
  collected: boolean;
  value: number;
}

export interface FlyingCharacter {
  x: number; // Fixed horizontal corridor at 0.50
  y: number; // Current smoothed vertical position (0.1..0.9)
  targetY: number;
  radius: number;
  pitchAngle: number; // Tilts up/down based on elevation velocity
}

export interface NeckVerticalRecord {
  id: number;
  altitude: AltitudeBand;
  angleDegrees: number;
  pitchDirection: PitchDirection;
  timestamp: number;
}

export interface NeckVerticalTelemetry {
  currentPitchDelta: number; // Delta Y = y_nose - y_ear_mid
  currentPitchAngle: number; // Degrees in current direction (0..60°)
  pitchDirection: PitchDirection;
  peakExtensionAngle: number; // Peak degrees looking up (Extension)
  peakFlexionAngle: number; // Peak degrees looking down (Flexion)
  catchAccuracy: number; // 0..100%
  smoothnessIndex: number; // 0..100%
  starsCollected: number;
  targetStarsGoal: number; // e.g. 15
  totalScore: number;
  streak: number;
  characterY: number;
  targetAltitude: AltitudeBand;
  feedbackMessage: string;
  reps: NeckVerticalRecord[];
  isTrackingValid: boolean;
}

export interface StoredNeckVerticalData {
  lastSessionDate: string;
  starsCollected: number;
  peakExtensionAngle: number;
  peakFlexionAngle: number;
  catchAccuracy: number;
  smoothnessIndex: number;
  totalScore: number;
  repsCount: number;
}

export interface VerticalParticle {
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
