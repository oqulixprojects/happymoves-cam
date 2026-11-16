export type HandPreference = 'auto' | 'Left' | 'Right';

export type GestureType = 'thumbs-up' | 'peace' | 'pointing' | 'open-five' | 'ok-sign';

export type DetectedGesture = GestureType | 'unknown';

export interface FingerExtensionState {
  thumb: boolean;
  index: boolean;
  middle: boolean;
  ring: boolean;
  pinky: boolean;
}

export interface GestureDefinition {
  id: GestureType;
  name: string;
  emoji: string;
  description: string;
  instructions: string;
  expectedFingers: FingerExtensionState;
}

export interface GestureMatchRecord {
  id: number;
  gestureId: GestureType;
  gestureName: string;
  success: boolean;
  latencySeconds: number;
  isolationScore: number;
  timestamp: number;
}

export interface GestureMatchTelemetry {
  gesturesCompleted: number;
  totalAttempts: number;
  accuracyRate: number; // 0..100%
  currentLatency: number; // seconds
  avgLatency: number; // seconds
  currentIsolationScore: number; // 0..100%
  avgIsolationScore: number; // 0..100%
  holdProgressPercent: number; // 0..100%
  isHoldingTarget: boolean;
  currentHoldSeconds: number;
  requiredHoldSeconds: number; // 1.5s
  totalScore: number;
  streak: number;
  detectedGesture: DetectedGesture;
  targetGesture: GestureDefinition;
  fingerStates: FingerExtensionState;
  feedbackMessage: string;
  reps: GestureMatchRecord[];
  activeHand: 'Left' | 'Right' | 'None';
}

export interface StoredGestureSessionData {
  lastSessionDate: string;
  gesturesCompleted: number;
  accuracyRate: number;
  avgLatencySeconds: number;
  avgIsolationScore: number;
  totalScore: number;
  repsCount: number;
}

export interface Particle {
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
