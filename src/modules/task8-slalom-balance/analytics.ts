import type { Landmark } from '@/services/tracking/types';
import type {
  TrackedLane,
  SensitivityLevel,
  SlideItem,
  SlideItemKind,
  PenguinState,
  FishRecord,
  SlalomBalanceTelemetry,
  StoredSlalomBalanceData,
  SnowParticle,
  FloatingScore,
} from './types';

export const TARGET_FISH_GOAL = 16;
export const BASE_STANCE_WIDTH_CM = 28.0;

export const LOCAL_STORAGE_KEY = 'task8_slalom_balance_results';
export const LOCAL_STORAGE_FALLBACK_KEY = 'task8_results';

/* ========================================================================== */
/* Web Audio API Synthesizer                                                  */
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

/** Cheerful golden fish collection sound */
export function playFishCollectSound(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const freqs = [587.33, 739.99, 880.0, 1174.66]; // D5, F#5, A5, D6
    freqs.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + i * 0.045);

      gain.gain.setValueAtTime(0, now + i * 0.045);
      gain.gain.linearRampToValueAtTime(0.18, now + i * 0.045 + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.045 + 0.22);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + i * 0.045);
      osc.stop(now + i * 0.045 + 0.25);
    });
  } catch {
    // Ignored
  }
}

/** Sparkling ice crystal gem sound */
export function playGemCollectSound(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const freqs = [880.0, 1108.73, 1318.51, 1760.0]; // A5, C#6, E6, A6
    freqs.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + i * 0.04);

      gain.gain.setValueAtTime(0, now + i * 0.04);
      gain.gain.linearRampToValueAtTime(0.2, now + i * 0.04 + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.04 + 0.3);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + i * 0.04);
      osc.stop(now + i * 0.04 + 0.32);
    });
  } catch {
    // Ignored
  }
}

/** Soft ice obstacle brush sound */
export function playObstacleBumpSound(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(70, now + 0.14);

    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.17);
  } catch {
    // Ignored
  }
}

/* ========================================================================== */
/* Particle Generators                                                        */
/* ========================================================================== */

export function createSnowSplash(cx: number, cy: number): SnowParticle[] {
  const particles: SnowParticle[] = [];
  const colors = ['#ffffff', '#bae6fd', '#7dd3fc', '#fef08a', '#38bdf8'];
  const count = 22;

  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
    const speed = 0.003 + Math.random() * 0.008;
    particles.push({
      x: cx,
      y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 0.002,
      size: 3 + Math.random() * 5,
      alpha: 1,
      life: 0,
      maxLife: 25 + Math.floor(Math.random() * 20),
      color: colors[Math.floor(Math.random() * colors.length)],
    });
  }
  return particles;
}

export function createFloatingScore(
  text: string,
  cx: number,
  cy: number,
  color = '#facc15'
): FloatingScore {
  return {
    text,
    x: cx,
    y: cy - 0.03,
    alpha: 1,
    life: 0,
    maxLife: 35,
    color,
  };
}

/* ========================================================================== */
/* Persistence Helpers                                                        */
/* ========================================================================== */

export function saveResultsToStorage(data: StoredSlalomBalanceData): void {
  try {
    const payload = JSON.stringify(data);
    localStorage.setItem(LOCAL_STORAGE_KEY, payload);
    localStorage.setItem(LOCAL_STORAGE_FALLBACK_KEY, payload);
  } catch (err) {
    console.warn('[SlalomBalance] Failed to save results to localStorage:', err);
  }
}

export function loadResultsFromStorage(): StoredSlalomBalanceData | null {
  try {
    const saved =
      localStorage.getItem(LOCAL_STORAGE_KEY) || localStorage.getItem(LOCAL_STORAGE_FALLBACK_KEY);
    if (!saved) return null;
    return JSON.parse(saved) as StoredSlalomBalanceData;
  } catch {
    return null;
  }
}

/* ========================================================================== */
/* Slalom Balance Game & Vision Tracker Engine                                */
/* ========================================================================== */

export class SlalomBalanceTracker {
  neutralCalibratedX = 0;
  isCalibrated = false;

  sensitivity: SensitivityLevel = 'normal';
  soundEnabled = true;

  penguin: PenguinState = {
    x: 0.5,
    targetX: 0.5,
    y: 0.78,
    vx: 0,
    tiltAngle: 0,
    flipperAngle: 0,
  };

  items: SlideItem[] = [];
  lastItemSpawnTime = 0;
  spawnCounter = 0;

  currentShiftRatio = 0;
  currentShiftCm = 0;
  peakLeftShiftCm = 0;
  peakRightShiftCm = 0;

  activeLane: TrackedLane = 'center';

  fishCollected = 0;
  totalScore = 0;
  streak = 0;

  reps: FishRecord[] = [];

  // Stability sliding window (last 30 samples)
  shiftHistory: number[] = [];
  stabilityScore = 95;

  constructor() {
    this.reset();
  }

  reset(): void {
    this.penguin.x = 0.5;
    this.penguin.targetX = 0.5;
    this.penguin.vx = 0;
    this.penguin.tiltAngle = 0;
    this.penguin.flipperAngle = 0;

    this.items = [];
    this.lastItemSpawnTime = 0;
    this.spawnCounter = 0;

    this.currentShiftRatio = 0;
    this.currentShiftCm = 0;
    this.peakLeftShiftCm = 0;
    this.peakRightShiftCm = 0;

    this.activeLane = 'center';
    this.fishCollected = 0;
    this.totalScore = 0;
    this.streak = 0;
    this.reps = [];
    this.shiftHistory = [];
    this.stabilityScore = 95;
  }

  calibrateNeutral(landmarks: Landmark[] | undefined): void {
    if (!landmarks || landmarks.length < 29) return;
    const lHip = landmarks[23];
    const rHip = landmarks[24];
    const lAnkle = landmarks[27];
    const rAnkle = landmarks[28];

    const hipMidX = (lHip.x + rHip.x) / 2;
    const ankleMidX = (lAnkle.x + rAnkle.x) / 2;

    this.neutralCalibratedX = ankleMidX - hipMidX;
    this.isCalibrated = true;
  }

  getSensitivityMultiplier(): number {
    switch (this.sensitivity) {
      case 'low':
        return 0.75;
      case 'high':
        return 1.35;
      case 'normal':
      default:
        return 1.0;
    }
  }

  getLaneX(lane: TrackedLane): number {
    switch (lane) {
      case 'left':
        return 0.28;
      case 'right':
        return 0.72;
      case 'center':
      default:
        return 0.5;
    }
  }

  spawnSlideItem(nowMs: number): void {
    this.spawnCounter += 1;
    const id = `item-${this.spawnCounter}-${nowMs}`;

    // Cycle or alternate lanes to stimulate bilateral weight shifting
    const lanes: TrackedLane[] = ['left', 'center', 'right'];
    const chosenLane = lanes[this.spawnCounter % lanes.length];

    // Every 5th item is a sparkling gem, others are golden fish
    const isGem = this.spawnCounter % 5 === 0;
    const kind: SlideItemKind = isGem ? 'gem' : 'fish';
    const points = isGem ? 100 : 50;

    this.items.push({
      id,
      kind,
      x: this.getLaneX(chosenLane),
      y: -0.05,
      radius: isGem ? 0.045 : 0.05,
      lane: chosenLane,
      collected: false,
      points,
    });
  }

  update(
    landmarks: Landmark[] | undefined,
    nowMs: number,
    onCollect?: (item: SlideItem) => void,
    onObstacle?: (item: SlideItem) => void
  ): SlalomBalanceTelemetry {
    if (!landmarks || landmarks.length < 29) {
      return this.buildTelemetry(false, 'Position yourself standing with hips and feet in camera view.');
    }

    const lHip = landmarks[23];
    const rHip = landmarks[24];
    const lAnkle = landmarks[27];
    const rAnkle = landmarks[28];

    const hipMidX = (lHip.x + rHip.x) / 2;
    const ankleMidX = (lAnkle.x + rAnkle.x) / 2;

    // Base stance width in normalized coordinates
    const stanceWidthNorm = Math.max(0.12, Math.abs(lAnkle.x - rAnkle.x));

    // Section 4 Formula:
    // In mirrored display: Mirrored shift = AnkleMid - HipMid - Calibrated
    const rawShift = ankleMidX - hipMidX - this.neutralCalibratedX;
    const multiplier = this.getSensitivityMultiplier();
    this.currentShiftRatio = rawShift * multiplier;

    // Pelvic displacement in centimeters
    const shiftCm = (Math.abs(this.currentShiftRatio) / stanceWidthNorm) * BASE_STANCE_WIDTH_CM;
    this.currentShiftCm = Number(shiftCm.toFixed(1));

    // Thresholds: Left < -0.06, Right > +0.06, Deadzone +-0.03
    const threshold = 0.06;
    if (this.currentShiftRatio < -threshold) {
      this.activeLane = 'left';
      if (this.currentShiftCm > this.peakLeftShiftCm) {
        this.peakLeftShiftCm = this.currentShiftCm;
      }
    } else if (this.currentShiftRatio > threshold) {
      this.activeLane = 'right';
      if (this.currentShiftCm > this.peakRightShiftCm) {
        this.peakRightShiftCm = this.currentShiftCm;
      }
    } else {
      this.activeLane = 'center';
    }

    // Map Shift Ratio to Penguin target X position on screen [0.24 .. 0.76]
    // Normalized range: 0.50 + shiftRatio * 2.2
    const targetScreenX = Math.max(0.22, Math.min(0.78, 0.5 + this.currentShiftRatio * 2.2));
    this.penguin.targetX = targetScreenX;

    // Smooth lerp steering (alpha = 0.14)
    const prevX = this.penguin.x;
    this.penguin.x += (this.penguin.targetX - this.penguin.x) * 0.14;
    this.penguin.vx = this.penguin.x - prevX;

    // Dynamic tilt angle banking into curves
    this.penguin.tiltAngle = Math.max(-0.4, Math.min(0.4, this.penguin.vx * 14));
    this.penguin.flipperAngle = Math.sin(nowMs * 0.015) * 0.35;

    // Postural Stability Score (sliding window jerkiness)
    this.shiftHistory.push(this.currentShiftRatio);
    if (this.shiftHistory.length > 30) {
      this.shiftHistory.shift();
    }
    if (this.shiftHistory.length >= 10) {
      let totalJerk = 0;
      for (let i = 1; i < this.shiftHistory.length; i++) {
        totalJerk += Math.abs(this.shiftHistory[i] - this.shiftHistory[i - 1]);
      }
      const avgJerk = totalJerk / (this.shiftHistory.length - 1);
      this.stabilityScore = Math.max(70, Math.min(100, Math.round(100 - avgJerk * 450)));
    }

    // Spawn items periodically (every 1.6 seconds)
    if (nowMs - this.lastItemSpawnTime > 1600 && this.fishCollected < TARGET_FISH_GOAL) {
      this.spawnSlideItem(nowMs);
      this.lastItemSpawnTime = nowMs;
    }

    // Update scrolling items
    const scrollSpeed = 0.0075;
    const penguinCollisionRadius = 0.06;

    for (let i = this.items.length - 1; i >= 0; i--) {
      const item = this.items[i];
      item.y += scrollSpeed;

      // Check collision with penguin
      if (!item.collected && Math.abs(item.y - this.penguin.y) < 0.05) {
        const dx = Math.abs(item.x - this.penguin.x);
        if (dx < penguinCollisionRadius) {
          item.collected = true;

          if (item.kind === 'obstacle') {
            if (this.soundEnabled) playObstacleBumpSound();
            this.streak = 0;
            onObstacle?.(item);
          } else {
            // Fish or Gem collected
            if (item.kind === 'gem') {
              if (this.soundEnabled) playGemCollectSound();
            } else {
              if (this.soundEnabled) playFishCollectSound();
            }

            this.fishCollected += 1;
            this.streak += 1;
            const itemPoints = item.points + Math.min(50, this.streak * 10);
            this.totalScore += itemPoints;

            const record: FishRecord = {
              id: this.fishCollected,
              kind: item.kind,
              lane: item.lane,
              shiftCm: this.currentShiftCm,
              collected: true,
              timestamp: Date.now(),
            };
            this.reps = [record, ...this.reps].slice(0, 12);

            this.persistSession();
            onCollect?.(item);
          }
        }
      }

      // Remove items that scrolled off-screen
      if (item.y > 1.1) {
        this.items.splice(i, 1);
      }
    }

    let feedbackMessage = '';
    if (this.fishCollected >= TARGET_FISH_GOAL) {
      feedbackMessage = 'Flume Complete! Excellent weight shift balance and symmetry!';
    } else if (this.activeLane === 'left') {
      feedbackMessage = `Weight shifted LEFT (${this.currentShiftCm} cm) — Good lateral balance!`;
    } else if (this.activeLane === 'right') {
      feedbackMessage = `Weight shifted RIGHT (${this.currentShiftCm} cm) — Good lateral balance!`;
    } else {
      feedbackMessage = 'Centered on ice. Shift weight left or right to steer penguin!';
    }

    return this.buildTelemetry(true, feedbackMessage);
  }

  buildTelemetry(isTrackingValid: boolean, feedbackMessage: string): SlalomBalanceTelemetry {
    // Bilateral Symmetry: (1 - |L - R| / max(L, R, 1)) * 100
    const maxShift = Math.max(this.peakLeftShiftCm, this.peakRightShiftCm, 1);
    const diff = Math.abs(this.peakLeftShiftCm - this.peakRightShiftCm);
    const symmetry = Math.round((1 - diff / maxShift) * 100);

    return {
      currentShiftRatio: Number(this.currentShiftRatio.toFixed(3)),
      currentShiftCm: this.currentShiftCm,
      peakLeftShiftCm: this.peakLeftShiftCm,
      peakRightShiftCm: this.peakRightShiftCm,
      activeLane: this.activeLane,
      balanceStability: this.stabilityScore,
      slalomSymmetry: Math.max(0, Math.min(100, symmetry)),
      fishCollected: this.fishCollected,
      targetFishGoal: TARGET_FISH_GOAL,
      totalScore: this.totalScore,
      streak: this.streak,
      feedbackMessage,
      isTrackingValid,
      reps: this.reps,
    };
  }

  persistSession(): void {
    const maxShift = Math.max(this.peakLeftShiftCm, this.peakRightShiftCm, 1);
    const diff = Math.abs(this.peakLeftShiftCm - this.peakRightShiftCm);
    const symmetry = Math.round((1 - diff / maxShift) * 100);

    const data: StoredSlalomBalanceData = {
      lastSessionDate: new Date().toISOString(),
      fishCollected: this.fishCollected,
      peakLeftDisplacementCm: this.peakLeftShiftCm,
      peakRightDisplacementCm: this.peakRightShiftCm,
      stabilityScore: this.stabilityScore,
      symmetryScore: Math.max(0, Math.min(100, symmetry)),
      totalScore: this.totalScore,
    };
    saveResultsToStorage(data);
  }
}
