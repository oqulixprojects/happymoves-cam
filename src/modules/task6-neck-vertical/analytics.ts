
import type { GameStats, NeckTelemetry } from './types';

// Calculate star-catching accuracy
export function calculateAccuracy(
  starsCollected: number,
  totalAttempts: number,
): number {
  if (totalAttempts === 0) return 0;

  return Math.round((starsCollected / totalAttempts) * 100);
}

// Award 50 points when a collectible is caught
export function awardStarPoints(
  current: GameStats,
): GameStats {
  return {
    ...current,
    score: current.score + 50,
  };
}

// Record one completed movement attempt
export function updateGameStats(
  current: GameStats,
  collected: boolean,
): GameStats {
  const starsCollected =
    current.starsCollected + (collected ? 1 : 0);

  const totalAttempts = current.totalAttempts + 1;

  return {
    ...current,
    starsCollected,
    totalAttempts,
    accuracy: calculateAccuracy(
      starsCollected,
      totalAttempts,
    ),
  };
}

// Update movement telemetry
export function updateNeckTelemetry(
  current: NeckTelemetry,
  previousDeltaY: number,
  currentDeltaY: number,
  confidence: number,
  pitchAngle: number = current.movementAngle,
): NeckTelemetry {
  const change = currentDeltaY - previousDeltaY;

  const movingUp = change < -0.001;
  const movingDown = change > 0.001;

  const upwardMovements =
    current.upwardMovements + (movingUp ? 1 : 0);

  const downwardMovements =
    current.downwardMovements + (movingDown ? 1 : 0);

  const repetitions = Math.min(
    upwardMovements,
    downwardMovements,
  );

  const smoothness = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        (100 - Math.abs(change) * 1000) * confidence,
      ),
    ),
  );

  const extensionAngle = Math.max(
    current.extensionAngle,
    pitchAngle > 0 ? pitchAngle : 0,
  );

  const flexionAngle = Math.max(
    current.flexionAngle,
    pitchAngle < 0 ? Math.abs(pitchAngle) : 0,
  );

  return {
    upwardMovements,
    downwardMovements,
    repetitions,
    smoothness,
    currentPosition: Math.round(currentDeltaY * 1000) / 10,
    movementAngle: pitchAngle,
    extensionAngle,
    flexionAngle,
    catchAccuracy: current.catchAccuracy,
    verticalROM: extensionAngle + flexionAngle,
  };
}
