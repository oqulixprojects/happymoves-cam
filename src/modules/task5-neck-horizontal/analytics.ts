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
  CloudItem,
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
  const angleDegrees = Math.min(75, Math.round((Math.abs(deviation) / 0.35) * 70));

  return {
    yawRatio: Number(yawRatio.toFixed(3)),
    turnDirection,
    angleDegrees,
  };
}

/**
 * Section 4 Horizontal Object Coordinate Mapping:
 * X_object = Clamp(0.08, 0.92, 0.5 + (R_yaw - 0.5) * sensitivityMultiplier)
 */
export function mapYawToHorizontalPosition(
  yawRatio: number,
  sensitivity: SteeringSensitivity = 'normal'
): number {
  const multiplier = sensitivity === 'high' ? 2.4 : sensitivity === 'low' ? 1.5 : 1.9;
  const deviation = yawRatio - 0.5;
  const mappedX = 0.5 + deviation * multiplier;
  return Math.max(0.08, Math.min(0.92, mappedX));
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
  // Left coin at x = 0.20, Right coin at x = 0.80
  const x = side === 'left' ? 0.20 : 0.80;
  return {
    id: `coin-${nextCoinId++}`,
    side,
    x,
    y: 0.70,
    radius: 0.052,
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

/** Countdown beep (low for 3, 2, 1; high for GO!) */
export function playCountdownBeep(isHigh = false): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(isHigh ? 880 : 440, now);

    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + (isHigh ? 0.35 : 0.18));

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + (isHigh ? 0.36 : 0.2));
  } catch {
    // Ignored
  }
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
    osc.frequency.setValueAtTime(450, now);
    osc.frequency.exponentialRampToValueAtTime(1200, now + 0.1);

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

    bellGain.gain.setValueAtTime(0.14, now + 0.05);
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
      osc.frequency.setValueAtTime(freq, now + idx * 0.08);

      gain.gain.setValueAtTime(0, now + idx * 0.08);
      gain.gain.linearRampToValueAtTime(0.18, now + idx * 0.08 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.45);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + idx * 0.08);
      osc.stop(now + idx * 0.08 + 0.5);
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
  const colors = ['#f59e0b', '#fbbf24', '#fde047', '#38bdf8', '#34d399', '#ffffff', '#ec4899'];
  const count = 35;

  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
    const speed = 0.005 + Math.random() * 0.009;
    particles.push({
      x: cx,
      y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      color: colors[Math.floor(Math.random() * colors.length)],
      size: 4 + Math.random() * 6,
      alpha: 1,
      life: 0,
      maxLife: 40 + Math.floor(Math.random() * 25),
    });
  }
  return particles;
}

/** Dual jet engine flame & smoke trails trailing behind glider */
export function createJetTrailParticles(x: number, y: number, tilt: number): NeckParticle[] {
  const particles: NeckParticle[] = [];
  // Two engine nozzles spaced horizontally
  const leftX = x - 0.028 + tilt * 0.01;
  const rightX = x + 0.028 + tilt * 0.01;
  const trailY = y + 0.038;

  const colors = ['#38bdf8', '#67e8f9', '#bae6fd', '#fde047', '#f97316'];

  for (const originX of [leftX, rightX]) {
    particles.push({
      x: originX + (Math.random() - 0.5) * 0.005,
      y: trailY,
      vx: (Math.random() - 0.5) * 0.001 - tilt * 0.002,
      vy: 0.003 + Math.random() * 0.004,
      color: colors[Math.floor(Math.random() * colors.length)],
      size: 3 + Math.random() * 4,
      alpha: 0.8,
      life: 0,
      maxLife: 20 + Math.floor(Math.random() * 10),
    });
  }

  return particles;
}

export function createFloatingScore(cx: number, cy: number, score = 50, streak = 0): FloatingText {
  const text = streak > 1 ? `+${score} 🔥 ${streak}x!` : `+${score}`;
  return {
    text,
    x: cx,
    y: cy - 0.05,
    alpha: 1,
    life: 0,
    maxLife: 45,
    color: streak > 1 ? '#f97316' : '#fbbf24',
  };
}

/** Victory celebration confetti burst */
export function createCelebrationConfetti(): NeckParticle[] {
  const particles: NeckParticle[] = [];
  const colors = ['#38bdf8', '#f59e0b', '#10b981', '#ec4899', '#8b5cf6', '#f43f5e', '#eab308'];

  for (let i = 0; i < 80; i++) {
    particles.push({
      x: 0.2 + Math.random() * 0.6,
      y: 0.1 + Math.random() * 0.3,
      vx: (Math.random() - 0.5) * 0.01,
      vy: 0.002 + Math.random() * 0.006,
      color: colors[Math.floor(Math.random() * colors.length)],
      size: 5 + Math.random() * 6,
      alpha: 1,
      life: 0,
      maxLife: 80 + Math.floor(Math.random() * 40),
    });
  }
  return particles;
}

/* ========================================================================== */
/* Parallax Environment Background Helpers                                    */
/* ========================================================================== */

export function createInitialClouds(): CloudItem[] {
  return [
    { x: 0.1, y: 0.12, width: 140, height: 42, speed: 0.00015, opacity: 0.65 },
    { x: 0.45, y: 0.18, width: 200, height: 55, speed: 0.00022, opacity: 0.75 },
    { x: 0.78, y: 0.08, width: 160, height: 48, speed: 0.00018, opacity: 0.6 },
    { x: 0.25, y: 0.28, width: 120, height: 38, speed: 0.00012, opacity: 0.5 },
    { x: 0.9, y: 0.24, width: 180, height: 50, speed: 0.00025, opacity: 0.7 },
  ];
}

export function updateClouds(clouds: CloudItem[]): void {
  for (const c of clouds) {
    c.x += c.speed;
    if (c.x > 1.2) {
      c.x = -0.25;
    }
  }
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
    y: 0.70,
    tiltAngle: 0,
    radius: 0.048,
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
    onCoinCollected?: (cx: number, cy: number, streak: number) => void
  ): NeckHorizontalTelemetry {
    // Check if face landmarks are visible
    if (!landmarks || landmarks.length < 9) {
      return this.buildTelemetry(0.5, 0, 'center', false, 'Align head and shoulders clearly in center of frame to fly!');
    }

    const nose = landmarks[0];
    const leftEar = landmarks[7];
    const rightEar = landmarks[8];

    if (!nose || !leftEar || !rightEar) {
      return this.buildTelemetry(0.5, 0, 'center', false, 'Detecting head & ear alignment...');
    }

    const { yawRatio, turnDirection, angleDegrees } = calculateHeadYawRatio(nose, leftEar, rightEar);

    // Update session peak angles
    if (turnDirection === 'left' && angleDegrees > this.peakLeftAngle) {
      this.peakLeftAngle = angleDegrees;
    } else if (turnDirection === 'right' && angleDegrees > this.peakRightAngle) {
      this.peakRightAngle = angleDegrees;
    }

    // Map yaw ratio to target glider X coordinate
    const targetX = mapYawToHorizontalPosition(yawRatio, this.sensitivity);
    this.drone.targetX = targetX;

    // Smooth glider horizontal motion using linear interpolation (lerp)
    const lerpAlpha = 0.18;
    const prevX = this.drone.x;
    this.drone.x = this.drone.x + (targetX - this.drone.x) * lerpAlpha;

    // Banking tilt proportional to velocity
    const velocityX = this.drone.x - prevX;
    this.drone.tiltAngle = Math.max(-0.45, Math.min(0.45, velocityX * 22));

    // Collision detection between glider and coin
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
      const coinScore = 50 + Math.min(100, (this.streak - 1) * 20);
      this.totalScore += coinScore;

      if (this.soundEnabled) {
        playCoinPopSound();
        if (this.coinsCollected >= TARGET_COINS_GOAL) {
          playSetCompletionFanfare();
        }
      }

      onCoinCollected?.(this.currentCoin.x, this.currentCoin.y, this.streak);

      const record: NeckRecord = {
        id: this.coinsCollected,
        side: this.currentCoin.side,
        angleDegrees,
        timestamp: Date.now(),
      };
      this.reps = [record, ...this.reps].slice(0, 15);

      this.persistSession();

      // Switch sides to encourage alternating rotation
      this.targetSide = this.targetSide === 'left' ? 'right' : 'left';
      this.currentCoin = createTargetCoin(this.targetSide);

      feedbackMessage = `COIN CAPTURED! +${coinScore} PTS! Next target: ${this.targetSide.toUpperCase()}!`;
    } else {
      if (this.targetSide === 'left') {
        feedbackMessage =
          turnDirection === 'left'
            ? `Gliding Left (${angleDegrees}°)... reach for the golden sun!`
            : 'Turn head smoothly LEFT to guide glider!';
      } else {
        feedbackMessage =
          turnDirection === 'right'
            ? `Gliding Right (${angleDegrees}°)... reach for the golden sun!`
            : 'Turn head smoothly RIGHT to guide glider!';
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
