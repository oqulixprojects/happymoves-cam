
export interface NeckTrackingData {
  noseY: number;
  earMidY: number;
  deltaY: number;
  characterY: number;
  confidence: number;
}

export interface GameStats {
  score: number;
  starsCollected: number;
  totalAttempts: number;
  accuracy: number;
}

export interface Star {
  id: number;
  x: number;
  y: number;
  collected: boolean;
}

export interface Crystal {
  id: number;
  x: number;
  y: number;
  collected: boolean;
}

export interface NeckTelemetry {
  upwardMovements: number;
  downwardMovements: number;
  repetitions: number;
  smoothness: number;
  currentPosition: number;
  movementAngle: number;
  extensionAngle: number;
  flexionAngle: number;
  catchAccuracy: number;
  verticalROM: number;
}
