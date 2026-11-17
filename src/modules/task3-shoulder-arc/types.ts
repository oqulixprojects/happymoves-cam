
// Which shoulder are we tracking?
export type ShoulderSide = 'left' | 'right';

// Current stage of the exercise
export type ShoulderRepState =
  | 'resting'
  | 'raising'
  | 'holding'
  | 'lowering'
  | 'completed';

// Information about each clock checkpoint
export interface ShoulderCheckpoint {
  angle: number;
  collected: boolean;
}

// Information saved for each completed repetition
export interface ShoulderRepLog {
  id: string;
  side: ShoulderSide;
  peakAngle: number;
  holdTimeSeconds: number;
  checkpointsReached: number[];
  timestamp: number;
}

// Live information displayed in the dashboard
export interface ShoulderArcAnalytics {
  activeSide: ShoulderSide;
  currentAngle: number;
  peakAngle: number;
  currentHoldSeconds: number;
  holdProgressPercent: number;
  repCount: number;
  targetReps: number;
  repState: ShoulderRepState;
  checkpoints: ShoulderCheckpoint[];
  history: ShoulderRepLog[];
  feedbackMessage: string;
}
