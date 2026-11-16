export type TrackedLeg = 'left' | 'right' | 'auto';

export type RepState = 'resting' | 'flexed' | 'extending' | 'holding' | 'retracting' | 'completed';

export interface RepetitionLog {
  id: number;
  leg: 'left' | 'right';
  peakAngle: number;
  holdTimeSeconds: number;
  targetAchieved: boolean;
  timestamp: string;
}

export interface GoniometerAnalytics {
  activeLeg: 'left' | 'right';
  currentAngle: number;
  targetAngle: number;
  minAngle: number;
  maxAngle: number;
  repCount: number;
  repState: RepState;
  holdProgressPercent: number; // 0 to 100
  currentHoldSeconds: number;
  requiredHoldSeconds: number;
  qualityScore: number; // 0 - 100
  historyAngles: number[];
  reps: RepetitionLog[];
  feedbackMessage: string;
}

