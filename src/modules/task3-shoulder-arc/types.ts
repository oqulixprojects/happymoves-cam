export type TrackedArm = 'auto' | 'left' | 'right';

export type RepState = 'resting' | 'raising' | 'holding' | 'lowering';

export interface CheckpointStar {
  angle: number; // 60, 90, 120
  label: string;
  collected: boolean;
}

export interface ShoulderArcRecord {
  id: number;
  arm: 'left' | 'right';
  peakAngle: number;
  holdTimeSeconds: number;
  targetAchieved: boolean;
  checkpointsCollected: number;
  timestamp: number;
}

export interface ShoulderArcTelemetry {
  activeArm: 'left' | 'right';
  currentAngle: number; // Current degrees (0..180)
  targetAngle: number; // e.g. 120
  peakAngle: number; // Max ROM achieved in current rep
  sessionMaxROM: number; // Max ROM across entire session
  repCount: number;
  repState: RepState;
  holdProgressPercent: number; // 0..100%
  currentHoldSeconds: number; // seconds
  requiredHoldSeconds: number; // 3.0s
  therapeuticTimeSeconds: number; // Total seconds spent > 90 deg
  qualityScore: number; // 0..100%
  checkpoints: CheckpointStar[];
  feedbackMessage: string;
  reps: ShoulderArcRecord[];
  isTrackingValid: boolean;
}

export interface StoredShoulderArcData {
  lastSessionDate: string;
  repsCompleted: number;
  peakROM: number;
  therapeuticZoneSeconds: number;
  avgHoldTime: number;
  totalScore: number;
  activeArm: 'left' | 'right';
}

export interface ArcParticle {
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
