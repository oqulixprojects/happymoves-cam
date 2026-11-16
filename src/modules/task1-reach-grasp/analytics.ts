import type { Landmark, HandResult } from '@/services/tracking/types';
import type {
  GamePhase,
  HandMetrics,
  HandState,
  ObjectType,
  ReachGraspTelemetry,
  RepetitionRecord,
  StoredSessionData,
  TargetObject,
  BasketZone,
  Particle,
  FloatingText,
} from './types';

export const OPEN_THRESHOLD = 0.35;
export const CLOSED_THRESHOLD = 0.20;

export const LOCAL_STORAGE_KEY = 'task1_reach_grasp_results';
export const LOCAL_STORAGE_FALLBACK_KEY = 'task1_results';

/** Standard 2D Euclidean distance between two points */
export function calculateDistance(
  a: { x: number; y: number },
  b: { x: number; y: number }
): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Section 4 Landmark Formula:
 * Average distance from wrist (0) to all 5 fingertips (4, 8, 12, 16, 20):
 * D = 1/5 * sum(dist(fingertip_i, wrist))
 */
export function calculateFingertipAverageDistance(
  wrist: Landmark,
  fingertips: Landmark[]
): number {
  if (!fingertips.length) return 0;
  const sum = fingertips.reduce(
    (acc, tip) => acc + calculateDistance(tip, wrist),
    0
  );
  return sum / fingertips.length;
}

/** Calculates bounding box for the hand landmarks */
export function calculateBoundingBox(landmarks: Landmark[]) {
  if (!landmarks || landmarks.length === 0) {
    return { minX: 0, maxX: 0, minY: 0, maxY: 0, diagonal: 0 };
  }
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const l of landmarks) {
    if (l.x < minX) minX = l.x;
    if (l.x > maxX) maxX = l.x;
    if (l.y < minY) minY = l.y;
    if (l.y > maxY) maxY = l.y;
  }

  const diagonal = Math.hypot(maxX - minX, maxY - minY);
  return { minX, maxX, minY, maxY, diagonal };
}

/** Computes the physiological palm center from wrist and MCP knuckles */
export function calculatePalmCenter(landmarks: Landmark[]): { x: number; y: number } {
  // Indices: Wrist 0, MCP knuckles 5, 9, 13, 17
  const indices = [0, 5, 9, 13, 17];
  let sumX = 0;
  let sumY = 0;
  for (const idx of indices) {
    const pt = landmarks[idx];
    if (pt) {
      sumX += pt.x;
      sumY += pt.y;
    }
  }
  return { x: sumX / indices.length, y: sumY / indices.length };
}

/**
 * Analyzes hand landmarks and computes normalized average fingertip distance,
 * extension ROM (0-100%), and open/closed state.
 *
 * Normalization: uses palm scale (wrist to middle MCP 9) to adaptively normalize
 * across varying camera distances while matching spec thresholds (>=0.35 open, <0.20 closed).
 */
export function analyzeHandLandmarks(landmarks: Landmark[]): HandMetrics {
  const wrist = landmarks[0] ?? { x: 0.5, y: 0.8, z: 0 };
  const fingertips = [
    landmarks[4],  // Thumb
    landmarks[8],  // Index
    landmarks[12], // Middle
    landmarks[16], // Ring
    landmarks[20], // Pinky
  ].filter((p): p is Landmark => Boolean(p));

  const rawDist = calculateFingertipAverageDistance(wrist, fingertips);
  const bbox = calculateBoundingBox(landmarks);

  // Middle MCP (index 9) distance from wrist provides scale invariant palm baseline
  const middleMcp = landmarks[9] ?? wrist;
  const palmScale = calculateDistance(wrist, middleMcp);

  // Standard webcam sitting distance baseline: palmScale ~ 0.16
  const referencePalm = 0.16;
  const scaleRatio = palmScale > 0.04 ? referencePalm / palmScale : 1.0;
  // Blend raw and normalized to balance camera scale stability with exact coordinate specs
  const normalizedDist = Math.max(0.05, Math.min(0.65, rawDist * (0.6 * scaleRatio + 0.4)));

  // Hand state according to spec thresholds
  let state: HandState = 'partial';
  if (normalizedDist >= OPEN_THRESHOLD) {
    state = 'open';
  } else if (normalizedDist < CLOSED_THRESHOLD) {
    state = 'closed';
  }

  // Hand Opening ROM (0% to 100%)
  // Baseline relaxed/closed fist ~0.16, full wide extension >=0.36
  const rom = Math.min(100, Math.max(0, ((normalizedDist - 0.16) / (0.36 - 0.16)) * 100));

  const palmCenter = calculatePalmCenter(landmarks);

  return {
    avgFingertipDistance: Number(normalizedDist.toFixed(3)),
    opennessROM: Math.round(rom),
    state,
    palmCenter,
    boundingBox: bbox,
  };
}

/** Collision check: distance between hand cursor and circular target */
export function isHandHoveringTarget(
  cursor: { x: number; y: number },
  target: TargetObject
): boolean {
  const dist = calculateDistance(cursor, { x: target.x, y: target.y });
  // Target radius plus comfortable touch tolerance
  return dist <= target.radius + 0.06;
}

/** Collision check: whether cursor/object is within the basket drop zone */
export function isInsideBasket(
  point: { x: number; y: number },
  basket: BasketZone
): boolean {
  const halfW = basket.width / 2;
  const halfH = basket.height / 2;
  return (
    point.x >= basket.x - halfW &&
    point.x <= basket.x + halfW &&
    point.y >= basket.y - halfH &&
    point.y <= basket.y + halfH
  );
}

/** Palette and metadata for virtual target objects */
const OBJECT_TEMPLATES: Array<{
  type: ObjectType;
  color: string;
  glowColor: string;
  label: string;
}> = [
  { type: 'apple', color: '#ef4444', glowColor: 'rgba(239, 68, 68, 0.5)', label: 'Red Apple' },
  { type: 'gem', color: '#06b6d4', glowColor: 'rgba(6, 182, 212, 0.5)', label: 'Cyan Gem' },
  { type: 'star', color: '#f59e0b', glowColor: 'rgba(245, 158, 11, 0.5)', label: 'Golden Star' },
  { type: 'ball', color: '#3b82f6', glowColor: 'rgba(59, 130, 246, 0.5)', label: 'Blue Sphere' },
  { type: 'block', color: '#10b981', glowColor: 'rgba(16, 185, 129, 0.5)', label: 'Emerald Cube' },
];

let nextObjectId = 1;
export function createRandomTarget(): TargetObject {
  const template = OBJECT_TEMPLATES[(nextObjectId - 1) % OBJECT_TEMPLATES.length];
  // Spawn in the upper-half reach zone, away from the bottom-right basket
  // X range: 0.22 to 0.72, Y range: 0.22 to 0.45
  const x = 0.22 + Math.random() * 0.50;
  const y = 0.20 + Math.random() * 0.26;

  return {
    id: `obj-${nextObjectId++}`,
    type: template.type,
    x,
    y,
    radius: 0.065,
    color: template.color,
    glowColor: template.glowColor,
    label: template.label,
  };
}

export function createDefaultBasket(): BasketZone {
  // Target container basket placed in the bottom-right zone (0.80, 0.76)
  return {
    x: 0.78,
    y: 0.76,
    width: 0.24,
    height: 0.22,
    label: 'Drop Basket',
  };
}

/* ========================================================================== */
/* Web Audio API Sound Effects Synthesizer                                   */
/* ========================================================================== */

let sharedAudioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!sharedAudioCtx) {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioCtx) {
      sharedAudioCtx = new AudioCtx();
    }
  }
  if (sharedAudioCtx && sharedAudioCtx.state === 'suspended') {
    void sharedAudioCtx.resume();
  }
  return sharedAudioCtx;
}

/** Chime sound: bright ascending 3-tone harmonic chime for emerald burst */
export function playChimeSound(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const freqs = [587.33, 739.99, 880.0, 1174.66]; // D5, F#5, A5, D6

    freqs.forEach((freq, idx) => {
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
    // Audio context safely ignored if blocked by autoplay policy
  }
}

/** Grip lock sound: punchy mechanical/cyber energy latch sound */
export function playGrabSound(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(260, now);
    osc.frequency.exponentialRampToValueAtTime(620, now + 0.12);

    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.2);
  } catch {
    // Ignored
  }
}

/** Premature drop sound: soft low boing tone */
export function playDropSound(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.exponentialRampToValueAtTime(110, now + 0.25);

    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.3);
  } catch {
    // Ignored
  }
}

/* ========================================================================== */
/* Particle and Visual Burst Generators                                       */
/* ========================================================================== */

export function createEmeraldBurst(cx: number, cy: number): Particle[] {
  const particles: Particle[] = [];
  const colors = ['#10b981', '#34d399', '#6ee7b7', '#14b8a6', '#fef08a', '#ffffff'];
  const count = 38;

  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
    const speed = 0.004 + Math.random() * 0.012;
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

export function createFloatingScore(cx: number, cy: number, score = 100): FloatingText {
  return {
    text: `+${score} PTS`,
    x: cx,
    y: cy - 0.02,
    alpha: 1,
    life: 0,
    maxLife: 45,
    color: '#34d399',
  };
}

/* ========================================================================== */
/* LocalStorage Persistence Helper                                            */
/* ========================================================================== */

export function saveResultsToStorage(data: StoredSessionData): void {
  try {
    const payload = JSON.stringify(data);
    localStorage.setItem(LOCAL_STORAGE_KEY, payload);
    localStorage.setItem(LOCAL_STORAGE_FALLBACK_KEY, payload);
  } catch (err) {
    console.warn('[ReachGrasp] Failed to save session to localStorage:', err);
  }
}

export function loadResultsFromStorage(): StoredSessionData | null {
  try {
    const saved = localStorage.getItem(LOCAL_STORAGE_KEY) || localStorage.getItem(LOCAL_STORAGE_FALLBACK_KEY);
    if (!saved) return null;
    return JSON.parse(saved) as StoredSessionData;
  } catch {
    return null;
  }
}

/* ========================================================================== */
/* Rehabilitation Session State Machine                                       */
/* ========================================================================== */

export class ReachGraspTracker {
  target: TargetObject = createRandomTarget();
  basket: BasketZone = createDefaultBasket();

  phase: GamePhase = 'idle';
  reachStartTime = 0;
  peakROMInCurrentCycle = 0;

  cyclesCompleted = 0;
  totalAttempts = 0;
  totalScore = 0;
  streak = 0;
  reps: RepetitionRecord[] = [];

  soundEnabled = true;

  constructor() {
    this.target = createRandomTarget();
    this.basket = createDefaultBasket();
  }

  reset(): void {
    this.target = createRandomTarget();
    this.phase = 'idle';
    this.reachStartTime = 0;
    this.peakROMInCurrentCycle = 0;
    this.cyclesCompleted = 0;
    this.totalAttempts = 0;
    this.totalScore = 0;
    this.streak = 0;
    this.reps = [];
  }

  /**
   * Main per-frame state machine step.
   * Returns complete telemetry state.
   */
  update(
    handResult: HandResult | undefined,
    nowMs: number,
    onSuccessBurst?: (x: number, y: number) => void
  ): ReachGraspTelemetry {
    // Default telemetry when no hand is in frame
    if (!handResult || !handResult.landmarks || handResult.landmarks.length < 21) {
      if (this.phase === 'transporting') {
        // Lost hand tracking during transport: premature drop
        this.totalAttempts += 1;
        this.streak = 0;
        this.phase = 'reaching';
        if (this.soundEnabled) playDropSound();
      }

      const successRate =
        this.totalAttempts > 0
          ? Math.round((this.cyclesCompleted / this.totalAttempts) * 100)
          : 100;

      const avgGrasp = this.calculateAverageGraspTime();

      return {
        cyclesCompleted: this.cyclesCompleted,
        totalAttempts: this.totalAttempts,
        gripSuccessRate: successRate,
        currentROM: 0,
        peakROMInCycle: this.peakROMInCurrentCycle,
        currentGraspTime: 0,
        avgGraspTime: avgGrasp,
        totalScore: this.totalScore,
        streak: this.streak,
        currentPhase: this.phase,
        handState: 'partial',
        avgFingertipDist: 0,
        feedbackMessage: 'Position your hand clearly in front of the webcam to begin.',
        reps: this.reps,
        activeHand: 'None',
      };
    }

    const metrics = analyzeHandLandmarks(handResult.landmarks);
    const activeHand = handResult.handedness;

    // Track peak ROM during active cycles
    if (metrics.opennessROM > this.peakROMInCurrentCycle) {
      this.peakROMInCurrentCycle = metrics.opennessROM;
    }

    let feedbackMessage = '';
    const hovering = isHandHoveringTarget(metrics.palmCenter, this.target);
    const inBasket = isInsideBasket(metrics.palmCenter, this.basket);

    let currentGraspSec = 0;
    if (this.reachStartTime > 0) {
      currentGraspSec = Number(((nowMs - this.reachStartTime) / 1000).toFixed(1));
    }

    // State machine transitions
    switch (this.phase) {
      case 'idle': {
        this.phase = 'reaching';
        this.reachStartTime = nowMs;
        this.peakROMInCurrentCycle = metrics.opennessROM;
        feedbackMessage = 'Phase 1: Open your hand wide (D ≥ 0.35) and reach for the object!';
        break;
      }

      case 'reaching': {
        if (this.reachStartTime === 0) this.reachStartTime = nowMs;

        if (hovering) {
          this.phase = 'grabbing';
          feedbackMessage = 'Phase 2: Hand over target! Close fingers into a fist (D < 0.20) to grab!';
        } else if (metrics.state === 'open') {
          feedbackMessage = 'Great hand extension! Move cursor over the floating object.';
        } else {
          feedbackMessage = 'Extend fingers wide (D ≥ 0.35) to initiate reach.';
        }
        break;
      }

      case 'grabbing': {
        if (!hovering) {
          // Patient moved away before grabbing
          this.phase = 'reaching';
          feedbackMessage = 'Reach back towards the object.';
        } else if (metrics.state === 'closed') {
          // Grip locked!
          this.phase = 'transporting';
          if (this.soundEnabled) playGrabSound();
          feedbackMessage = 'Phase 3: Grip Locked! Carry the object into the target basket.';
        } else {
          feedbackMessage = 'Hovering! Now squeeze fingers closed (D < 0.20) to grasp!';
        }
        break;
      }

      case 'transporting': {
        // Target follows hand
        this.target.x = metrics.palmCenter.x;
        this.target.y = metrics.palmCenter.y;

        if (inBasket && metrics.state === 'open') {
          // Successful placement in basket!
          const graspDuration = (nowMs - this.reachStartTime) / 1000;
          this.cyclesCompleted += 1;
          this.totalAttempts += 1;
          this.streak += 1;
          const repScore = 100 + Math.min(50, this.streak * 10);
          this.totalScore += repScore;

          const newRep: RepetitionRecord = {
            id: this.cyclesCompleted,
            timestamp: Date.now(),
            success: true,
            graspTimeSeconds: Number(graspDuration.toFixed(1)),
            peakOpenROM: this.peakROMInCurrentCycle,
            objectType: this.target.type,
          };
          this.reps = [newRep, ...this.reps].slice(0, 10);

          if (this.soundEnabled) playChimeSound();
          onSuccessBurst?.(this.basket.x, this.basket.y);

          // Save to localStorage automatically on each completed rep
          this.persistCurrentSession();

          // Spawn next target
          this.target = createRandomTarget();
          this.phase = 'success';
          this.reachStartTime = nowMs;
          this.peakROMInCurrentCycle = 0;
          feedbackMessage = `+${repScore} PTS! Excellent release! Next object ready.`;
        } else if (!inBasket && metrics.state === 'open') {
          // Premature drop outside basket!
          this.totalAttempts += 1;
          this.streak = 0;
          if (this.soundEnabled) playDropSound();

          // Reposition target back to reach zone
          this.target = createRandomTarget();
          this.phase = 'reaching';
          this.reachStartTime = nowMs;
          this.peakROMInCurrentCycle = metrics.opennessROM;
          feedbackMessage = 'Lost grip before basket! Keep hand closed while transporting.';
        } else if (inBasket) {
          feedbackMessage = 'Inside basket! Open your hand wide (D ≥ 0.35) to release!';
        } else {
          feedbackMessage = 'Keep grip firm and guide object towards the glowing basket.';
        }
        break;
      }

      case 'success': {
        // Brief transition delay before next reach
        this.phase = 'reaching';
        this.reachStartTime = nowMs;
        feedbackMessage = 'Open fingers wide and reach for the new object!';
        break;
      }
    }

    const successRate =
      this.totalAttempts > 0
        ? Math.round((this.cyclesCompleted / this.totalAttempts) * 100)
        : 100;

    const avgGrasp = this.calculateAverageGraspTime();

    return {
      cyclesCompleted: this.cyclesCompleted,
      totalAttempts: this.totalAttempts,
      gripSuccessRate: successRate,
      currentROM: metrics.opennessROM,
      peakROMInCycle: this.peakROMInCurrentCycle,
      currentGraspTime: currentGraspSec,
      avgGraspTime: avgGrasp,
      totalScore: this.totalScore,
      streak: this.streak,
      currentPhase: this.phase,
      handState: metrics.state,
      avgFingertipDist: metrics.avgFingertipDistance,
      feedbackMessage,
      reps: this.reps,
      activeHand,
    };
  }

  calculateAverageGraspTime(): number {
    if (this.reps.length === 0) return 0;
    const sum = this.reps.reduce((acc, r) => acc + r.graspTimeSeconds, 0);
    return Number((sum / this.reps.length).toFixed(1));
  }

  persistCurrentSession(): void {
    const successRate =
      this.totalAttempts > 0
        ? Math.round((this.cyclesCompleted / this.totalAttempts) * 100)
        : 100;

    const data: StoredSessionData = {
      lastSessionDate: new Date().toISOString(),
      cyclesCompleted: this.cyclesCompleted,
      gripSuccessRate: successRate,
      avgGraspTime: this.calculateAverageGraspTime(),
      peakROM: Math.max(...this.reps.map((r) => r.peakOpenROM), 0),
      totalScore: this.totalScore,
      repsCount: this.reps.length,
    };
    saveResultsToStorage(data);
  }
}
