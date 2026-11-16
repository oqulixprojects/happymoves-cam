import type { Landmark } from '@/services/tracking/types';
import type {
  FlightSensitivity,
  PitchDirection,
  AltitudeBand,
  TargetStar,
  FlyingCharacter,
  NeckVerticalRecord,
  NeckVerticalTelemetry,
  StoredNeckVerticalData,
  VerticalParticle,
  FloatingText,
} from './types';

export const TARGET_STARS_GOAL = 15;

export const LOCAL_STORAGE_KEY = 'task6_neck_vertical_results';
export const LOCAL_STORAGE_FALLBACK_KEY = 'task6_results';

/** Standard 2D Euclidean distance */
export function calculateDistance(
  a: { x: number; y: number },
  b: { x: number; y: number }
): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Section 4 Pitch Angle & Delta Calculation:
 * Delta_y = y_nose - y_ear_mid
 * Ear_mid = (Left_Ear_7 + Right_Ear_8) / 2
 * Tilting head UP: Delta_y < 0 (lifts character into sky)
 * Dipping head DOWN: Delta_y > 0 (dives character into ground)
 */
export function calculateHeadPitch(
  nose: Landmark,
  leftEar: Landmark,
  rightEar: Landmark,
  neutralOffset = 0.02
): {
  pitchDelta: number;
  pitchDirection: PitchDirection;
  angleDegrees: number;
} {
  const earMidY = (leftEar.y + rightEar.y) / 2;
  const rawDelta = nose.y - earMidY;
  const pitchDelta = rawDelta - neutralOffset;

  let pitchDirection: PitchDirection = 'neutral';
  let angleDegrees = 0;

  if (pitchDelta < -0.012) {
    pitchDirection = 'up'; // Extension
    // Normal cervical extension is ~45° - 50°
    angleDegrees = Math.min(60, Math.round((Math.abs(pitchDelta) / 0.08) * 45));
  } else if (pitchDelta > 0.012) {
    pitchDirection = 'down'; // Flexion
    // Normal cervical flexion is ~40° - 45°
    angleDegrees = Math.min(60, Math.round((Math.abs(pitchDelta) / 0.08) * 45));
  }

  return {
    pitchDelta: Number(pitchDelta.toFixed(3)),
    pitchDirection,
    angleDegrees,
  };
}

/**
 * Section 4 Vertical Coordinate Mapping:
 * Y_character = Clamp(0.12, 0.88, 0.5 + (Delta_y * SensitivityMultiplier))
 */
export function mapPitchToVerticalPosition(
  pitchDelta: number,
  sensitivity: FlightSensitivity = 'normal'
): number {
  const multiplier = sensitivity === 'high' ? 3.8 : sensitivity === 'low' ? 2.2 : 3.0;
  const mappedY = 0.50 + pitchDelta * multiplier;
  return Math.max(0.12, Math.min(0.88, mappedY));
}

let nextStarId = 1;
export function createTargetStar(altitude: AltitudeBand): TargetStar {
  // High sky star at y = 0.22, Low pearl at y = 0.78
  const y = altitude === 'high' ? 0.22 : 0.78;
  const type = altitude === 'high' ? 'star' : 'pearl';

  return {
    id: `star-${nextStarId++}`,
    altitude,
    x: 0.50,
    y,
    radius: 0.055,
    type,
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

/** Catch sound for high altitude golden star */
export function playStarCatchSound(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const notes = [659.25, 880.0, 1174.66]; // E5, A5, D6

    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + idx * 0.06);

      gain.gain.setValueAtTime(0, now + idx * 0.06);
      gain.gain.linearRampToValueAtTime(0.16, now + idx * 0.06 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.06 + 0.35);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + idx * 0.06);
      osc.stop(now + idx * 0.06 + 0.38);
    });
  } catch {
    // Ignored
  }
}

/** Catch sound for low altitude ocean pearl */
export function playPearlCatchSound(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.exponentialRampToValueAtTime(800, now + 0.1);

    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.25);
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

export function createCatchBurst(cx: number, cy: number, isStar = true): VerticalParticle[] {
  const particles: VerticalParticle[] = [];
  const starColors = ['#f59e0b', '#fbbf24', '#fde047', '#ffffff', '#38bdf8'];
  const pearlColors = ['#06b6d4', '#38bdf8', '#67e8f9', '#a5f3fc', '#ffffff'];
  const colors = isStar ? starColors : pearlColors;
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

export function createFloatingScore(cx: number, cy: number, score = 50, color = '#fbbf24'): FloatingText {
  return {
    text: `+${score} PTS`,
    x: cx,
    y: cy - 0.04,
    alpha: 1,
    life: 0,
    maxLife: 42,
    color,
  };
}

/* ========================================================================== */
/* LocalStorage Persistence Helper                                            */
/* ========================================================================== */

export function saveResultsToStorage(data: StoredNeckVerticalData): void {
  try {
    const payload = JSON.stringify(data);
    localStorage.setItem(LOCAL_STORAGE_KEY, payload);
    localStorage.setItem(LOCAL_STORAGE_FALLBACK_KEY, payload);
  } catch (err) {
    console.warn('[NeckVertical] Failed to save results to localStorage:', err);
  }
}

export function loadResultsFromStorage(): StoredNeckVerticalData | null {
  try {
    const saved = localStorage.getItem(LOCAL_STORAGE_KEY) || localStorage.getItem(LOCAL_STORAGE_FALLBACK_KEY);
    if (!saved) return null;
    return JSON.parse(saved) as StoredNeckVerticalData;
  } catch {
    return null;
  }
}

/* ========================================================================== */
/* Neck Vertical Tracker State Machine                                        */
/* ========================================================================== */

export class NeckVerticalTracker {
  character: FlyingCharacter = {
    x: 0.5,
    y: 0.5,
    targetY: 0.5,
    radius: 0.048,
    pitchAngle: 0,
  };

  targetAltitude: AltitudeBand = 'high';
  currentStar: TargetStar = createTargetStar('high');

  peakExtensionAngle = 0;
  peakFlexionAngle = 0;

  starsCollected = 0;
  totalAttempts = 0;
  totalScore = 0;
  streak = 0;

  neutralOffset = 0.02;
  sensitivity: FlightSensitivity = 'normal';
  soundEnabled = true;

  prevTargetY = 0.5;
  jitterAccumulator = 0;
  jitterSamples = 0;

  reps: NeckVerticalRecord[] = [];

  constructor() {
    this.targetAltitude = 'high';
    this.currentStar = createTargetStar('high');
  }

  reset(): void {
    this.character.y = 0.5;
    this.character.targetY = 0.5;
    this.character.pitchAngle = 0;
    this.targetAltitude = 'high';
    this.currentStar = createTargetStar('high');
    this.peakExtensionAngle = 0;
    this.peakFlexionAngle = 0;
    this.starsCollected = 0;
    this.totalAttempts = 0;
    this.totalScore = 0;
    this.streak = 0;
    this.jitterAccumulator = 0;
    this.jitterSamples = 0;
    this.reps = [];
  }

  update(
    landmarks: Landmark[] | undefined,
    _nowMs: number,
    onCatch?: (cx: number, cy: number, isStar: boolean) => void
  ): NeckVerticalTelemetry {
    // If landmarks missing
    if (!landmarks || landmarks.length < 9) {
      return this.buildTelemetry(0, 0, 'neutral', false, 'Align head clearly in front of camera.');
    }

    const nose = landmarks[0];
    const leftEar = landmarks[7];
    const rightEar = landmarks[8];

    if (!nose || !leftEar || !rightEar) {
      return this.buildTelemetry(0, 0, 'neutral', false, 'Looking for nose and ear landmarks...');
    }

    const { pitchDelta, pitchDirection, angleDegrees } = calculateHeadPitch(
      nose,
      leftEar,
      rightEar,
      this.neutralOffset
    );

    // Update session peak angles
    if (pitchDirection === 'up' && angleDegrees > this.peakExtensionAngle) {
      this.peakExtensionAngle = angleDegrees;
    } else if (pitchDirection === 'down' && angleDegrees > this.peakFlexionAngle) {
      this.peakFlexionAngle = angleDegrees;
    }

    // Map to target Y
    const targetY = mapPitchToVerticalPosition(pitchDelta, this.sensitivity);
    this.character.targetY = targetY;

    // Smooth movement via lerp
    const lerpAlpha = 0.16;
    const prevY = this.character.y;
    this.character.y = this.character.y + (targetY - this.character.y) * lerpAlpha;

    // Pitch tilt of the flying character
    const velocityY = this.character.y - prevY;
    this.character.pitchAngle = Math.max(-0.45, Math.min(0.45, velocityY * 16));

    // Smoothness measurement
    const jerk = Math.abs(targetY - this.prevTargetY);
    this.prevTargetY = targetY;
    this.jitterAccumulator += jerk;
    this.jitterSamples += 1;

    // Collision detection with current star/pearl
    const distToStar = calculateDistance(
      { x: this.character.x, y: this.character.y },
      { x: this.currentStar.x, y: this.currentStar.y }
    );

    let feedbackMessage = '';

    if (distToStar < this.character.radius + this.currentStar.radius + 0.02) {
      // Caught!
      this.starsCollected += 1;
      this.totalAttempts += 1;
      this.streak += 1;
      const scoreGain = 50 + Math.min(50, this.streak * 10);
      this.totalScore += scoreGain;

      const isStar = this.currentStar.type === 'star';
      if (this.soundEnabled) {
        if (isStar) playStarCatchSound();
        else playPearlCatchSound();

        if (this.starsCollected % TARGET_STARS_GOAL === 0) {
          playSetCompletionFanfare();
        }
      }

      onCatch?.(this.currentStar.x, this.currentStar.y, isStar);

      const record: NeckVerticalRecord = {
        id: this.starsCollected,
        altitude: this.currentStar.altitude,
        angleDegrees,
        pitchDirection,
        timestamp: Date.now(),
      };
      this.reps = [record, ...this.reps].slice(0, 10);

      this.persistSession();

      // Switch altitude to encourage vertical alternating movement
      this.targetAltitude = this.targetAltitude === 'high' ? 'low' : 'high';
      this.currentStar = createTargetStar(this.targetAltitude);

      feedbackMessage = isStar
        ? `STAR CAPTURED! +${scoreGain} PTS! Now dip chin DOWN to dive for the pearl!`
        : `PEARL COLLECTED! +${scoreGain} PTS! Now tilt head UP to fly into the sky!`;
    } else {
      if (this.targetAltitude === 'high') {
        feedbackMessage =
          pitchDirection === 'up'
            ? `Tilting Up (${angleDegrees}°)... fly into the clouds to catch the golden star!`
            : 'Tilt head UP toward the sky to fly higher!';
      } else {
        feedbackMessage =
          pitchDirection === 'down'
            ? `Dipping Down (${angleDegrees}°)... dive toward the deep to collect the pearl!`
            : 'Dip chin DOWN toward your chest to dive lower!';
      }
    }

    return this.buildTelemetry(pitchDelta, angleDegrees, pitchDirection, true, feedbackMessage);
  }

  buildTelemetry(
    pitchDelta: number,
    angleDegrees: number,
    pitchDirection: PitchDirection,
    isTrackingValid: boolean,
    feedbackMessage: string
  ): NeckVerticalTelemetry {
    const accuracy =
      this.totalAttempts > 0
        ? Math.round((this.starsCollected / this.totalAttempts) * 100)
        : 100;

    const meanJerk = this.jitterSamples > 0 ? this.jitterAccumulator / this.jitterSamples : 0;
    const smoothness = Math.max(80, Math.min(100, Math.round(100 - meanJerk * 180)));

    return {
      currentPitchDelta: pitchDelta,
      currentPitchAngle: angleDegrees,
      pitchDirection,
      peakExtensionAngle: this.peakExtensionAngle,
      peakFlexionAngle: this.peakFlexionAngle,
      catchAccuracy: accuracy,
      smoothnessIndex: smoothness,
      starsCollected: this.starsCollected,
      targetStarsGoal: TARGET_STARS_GOAL,
      totalScore: this.totalScore,
      streak: this.streak,
      characterY: Number(this.character.y.toFixed(3)),
      targetAltitude: this.targetAltitude,
      feedbackMessage,
      reps: this.reps,
      isTrackingValid,
    };
  }

  persistSession(): void {
    const accuracy =
      this.totalAttempts > 0
        ? Math.round((this.starsCollected / this.totalAttempts) * 100)
        : 100;

    const meanJerk = this.jitterSamples > 0 ? this.jitterAccumulator / this.jitterSamples : 0;
    const smoothness = Math.max(80, Math.min(100, Math.round(100 - meanJerk * 180)));

    const data: StoredNeckVerticalData = {
      lastSessionDate: new Date().toISOString(),
      starsCollected: this.starsCollected,
      peakExtensionAngle: this.peakExtensionAngle,
      peakFlexionAngle: this.peakFlexionAngle,
      catchAccuracy: accuracy,
      smoothnessIndex: smoothness,
      totalScore: this.totalScore,
      repsCount: this.reps.length,
    };
    saveResultsToStorage(data);
  }
}
