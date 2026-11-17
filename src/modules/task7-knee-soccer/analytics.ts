import type { TargetCorner } from './types';

type Point = { x: number; y: number };
type TimedPoint = Point & { time: number };

export const EXTENSION_TARGET = 160; // degrees needed for a goal
export const MIN_KICK_SPEED = 1.0; // m/s, a slower kick counts as a miss
export const THIGH_LENGTH_METERS = 0.4; // assumed thigh length, used as a ruler

/**
 * Angle at the knee (0 to 180 degrees).
 * `aspect` is video width / height. It stops the angle from being
 * squashed, because camera landmarks are 0..1 on both axes.
 */
export function calculateKneeAngle(
  hip: Point,
  knee: Point,
  ankle: Point,
  aspect = 1,
): number {
  const a = { x: (hip.x - knee.x) * aspect, y: hip.y - knee.y };
  const b = { x: (ankle.x - knee.x) * aspect, y: ankle.y - knee.y };

  const dotProduct = a.x * b.x + a.y * b.y;
  const magnitudeA = Math.hypot(a.x, a.y);
  const magnitudeB = Math.hypot(b.x, b.y);

  if (magnitudeA === 0 || magnitudeB === 0) {
    return 0;
  }

  const cosine = dotProduct / (magnitudeA * magnitudeB);
  const safeCosine = Math.max(-1, Math.min(1, cosine));

  return (Math.acos(safeCosine) * 180) / Math.PI;
}

/**
 * How many metres one image unit is worth, using thigh length as a ruler.
 */
export function getMetersPerUnit(hip: Point, knee: Point, aspect = 1): number {
  const thigh = Math.hypot((hip.x - knee.x) * aspect, hip.y - knee.y);
  return thigh > 0 ? THIGH_LENGTH_METERS / thigh : 0;
}

/**
 * Estimated foot speed in metres per second (an estimate, not clinical).
 */
export function calculateFootSpeed(
  previous: TimedPoint,
  current: TimedPoint,
  metersPerUnit: number,
  aspect = 1,
): number {
  const elapsedSeconds = (current.time - previous.time) / 1000;

  if (elapsedSeconds <= 0 || metersPerUnit <= 0) {
    return 0;
  }

  const distance = Math.hypot(
    (current.x - previous.x) * aspect,
    current.y - previous.y,
  );

  return Number(((distance * metersPerUnit) / elapsedSeconds).toFixed(2));
}

/**
 * Moving average. Makes jumpy numbers smoother.
 */
export class MovingAverage {
  private values: number[] = [];

  constructor(private size = 5) {}

  push(value: number): number {
    this.values.push(value);
    if (this.values.length > this.size) {
      this.values.shift();
    }
    return this.values.reduce((sum, v) => sum + v, 0) / this.values.length;
  }

  reset() {
    this.values = [];
  }
}

/**
 * Selects the next target corner in sequence.
 */
export function getTargetCorner(kickNumber: number): TargetCorner {
  const targets: TargetCorner[] = ['top-left', 'top-right', 'bottom-left'];

  return targets[kickNumber % targets.length];
}

/**
 * Checks whether the knee has reached the extension target.
 */
export function isExtensionReached(angle: number): boolean {
  return angle >= EXTENSION_TARGET;
}

/**
 * A kick is on target when the knee is fully extended
 * and the foot moved with enough speed.
 */
export function isKickStrongEnough(speed: number): boolean {
  return speed >= MIN_KICK_SPEED;
}

/**
 * Calculates accuracy as a percentage.
 */
export function calculateAccuracy(
  successfulKicks: number,
  totalKicks: number,
): number {
  if (totalKicks === 0) {
    return 0;
  }

  return Math.round((successfulKicks / totalKicks) * 100);
}