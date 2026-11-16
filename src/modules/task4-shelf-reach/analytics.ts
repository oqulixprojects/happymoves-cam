import type { Landmark } from '@/services/tracking/types';
import type {
  TrackedArm,
  ItemType,
  PantryItem,
  ShelfSlot,
  ShelfRecord,
  ShelfReachTelemetry,
  StoredShelfReachData,
  ShelfParticle,
  FloatingText,
} from './types';

export const LOCAL_STORAGE_KEY = 'task4_shelf_reach_results';
export const LOCAL_STORAGE_FALLBACK_KEY = 'task4_results';

/** Standard 2D Euclidean distance */
export function calculateDistance(
  a: { x: number; y: number },
  b: { x: number; y: number }
): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Section 4 Relative Reach Height:
 * Relative Reach Height = (y_shoulder - y_wrist) / Torso Length * 100%
 * Torso Length = |y_hip - y_shoulder|
 * Positive values indicate reaching above shoulder level.
 */
export function calculateRelativeReachHeight(
  shoulder: Landmark,
  wrist: Landmark,
  hip: Landmark
): number {
  const torsoLength = Math.max(0.12, Math.abs(hip.y - shoulder.y));
  const reachDelta = shoulder.y - wrist.y;
  const ratio = (reachDelta / torsoLength) * 100;
  return Math.round(ratio);
}

/**
 * Calculates Bilateral Reaching Symmetry:
 * Symmetry = (1 - |PeakLeft - PeakRight| / max(PeakLeft, PeakRight, 1)) * 100%
 */
export function calculateBilateralSymmetry(leftPeak: number, rightPeak: number): number {
  const denom = Math.max(leftPeak, rightPeak, 1);
  const diff = Math.abs(leftPeak - rightPeak);
  return Math.max(0, Math.min(100, Math.round((1 - diff / denom) * 100)));
}

/** Pre-defined item catalog for 2D flat pantry shelves */
const ITEM_TEMPLATES: Array<{
  type: ItemType;
  name: string;
  emoji: string;
  color: string;
  targetShelf: 'middle' | 'top';
}> = [
  { type: 'cereal', name: 'Oat Cereal', emoji: '🥣', color: '#f59e0b', targetShelf: 'top' },
  { type: 'juice', name: 'Orange Juice', emoji: '🧃', color: '#f97316', targetShelf: 'middle' },
  { type: 'soup', name: 'Tomato Soup', emoji: '🥫', color: '#ef4444', targetShelf: 'middle' },
  { type: 'honey', name: 'Wild Honey', emoji: '🍯', color: '#eab308', targetShelf: 'top' },
  { type: 'oil', name: 'Olive Oil', emoji: '🫒', color: '#10b981', targetShelf: 'top' },
];

let nextItemId = 1;
export function createPantryItem(): PantryItem {
  const template = ITEM_TEMPLATES[(nextItemId - 1) % ITEM_TEMPLATES.length];
  nextItemId++;

  // Staged at bottom counter (y = 0.82)
  return {
    id: `pantry-item-${nextItemId}`,
    type: template.type,
    name: template.name,
    emoji: template.emoji,
    color: template.color,
    x: 0.50,
    y: 0.82,
    width: 0.12,
    height: 0.14,
    currentShelf: 'counter',
    targetShelf: template.targetShelf,
    isHeld: false,
    isPlaced: false,
  };
}

export function createShelfSlot(targetShelf: 'middle' | 'top'): ShelfSlot {
  if (targetShelf === 'top') {
    // Top High Shelf at y = 0.22
    return {
      level: 'top',
      label: 'High Shelf (Top Tier)',
      x: 0.50,
      y: 0.22,
      width: 0.15,
      height: 0.16,
    };
  }
  // Middle Shelf at y = 0.50
  return {
    level: 'middle',
    label: 'Mid Shelf (Eye Level)',
    x: 0.50,
    y: 0.50,
    width: 0.15,
    height: 0.16,
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

/** Snap lock click sound when placed onto shelf slot */
export function playSnapClick(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.12);

    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.18);
  } catch {
    // Ignored
  }
}

/** Item pickup latch sound */
export function playPickupSound(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.exponentialRampToValueAtTime(660, now + 0.08);

    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.12);
  } catch {
    // Ignored
  }
}

/** Celebration chime on completed arrangement */
export function playShelfPlacementChime(): void {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const freqs = [587.33, 739.99, 880.0, 1174.66]; // D5, F#5, A5, D6

    freqs.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + idx * 0.07);

      gain.gain.setValueAtTime(0, now + idx * 0.07);
      gain.gain.linearRampToValueAtTime(0.16, now + idx * 0.07 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.07 + 0.42);

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

export function createShelfBurst(cx: number, cy: number, color = '#10b981'): ShelfParticle[] {
  const particles: ShelfParticle[] = [];
  const count = 32;

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

export function saveResultsToStorage(data: StoredShelfReachData): void {
  try {
    const payload = JSON.stringify(data);
    localStorage.setItem(LOCAL_STORAGE_KEY, payload);
    localStorage.setItem(LOCAL_STORAGE_FALLBACK_KEY, payload);
  } catch (err) {
    console.warn('[ShelfReach] Failed to save results to localStorage:', err);
  }
}

export function loadResultsFromStorage(): StoredShelfReachData | null {
  try {
    const saved = localStorage.getItem(LOCAL_STORAGE_KEY) || localStorage.getItem(LOCAL_STORAGE_FALLBACK_KEY);
    if (!saved) return null;
    return JSON.parse(saved) as StoredShelfReachData;
  } catch {
    return null;
  }
}

/* ========================================================================== */
/* Shelf Reach Session State Machine                                          */
/* ========================================================================== */

export class ShelfReachTracker {
  activeArm: 'left' | 'right' = 'right';

  currentItem: PantryItem = createPantryItem();
  targetSlot: ShelfSlot = createShelfSlot('top');

  itemsArranged = 0;
  totalAttempts = 0;
  totalScore = 0;
  streak = 0;

  maxReachHeightPercent = 0;
  leftPeakReach = 0;
  rightPeakReach = 0;

  lastWristY = 0;
  lastTimeMs = 0;
  currentVelocity = 0; // m/s equivalent

  slotHoverStartTime = 0;

  reps: ShelfRecord[] = [];
  soundEnabled = true;

  constructor() {
    this.currentItem = createPantryItem();
    this.targetSlot = createShelfSlot(this.currentItem.targetShelf);
  }

  reset(): void {
    this.currentItem = createPantryItem();
    this.targetSlot = createShelfSlot(this.currentItem.targetShelf);
    this.itemsArranged = 0;
    this.totalAttempts = 0;
    this.totalScore = 0;
    this.streak = 0;
    this.maxReachHeightPercent = 0;
    this.leftPeakReach = 0;
    this.rightPeakReach = 0;
    this.currentVelocity = 0;
    this.slotHoverStartTime = 0;
    this.reps = [];
  }

  update(
    landmarks: Landmark[] | undefined,
    selectedArmPref: TrackedArm,
    nowMs: number,
    onSnapped?: (x: number, y: number) => void
  ): ShelfReachTelemetry {
    // If landmarks missing
    if (!landmarks || landmarks.length < 33) {
      return this.buildTelemetry(0, false, 'Stand or sit so hips, shoulders, and arms are visible.');
    }

    // Left arm: Shoulder 11, Wrist 15, Hip 23
    // Right arm: Shoulder 12, Wrist 16, Hip 24
    const lShoulder = landmarks[11];
    const lWrist = landmarks[15];
    const lHip = landmarks[23];

    const rShoulder = landmarks[12];
    const rWrist = landmarks[16];
    const rHip = landmarks[24];

    const leftReach = calculateRelativeReachHeight(lShoulder, lWrist, lHip);
    const rightReach = calculateRelativeReachHeight(rShoulder, rWrist, rHip);

    if (leftReach > this.leftPeakReach) this.leftPeakReach = leftReach;
    if (rightReach > this.rightPeakReach) this.rightPeakReach = rightReach;

    // Determine active arm
    if (selectedArmPref === 'left') {
      this.activeArm = 'left';
    } else if (selectedArmPref === 'right') {
      this.activeArm = 'right';
    } else {
      if (Math.abs(leftReach - rightReach) > 15) {
        this.activeArm = leftReach > rightReach ? 'left' : 'right';
      }
    }

    const activeWrist = this.activeArm === 'left' ? lWrist : rWrist;
    const currentReach = this.activeArm === 'left' ? leftReach : rightReach;

    if (currentReach > this.maxReachHeightPercent) {
      this.maxReachHeightPercent = currentReach;
    }

    // Velocity computation
    if (this.lastTimeMs > 0) {
      const dtSec = Math.max(0.001, (nowMs - this.lastTimeMs) / 1000);
      const dy = Math.abs(activeWrist.y - this.lastWristY);
      // Rough meter conversion: full torso ~ 0.55m
      const torsoScale = Math.max(0.12, Math.abs(lHip.y - lShoulder.y));
      const velocity = ((dy / torsoScale) * 0.55) / dtSec;
      this.currentVelocity = Number(velocity.toFixed(2));
    }
    this.lastWristY = activeWrist.y;
    this.lastTimeMs = nowMs;

    let feedbackMessage = '';

    // Pick-and-Place State
    if (!this.currentItem.isHeld) {
      // Check collision with staged counter item
      const distToItem = calculateDistance(activeWrist, { x: this.currentItem.x, y: this.currentItem.y });
      if (distToItem < 0.12) {
        this.currentItem.isHeld = true;
        if (this.soundEnabled) playPickupSound();
        feedbackMessage = `Picked up ${this.currentItem.name}! Lift arm to place on the ${this.targetSlot.label}.`;
      } else {
        feedbackMessage = `Lower hand to counter and touch the ${this.currentItem.name} to pick it up.`;
      }
    } else {
      // Held item follows active wrist
      this.currentItem.x = activeWrist.x;
      this.currentItem.y = activeWrist.y;

      // Check alignment with target slot
      const distToSlot = calculateDistance(
        { x: this.currentItem.x, y: this.currentItem.y },
        { x: this.targetSlot.x, y: this.targetSlot.y }
      );

      if (distToSlot < 0.10) {
        if (this.slotHoverStartTime === 0) {
          this.slotHoverStartTime = nowMs;
        }

        const slotHoverDuration = (nowMs - this.slotHoverStartTime) / 1000;
        feedbackMessage = `In target slot! Hold steady (${(0.4 - slotHoverDuration).toFixed(1)}s)...`;

        // 0.4s hold inside slot snaps it in place
        if (slotHoverDuration >= 0.4) {
          this.itemsArranged += 1;
          this.totalAttempts += 1;
          this.streak += 1;
          this.totalScore += 100 + Math.min(50, this.streak * 10);

          if (this.soundEnabled) {
            playSnapClick();
            playShelfPlacementChime();
          }

          onSnapped?.(this.targetSlot.x, this.targetSlot.y);

          const record: ShelfRecord = {
            id: this.itemsArranged,
            itemName: this.currentItem.name,
            arm: this.activeArm,
            targetShelf: this.targetSlot.level,
            reachHeightPercent: currentReach,
            reachVelocity: this.currentVelocity,
            timestamp: Date.now(),
          };
          this.reps = [record, ...this.reps].slice(0, 10);

          this.persistSession();

          // Spawn next item and slot
          this.currentItem = createPantryItem();
          this.targetSlot = createShelfSlot(this.currentItem.targetShelf);
          this.slotHoverStartTime = 0;

          feedbackMessage = `Placed! +100 PTS! Next item: ${this.currentItem.name} on counter.`;
        }
      } else {
        this.slotHoverStartTime = 0;
        feedbackMessage = `Elevate arm higher to reach the ${this.targetSlot.label}!`;
      }
    }

    return this.buildTelemetry(currentReach, true, feedbackMessage);
  }

  buildTelemetry(
    currentReachPercent: number,
    isTrackingValid: boolean,
    feedbackMessage: string
  ): ShelfReachTelemetry {
    const symmetry = calculateBilateralSymmetry(this.leftPeakReach, this.rightPeakReach);

    return {
      activeArm: this.activeArm,
      currentReachPercent,
      maxReachHeightPercent: this.maxReachHeightPercent,
      leftPeakReachPercent: this.leftPeakReach,
      rightPeakReachPercent: this.rightPeakReach,
      bilateralSymmetryPercent: symmetry,
      itemsArranged: this.itemsArranged,
      totalAttempts: this.totalAttempts,
      reachSpeed: this.currentVelocity,
      totalScore: this.totalScore,
      streak: this.streak,
      feedbackMessage,
      isHoldingItem: this.currentItem.isHeld,
      heldItemName: this.currentItem.isHeld ? this.currentItem.name : 'None',
      reps: this.reps,
      isTrackingValid,
    };
  }

  persistSession(): void {
    const symmetry = calculateBilateralSymmetry(this.leftPeakReach, this.rightPeakReach);
    const avgSpeed =
      this.reps.length > 0
        ? Number((this.reps.reduce((acc, r) => acc + r.reachVelocity, 0) / this.reps.length).toFixed(2))
        : 1.0;

    const data: StoredShelfReachData = {
      lastSessionDate: new Date().toISOString(),
      itemsArranged: this.itemsArranged,
      maxReachHeightPercent: this.maxReachHeightPercent,
      bilateralSymmetry: symmetry,
      avgReachSpeed: avgSpeed,
      totalScore: this.totalScore,
      repsCount: this.reps.length,
    };
    saveResultsToStorage(data);
  }
}
