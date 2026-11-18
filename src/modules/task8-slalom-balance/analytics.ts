import type { Landmark } from './types';

/** Normalized hip-to-ankle offset needed to count as a lean (from the task spec). */
export const SHIFT_THRESHOLD = 0.06;

/**
 * The camera preview is shown mirrored (like a mirror). In the raw camera image
 * the user's right side has a SMALLER x, so we flip the sign. If the penguin
 * steers the wrong way on your machine, set this to false.
 */
export const MIRRORED = true;

/** Average shoulder width in cm, used to convert normalized units to centimetres. */
const SHOULDER_WIDTH_CM = 38;
/** Fallback scale if shoulders are not visible: normalized units -> cm. */
const FALLBACK_CM_PER_UNIT = 100;

export const TOTAL_FISH = 16;

const mid = (a: Landmark, b: Landmark) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/** Pull the 33 pose landmarks out of a tracker frame (handles a few likely shapes). */
export function extractPose(frame: unknown): Landmark[] | null {
  const f = frame as { pose?: unknown } | null;
  const p = f?.pose as unknown;
  if (!p) return null;
  if (Array.isArray(p)) {
    const first = p[0];
    // Could be Landmark[] or Landmark[][] (one array per person)
    if (Array.isArray(first)) return first as Landmark[];
    return p as Landmark[];
  }
  const inner = (p as { landmarks?: unknown }).landmarks;
  if (Array.isArray(inner)) {
    return (Array.isArray(inner[0]) ? inner[0] : inner) as Landmark[];
  }
  return null;
}

export interface ShiftResult {
  /** Signed lateral shift, positive = penguin should go right on screen. */
  shift: number;
  /** cm per normalized unit for this frame. */
  cmPerUnit: number;
}

/** ΔX = Hip_mid.x − Ankle_mid.x, using landmarks 23/24 (hips) and 27/28 (ankles). */
export function computeShift(lm: Landmark[], mirrored: boolean = MIRRORED): ShiftResult | null {
  const lh = lm[23], rh = lm[24], la = lm[27], ra = lm[28];
  if (!lh || !rh || !la || !ra) return null;
  const hip = mid(lh, rh);
  const ankle = mid(la, ra);
  const raw = hip.x - ankle.x;
  const shift = mirrored ? -raw : raw;

  let cmPerUnit = FALLBACK_CM_PER_UNIT;
  const ls = lm[11], rs = lm[12];
  if (ls && rs) {
    const w = Math.abs(ls.x - rs.x);
    if (w > 0.05) cmPerUnit = SHOULDER_WIDTH_CM / w;
  }
  return { shift, cmPerUnit };
}

/** Map a shift to a lane: 0 = left, 1 = centre, 2 = right. */
export function shiftToLane(shift: number): 0 | 1 | 2 {
  if (shift < -SHIFT_THRESHOLD) return 0;
  if (shift > SHIFT_THRESHOLD) return 2;
  return 1;
}

/** Stability 0–100 from how jittery the recent shift values are (lower std = steadier). */
export function stabilityScore(history: number[]): number {
  if (history.length < 5) return 100;
  // Remove slow, intended motion by measuring frame-to-frame change instead of spread.
  let diffSum = 0;
  for (let i = 1; i < history.length; i++) diffSum += Math.abs(history[i] - history[i - 1]);
  const avgStep = diffSum / (history.length - 1);
  return Math.max(0, Math.min(100, Math.round(100 - avgStep * 1500)));
}

/** Left/right balance: 100 = equal reach on both sides. */
export function symmetryScore(maxLeftCm: number, maxRightCm: number): number {
  const hi = Math.max(maxLeftCm, maxRightCm);
  if (hi <= 0) return 100;
  return Math.round((Math.min(maxLeftCm, maxRightCm) / hi) * 100);
}
