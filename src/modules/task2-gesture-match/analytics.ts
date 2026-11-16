import type { Landmark, HandResult } from '@/services/tracking/types';
import type {
  DetectedGesture,
  FingerExtensionState,
  GestureDefinition,
  GestureMatchRecord,
  GestureMatchTelemetry,
  StoredGestureSessionData,
  Particle,
  FloatingText,
} from './types';

export const REQUIRED_HOLD_SECONDS = 1.5;

export const LOCAL_STORAGE_KEY = 'task2_gesture_match_results';
export const LOCAL_STORAGE_FALLBACK_KEY = 'task2_results';

/** Standard 2D Euclidean distance between two points */
export function calculateDistance(
  a: { x: number; y: number },
  b: { x: number; y: number }
): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export const GESTURE_DEFINITIONS: GestureDefinition[] = [
  {
    id: 'thumbs-up',
    name: 'Thumbs Up',
    emoji: '👍',
    description: 'Extend thumb straight up while tucking other 4 fingers.',
    instructions: 'Curl index, middle, ring, and pinky into palm. Point thumb upward.',
    expectedFingers: { thumb: true, index: false, middle: false, ring: false, pinky: false },
  },
  {
    id: 'peace',
    name: 'Victory / Peace',
    emoji: '✌️',
    description: 'Extend index and middle fingers in a V-shape; tuck thumb, ring, and pinky.',
    instructions: 'Hold up index and middle fingers. Keep thumb over curled ring and pinky.',
    expectedFingers: { thumb: false, index: true, middle: true, ring: false, pinky: false },
  },
  {
    id: 'pointing',
    name: 'Index Pointing',
    emoji: '☝️',
    description: 'Isolate and extend index finger upward; keep all other 4 digits curled.',
    instructions: 'Point index finger up towards ceiling. Tuck thumb and remaining 3 fingers.',
    expectedFingers: { thumb: false, index: true, middle: false, ring: false, pinky: false },
  },
  {
    id: 'open-five',
    name: 'Open Five',
    emoji: '🖐️',
    description: 'Fully extend and spread all 5 digits wide open.',
    instructions: 'Open your palm wide and extend all fingers outward.',
    expectedFingers: { thumb: true, index: true, middle: true, ring: true, pinky: true },
  },
  {
    id: 'ok-sign',
    name: 'OK Sign',
    emoji: '👌',
    description: 'Touch thumb tip to index tip in a circle; extend middle, ring, and pinky.',
    instructions: 'Pinch thumb and index tips together. Keep middle, ring, and pinky extended.',
    expectedFingers: { thumb: true, index: true, middle: true, ring: true, pinky: true },
  },
];

/**
 * Detects whether each of the 5 fingers is extended or folded.
 * Section 4 Formula:
 * IsExtended(j) = y_tip(j) < y_pip(j) - 0.04
 * Also considers radial distance from wrist for angle tolerance.
 */
export function detectFingerExtensions(landmarks: Landmark[]): FingerExtensionState {
  if (!landmarks || landmarks.length < 21) {
    return { thumb: false, index: false, middle: false, ring: false, pinky: false };
  }

  const wrist = landmarks[0] ?? { x: 0.5, y: 0.8, z: 0 };

  // Thumb: Tip 4, IP 3, MCP 2, CMC 1
  const thumbTip = landmarks[4] ?? wrist;
  const thumbMcp = landmarks[2] ?? wrist;
  const indexMcp = landmarks[5] ?? wrist;
  const thumbDistWrist = calculateDistance(thumbTip, wrist);
  const thumbMcpDistWrist = calculateDistance(thumbMcp, wrist);
  const thumbDistIndexMcp = calculateDistance(thumbTip, indexMcp);

  // Thumb is extended if its tip extends away from wrist/palm or points upward
  const isThumbExtended =
    thumbDistWrist > thumbMcpDistWrist * 1.25 ||
    thumbDistIndexMcp > 0.12 ||
    thumbTip.y < thumbMcp.y - 0.04;

  // Helper for index (8, 6), middle (12, 10), ring (16, 14), pinky (20, 18)
  const isDigitExtended = (tipIdx: number, pipIdx: number): boolean => {
    const tip = landmarks[tipIdx];
    const pip = landmarks[pipIdx];
    if (!tip || !pip) return false;

    const verticalExtension = tip.y < pip.y - 0.04;
    const radialTipDist = calculateDistance(tip, wrist);
    const radialPipDist = calculateDistance(pip, wrist);
    const radialExtension = radialTipDist > radialPipDist * 1.22;

    return verticalExtension || radialExtension;
  };

  return {
    thumb: isThumbExtended,
    index: isDigitExtended(8, 6),
    middle: isDigitExtended(12, 10),
    ring: isDigitExtended(16, 14),
    pinky: isDigitExtended(20, 18),
  };
}

/**
 * Classifies current hand landmarks into one of the 5 supported gestures or 'unknown'.
 */
export function classifyGesture(landmarks: Landmark[]): DetectedGesture {
  if (!landmarks || landmarks.length < 21) return 'unknown';

  const fingers = detectFingerExtensions(landmarks);
  const thumbTip = landmarks[4] ?? { x: 0, y: 0 };
  const indexTip = landmarks[8] ?? { x: 0, y: 0 };

  // Pinch distance for OK Sign
  const pinchDist = calculateDistance(thumbTip, indexTip);
  const isPinching = pinchDist < 0.048;

  // 1. OK Sign: Thumb touches index tip, while middle, ring, pinky are extended
  if (isPinching && fingers.middle && fingers.ring && fingers.pinky) {
    return 'ok-sign';
  }

  // 2. Open Five: All 5 fingers extended
  if (fingers.thumb && fingers.index && fingers.middle && fingers.ring && fingers.pinky) {
    return 'open-five';
  }

  // 3. Victory / Peace (2): Index and Middle extended, other 3 folded
  if (!fingers.thumb && fingers.index && fingers.middle && !fingers.ring && !fingers.pinky) {
    return 'peace';
  }

  // 4. One (Pointing): Index extended, other 4 folded
  if (!fingers.thumb && fingers.index && !fingers.middle && !fingers.ring && !fingers.pinky) {
    return 'pointing';
  }

  // 5. Thumbs Up: Thumb extended, other 4 folded
  if (fingers.thumb && !fingers.index && !fingers.middle && !fingers.ring && !fingers.pinky) {
    return 'thumbs-up';
  }

  return 'unknown';
}

/**
 * Calculates the Finger Isolation Score (0 - 100%).
 * Evaluates target digits extended vs involuntary movement of non-target digits.
 */
export function calculateIsolationScore(
  actual: FingerExtensionState,
  expected: FingerExtensionState,
  isOkSign = false
): number {
  if (isOkSign) {
    // For OK sign, middle, ring, pinky must be extended
    let match = 0;
    if (actual.middle === expected.middle) match++;
    if (actual.ring === expected.ring) match++;
    if (actual.pinky === expected.pinky) match++;
    return Math.round((match / 3) * 100);
  }

  let matches = 0;
  const digits: (keyof FingerExtensionState)[] = ['thumb', 'index', 'middle', 'ring', 'pinky'];
  for (const d of digits) {
    if (actual[d] === expected[d]) matches++;
  }
  return Math.round((matches / 5) * 100);
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

/** Match Chime: Harmonic chord for successful 1.5s hold */
export function playMatchChime(): void {
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
      gain.gain.linearRampToValueAtTime(0.18, now + idx * 0.07 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.07 + 0.45);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + idx * 0.07);
      osc.stop(now + idx * 0.07 + 0.5);
    });
  } catch {
    // Ignored if audio blocked
  }
}

/** Subtle ticking tone while hold is progressing */
export function playHoldTick(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, now);

    gain.gain.setValueAtTime(0.05, now);
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
/* Particle & Visual Effects                                                 */
/* ========================================================================== */

export function createConfettiBurst(cx: number, cy: number): Particle[] {
  const particles: Particle[] = [];
  const colors = ['#10b981', '#34d399', '#38bdf8', '#818cf8', '#f59e0b', '#fbbf24', '#ffffff'];
  const count = 36;

  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
    const speed = 0.005 + Math.random() * 0.012;
    particles.push({
      x: cx,
      y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      color: colors[Math.floor(Math.random() * colors.length)],
      size: 4 + Math.random() * 5,
      alpha: 1,
      life: 0,
      maxLife: 42 + Math.floor(Math.random() * 20),
    });
  }
  return particles;
}

export function createFloatingText(cx: number, cy: number, text = 'MATCH! +50 PTS'): FloatingText {
  return {
    text,
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

export function saveResultsToStorage(data: StoredGestureSessionData): void {
  try {
    const payload = JSON.stringify(data);
    localStorage.setItem(LOCAL_STORAGE_KEY, payload);
    localStorage.setItem(LOCAL_STORAGE_FALLBACK_KEY, payload);
  } catch (err) {
    console.warn('[GestureMatch] Failed to save to localStorage:', err);
  }
}

export function loadResultsFromStorage(): StoredGestureSessionData | null {
  try {
    const saved = localStorage.getItem(LOCAL_STORAGE_KEY) || localStorage.getItem(LOCAL_STORAGE_FALLBACK_KEY);
    if (!saved) return null;
    return JSON.parse(saved) as StoredGestureSessionData;
  } catch {
    return null;
  }
}

/* ========================================================================== */
/* Gesture Match Session State Machine                                        */
/* ========================================================================== */

export class GestureMatchTracker {
  targetIndex = 0;
  targetGesture: GestureDefinition = GESTURE_DEFINITIONS[0];

  gesturePromptTime = 0;
  holdStartTime = 0;
  lastTickTime = 0;

  gesturesCompleted = 0;
  totalAttempts = 0;
  totalScore = 0;
  streak = 0;
  reps: GestureMatchRecord[] = [];

  soundEnabled = true;

  constructor() {
    this.targetIndex = 0;
    this.targetGesture = GESTURE_DEFINITIONS[0];
  }

  reset(): void {
    this.targetIndex = 0;
    this.targetGesture = GESTURE_DEFINITIONS[0];
    this.gesturePromptTime = 0;
    this.holdStartTime = 0;
    this.lastTickTime = 0;
    this.gesturesCompleted = 0;
    this.totalAttempts = 0;
    this.totalScore = 0;
    this.streak = 0;
    this.reps = [];
  }

  nextGesture(): void {
    this.targetIndex = (this.targetIndex + 1) % GESTURE_DEFINITIONS.length;
    this.targetGesture = GESTURE_DEFINITIONS[this.targetIndex];
    this.gesturePromptTime = performance.now();
    this.holdStartTime = 0;
  }

  /**
   * Main per-frame state machine update.
   */
  update(
    handResult: HandResult | undefined,
    nowMs: number,
    onSuccess?: (cx: number, cy: number) => void
  ): GestureMatchTelemetry {
    if (this.gesturePromptTime === 0) {
      this.gesturePromptTime = nowMs;
    }

    const defaultFingers: FingerExtensionState = {
      thumb: false,
      index: false,
      middle: false,
      ring: false,
      pinky: false,
    };

    // If no hand in view
    if (!handResult || !handResult.landmarks || handResult.landmarks.length < 21) {
      this.holdStartTime = 0;

      const accuracy =
        this.totalAttempts > 0
          ? Math.round((this.gesturesCompleted / this.totalAttempts) * 100)
          : 100;

      return {
        gesturesCompleted: this.gesturesCompleted,
        totalAttempts: this.totalAttempts,
        accuracyRate: accuracy,
        currentLatency: 0,
        avgLatency: this.calculateAverageLatency(),
        currentIsolationScore: 0,
        avgIsolationScore: this.calculateAverageIsolation(),
        holdProgressPercent: 0,
        isHoldingTarget: false,
        currentHoldSeconds: 0,
        requiredHoldSeconds: REQUIRED_HOLD_SECONDS,
        totalScore: this.totalScore,
        streak: this.streak,
        detectedGesture: 'unknown',
        targetGesture: this.targetGesture,
        fingerStates: defaultFingers,
        feedbackMessage: 'Position your hand clearly in front of the camera to begin.',
        reps: this.reps,
        activeHand: 'None',
      };
    }

    const landmarks = handResult.landmarks;
    const activeHand = handResult.handedness;
    const fingerStates = detectFingerExtensions(landmarks);
    const detectedGesture = classifyGesture(landmarks);

    const isolationScore = calculateIsolationScore(
      fingerStates,
      this.targetGesture.expectedFingers,
      this.targetGesture.id === 'ok-sign'
    );

    const isMatching = detectedGesture === this.targetGesture.id;

    let holdProgressPercent = 0;
    let currentHoldSec = 0;
    let feedbackMessage = '';

    if (isMatching) {
      if (this.holdStartTime === 0) {
        this.holdStartTime = nowMs;
      }

      const elapsedSec = (nowMs - this.holdStartTime) / 1000;
      currentHoldSec = Number(elapsedSec.toFixed(1));
      holdProgressPercent = Math.min(100, Math.round((elapsedSec / REQUIRED_HOLD_SECONDS) * 100));

      // Play soft tick every 0.4s during hold
      if (this.soundEnabled && nowMs - this.lastTickTime >= 400 && elapsedSec < REQUIRED_HOLD_SECONDS) {
        this.lastTickTime = nowMs;
        playHoldTick();
      }

      feedbackMessage = `Holding ${this.targetGesture.name}! Keep steady (${currentHoldSec}s / ${REQUIRED_HOLD_SECONDS}s)`;

      // Check if 1.5s hold successfully completed
      if (elapsedSec >= REQUIRED_HOLD_SECONDS) {
        const latencySec = Number(((nowMs - this.gesturePromptTime) / 1000).toFixed(1));

        this.gesturesCompleted += 1;
        this.totalAttempts += 1;
        this.streak += 1;
        const repScore = 50 + Math.min(50, this.streak * 10);
        this.totalScore += repScore;

        const record: GestureMatchRecord = {
          id: this.gesturesCompleted,
          gestureId: this.targetGesture.id,
          gestureName: this.targetGesture.name,
          success: true,
          latencySeconds: latencySec,
          isolationScore,
          timestamp: Date.now(),
        };
        this.reps = [record, ...this.reps].slice(0, 10);

        if (this.soundEnabled) playMatchChime();

        // Palm center for confetti burst
        const palmX = landmarks[9]?.x ?? 0.5;
        const palmY = landmarks[9]?.y ?? 0.5;
        onSuccess?.(palmX, palmY);

        // Auto persist
        this.persistSession();

        // Advance to next gesture
        this.nextGesture();

        feedbackMessage = `MATCH! +${repScore} PTS! Next pose: ${this.targetGesture.name} ${this.targetGesture.emoji}`;
      }
    } else {
      // Not matching: reset hold timer
      this.holdStartTime = 0;
      currentHoldSec = 0;
      holdProgressPercent = 0;

      if (detectedGesture !== 'unknown') {
        feedbackMessage = `Detected: ${detectedGesture.toUpperCase()}. Adjust fingers to match ${this.targetGesture.name}!`;
      } else {
        feedbackMessage = `Mimic prompt: ${this.targetGesture.instructions}`;
      }
    }

    const currentLatency = Number(((nowMs - this.gesturePromptTime) / 1000).toFixed(1));
    const accuracy =
      this.totalAttempts > 0
        ? Math.round((this.gesturesCompleted / this.totalAttempts) * 100)
        : 100;

    return {
      gesturesCompleted: this.gesturesCompleted,
      totalAttempts: this.totalAttempts,
      accuracyRate: accuracy,
      currentLatency,
      avgLatency: this.calculateAverageLatency(),
      currentIsolationScore: isolationScore,
      avgIsolationScore: this.calculateAverageIsolation(),
      holdProgressPercent,
      isHoldingTarget: isMatching,
      currentHoldSeconds: currentHoldSec,
      requiredHoldSeconds: REQUIRED_HOLD_SECONDS,
      totalScore: this.totalScore,
      streak: this.streak,
      detectedGesture,
      targetGesture: this.targetGesture,
      fingerStates,
      feedbackMessage,
      reps: this.reps,
      activeHand,
    };
  }

  calculateAverageLatency(): number {
    if (this.reps.length === 0) return 0;
    const sum = this.reps.reduce((acc, r) => acc + r.latencySeconds, 0);
    return Number((sum / this.reps.length).toFixed(1));
  }

  calculateAverageIsolation(): number {
    if (this.reps.length === 0) return 0;
    const sum = this.reps.reduce((acc, r) => acc + r.isolationScore, 0);
    return Math.round(sum / this.reps.length);
  }

  persistSession(): void {
    const accuracy =
      this.totalAttempts > 0
        ? Math.round((this.gesturesCompleted / this.totalAttempts) * 100)
        : 100;

    const data: StoredGestureSessionData = {
      lastSessionDate: new Date().toISOString(),
      gesturesCompleted: this.gesturesCompleted,
      accuracyRate: accuracy,
      avgLatencySeconds: this.calculateAverageLatency(),
      avgIsolationScore: this.calculateAverageIsolation(),
      totalScore: this.totalScore,
      repsCount: this.reps.length,
    };
    saveResultsToStorage(data);
  }
}
