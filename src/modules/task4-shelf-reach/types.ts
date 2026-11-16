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
