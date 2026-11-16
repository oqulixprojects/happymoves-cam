
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
  extensionAngle: 0,
  flexionAngle: 0,
  catchAccuracy: 0,
  verticalROM: 0,
};

const initialGameStats: GameStats = {
  score: 0,
  starsCollected: 0,
  totalAttempts: 0,
  accuracy: 0,
};

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
      starsCollected,
      totalAttempts,
      accuracy: stats.accuracy as number,
    };
  } catch {
    return { ...initialGameStats };
  }
}

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

    const requiredFields = [
      'upwardMovements',
      'downwardMovements',
      'repetitions',
      'smoothness',
      'currentPosition',
      'movementAngle',
    ];

    for (const field of requiredFields) {
      if (
        typeof stats[field] !== 'number' ||
        !Number.isFinite(stats[field])
      ) {
        return { ...initialTelemetry };
      }
    }

    const optionalFields = [
      'extensionAngle',
      'flexionAngle',
      'catchAccuracy',
      'verticalROM',
    ];

    for (const field of optionalFields) {
      if (
        stats[field] !== undefined &&
        (typeof stats[field] !== 'number' ||
          !Number.isFinite(stats[field]))
      ) {
        return { ...initialTelemetry };
      }
    }

    const upward = stats.upwardMovements as number;
    const downward = stats.downwardMovements as number;
    const repetitions = stats.repetitions as number;
    const smoothness = stats.smoothness as number;

    const valid =
      Number.isSafeInteger(upward) &&
      Number.isSafeInteger(downward) &&
      Number.isSafeInteger(repetitions) &&
      upward >= 0 &&
      downward >= 0 &&
      repetitions >= 0 &&
      repetitions <= Math.min(upward, downward) &&
      smoothness >= 0 &&
      smoothness <= 100;

    if (!valid) return { ...initialTelemetry };

    return {
      upwardMovements: upward,
      downwardMovements: downward,
      repetitions,
      smoothness,
      currentPosition: stats.currentPosition as number,
      movementAngle: stats.movementAngle as number,
      extensionAngle:
        (stats.extensionAngle as number | undefined) ?? 0,
      flexionAngle:
        (stats.flexionAngle as number | undefined) ?? 0,
      catchAccuracy:
        (stats.catchAccuracy as number | undefined) ?? 0,
      verticalROM:
        (stats.verticalROM as number | undefined) ?? 0,
    };
  } catch {
    return { ...initialTelemetry };
  }
}

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
  const [starY, setStarY] = useState(22);
  const [crystalY, setCrystalY] = useState(78);

  const [gameStats, setGameStats] =
    useState<GameStats>(loadGameStats);

  const [telemetry, setTelemetry] =
    useState<NeckTelemetry>(loadNeckTelemetry);

  const [trackingMessage, setTrackingMessage] = useState(
    'Start the camera to begin',
  );

  useEffect(() => {
    saveLocalData('neckGameStats', gameStats);
  }, [gameStats]);

  useEffect(() => {
    saveLocalData('neckTelemetry', telemetry);
  }, [telemetry]);

  const camera = useCamera(videoRef);

  const resetStatistics = () => {
    setGameStats({ ...initialGameStats });
    setTelemetry({ ...initialTelemetry });

    saveLocalData('neckGameStats', initialGameStats);
    saveLocalData('neckTelemetry', initialTelemetry);

    setCharacterY(50);
    setStarY(22);
    setCrystalY(78);

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

    if (now - lastUpdateRef.current < 100) return;

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

    let caughtCollectible = false;

    if (now - lastCatchRef.current >= 700) {
      if (
        direction === 'up' &&
        Math.abs(position - starY) < 8
      ) {
        caughtCollectible = true;
        caughtStarThisRepRef.current = true;

        setGameStats((previous) =>
          awardStarPoints(previous),
        );

        setStarY(Math.floor(Math.random() * 16) + 15);

        setTrackingMessage('⭐ Star caught! +50 points');
      } else if (
        direction === 'down' &&
        Math.abs(position - crystalY) < 8
      ) {
        caughtCollectible = true;

        setCrystalY(Math.floor(Math.random() * 16) + 70);

        setTrackingMessage('Crystal collected!');
      }

      if (caughtCollectible) {
        lastCatchRef.current = now;
      }
    }

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

    if (!caughtCollectible) {
      setTrackingMessage(
        direction === 'up'
          ? 'Head up!'
          : direction === 'down'
            ? 'Chin down!'
            : 'Keep your head centered',
      );
    }

    lastUpdateRef.current = now;
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
        <h2>Neck Vertical: Sky Star Catcher</h2>
        <p>
          Cervical Flexion & Extension – Move the character
          to collect stars and crystals.
        </p>
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
              className="neck-star"
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

            <div
              className="neck-crystal-group"
              style={{
                position: 'absolute',
                top: `${crystalY}%`,
                left: '50%',
                transform: 'translate(-50%, -50%)',
              }}
            >
              <span className="neck-crystal-glitter glitter-one">✦</span>
              <span className="neck-crystal-glitter glitter-two">✧</span>
              <span className="neck-crystal-glitter glitter-three">✦</span>
              <span className="neck-crystal-glitter glitter-four">✧</span>
              <span className="neck-crystal-glitter glitter-five">✦</span>
              <span className="neck-crystal-glitter glitter-six">✧</span>
              <span className="neck-crystal-glitter glitter-seven">✦</span>
              <span className="neck-crystal-glitter glitter-eight">✧</span>

              <div className="neck-crystal">💎</div>
            </div>
          </div>

          <p>{trackingMessage}</p>
          <h3>Score: {gameStats.score}</h3>
          <p>⭐ Star: +50 points</p>
          <p>Collect the crystal in the lower lane</p>
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
            <strong>Successful Star Attempts</strong>
            <p>{gameStats.starsCollected}</p>
          </div>

          <div className="neck-stat">
            <strong>Total Star Attempts</strong>
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
