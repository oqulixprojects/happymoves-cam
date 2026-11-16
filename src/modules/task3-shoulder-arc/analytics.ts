import type { Landmark } from '@/services/tracking/types';
import type {
  TrackedArm,
  RepState,
  CheckpointStar,
  ShoulderArcRecord,
  ShoulderArcTelemetry,
  StoredShoulderArcData,
  ArcParticle,
  FloatingText,
} from './types';

export const REQUIRED_HOLD_SECONDS = 3.0;
export const DEFAULT_TARGET_ANGLE = 120;
export const THERAPEUTIC_ZONE_MIN = 90;

export const LOCAL_STORAGE_KEY = 'task3_shoulder_arc_results';
export const LOCAL_STORAGE_FALLBACK_KEY = 'task3_results';

/** Standard 2D Euclidean distance */
export function calculateDistance(
  a: { x: number; y: number },
  b: { x: number; y: number }
): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Section 4 Angle Formula:
 * u = Hip - Shoulder, v = Wrist - Shoulder
 * theta = arccos( (u . v) / (||u|| * ||v||) ) * (180 / pi)
 * Corrects for video aspect ratio so x and y have equal metric scale.
 */
export function calculateShoulderAbductionAngle(
  hip: Landmark,
  shoulder: Landmark,
  wrist: Landmark,
  aspect = 1.0
): number {
  // Vector u: Shoulder to Hip (downward torso baseline)
  const ux = (hip.x - shoulder.x) * aspect;
  const uy = hip.y - shoulder.y;

  // Vector v: Shoulder to Wrist (arm direction)
  const vx = (wrist.x - shoulder.x) * aspect;
  const vy = wrist.y - shoulder.y;

  const dot = ux * vx + uy * vy;
  const magU = Math.hypot(ux, uy);
  const magV = Math.hypot(vx, vy);

  if (magU === 0 || magV === 0) return 0;

  const cosTheta = Math.max(-1, Math.min(1, dot / (magU * magV)));
  const angleRad = Math.acos(cosTheta);
  const angleDeg = (angleRad * 180) / Math.PI;

  return Math.round(angleDeg);
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

/** Checkpoint star burst chime */
export function playStarChime(frequency = 783.99): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(frequency, now);

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.15, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.38);
  } catch {
    // Audio ignored if blocked
  }
}

/** Celebration fanfare on completing a full 3s hold rep */
export function playRepCompleteFanfare(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6

    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
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

/** Hold progress tick */
export function playHoldTick(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(900, now);

    gain.gain.setValueAtTime(0.04, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.06);
  } catch {
    // Ignored
  }
}

/* ========================================================================== */
/* Particle and Visual Burst Generators                                       */
/* ========================================================================== */

export function createStarBurst(cx: number, cy: number, color = '#fbbf24'): ArcParticle[] {
  const particles: ArcParticle[] = [];
  const count = 28;

  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.4;
    const speed = 0.004 + Math.random() * 0.008;
    particles.push({
      x: cx,
      y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      color,
      size: 4 + Math.random() * 5,
      alpha: 1,
      life: 0,
      maxLife: 35 + Math.floor(Math.random() * 20),
    });
  }
  return particles;
}

export function createFloatingText(cx: number, cy: number, text: string, color = '#34d399'): FloatingText {
  return {
    text,
    x: cx,
    y: cy - 0.03,
    alpha: 1,
    life: 0,
    maxLife: 42,
    color,
  };
}

/* ========================================================================== */
/* LocalStorage Persistence Helper                                            */
/* ========================================================================== */

export function saveResultsToStorage(data: StoredShoulderArcData): void {
  try {
    const payload = JSON.stringify(data);
    localStorage.setItem(LOCAL_STORAGE_KEY, payload);
    localStorage.setItem(LOCAL_STORAGE_FALLBACK_KEY, payload);
  } catch (err) {
    console.warn('[ShoulderArc] Failed to save results to localStorage:', err);
  }
}

export function loadResultsFromStorage(): StoredShoulderArcData | null {
  try {
    const saved = localStorage.getItem(LOCAL_STORAGE_KEY) || localStorage.getItem(LOCAL_STORAGE_FALLBACK_KEY);
    if (!saved) return null;
    return JSON.parse(saved) as StoredShoulderArcData;
  } catch {
    return null;
  }
}

/* ========================================================================== */
/* Shoulder Arc Tracker State Machine                                         */
/* ========================================================================== */

export class ShoulderArcTracker {
  activeArm: 'left' | 'right' = 'right';
  targetAngle = DEFAULT_TARGET_ANGLE;

  repCount = 0;
  repState: RepState = 'resting';
  currentRepPeak = 0;
  sessionMaxROM = 0;

  holdStartTime = 0;
  lastTickTime = 0;
  lastFrameTime = 0;
  therapeuticTimeSeconds = 0;

  checkpoints: CheckpointStar[] = [
    { angle: 60, label: '60° Star', collected: false },
    { angle: 90, label: '90° Star', collected: false },
    { angle: 120, label: '120° Star', collected: false },
  ];

  reps: ShoulderArcRecord[] = [];
  soundEnabled = true;

  reset(): void {
    this.repCount = 0;
    this.repState = 'resting';
    this.currentRepPeak = 0;
    this.sessionMaxROM = 0;
    this.holdStartTime = 0;
    this.lastTickTime = 0;
    this.lastFrameTime = 0;
    this.therapeuticTimeSeconds = 0;
    this.resetCheckpoints();
    this.reps = [];
  }

  resetCheckpoints(): void {
    this.checkpoints = [
      { angle: 60, label: '60° Star', collected: false },
      { angle: 90, label: '90° Star', collected: false },
      { angle: 120, label: '120° Star', collected: false },
    ];
  }

  update(
    landmarks: Landmark[] | undefined,
    selectedArmPref: TrackedArm,
    nowMs: number,
    aspect = 1.0,
    onStarCollected?: (starAngle: number) => void,
    onRepCompleted?: (cx: number, cy: number) => void
  ): ShoulderArcTelemetry {
    const dtSec = this.lastFrameTime > 0 ? Math.min(0.2, (nowMs - this.lastFrameTime) / 1000) : 0;
    this.lastFrameTime = nowMs;

    // Minimum landmarks validation
    if (!landmarks || landmarks.length < 33) {
      return this.buildTelemetry(0, false, 'Stand or sit so upper body (hips, shoulders, wrists) is visible.');
    }

    // Left arm landmarks: Shoulder 11, Wrist 15, Hip 23
    // Right arm landmarks: Shoulder 12, Wrist 16, Hip 24
    const lShoulder = landmarks[11];
    const lWrist = landmarks[15];
    const lHip = landmarks[23];

    const rShoulder = landmarks[12];
    const rWrist = landmarks[16];
    const rHip = landmarks[24];

    const leftAngle = calculateShoulderAbductionAngle(lHip, lShoulder, lWrist, aspect);
    const rightAngle = calculateShoulderAbductionAngle(rHip, rShoulder, rWrist, aspect);

    // Determine active arm
    if (selectedArmPref === 'left') {
      this.activeArm = 'left';
    } else if (selectedArmPref === 'right') {
      this.activeArm = 'right';
    } else {
      // Auto: select arm currently exhibiting higher mobility or movement
      if (Math.abs(leftAngle - rightAngle) > 15) {
        this.activeArm = leftAngle > rightAngle ? 'left' : 'right';
      }
    }

    const currentAngle = this.activeArm === 'left' ? leftAngle : rightAngle;

    // Accumulate therapeutic overhead time (> 90 deg)
    if (currentAngle >= THERAPEUTIC_ZONE_MIN) {
      this.therapeuticTimeSeconds += dtSec;
    }

    // Update peak ROM
    if (currentAngle > this.currentRepPeak) {
      this.currentRepPeak = currentAngle;
    }
    if (currentAngle > this.sessionMaxROM) {
      this.sessionMaxROM = currentAngle;
    }

    // Checkpoint star detection
    this.checkpoints.forEach((cp) => {
      if (!cp.collected && currentAngle >= cp.angle) {
        cp.collected = true;
        if (this.soundEnabled) {
          const freq = cp.angle === 60 ? 659.25 : cp.angle === 90 ? 783.99 : 987.77;
          playStarChime(freq);
        }
        onStarCollected?.(cp.angle);
      }
    });

    let currentHoldSec = 0;
    let holdProgressPercent = 0;
    let feedbackMessage = '';

    // Rep State Machine: resting -> raising -> holding -> lowering
    switch (this.repState) {
      case 'resting': {
        this.holdStartTime = 0;
        if (currentAngle > 35) {
          this.repState = 'raising';
          this.currentRepPeak = currentAngle;
          feedbackMessage = 'Raising arm out to side... reach through the star checkpoints!';
        } else {
          feedbackMessage = 'Arm at side. Raise arm laterally into an arc to begin!';
        }
        break;
      }

      case 'raising': {
        if (currentAngle >= this.targetAngle) {
          this.repState = 'holding';
          this.holdStartTime = nowMs;
          feedbackMessage = 'Target reached! Hold steady for 3 seconds!';
        } else if (currentAngle < 25) {
          // Returned before reaching target
          this.repState = 'resting';
          this.resetCheckpoints();
          feedbackMessage = 'Rep reset. Raise arm out to side.';
        } else {
          feedbackMessage = `Abducting shoulder: ${currentAngle}°. Target: ${this.targetAngle}°`;
        }
        break;
      }

      case 'holding': {
        if (currentAngle >= this.targetAngle - 10) {
          const elapsedSec = (nowMs - this.holdStartTime) / 1000;
          currentHoldSec = Number(elapsedSec.toFixed(1));
          holdProgressPercent = Math.min(100, Math.round((elapsedSec / REQUIRED_HOLD_SECONDS) * 100));

          if (this.soundEnabled && nowMs - this.lastTickTime >= 450 && elapsedSec < REQUIRED_HOLD_SECONDS) {
            this.lastTickTime = nowMs;
            playHoldTick();
          }

          feedbackMessage = `Holding peak ROM! Keep steady (${currentHoldSec}s / ${REQUIRED_HOLD_SECONDS}s)`;

          // 3-second hold completed
          if (elapsedSec >= REQUIRED_HOLD_SECONDS) {
            this.repCount += 1;
            this.repState = 'lowering';

            const activeShoulder = this.activeArm === 'left' ? lShoulder : rShoulder;
            const collectedCount = this.checkpoints.filter((c) => c.collected).length;

            const newRecord: ShoulderArcRecord = {
              id: this.repCount,
              arm: this.activeArm,
              peakAngle: this.currentRepPeak,
              holdTimeSeconds: REQUIRED_HOLD_SECONDS,
              targetAchieved: true,
              checkpointsCollected: collectedCount,
              timestamp: Date.now(),
            };
            this.reps = [newRecord, ...this.reps].slice(0, 10);

            if (this.soundEnabled) playRepCompleteFanfare();
            onRepCompleted?.(activeShoulder.x, activeShoulder.y);

            this.persistSession();
            feedbackMessage = `Great 3s hold! Lower arm back to side to finish Rep #${this.repCount}.`;
          }
        } else {
          // Dropped below target band before completing 3s hold
          this.repState = 'raising';
          this.holdStartTime = 0;
          feedbackMessage = 'Lost hold threshold! Raise arm back up to target band.';
        }
        break;
      }

      case 'lowering': {
        if (currentAngle <= 35) {
          this.repState = 'resting';
          this.resetCheckpoints();
          this.currentRepPeak = 0;
          feedbackMessage = `Rep #${this.repCount} complete! Ready for next repetition.`;
        } else {
          feedbackMessage = 'Lower arm smoothly down to your side.';
        }
        break;
      }
    }

    return this.buildTelemetry(currentAngle, true, feedbackMessage, currentHoldSec, holdProgressPercent);
  }

  buildTelemetry(
    currentAngle: number,
    isTrackingValid: boolean,
    feedbackMessage: string,
    currentHoldSeconds = 0,
    holdProgressPercent = 0
  ): ShoulderArcTelemetry {
    // Quality score based on target achievement and checkpoint collection
    const targetRatio = Math.min(1, currentAngle / this.targetAngle);
    const qualityScore = Math.round(targetRatio * 100);

    return {
      activeArm: this.activeArm,
      currentAngle,
      targetAngle: this.targetAngle,
      peakAngle: this.currentRepPeak,
      sessionMaxROM: this.sessionMaxROM,
      repCount: this.repCount,
      repState: this.repState,
      holdProgressPercent,
      currentHoldSeconds,
      requiredHoldSeconds: REQUIRED_HOLD_SECONDS,
      therapeuticTimeSeconds: Number(this.therapeuticTimeSeconds.toFixed(1)),
      qualityScore,
      checkpoints: this.checkpoints,
      feedbackMessage,
      reps: this.reps,
      isTrackingValid,
    };
  }

  persistSession(): void {
    const data: StoredShoulderArcData = {
      lastSessionDate: new Date().toISOString(),
      repsCompleted: this.repCount,
      peakROM: this.sessionMaxROM,
      therapeuticZoneSeconds: Number(this.therapeuticTimeSeconds.toFixed(1)),
      avgHoldTime: REQUIRED_HOLD_SECONDS,
      totalScore: this.repCount * 100,
      activeArm: this.activeArm,
    };
    saveResultsToStorage(data);
  }
}
