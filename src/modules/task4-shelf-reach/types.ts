export type TrackedArm = 'auto' | 'left' | 'right';

export type ShelfLevel = 'counter' | 'middle' | 'top';

export type ItemType = 'cereal' | 'juice' | 'soup' | 'honey' | 'oil';

export interface PantryItem {
  id: string;
  type: ItemType;
  name: string;
  emoji: string;
  color: string;
  x: number; // 0..1 normalized center X
  y: number; // 0..1 normalized center Y
  width: number; // normalized width
  height: number; // normalized height
  currentShelf: ShelfLevel;
  targetShelf: 'middle' | 'top';
  isHeld: boolean;
  isPlaced: boolean;
}

export interface ShelfSlot {
  level: 'middle' | 'top';
  label: string;
  x: number; // 0..1
  y: number; // 0..1
  width: number;
  height: number;
}

export interface ShelfRecord {
  id: number;
  itemName: string;
  arm: 'left' | 'right';
  targetShelf: 'middle' | 'top';
  reachHeightPercent: number;
  reachVelocity: number;
  timestamp: number;
}

export interface ShelfReachTelemetry {
  activeArm: 'left' | 'right';
  currentReachPercent: number; // percentage above shoulder (0 = shoulder, >0 = above)
  maxReachHeightPercent: number; // session peak reach height %
  leftPeakReachPercent: number;
  rightPeakReachPercent: number;
  bilateralSymmetryPercent: number; // 0..100%
  itemsArranged: number;
  totalAttempts: number;
  reachSpeed: number; // m/s equivalent
  totalScore: number;
  streak: number;
  feedbackMessage: string;
  isHoldingItem: boolean;
  heldItemName: string;
  reps: ShelfRecord[];
  isTrackingValid: boolean;
}

export interface StoredShelfReachData {
  lastSessionDate: string;
  itemsArranged: number;
  maxReachHeightPercent: number;
  bilateralSymmetry: number;
  avgReachSpeed: number;
  totalScore: number;
  repsCount: number;
}

export interface ShelfParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  size: number;
  alpha: number;
  life: number;
  maxLife: number;
}

export interface FloatingText {
  text: string;
  x: number;
  y: number;
  alpha: number;
  life: number;
  maxLife: number;
  color: string;
}

export interface Landmark {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
}

export interface Pt {
  x: number;
  y: number;
}

export type Side = 'left' | 'right';
export type ItemKind = 'cereal' | 'juice' | 'soup' | 'honey';
export type ItemState = 'counter' | 'held' | 'placed';
export type GamePhase = 'waiting' | 'playing' | 'complete';

export interface ShelfItem {
  id: number;
  kind: ItemKind;
  /** centre of the item in canvas pixels */
  x: number;
  y: number;
  state: ItemState;
  /** which counter position this item came from */
  counterSlot: number;
}

export interface TargetSlot {
  x: number;
  y: number;
  shelf: 'middle' | 'top';
}

export interface Star {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number; // seconds remaining
  size: number;
}

export interface GameState {
  phase: GamePhase;
  items: ShelfItem[];
  placed: number;
  spawned: number;
  heldId: number | null;
  heldBy: Side | null;
  heldLostAt: number;
  dwellId: number | null;
  dwellSide: Side | null;
  dwellStart: number;
  /** smoothed wrist positions in canvas pixels (mirrored, selfie view) */
  wrists: Record<Side, Pt | null>;
  /** live relative reach height (% of torso) above shoulder line */
  reach: Record<Side, number>;
  maxReach: Record<Side, number>;
  prevReach: Record<Side, number | null>;
  /** smoothed upward arm speed in m/s */
  speed: number;
  lastT: number;
  startedAt: number;
  stars: Star[];
}

export interface Telemetry {
  currentReachPct: number;
  maxReachPct: number;
  symmetryPct: number;
  itemsPlaced: number;
  itemsTotal: number;
  reachSpeed: number;
}

export interface SessionResult {
  date: string;
  durationSec: number;
  itemsPlaced: number;
  maxReachPct: number;
  maxReachLeftPct: number;
  maxReachRightPct: number;
  symmetryPct: number;
}
