
import { useEffect, useRef, useState } from 'react';
import { useCamera } from '@/hooks/useCamera';
import { useTracker } from '@/hooks/useTracker';
import type { TrackingFrame } from '@/services/tracking/types';
import type { GameStats, NeckTelemetry } from './types';
import {
  awardStarPoints,
  updateGameStats,
  updateNeckTelemetry,
} from './analytics';
import './neckVertical.css';

const initialTelemetry: NeckTelemetry = {
  upwardMovements: 0,
  downwardMovements: 0,
  repetitions: 0,
  smoothness: 100,
  currentPosition: 0,
  movementAngle: 0,
};

const initialGameStats: GameStats = {
  score: 0,
  starsCollected: 0,
  totalAttempts: 0,
  accuracy: 0,
};

// Safely load and validate game statistics.
function loadGameStats(): GameStats {
  try {
    const saved = localStorage.getItem('neckGameStats');

    if (!saved) return { ...initialGameStats };

    const data: unknown = JSON.parse(saved);

    if (
      typeof data !== 'object' ||
      data === null ||
      Array.isArray(data)
    ) {
      return { ...initialGameStats };
    }

    const stats = data as Record<string, unknown>;

    const valid =
      typeof stats.score === 'number' &&
      Number.isSafeInteger(stats.score) &&
      stats.score >= 0 &&
      typeof stats.starsCollected === 'number' &&
      Number.isSafeInteger(stats.starsCollected) &&
      stats.starsCollected >= 0 &&
      typeof stats.totalAttempts === 'number' &&
      Number.isSafeInteger(stats.totalAttempts) &&
      stats.totalAttempts >= 0 &&
      typeof stats.accuracy === 'number' &&
      Number.isInteger(stats.accuracy) &&
      stats.accuracy >= 0 &&
      stats.accuracy <= 100 &&
      stats.starsCollected <= stats.totalAttempts;

    if (!valid) return { ...initialGameStats };

    const starsCollected = stats.starsCollected as number;
const totalAttempts = stats.totalAttempts as number;

const expectedAccuracy =
  totalAttempts === 0
    ? 0
    : Math.round(
        (starsCollected / totalAttempts) * 100,
      );
    if (stats.accuracy !== expectedAccuracy) {
      return { ...initialGameStats };
    }

    return {
      score: stats.score as number,
      starsCollected: stats.starsCollected as number,
      totalAttempts: stats.totalAttempts as number,
      accuracy: stats.accuracy as number,
    };
  } catch {
    return { ...initialGameStats };
  }
}

// Safely load and validate movement telemetry.
function loadNeckTelemetry(): NeckTelemetry {
  try {
    const saved = localStorage.getItem('neckTelemetry');

    if (!saved) return { ...initialTelemetry };

    const data: unknown = JSON.parse(saved);

    if (
      typeof data !== 'object' ||
      data === null ||
      Array.isArray(data)
    ) {
      return { ...initialTelemetry };
    }

    const stats = data as Record<string, unknown>;

    const numericFields = [
      'upwardMovements',
      'downwardMovements',
      'repetitions',
      'smoothness',
      'currentPosition',
      'movementAngle',
    ];

    for (const field of numericFields) {
      if (
        typeof stats[field] !== 'number' ||
        !Number.isFinite(stats[field])
      ) {
        return { ...initialTelemetry };
      }
    }

    const valid =
      Number.isSafeInteger(stats.upwardMovements) &&
      Number.isSafeInteger(stats.downwardMovements) &&
      Number.isSafeInteger(stats.repetitions) &&
      (stats.upwardMovements as number) >= 0 &&
      (stats.downwardMovements as number) >= 0 &&
      (stats.repetitions as number) >= 0 &&
      (stats.repetitions as number) <=
        Math.min(
          stats.upwardMovements as number,
          stats.downwardMovements as number,
        ) &&
      (stats.smoothness as number) >= 0 &&
      (stats.smoothness as number) <= 100;

    if (!valid) return { ...initialTelemetry };

    return {
      upwardMovements: stats.upwardMovements as number,
      downwardMovements: stats.downwardMovements as number,
      repetitions: stats.repetitions as number,
      smoothness: stats.smoothness as number,
      currentPosition: stats.currentPosition as number,
      movementAngle: stats.movementAngle as number,
    };
  } catch {
    return { ...initialTelemetry };
  }
}

// Safely save data to LocalStorage.
function saveLocalData(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error(`Unable to save ${key} to LocalStorage:`, error);
  }
}

export default function NeckVerticalModule() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const lastUpdateRef = useRef(0);
  const lastCatchRef = useRef(0);
  const previousDeltaYRef = useRef(0);

  const lastMovementDirectionRef =
    useRef<'up' | 'down' | 'center'>('center');

  const hasMovedUpRef = useRef(false);
  const caughtStarThisRepRef = useRef(false);

  const [characterY, setCharacterY] = useState(50);
  const [starY, setStarY] = useState(25);

  const [gameStats, setGameStats] =
    useState<GameStats>(loadGameStats);

  const [telemetry, setTelemetry] =
    useState<NeckTelemetry>(loadNeckTelemetry);

  const [trackingMessage, setTrackingMessage] = useState(
    'Start the camera to begin',
  );

  // Save statistics whenever they change.
  useEffect(() => {
    saveLocalData('neckGameStats', gameStats);
  }, [gameStats]);

  useEffect(() => {
    saveLocalData('neckTelemetry', telemetry);
  }, [telemetry]);

  const camera = useCamera(videoRef);

  // Reset statistics and save the reset values.
  const resetStatistics = () => {
    setGameStats({ ...initialGameStats });
    setTelemetry({ ...initialTelemetry });

    saveLocalData('neckGameStats', initialGameStats);
    saveLocalData('neckTelemetry', initialTelemetry);

    setCharacterY(50);
    setStarY(25);

    hasMovedUpRef.current = false;
    caughtStarThisRepRef.current = false;

    lastMovementDirectionRef.current = 'center';
    previousDeltaYRef.current = 0;

    lastUpdateRef.current = Date.now();
    lastCatchRef.current = 0;

    setTrackingMessage('Statistics reset. Ready to play!');
  };

  const handleFrame = (frame: TrackingFrame) => {
    if (!frame.pose || frame.pose.length < 9) return;

    const nose = frame.pose[0];
    const leftEar = frame.pose[7];
    const rightEar = frame.pose[8];

    if (!nose || !leftEar || !rightEar) return;

    const earMidY = (leftEar.y + rightEar.y) / 2;
    const deltaY = nose.y - earMidY;

    const position = Math.max(
      10,
      Math.min(90, 50 + deltaY * 300),
    );

    const confidence = Math.min(
      nose.visibility ?? 1,
      leftEar.visibility ?? 1,
      rightEar.visibility ?? 1,
    );

    const now = Date.now();

    if (now - lastUpdateRef.current >= 100) {
      setCharacterY(position);

      const direction =
        deltaY < -0.01
          ? 'up'
          : deltaY > 0.01
            ? 'down'
            : 'center';

      const directionChanged =
        direction !== 'center' &&
        direction !== lastMovementDirectionRef.current;

      let completedRepetition = false;

      if (directionChanged && direction === 'up') {
        hasMovedUpRef.current = true;
        caughtStarThisRepRef.current = false;
      }

      if (
        directionChanged &&
        direction === 'down' &&
        hasMovedUpRef.current
      ) {
        completedRepetition = true;
        hasMovedUpRef.current = false;
      }

      // Check for a star catch.
      const caughtStar =
        Math.abs(position - starY) < 8 &&
        now - lastCatchRef.current >= 1000;

      if (caughtStar) {
        caughtStarThisRepRef.current = true;

        // Award points immediately.
        setGameStats((previous) =>
          awardStarPoints(previous),
        );

        setStarY(Math.floor(Math.random() * 71) + 15);

        setTrackingMessage('⭐ Star caught! +50 points');
        lastCatchRef.current = now;
      }

      // Update movement telemetry.
      setTelemetry((previous) => {
        const updated = updateNeckTelemetry(
          previous,
          previousDeltaYRef.current,
          deltaY,
          confidence,
        );

        return {
          ...updated,
          upwardMovements:
            previous.upwardMovements +
            (directionChanged && direction === 'up' ? 1 : 0),
          downwardMovements:
            previous.downwardMovements +
            (directionChanged && direction === 'down' ? 1 : 0),
          repetitions:
            previous.repetitions +
            (completedRepetition ? 1 : 0),
        };
      });

      // Update accuracy after a completed repetition.
      if (completedRepetition) {
        setGameStats((previous) =>
          updateGameStats(
            previous,
            caughtStarThisRepRef.current,
          ),
        );

        caughtStarThisRepRef.current = false;
      }

      if (directionChanged) {
        lastMovementDirectionRef.current = direction;
      }

      previousDeltaYRef.current = deltaY;

      if (!caughtStar) {
        setTrackingMessage(
          deltaY < -0.01
            ? 'Head up!'
            : deltaY > 0.01
              ? 'Chin down!'
              : 'Keep your head centered',
        );
      }

      lastUpdateRef.current = now;
    }
  };

  const tracker = useTracker({
    kind: 'pose',
    videoRef,
    canvasRef,
    enabled: camera.status === 'active',
    onFrame: handleFrame,
  });

  return (
    <div className="neck-vertical-module">
      <header className="neck-vertical-header">
        <h2>Neck Vertical: Star Catcher</h2>
        <p>Move your head up and down to catch the stars.</p>
      </header>

      <div className="neck-vertical-layout">
        <section className="neck-camera-panel">
          <h3>Camera Tracking</h3>

          <div className="camera-controls">
            <button
              onClick={() => camera.start()}
              disabled={
                camera.status === 'starting' ||
                camera.status === 'active'
              }
            >
              {camera.status === 'active'
                ? 'Camera Started'
                : camera.status === 'starting'
                  ? 'Starting Camera...'
                  : 'Start Camera'}
            </button>

            <button
              onClick={() => camera.stop()}
              disabled={camera.status !== 'active'}
            >
              Stop Camera
            </button>
          </div>

          <video ref={videoRef} autoPlay playsInline muted />
          <canvas ref={canvasRef} />

          <p>Camera: {camera.status}</p>
          <p>Tracking: {tracker.status}</p>

          {camera.error && <p>{camera.error.message}</p>}
          {tracker.error && <p>{tracker.error.message}</p>}
        </section>

        <section className="neck-game-panel">
          <h3>Catch the Stars!</h3>

          <div className="neck-game-lane">
            <div
              className="neck-character"
              style={{ top: `${characterY}%` }}
            >
              🚀
            </div>

            <div
              style={{
                position: 'absolute',
                top: `${starY}%`,
                left: '50%',
                transform: 'translate(-50%, -50%)',
                fontSize: 32,
              }}
            >
              ⭐
            </div>
          </div>

          <p>{trackingMessage}</p>
          <h3>Score: {gameStats.score}</h3>
        </section>

        <section className="neck-telemetry-panel">
          <h3>Movement Telemetry</h3>

          <div className="neck-stat">
            <strong>Upward Movements</strong>
            <p>{telemetry.upwardMovements}</p>
          </div>

          <div className="neck-stat">
            <strong>Downward Movements</strong>
            <p>{telemetry.downwardMovements}</p>
          </div>

          <div className="neck-stat">
            <strong>Repetitions</strong>
            <p>{telemetry.repetitions}</p>
          </div>

          <div className="neck-stat">
            <strong>Movement Smoothness</strong>
            <p>{telemetry.smoothness}%</p>
          </div>

          <div className="neck-stat">
            <strong>Rocket Position</strong>
            <p>{Math.round(characterY)}%</p>
          </div>

          <div className="neck-stat">
            <strong>Score</strong>
            <p>{gameStats.score}</p>
          </div>

          <div className="neck-stat">
            <strong>Star Catching Accuracy</strong>
            <p>{gameStats.accuracy}%</p>
          </div>

          <div className="neck-stat">
            <strong>Successful Attempts</strong>
            <p>{gameStats.starsCollected}</p>
          </div>

          <div className="neck-stat">
            <strong>Total Attempts</strong>
            <p>{gameStats.totalAttempts}</p>
          </div>

          <div className="neck-stat">
            <strong>Tracking Status</strong>
            <p>{tracker.status}</p>
          </div>

          <button
            type="button"
            onClick={resetStatistics}
            className="reset-statistics-button"
          >
            Reset Statistics
          </button>
        </section>
      </div>
    </div>
  );
}
