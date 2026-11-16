export type TrackedLeg = 'auto' | 'left' | 'right';

export type KickPhase = 'ready' | 'kicking' | 'flying' | 'goal' | 'resetting';

export type TargetCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export interface SoccerBall {
  x: number; // 0..1 normalized center X
  y: number; // 0..1 normalized center Y
  vx: number;
  vy: number;
  radius: number;
  rotation: number;
  isFlying: boolean;
}

export interface GoalTarget {
  id: string;
  corner: TargetCorner;
  x: number;
  y: number;
  radius: number;
  label: string;
  isActive: boolean;
}

export interface KickRecord {
  id: number;
  leg: 'left' | 'right';
  peakAngle: number;
  velocity: number;
  hitTarget: boolean;
  targetCorner: TargetCorner;
  timestamp: number;
}

export interface KneeSoccerTelemetry {
  activeLeg: 'left' | 'right';
  currentAngle: number; // Current knee angle (70° - 180°)
  targetAngle: number; // Full terminal extension goal (≥ 160°)
  peakAngle: number; // Peak knee extension in current rep
  sessionMaxROM: number; // Max knee angle achieved across session
  kickSpeed: number; // Foot velocity in m/s
  targetAccuracy: number; // 0..100%
  kicksCompleted: number;
  targetKicksGoal: number; // e.g. 10
  totalScore: number;
  streak: number;
  kickPhase: KickPhase;
  activeTargetCorner: TargetCorner;
  feedbackMessage: string;
  reps: KickRecord[];
  isTrackingValid: boolean;
}

export interface StoredKneeSoccerData {
  lastSessionDate: string;
  kicksCompleted: number;
  peakROM: number;
  avgKickSpeed: number;
  targetAccuracy: number;
  totalScore: number;
  repsCount: number;
}

export interface SoccerParticle {
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
