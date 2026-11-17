
export type LegSide = 'left' | 'right';

export type TargetCorner = 'top-left' | 'top-right' | 'bottom-left';

export type GameStatus = 'ready' | 'kicking' | 'goal' | 'miss' | 'completed';

export interface KneeTrackingData {
  leftAngle: number;
  rightAngle: number;
  activeAngle: number;
  footX: number;
  footY: number;
  footVelocity: number;
  isTracking: boolean;
}

export interface KickResult {
  id: number;
  target: TargetCorner;
  success: boolean;
  angle: number;
  speed: number;
  points: number;
}

export interface SoccerAnalytics {
  currentAngle: number;
  peakRom: number;
  kickSpeed: number;
  totalKicks: number;
  successfulKicks: number;
  accuracy: number;
  score: number;
  gameStatus: GameStatus;
  kickResults: KickResult[];
}

export interface SavedSession {
  peakRom: number;
  peakKickSpeed: number;
  totalKicks: number;
  successfulKicks: number;
  score: number;
  completedAt: string;
}
