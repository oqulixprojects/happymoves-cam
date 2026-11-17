import type {
  GameState,
  ItemKind,
  Landmark,
  Pt,
  SessionResult,
  ShelfItem,
  Side,
  TargetSlot,
  Telemetry,
} from './types';

// ---------------------------------------------------------------- constants
// Canvas dimensions (width and height in pixels)
export const W = 640;
export const H = 480;
export const TOTAL_ITEMS = 10;  // Total number of items
export const STORAGE_KEY = 'task4_results';  // Key used to store completed game results
// Width and height of each pantry item
export const ITEM_W = 56;
export const ITEM_H = 72;
/** y of the top surface of each shelf board (canvas px) */
export const SHELF_Y = { counter: 430, middle: 290, top: 150 } as const;

const TORSO_METERS = 0.5; // assumed real torso length, used for the m/s estimate
const MIN_VISIBILITY = 0.5;  // Minimum visibility confidence required for a body landmark
const PICK_DWELL_MS = 250;  // User must keep the wrist over an item for 250 milliseconds to pick it up
const PICK_PAD = 18;
const SNAP_DIST = 48;
const SMOOTH = 0.45;
const SIDES: Side[] = ['left', 'right'];
const KINDS: ItemKind[] = ['cereal', 'juice', 'soup', 'honey'];  // Types of pantry items
const COUNTER_X = [120, 250, 380, 510];
const SLOT_X = [100, 210, 320, 430, 540];

// MediaPipe pose landmark indices
const LM = { LS: 11, RS: 12, LW: 15, RW: 16, LH: 23, RH: 24 } as const;

// ------------------------------------------------------------------- math
/** Accepts whatever shape the tracker gives us and returns 33 landmarks (or null). */
export function extractPose(raw: unknown): Landmark[] | null {
  if (!raw) return null;
  let cand: unknown = raw;
  if (!Array.isArray(cand) && typeof cand === 'object' && cand !== null && 'landmarks' in cand) {
    cand = (cand as { landmarks: unknown }).landmarks;
  }
  if (Array.isArray(cand) && cand.length > 0 && Array.isArray(cand[0])) {
    cand = cand[0]; // first person
  }
  if (!Array.isArray(cand) || cand.length < 25) return null;
  return cand as Landmark[];
}

const visible = (l: Landmark | undefined): l is Landmark =>
  !!l && (l.visibility ?? 1) >= MIN_VISIBILITY;

/** Distance between shoulder midpoint and hip midpoint (normalised units). */
export function torsoLength(lm: Landmark[]): number {
  const sx = (lm[LM.LS].x + lm[LM.RS].x) / 2;
  const sy = (lm[LM.LS].y + lm[LM.RS].y) / 2;
  const hx = (lm[LM.LH].x + lm[LM.RH].x) / 2;
  const hy = (lm[LM.LH].y + lm[LM.RH].y) / 2;
  return Math.hypot(sx - hx, sy - hy);
}

/**
 * Relative reach height in % of torso length.
 * Image y grows downward, so (shoulderY - wristY) > 0 means wrist above shoulder.
 */
export function reachPct(shoulderY: number, wristY: number, torso: number): number {
  return ((shoulderY - wristY) / torso) * 100;
}

/** 100% = both arms reached equally high. */
export function symmetry(maxLeft: number, maxRight: number): number {
  const hi = Math.max(maxLeft, maxRight);
  if (hi <= 0) return 100;
  return (Math.max(Math.min(maxLeft, maxRight), 0) / hi) * 100;
}

/** Normalised landmark -> canvas pixels, mirrored for selfie view. */
function toCanvas(l: Landmark): Pt {
  return { x: (1 - l.x) * W, y: l.y * H };
}

// ------------------------------------------------------------ game helpers
function makeItem(id: number, counterSlot: number): ShelfItem {
  return {
    id,
    kind: KINDS[id % KINDS.length],
    x: COUNTER_X[counterSlot],
    y: SHELF_Y.counter - ITEM_H / 2,
    state: 'counter',
    counterSlot,
  };
}

export function createGame(): GameState {
  return {
    phase: 'waiting',
    items: [0, 1, 2, 3].map((i) => makeItem(i, i)),
    placed: 0,
    spawned: 4,
    heldId: null,
    heldBy: null,
    heldLostAt: 0,
    dwellId: null,
    dwellSide: null,
    dwellStart: 0,
    wrists: { left: null, right: null },
    reach: { left: 0, right: 0 },
    maxReach: { left: 0, right: 0 },
    prevReach: { left: null, right: null },
    speed: 0,
    lastT: 0,
    startedAt: 0,
    stars: [],
  };
}

/** Next dashed target slot: alternates middle shelf / top shelf. */
export function getTarget(placed: number): TargetSlot {
  const shelf = placed % 2 === 0 ? 'middle' : 'top';
  const idx = Math.floor(placed / 2) % SLOT_X.length;
  return { x: SLOT_X[idx], y: SHELF_Y[shelf] - ITEM_H / 2, shelf };
}

function release(g: GameState, item: ShelfItem): void {
  item.state = 'counter';
  item.x = COUNTER_X[item.counterSlot];
  item.y = SHELF_Y.counter - ITEM_H / 2;
  g.heldId = null;
  g.heldBy = null;
  g.heldLostAt = 0;
}

function burstStars(g: GameState, x: number, y: number): void {
  for (let i = 0; i < 14; i++) {
    const a = (Math.PI * 2 * i) / 14 + Math.random() * 0.4;
    const s = 80 + Math.random() * 120;
    g.stars.push({
      x,
      y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s - 40,
      life: 0.8 + Math.random() * 0.4,
      size: 6 + Math.random() * 6,
    });
  }
}

export function stepStars(g: GameState, dt: number): void {
  for (const s of g.stars) {
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    s.vy += 220 * dt;
    s.life -= dt;
  }
  g.stars = g.stars.filter((s) => s.life > 0);
}

/**
 * Feed one pose frame into the game.
 * Returns true when an item was just snapped into its slot (play the click).
 */
export function processPose(g: GameState, lm: Landmark[] | null, now: number): boolean {
  const dt = g.lastT ? Math.max((now - g.lastT) / 1000, 0.001) : 0.033;
  g.lastT = now;

  if (!lm || g.phase === 'complete') {
    g.wrists.left = null;
    g.wrists.right = null;
    g.speed *= 0.9;
    return false;
  }
  if (g.phase === 'waiting') {
    g.phase = 'playing';
    g.startedAt = now;
  }

  // ---- reach height + wrist positions
  const torso = torsoLength(lm);
  const torsoOk = torso > 0.05;
  let bestSpeed = 0;

  for (const side of SIDES) {
    const sh = lm[side === 'left' ? LM.LS : LM.RS];
    const wr = lm[side === 'left' ? LM.LW : LM.RW];
    if (!visible(sh) || !visible(wr)) {
      g.wrists[side] = null;
      g.prevReach[side] = null;
      continue;
    }
    const p = toCanvas(wr);
    const prev = g.wrists[side];
    g.wrists[side] = prev
      ? { x: prev.x + (p.x - prev.x) * SMOOTH, y: prev.y + (p.y - prev.y) * SMOOTH }
      : p;

    if (torsoOk) {
      const pct = reachPct(sh.y, wr.y, torso);
      g.reach[side] = pct;
      if (pct > g.maxReach[side]) g.maxReach[side] = pct;
      const pp = g.prevReach[side];
      if (pp !== null) {
        bestSpeed = Math.max(bestSpeed, ((pct - pp) / 100) * TORSO_METERS / dt);
      }
      g.prevReach[side] = pct;
    }
  }
  g.speed += (bestSpeed - g.speed) * 0.2;

  // ---- carrying an item
  if (g.heldId !== null && g.heldBy) {
    const held = g.items.find((i) => i.id === g.heldId);
    if (!held) {
      g.heldId = null;
      g.heldBy = null;
      return false;
    }
    const w = g.wrists[g.heldBy];
    if (!w) {
      if (!g.heldLostAt) g.heldLostAt = now;
      else if (now - g.heldLostAt > 2000) release(g, held);
      return false;
    }
    g.heldLostAt = 0;
    held.x = w.x;
    held.y = w.y;

    const t = getTarget(g.placed);
    if (Math.hypot(w.x - t.x, w.y - t.y) < SNAP_DIST) {
      held.state = 'placed';
      held.x = t.x;
      held.y = t.y;
      g.heldId = null;
      g.heldBy = null;
      g.placed += 1;
      burstStars(g, t.x, t.y);
      if (g.spawned < TOTAL_ITEMS) {
        g.items.push(makeItem(g.spawned, held.counterSlot));
        g.spawned += 1;
      }
      if (g.placed >= TOTAL_ITEMS) g.phase = 'complete';
      return true;
    }
    return false;
  }

  // ---- looking for an item to pick up (hover for PICK_DWELL_MS)
  let hit: { item: ShelfItem; side: Side } | null = null;
  for (const side of SIDES) {
    const w = g.wrists[side];
    if (!w) continue;
    const item = g.items.find(
      (i) =>
        i.state === 'counter' &&
        Math.abs(w.x - i.x) < ITEM_W / 2 + PICK_PAD &&
        Math.abs(w.y - i.y) < ITEM_H / 2 + PICK_PAD,
    );
    if (item) {
      hit = { item, side };
      break;
    }
  }

  if (!hit) {
    g.dwellId = null;
    g.dwellSide = null;
  } else if (g.dwellId === hit.item.id && g.dwellSide === hit.side) {
    if (now - g.dwellStart >= PICK_DWELL_MS) {
      hit.item.state = 'held';
      g.heldId = hit.item.id;
      g.heldBy = hit.side;
      g.heldLostAt = 0;
      g.dwellId = null;
      g.dwellSide = null;
    }
  } else {
    g.dwellId = hit.item.id;
    g.dwellSide = hit.side;
    g.dwellStart = now;
  }
  return false;
}

// -------------------------------------------------------- telemetry / save
export function buildTelemetry(g: GameState): Telemetry {
  return {
    currentReachPct: Math.round(Math.max(g.reach.left, g.reach.right, 0)),
    maxReachPct: Math.round(Math.max(g.maxReach.left, g.maxReach.right)),
    symmetryPct: Math.round(symmetry(g.maxReach.left, g.maxReach.right)),
    itemsPlaced: g.placed,
    itemsTotal: TOTAL_ITEMS,
    reachSpeed: Math.round(Math.abs(g.speed) * 10) / 10,
  };
}

export function buildResult(g: GameState): SessionResult {
  const t = buildTelemetry(g);
  return {
    date: new Date().toISOString(),
    durationSec: g.startedAt ? Math.round((performance.now() - g.startedAt) / 1000) : 0,
    itemsPlaced: g.placed,
    maxReachPct: t.maxReachPct,
    maxReachLeftPct: Math.round(g.maxReach.left),
    maxReachRightPct: Math.round(g.maxReach.right),
    symmetryPct: t.symmetryPct,
  };
}

export function saveResult(r: SessionResult): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    const list: SessionResult[] = Array.isArray(parsed) ? (parsed as SessionResult[]) : [];
    list.push(r);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(-50)));
  } catch {
    /* storage unavailable - ignore */
  }
}