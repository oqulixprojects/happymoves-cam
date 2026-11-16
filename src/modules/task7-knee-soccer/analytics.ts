import type { Landmark } from '@/services/tracking/types';
import type {
  TrackedLeg,
  KickPhase,
  TargetCorner,
  SoccerBall,
  GoalTarget,
  KickRecord,
  KneeSoccerTelemetry,
  StoredKneeSoccerData,
  SoccerParticle,
  FloatingText,
} from './types';

export const TARGET_EXTENSION_ANGLE = 160;
export const RESTING_FLEXION_MAX = 110;
export const TARGET_KICKS_GOAL = 10;

export const LOCAL_STORAGE_KEY = 'task7_knee_soccer_results';
export const LOCAL_STORAGE_FALLBACK_KEY = 'task7_results';

/** Standard 2D Euclidean distance */
export function calculateDistance(
  a: { x: number; y: number },
  b: { x: number; y: number }
): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Section 4 Knee Angle Calculation:
 * V_hip_knee = Hip - Knee, V_ankle_knee = Ankle - Knee
 * theta_knee = arccos( (V_hip_knee . V_ankle_knee) / (|V_hip_knee| * |V_ankle_knee|) ) * (180 / pi)
 * Corrected for video aspect ratio.
 */
export function calculateKneeAngle(
  hip: Landmark,
  knee: Landmark,
  ankle: Landmark,
  aspect = 1.0
): number {
  const ux = (hip.x - knee.x) * aspect;
  const uy = hip.y - knee.y;

  const vx = (ankle.x - knee.x) * aspect;
  const vy = ankle.y - knee.y;

  const dot = ux * vx + uy * vy;
  const magU = Math.hypot(ux, uy);
  const magV = Math.hypot(vx, vy);

  if (magU === 0 || magV === 0) return 90;

  const cosTheta = Math.max(-1, Math.min(1, dot / (magU * magV)));
  const angleRad = Math.acos(cosTheta);
  const angleDeg = (angleRad * 180) / Math.PI;

  return Math.round(angleDeg);
}

export const CORNER_TARGETS: GoalTarget[] = [
  { id: 'target-tl', corner: 'top-left', x: 0.22, y: 0.16, radius: 0.05, label: 'Top-Left Corner', isActive: true },
  { id: 'target-tr', corner: 'top-right', x: 0.78, y: 0.16, radius: 0.05, label: 'Top-Right Corner', isActive: false },
  { id: 'target-bl', corner: 'bottom-left', x: 0.22, y: 0.36, radius: 0.05, label: 'Bottom-Left Corner', isActive: false },
  { id: 'target-br', corner: 'bottom-right', x: 0.78, y: 0.36, radius: 0.05, label: 'Bottom-Right Corner', isActive: false },
];

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

/** Kick launch impact sound */
export function playKickLaunchSound(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(45, now + 0.12);

    gain.gain.setValueAtTime(0.28, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.16);
  } catch {
    // Ignored
  }
}

/** Goal whistle and cheering fanfare */
export function playGoalCelebrationSound(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Referee whistle (two high chirps)
    const whistle = ctx.createOscillator();
    const wGain = ctx.createGain();
    whistle.type = 'sine';
    whistle.frequency.setValueAtTime(2400, now);
    whistle.frequency.setValueAtTime(2800, now + 0.06);

    wGain.gain.setValueAtTime(0.12, now);
    wGain.gain.linearRampToValueAtTime(0.15, now + 0.06);
    wGain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

    whistle.connect(wGain);
    wGain.connect(ctx.destination);

    whistle.start(now);
    whistle.stop(now + 0.28);

    // Triumphant chord
    const freqs = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
    freqs.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + 0.12 + idx * 0.06);

      gain.gain.setValueAtTime(0, now + 0.12 + idx * 0.06);
      gain.gain.linearRampToValueAtTime(0.16, now + 0.12 + idx * 0.06 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12 + idx * 0.06 + 0.45);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + 0.12 + idx * 0.06);
      osc.stop(now + 0.12 + idx * 0.06 + 0.5);
    });
  } catch {
    // Ignored
  }
}

/* ========================================================================== */
/* Particle and Visual Burst Generators                                       */
/* ========================================================================== */

export function createGoalConfetti(cx: number, cy: number): SoccerParticle[] {
  const particles: SoccerParticle[] = [];
  const colors = ['#10b981', '#34d399', '#38bdf8', '#f59e0b', '#ef4444', '#ffffff'];
  const count = 38;

  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.4;
    const speed = 0.005 + Math.random() * 0.012;
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

export function createGoalText(cx: number, cy: number, score = 100): FloatingText {
  return {
    text: `GOAL! +${score} PTS`,
    x: cx,
    y: cy - 0.04,
    alpha: 1,
    life: 0,
    maxLife: 45,
    color: '#34d399',
  };
}

/* ========================================================================== */
/* LocalStorage Persistence Helper                                            */
/* ========================================================================== */

export function saveResultsToStorage(data: StoredKneeSoccerData): void {
  try {
    const payload = JSON.stringify(data);
    localStorage.setItem(LOCAL_STORAGE_KEY, payload);
    localStorage.setItem(LOCAL_STORAGE_FALLBACK_KEY, payload);
  } catch (err) {
    console.warn('[KneeSoccer] Failed to save results to localStorage:', err);
  }
}

export function loadResultsFromStorage(): StoredKneeSoccerData | null {
  try {
    const saved = localStorage.getItem(LOCAL_STORAGE_KEY) || localStorage.getItem(LOCAL_STORAGE_FALLBACK_KEY);
    if (!saved) return null;
    return JSON.parse(saved) as StoredKneeSoccerData;
  } catch {
    return null;
  }
}

/* ========================================================================== */
/* Knee Soccer Session State Machine                                          */
/* ========================================================================== */

export class KneeSoccerTracker {
  activeLeg: 'left' | 'right' = 'right';
  targetIndex = 0;
  activeCorner: TargetCorner = 'top-left';

  ball: SoccerBall = {
    x: 0.5,
    y: 0.82,
    vx: 0,
    vy: 0,
    radius: 0.042,
    rotation: 0,
    isFlying: false,
  };

  kickPhase: KickPhase = 'ready';

  currentRepPeak = 90;
  sessionMaxROM = 90;

  lastAnklePos = { x: 0.5, y: 0.82 };
  lastTimeMs = 0;
  kickSpeed = 0; // m/s
  peakSpeedInRep = 0;

  kicksCompleted = 0;
  totalAttempts = 0;
  totalScore = 0;
  streak = 0;

  reps: KickRecord[] = [];
  soundEnabled = true;

  constructor() {
    this.targetIndex = 0;
    this.activeCorner = 'top-left';
  }

  reset(): void {
    this.targetIndex = 0;
    this.activeCorner = 'top-left';
    this.ball.x = 0.5;
    this.ball.y = 0.82;
    this.ball.vx = 0;
    this.ball.vy = 0;
    this.ball.isFlying = false;
    this.kickPhase = 'ready';
    this.currentRepPeak = 90;
    this.sessionMaxROM = 90;
    this.kickSpeed = 0;
    this.peakSpeedInRep = 0;
    this.kicksCompleted = 0;
    this.totalAttempts = 0;
    this.totalScore = 0;
    this.streak = 0;
    this.reps = [];
  }

  nextTarget(): void {
    this.targetIndex = (this.targetIndex + 1) % CORNER_TARGETS.length;
    this.activeCorner = CORNER_TARGETS[this.targetIndex].corner;
  }

  update(
    landmarks: Landmark[] | undefined,
    selectedLegPref: TrackedLeg,
    nowMs: number,
    aspect = 1.0,
    onGoal?: (gx: number, gy: number) => void
  ): KneeSoccerTelemetry {
    // If landmarks missing
    if (!landmarks || landmarks.length < 33) {
      return this.buildTelemetry(90, false, 'Sit so your hips, knees, and ankles are visible in frame.');
    }

    // Left leg: Hip 23, Knee 25, Ankle 27, Foot 31
    // Right leg: Hip 24, Knee 26, Ankle 28, Foot 32
    const lHip = landmarks[23];
    const lKnee = landmarks[25];
    const lAnkle = landmarks[27];

    const rHip = landmarks[24];
    const rKnee = landmarks[26];
    const rAnkle = landmarks[28];

    const leftAngle = calculateKneeAngle(lHip, lKnee, lAnkle, aspect);
    const rightAngle = calculateKneeAngle(rHip, rKnee, rAnkle, aspect);

    // Auto or manual leg selection
    if (selectedLegPref === 'left') {
      this.activeLeg = 'left';
    } else if (selectedLegPref === 'right') {
      this.activeLeg = 'right';
    } else {
      // Auto: choose leg with larger extension motion
      if (Math.abs(leftAngle - rightAngle) > 15) {
        this.activeLeg = leftAngle > rightAngle ? 'left' : 'right';
      }
    }

    const currentAngle = this.activeLeg === 'left' ? leftAngle : rightAngle;
    const activeAnkle = this.activeLeg === 'left' ? lAnkle : rAnkle;
    const activeKnee = this.activeLeg === 'left' ? lKnee : rKnee;

    // Foot velocity calculation
    if (this.lastTimeMs > 0) {
      const dtSec = Math.max(0.001, (nowMs - this.lastTimeMs) / 1000);
      const dDist = calculateDistance(activeAnkle, this.lastAnklePos);
      // Rough human lower leg length ~ 0.45m
      const legScale = Math.max(0.15, Math.abs(activeKnee.y - activeAnkle.y));
      const velocity = ((dDist / legScale) * 0.45) / dtSec;
      this.kickSpeed = Number(velocity.toFixed(1));
      if (this.kickSpeed > this.peakSpeedInRep) {
        this.peakSpeedInRep = this.kickSpeed;
      }
    }
    this.lastAnklePos = { x: activeAnkle.x, y: activeAnkle.y };
    this.lastTimeMs = nowMs;

    // Update peak ROM
    if (currentAngle > this.currentRepPeak) {
      this.currentRepPeak = currentAngle;
    }
    if (currentAngle > this.sessionMaxROM) {
      this.sessionMaxROM = currentAngle;
    }

    const activeTarget = CORNER_TARGETS[this.targetIndex];
    let feedbackMessage = '';

    // Gameplay kick state machine
    switch (this.kickPhase) {
      case 'ready': {
        // Ball stays at patient's foot
        this.ball.x = activeAnkle.x;
        this.ball.y = activeAnkle.y;
        this.ball.isFlying = false;

        if (currentAngle > 115) {
          this.kickPhase = 'kicking';
          feedbackMessage = 'Extending knee forward! Kick with power toward the target corner!';
        } else {
          feedbackMessage = `Knee flexed at ${currentAngle}°. Extend knee forward (≥ ${TARGET_EXTENSION_ANGLE}°) to kick!`;
        }
        break;
      }

      case 'kicking': {
        this.ball.x = activeAnkle.x;
        this.ball.y = activeAnkle.y;

        // Terminal extension launch threshold: angle >= 155° or accelerating forward
        if (currentAngle >= 155) {
          this.kickPhase = 'flying';
          this.ball.isFlying = true;

          // Calculate ballistic launch trajectory toward active target corner
          const dx = activeTarget.x - this.ball.x;
          const dy = activeTarget.y - this.ball.y;
          const dist = Math.hypot(dx, dy);
          const flightSpeed = Math.max(0.02, Math.min(0.05, 0.025 + this.peakSpeedInRep * 0.006));

          this.ball.vx = (dx / dist) * flightSpeed;
          this.ball.vy = (dy / dist) * flightSpeed;

          if (this.soundEnabled) playKickLaunchSound();
          feedbackMessage = `BALL LAUNCHED! Flying toward ${activeTarget.label}...`;
        } else if (currentAngle < 105) {
          // Returned back without reaching launch
          this.kickPhase = 'ready';
          this.peakSpeedInRep = 0;
          this.currentRepPeak = 90;
        } else {
          feedbackMessage = `Reaching extension: ${currentAngle}° / ${TARGET_EXTENSION_ANGLE}° Goal`;
        }
        break;
      }

      case 'flying': {
        // Advance flying ball physics
        this.ball.x += this.ball.vx;
        this.ball.y += this.ball.vy;
        this.ball.rotation += 0.25;

        // Check collision with active target corner
        const distToTarget = calculateDistance(
          { x: this.ball.x, y: this.ball.y },
          { x: activeTarget.x, y: activeTarget.y }
        );

        if (distToTarget <= activeTarget.radius + this.ball.radius + 0.03) {
          // GOAL HIT!
          this.kickPhase = 'goal';
          this.kicksCompleted += 1;
          this.totalAttempts += 1;
          this.streak += 1;
          const goalScore = 100 + Math.min(50, this.streak * 10);
          this.totalScore += goalScore;

          if (this.soundEnabled) playGoalCelebrationSound();
          onGoal?.(activeTarget.x, activeTarget.y);

          const record: KickRecord = {
            id: this.kicksCompleted,
            leg: this.activeLeg,
            peakAngle: this.currentRepPeak,
            velocity: this.peakSpeedInRep,
            hitTarget: true,
            targetCorner: this.activeCorner,
            timestamp: Date.now(),
          };
          this.reps = [record, ...this.reps].slice(0, 10);

          this.persistSession();
          this.nextTarget();

          feedbackMessage = `GOAL!! +${goalScore} PTS! Lower leg back to ~90° for the next shot!`;
        } else if (this.ball.y <= 0.08 || this.ball.x <= 0.05 || this.ball.x >= 0.95) {
          // Missed / Out of bounds
          this.kickPhase = 'resetting';
          this.totalAttempts += 1;
          this.streak = 0;

          const record: KickRecord = {
            id: this.kicksCompleted + 1,
            leg: this.activeLeg,
            peakAngle: this.currentRepPeak,
            velocity: this.peakSpeedInRep,
            hitTarget: false,
            targetCorner: this.activeCorner,
            timestamp: Date.now(),
          };
          this.reps = [record, ...this.reps].slice(0, 10);
          feedbackMessage = 'Shot missed wide! Lower leg back to 90° to reset.';
        }
        break;
      }

      case 'goal':
      case 'resetting': {
        // Wait for patient to return leg to flexed resting state (<= 110°)
        if (currentAngle <= RESTING_FLEXION_MAX) {
          this.kickPhase = 'ready';
          this.currentRepPeak = 90;
          this.peakSpeedInRep = 0;
          this.ball.x = activeAnkle.x;
          this.ball.y = activeAnkle.y;
          this.ball.isFlying = false;
          feedbackMessage = `Ready for next kick! Target: ${CORNER_TARGETS[this.targetIndex].label}`;
        } else {
          feedbackMessage = 'Lower knee back down to flexed starting position to reload ball.';
        }
        break;
      }
    }

    return this.buildTelemetry(currentAngle, true, feedbackMessage);
  }

  buildTelemetry(
    currentAngle: number,
    isTrackingValid: boolean,
    feedbackMessage: string
  ): KneeSoccerTelemetry {
    const accuracy =
      this.totalAttempts > 0
        ? Math.round((this.kicksCompleted / this.totalAttempts) * 100)
        : 100;

    return {
      activeLeg: this.activeLeg,
      currentAngle,
      targetAngle: TARGET_EXTENSION_ANGLE,
      peakAngle: this.currentRepPeak,
      sessionMaxROM: this.sessionMaxROM,
      kickSpeed: this.kickSpeed,
      targetAccuracy: accuracy,
      kicksCompleted: this.kicksCompleted,
      targetKicksGoal: TARGET_KICKS_GOAL,
      totalScore: this.totalScore,
      streak: this.streak,
      kickPhase: this.kickPhase,
      activeTargetCorner: this.activeCorner,
      feedbackMessage,
      reps: this.reps,
      isTrackingValid,
    };
  }

  persistSession(): void {
    const accuracy =
      this.totalAttempts > 0
        ? Math.round((this.kicksCompleted / this.totalAttempts) * 100)
        : 100;

    const avgSpeed =
      this.reps.length > 0
        ? Number((this.reps.reduce((acc, r) => acc + r.velocity, 0) / this.reps.length).toFixed(1))
        : 1.8;

    const data: StoredKneeSoccerData = {
      lastSessionDate: new Date().toISOString(),
      kicksCompleted: this.kicksCompleted,
      peakROM: this.sessionMaxROM,
      avgKickSpeed: avgSpeed,
      targetAccuracy: accuracy,
      totalScore: this.totalScore,
      repsCount: this.reps.length,
    };
    saveResultsToStorage(data);
  }
}
