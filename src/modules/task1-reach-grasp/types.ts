export type HandPreference = 'auto' | 'Left' | 'Right';

export type HandState = 'open' | 'closed' | 'partial';

export type GamePhase =
  | 'idle'         // Waiting for hand detection
  | 'reaching'     // Phase 1: Hand open, reaching towards target
  | 'grabbing'     // Phase 2: Hand hovering over target, closing into grasp
  | 'transporting' // Phase 3: Grip secured, carrying to basket
  | 'success';     // Dropped in basket, emerald burst

export type ObjectType = 'apple' | 'ball' | 'star' | 'block' | 'gem';

export interface TargetObject {
  id: string;
  type: ObjectType;
  x: number; // 0..1 normalized coordinate
  y: number; // 0..1 normalized coordinate
  radius: number; // normalized radius
  color: string;
  glowColor: string;
  label: string;
}

export interface BasketZone {
  x: number; // 0..1 normalized center X
  y: number; // 0..1 normalized center Y
  width: number; // normalized width
  height: number; // normalized height
  label: string;
}

export interface HandMetrics {
  avgFingertipDistance: number;
  opennessROM: number; // 0 - 100%
  state: HandState;
  palmCenter: { x: number; y: number };
  boundingBox: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    diagonal: number;
  };
}

export interface RepetitionRecord {
  id: number;
  timestamp: number;
  success: boolean;
  graspTimeSeconds: number;
  peakOpenROM: number;
  objectType: ObjectType;
}

export interface ReachGraspTelemetry {
  cyclesCompleted: number;
  totalAttempts: number;
  gripSuccessRate: number; // 0..100%
  currentROM: number; // 0..100%
  peakROMInCycle: number; // 0..100%
  currentGraspTime: number; // seconds
  avgGraspTime: number; // seconds
  totalScore: number;
  streak: number;
  currentPhase: GamePhase;
  handState: HandState;
  avgFingertipDist: number;
  feedbackMessage: string;
  reps: RepetitionRecord[];
  activeHand: 'Left' | 'Right' | 'None';
}

export interface StoredSessionData {
  lastSessionDate: string;
  cyclesCompleted: number;
  gripSuccessRate: number;
  avgGraspTime: number;
  peakROM: number;
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
