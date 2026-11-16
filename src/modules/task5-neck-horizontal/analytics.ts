import type { Landmark } from '@/services/tracking/types';
import type {
  SteeringSensitivity,
  TurnDirection,
  TargetCoin,
  DroneState,
  NeckRecord,
  NeckHorizontalTelemetry,
  StoredNeckData,
  NeckParticle,
  FloatingText,
} from './types';

export const TARGET_COINS_GOAL = 15;

export const LOCAL_STORAGE_KEY = 'task5_neck_horizontal_results';
export const LOCAL_STORAGE_FALLBACK_KEY = 'task5_results';

/** Standard 2D Euclidean distance */
export function calculateDistance(
  a: { x: number; y: number },
  b: { x: number; y: number }
): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Section 4 Head Yaw (Rotation) Ratio:
 * Computes the normalized ratio of nose position across the ear span.
 * Returns value around ~0.5 when facing neutral front.
 * Values < 0.5 indicate turning Left; values > 0.5 indicate turning Right.
 */
export function calculateHeadYawRatio(
  nose: Landmark,
  leftEar: Landmark,
  rightEar: Landmark
): { yawRatio: number; turnDirection: TurnDirection; angleDegrees: number } {
  // Ear horizontal span
  const earMinX = Math.min(leftEar.x, rightEar.x);
  const earMaxX = Math.max(leftEar.x, rightEar.x);
  const earSpan = Math.max(0.02, earMaxX - earMinX);

  // In unmirrored camera coordinates:
  // Patient's left ear (7) is on camera right; patient's right ear (8) is on camera left.
  // When patient turns their head to their LEFT, nose shifts towards left ear (larger x).
  // When patient turns their head to their RIGHT, nose shifts towards right ear (smaller x).
  // Relative position along ear span:
  const relativeNose = (nose.x - earMinX) / earSpan;
  const yawRatio = Math.max(0.0, Math.min(1.0, relativeNose));

  // Deviation from neutral center 0.5
  const deviation = yawRatio - 0.5;

  let turnDirection: TurnDirection = 'center';
  if (deviation > 0.04) {
    turnDirection = 'left';
  } else if (deviation < -0.04) {
    turnDirection = 'right';
  }

  // Estimated cervical rotation in degrees (0° to ~70°)
  // Normal neck rotation is up to ~65-70°
  const angleDegrees = Math.min(75, Math.round((Math.abs(deviation) / 0.35) * 70));

  return {
    yawRatio: Number(yawRatio.toFixed(3)),
    turnDirection,
    angleDegrees,
  };
}

/**
 * Section 4 Horizontal Object Coordinate Mapping:
 * X_object = Clamp(0.1, 0.9, 0.5 + (R_yaw - 0.5) * sensitivityMultiplier)
 */
export function mapYawToHorizontalPosition(
  yawRatio: number,
  sensitivity: SteeringSensitivity = 'normal'
): number {
  const multiplier = sensitivity === 'high' ? 2.3 : sensitivity === 'low' ? 1.4 : 1.8;
  const deviation = yawRatio - 0.5;
  const mappedX = 0.5 + deviation * multiplier;
  return Math.max(0.10, Math.min(0.90, mappedX));
}

/**
 * Calculates Bilateral Cervical Rotation Symmetry Balance:
 * Symmetry = (1 - |PeakLeft - PeakRight| / max(PeakLeft, PeakRight, 1)) * 100%
 */
export function calculateRotationSymmetry(leftPeak: number, rightPeak: number): number {
  const denom = Math.max(leftPeak, rightPeak, 1);
  const diff = Math.abs(leftPeak - rightPeak);
  return Math.max(0, Math.min(100, Math.round((1 - diff / denom) * 100)));
}

let nextCoinId = 1;
export function createTargetCoin(side: 'left' | 'right'): TargetCoin {
  // Left coin at x = 0.22, Right coin at x = 0.78
  const x = side === 'left' ? 0.22 : 0.78;
  return {
    id: `coin-${nextCoinId++}`,
    side,
    x,
    y: 0.72,
    radius: 0.055,
    collected: false,
    value: 50,
  };
}

/* ========================================================================== */
/* Web Audio API Sound Effects Synthesizer                                   */
/* ========================================================================== */

let sharedAudioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!sharedAudioCtx) {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioCtx) {
      sharedAudioCtx = new AudioCtx();
    }
  }
  if (sharedAudioCtx && sharedAudioCtx.state === 'suspended') {
    void sharedAudioCtx.resume();
  }
  return sharedAudioCtx;
}

/** Sparkling coin collection pop and chime */
export function playCoinPopSound(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Pop oscillator
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(400, now);
    osc.frequency.exponentialRampToValueAtTime(1100, now + 0.1);

    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.16);

    // High harmonic bell chime
    const bell = ctx.createOscillator();
    const bellGain = ctx.createGain();
    bell.type = 'triangle';
    bell.frequency.setValueAtTime(1760, now + 0.05);

    bellGain.gain.setValueAtTime(0.12, now + 0.05);
    bellGain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

    bell.connect(bellGain);
    bellGain.connect(ctx.destination);

    bell.start(now + 0.05);
    bell.stop(now + 0.42);
  } catch {
    // Ignored
  }
}

/** Set completion celebration fanfare */
export function playSetCompletionFanfare(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6

    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + idx * 0.07);

      gain.gain.setValueAtTime(0, now + idx * 0.07);
      gain.gain.linearRampToValueAtTime(0.16, now + idx * 0.07 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.07 + 0.4);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + idx * 0.07);
      osc.stop(now + idx * 0.07 + 0.45);
    });
  } catch {
    // Ignored
  }
}

/* ========================================================================== */
/* Particle and Visual Burst Generators                                       */
/* ========================================================================== */

export function createCoinBurst(cx: number, cy: number): NeckParticle[] {
  const particles: NeckParticle[] = [];
  const colors = ['#f59e0b', '#fbbf24', '#fde047', '#38bdf8', '#34d399', '#ffffff'];
  const count = 30;

  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.4;
    const speed = 0.004 + Math.random() * 0.008;
    particles.push({
      x: cx,
      y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      color: colors[Math.floor(Math.random() * colors.length)],
      size: 4 + Math.random() * 5,
      alpha: 1,
      life: 0,
      maxLife: 35 + Math.floor(Math.random() * 20),
    });
  }
  return particles;
}

export function createFloatingScore(cx: number, cy: number, score = 50): FloatingText {
  return {
    text: `+${score} PTS`,
    x: cx,
    y: cy - 0.04,
    alpha: 1,
    life: 0,
    maxLife: 42,
    color: '#fbbf24',
  };
}

/* ========================================================================== */
/* LocalStorage Persistence Helper                                            */
/* ========================================================================== */

export function saveResultsToStorage(data: StoredNeckData): void {
  try {
    const payload = JSON.stringify(data);
    localStorage.setItem(LOCAL_STORAGE_KEY, payload);
    localStorage.setItem(LOCAL_STORAGE_FALLBACK_KEY, payload);
  } catch (err) {
    console.warn('[NeckHorizontal] Failed to save to localStorage:', err);
  }
}

export function loadResultsFromStorage(): StoredNeckData | null {
  try {
    const saved = localStorage.getItem(LOCAL_STORAGE_KEY) || localStorage.getItem(LOCAL_STORAGE_FALLBACK_KEY);
    if (!saved) return null;
    return JSON.parse(saved) as StoredNeckData;
  } catch {
    return null;
  }
}

/* ========================================================================== */
/* Neck Horizontal Tracker State Machine                                      */
/* ========================================================================== */

export class NeckHorizontalTracker {
  drone: DroneState = {
    x: 0.5,
    targetX: 0.5,
    y: 0.72,
    tiltAngle: 0,
    radius: 0.05,
  };

  targetSide: 'left' | 'right' = 'left';
  currentCoin: TargetCoin = createTargetCoin('left');

  peakLeftAngle = 0;
  peakRightAngle = 0;

  coinsCollected = 0;
  totalAttempts = 0;
  totalScore = 0;
  streak = 0;

  sensitivity: SteeringSensitivity = 'normal';
  soundEnabled = true;

  reps: NeckRecord[] = [];

  constructor() {
    this.targetSide = 'left';
    this.currentCoin = createTargetCoin('left');
  }

  reset(): void {
    this.drone.x = 0.5;
    this.drone.targetX = 0.5;
    this.drone.tiltAngle = 0;
    this.targetSide = 'left';
    this.currentCoin = createTargetCoin('left');
    this.peakLeftAngle = 0;
    this.peakRightAngle = 0;
    this.coinsCollected = 0;
    this.totalAttempts = 0;
    this.totalScore = 0;
    this.streak = 0;
    this.reps = [];
  }

  update(
    landmarks: Landmark[] | undefined,
    _nowMs: number,
    onCoinCollected?: (cx: number, cy: number) => void
  ): NeckHorizontalTelemetry {
    // Check if face landmarks are visible
    if (!landmarks || landmarks.length < 9) {
      return this.buildTelemetry(0.5, 0, 'center', false, 'Align head and shoulders in center of camera frame.');
    }

    const nose = landmarks[0];
    const leftEar = landmarks[7];
    const rightEar = landmarks[8];

    if (!nose || !leftEar || !rightEar) {
      return this.buildTelemetry(0.5, 0, 'center', false, 'Looking for nose and ear landmarks...');
    }

    const { yawRatio, turnDirection, angleDegrees } = calculateHeadYawRatio(nose, leftEar, rightEar);

    // Update session peak angles
    if (turnDirection === 'left' && angleDegrees > this.peakLeftAngle) {
      this.peakLeftAngle = angleDegrees;
    } else if (turnDirection === 'right' && angleDegrees > this.peakRightAngle) {
      this.peakRightAngle = angleDegrees;
    }

    // Map yaw ratio to target drone X coordinate
    const targetX = mapYawToHorizontalPosition(yawRatio, this.sensitivity);
    this.drone.targetX = targetX;

    // Smooth drone horizontal motion using linear interpolation (lerp)
    const lerpAlpha = 0.16;
    const prevX = this.drone.x;
    this.drone.x = this.drone.x + (targetX - this.drone.x) * lerpAlpha;

    // Banking tilt proportional to velocity
    const velocityX = this.drone.x - prevX;
    this.drone.tiltAngle = Math.max(-0.4, Math.min(0.4, velocityX * 18));

    // Collision detection between drone and coin
    const distToCoin = calculateDistance(
      { x: this.drone.x, y: this.drone.y },
      { x: this.currentCoin.x, y: this.currentCoin.y }
    );

    let feedbackMessage = '';

    if (distToCoin < this.drone.radius + this.currentCoin.radius + 0.02) {
      // Coin captured!
      this.coinsCollected += 1;
      this.totalAttempts += 1;
      this.streak += 1;
      const coinScore = 50 + Math.min(50, this.streak * 10);
      this.totalScore += coinScore;

      if (this.soundEnabled) {
        playCoinPopSound();
        if (this.coinsCollected % TARGET_COINS_GOAL === 0) {
          playSetCompletionFanfare();
        }
      }

      onCoinCollected?.(this.currentCoin.x, this.currentCoin.y);

      const record: NeckRecord = {
        id: this.coinsCollected,
        side: this.currentCoin.side,
        angleDegrees,
        timestamp: Date.now(),
      };
      this.reps = [record, ...this.reps].slice(0, 10);

      this.persistSession();

      // Switch sides to encourage alternating rotation
      this.targetSide = this.targetSide === 'left' ? 'right' : 'left';
      this.currentCoin = createTargetCoin(this.targetSide);

      feedbackMessage = `COIN CAPTURED! +${coinScore} PTS! Now steer toward the ${this.targetSide.toUpperCase()}!`;
    } else {
      if (this.targetSide === 'left') {
        feedbackMessage =
          turnDirection === 'left'
            ? `Steering Left (${angleDegrees}°)... keep rotating neck to reach target coin!`
            : 'Turn head smoothly to your LEFT to steer drone left!';
      } else {
        feedbackMessage =
          turnDirection === 'right'
            ? `Steering Right (${angleDegrees}°)... keep rotating neck to reach target coin!`
            : 'Turn head smoothly to your RIGHT to steer drone right!';
      }
    }

    return this.buildTelemetry(yawRatio, angleDegrees, turnDirection, true, feedbackMessage);
  }

  buildTelemetry(
    yawRatio: number,
    angleDegrees: number,
    turnDirection: TurnDirection,
    isTrackingValid: boolean,
    feedbackMessage: string
  ): NeckHorizontalTelemetry {
    const symmetry = calculateRotationSymmetry(this.peakLeftAngle, this.peakRightAngle);

    return {
      currentYawRatio: yawRatio,
      currentAngleDegrees: angleDegrees,
      currentTurnDirection: turnDirection,
      peakLeftAngle: this.peakLeftAngle,
      peakRightAngle: this.peakRightAngle,
      symmetryBalance: symmetry,
      coinsCollected: this.coinsCollected,
      targetCoinsGoal: TARGET_COINS_GOAL,
      totalScore: this.totalScore,
      streak: this.streak,
      droneX: Number(this.drone.x.toFixed(3)),
      targetSide: this.targetSide,
      feedbackMessage,
      reps: this.reps,
      isTrackingValid,
    };
  }

  persistSession(): void {
    const symmetry = calculateRotationSymmetry(this.peakLeftAngle, this.peakRightAngle);

    const data: StoredNeckData = {
      lastSessionDate: new Date().toISOString(),
      coinsCollected: this.coinsCollected,
      peakLeftRotation: this.peakLeftAngle,
      peakRightRotation: this.peakRightAngle,
      symmetryBalance: symmetry,
      totalScore: this.totalScore,
      repsCount: this.reps.length,
    };
    saveResultsToStorage(data);
  }
}
