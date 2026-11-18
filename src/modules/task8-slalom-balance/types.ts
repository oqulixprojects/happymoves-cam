export interface Landmark {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
}

export type GamePhase = 'ready' | 'playing' | 'done';

export interface Telemetry {
  amplitudeCm: number;
  stability: number;
  fishCollected: number;
  fishTotal: number;
  symmetry: number;
}

export interface SessionResult extends Telemetry {
  timestamp: string;
  maxLeftCm: number;
  maxRightCm: number;
}

export interface Item {
  kind: 'fish' | 'ice';
  lane: 0 | 1 | 2;
  y: number;
  hit: boolean;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
  size: number;
}