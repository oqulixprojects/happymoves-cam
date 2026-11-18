import { useCallback, useEffect, useRef, useState } from 'react';
import { useCamera } from '@/hooks/useCamera';
import { useTracker } from '@/hooks/useTracker';
import {
  TOTAL_FISH,
  computeShift,
  extractPose,
  shiftToLane,
  stabilityScore,
  symmetryScore,
} from './analytics';
import type { GamePhase, Item, Particle, SessionResult, Telemetry } from './types';
import './slalomBalance.css';

const W = 560;
const H = 720;
const TRACK_LEFT = 40;
const LANE_W = 160;
const PENGUIN_Y = 600;
const SCROLL_SPEED = 230;
const SPAWN_EVERY = 1.1;
const STORAGE_KEY = 'task8_results';

const laneX = (pos: number) => TRACK_LEFT + LANE_W / 2 + pos * LANE_W;

const EMPTY: Telemetry = {
  amplitudeCm: 0,
  stability: 100,
  fishCollected: 0,
  fishTotal: TOTAL_FISH,
  symmetry: 100,
};

export default function SlalomBalanceModule() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<HTMLCanvasElement>(null);

  const [phase, setPhase] = useState<GamePhase>('ready');
  const [telemetry, setTelemetry] = useState<Telemetry>(EMPTY);

  const phaseRef = useRef<GamePhase>('ready');
  const shiftRef = useRef(0);
  const cmRef = useRef(0);
  const historyRef = useRef<number[]>([]);
  const maxLeftRef = useRef(0);
  const maxRightRef = useRef(0);
  const keyRef = useRef<{ lane: 0 | 1 | 2; until: number } | null>(null);
  const game = useRef({
    pos: 1,
    items: [] as Item[],
    particles: [] as Particle[],
    scroll: 0,
    spawnTimer: 0,
    fishSpawned: 0,
    fishCollected: 0,
    bumps: 0,
  });

  const camera = useCamera(videoRef);
  useTracker({
    kind: 'pose',
    videoRef,
    canvasRef,
    enabled: camera.status === 'active',
    onFrame: (frame) => {
      const lm = extractPose(frame);
      if (!lm) return;
      const r = computeShift(lm);
      if (!r) return;
      shiftRef.current = shiftRef.current * 0.6 + r.shift * 0.4;
      cmRef.current = Math.abs(shiftRef.current) * r.cmPerUnit;
      historyRef.current.push(shiftRef.current);
      if (historyRef.current.length > 45) historyRef.current.shift();
      if (phaseRef.current === 'playing') {
        const cm = Math.abs(shiftRef.current) * r.cmPerUnit;
        if (shiftRef.current < 0) maxLeftRef.current = Math.max(maxLeftRef.current, cm);
        else maxRightRef.current = Math.max(maxRightRef.current, cm);
      }
    },
  });

  useEffect(() => {
    /* camera starts on button click */
  }, [camera]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const lane = e.key === 'ArrowLeft' ? 0 : e.key === 'ArrowRight' ? 2 : e.key === 'ArrowDown' ? 1 : null;
      if (lane === null) return;
      keyRef.current = { lane, until: performance.now() + 700 };
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const start = useCallback(() => {
    const g = game.current;
    g.pos = 1;
    g.items = [];
    g.particles = [];
    g.scroll = 0;
    g.spawnTimer = 0.6;
    g.fishSpawned = 0;
    g.fishCollected = 0;
    g.bumps = 0;
    maxLeftRef.current = 0;
    maxRightRef.current = 0;
    setTelemetry(EMPTY);
    phaseRef.current = 'playing';
    setPhase('playing');
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      setTelemetry({
        amplitudeCm: Math.round(cmRef.current * 10) / 10,
        stability: stabilityScore(historyRef.current),
        fishCollected: game.current.fishCollected,
        fishTotal: TOTAL_FISH,
        symmetry: symmetryScore(maxLeftRef.current, maxRightRef.current),
      });
    }, 100);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const canvas = gameRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    let raf = 0;
    let last = performance.now();

    const burst = (x: number, y: number, color: string, n: number) => {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const s = 60 + Math.random() * 160;
        game.current.particles.push({
          x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40,
          life: 0.5 + Math.random() * 0.4, color, size: 3 + Math.random() * 4,
        });
      }
    };

    const finish = () => {
      phaseRef.current = 'done';
      setPhase('done');
      const result: SessionResult = {
        timestamp: new Date().toISOString(),
        amplitudeCm: Math.round(Math.max(maxLeftRef.current, maxRightRef.current) * 10) / 10,
        stability: stabilityScore(historyRef.current),
        fishCollected: game.current.fishCollected,
        fishTotal: TOTAL_FISH,
        symmetry: symmetryScore(maxLeftRef.current, maxRightRef.current),
        maxLeftCm: Math.round(maxLeftRef.current * 10) / 10,
        maxRightCm: Math.round(maxRightRef.current * 10) / 10,
      };
      try {
        const prev = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as SessionResult[];
        localStorage.setItem(STORAGE_KEY, JSON.stringify([...prev, result]));
      } catch {
        /* storage unavailable: ignore */
      }
    };

    const update = (dt: number) => {
      const g = game.current;
      g.scroll = (g.scroll + SCROLL_SPEED * dt) % 80;

      const now = performance.now();
      const k = keyRef.current;
      const lane = k && k.until > now ? k.lane : shiftToLane(shiftRef.current);
      g.pos += (lane - g.pos) * Math.min(1, dt * 6);

      g.particles = g.particles.filter((p) => (p.life -= dt) > 0);
      for (const p of g.particles) {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 300 * dt;
      }

      if (phaseRef.current !== 'playing') return;

      g.spawnTimer -= dt;
      if (g.spawnTimer <= 0 && g.fishSpawned < TOTAL_FISH) {
        g.spawnTimer = SPAWN_EVERY;
        const fishLane = Math.floor(Math.random() * 3) as 0 | 1 | 2;
        g.items.push({ kind: 'fish', lane: fishLane, y: -30, hit: false });
        g.fishSpawned++;
        if (Math.random() < 0.55) {
          const others = ([0, 1, 2] as const).filter((l) => l !== fishLane);
          g.items.push({ kind: 'ice', lane: others[Math.floor(Math.random() * 2)], y: -30, hit: false });
        }
      }

      const px = laneX(g.pos);
      for (const it of g.items) {
        it.y += SCROLL_SPEED * dt;
        if (it.hit) continue;
        if (Math.abs(it.y - PENGUIN_Y) < 42 && Math.abs(laneX(it.lane) - px) < 58) {
          it.hit = true;
          if (it.kind === 'fish') {
            g.fishCollected++;
            burst(laneX(it.lane), it.y, '#ffc83d', 14);
          } else {
            g.bumps++;
            burst(laneX(it.lane), it.y, '#ffffff', 12);
          }
        }
      }
      g.items = g.items.filter((it) => it.y < H + 40 && !it.hit);

      if (g.fishSpawned >= TOTAL_FISH && g.items.length === 0) finish();
    };

    const drawPenguin = (x: number, y: number, tilt: number) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(tilt);
      ctx.fillStyle = '#16213f';
      ctx.beginPath(); ctx.ellipse(-36, 4, 12, 26, -0.5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(36, 4, 12, 26, 0.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#1d2b53';
      ctx.beginPath(); ctx.ellipse(0, 0, 32, 44, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.ellipse(0, 8, 21, 30, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ff8a3d';
      ctx.beginPath(); ctx.ellipse(-14, 46, 11, 6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(14, 46, 11, 6, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#1d2b53';
      ctx.beginPath(); ctx.arc(0, -40, 22, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(-8, -44, 7, 0, Math.PI * 2); ctx.arc(8, -44, 7, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#111';
      ctx.beginPath(); ctx.arc(-7, -43, 3, 0, Math.PI * 2); ctx.arc(9, -43, 3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ff8a3d';
      ctx.beginPath(); ctx.moveTo(-7, -34); ctx.lineTo(7, -34); ctx.lineTo(0, -24); ctx.closePath(); ctx.fill();
      ctx.restore();
    };

    const drawFish = (x: number, y: number) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.fillStyle = '#ffc83d';
      ctx.strokeStyle = '#c99200';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(0, 0, 24, 14, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(20, 0); ctx.lineTo(38, -12); ctx.lineTo(38, 12); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#222';
      ctx.beginPath(); ctx.arc(-11, -3, 3, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    };

    const drawIce = (x: number, y: number) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.fillStyle = '#8fdcff';
      ctx.strokeStyle = '#3a9bd0';
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.roundRect(-36, -30, 72, 60, 14); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.beginPath(); ctx.moveTo(-22, -16); ctx.lineTo(-8, -22); ctx.stroke();
      ctx.restore();
    };

    const draw = () => {
      const g = game.current;
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#d9f1ff';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#7fd0f5';
      ctx.fillRect(TRACK_LEFT - 12, 0, LANE_W * 3 + 24, H);
      ctx.fillStyle = '#b5e8ff';
      ctx.fillRect(TRACK_LEFT, 0, LANE_W * 3, H);
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 4;
      ctx.setLineDash([36, 44]);
      ctx.lineDashOffset = -g.scroll * 1;
      for (let i = 1; i < 3; i++) {
        ctx.beginPath(); ctx.moveTo(TRACK_LEFT + i * LANE_W, 0); ctx.lineTo(TRACK_LEFT + i * LANE_W, H); ctx.stroke();
      }
      ctx.setLineDash([]);
      for (const it of g.items) {
        if (it.kind === 'fish') drawFish(laneX(it.lane), it.y);
        else drawIce(laneX(it.lane), it.y);
      }
      const lane = keyRef.current && keyRef.current.until > performance.now()
        ? keyRef.current.lane : shiftToLane(shiftRef.current);
      drawPenguin(laneX(g.pos), PENGUIN_Y, (lane - g.pos) * 0.25);
      for (const p of g.particles) {
        ctx.globalAlpha = Math.max(0, p.life * 2);
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
    };

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      update(dt);
      draw();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="slalom-layout">
      <section className="slalom-stage">
        <canvas ref={gameRef} className="slalom-game" width={W} height={H} />

        <div className="slalom-cam">
          <div className="slalom-cam-inner">
            <video ref={videoRef} playsInline muted autoPlay />
            <canvas ref={canvasRef} />
          </div>
        </div>

        {phase === 'ready' && (
          <div className="slalom-overlay">
            <h2>Penguin Ice Slide</h2>
            <p>Stand so your whole body is in the camera. Lean your hips left or right to steer the penguin and catch the golden fish.</p>
            <button className="slalom-btn" onClick={() => { if (camera.status !== 'active') void camera.start(); start(); }}>Start sliding</button>
            <p className="slalom-status">Camera: {String(camera.status)}. No camera? Use the arrow keys.</p>
          </div>
        )}

        {phase === 'done' && (
          <div className="slalom-overlay">
            <h2>Great sliding!</h2>
            <p>
              You caught {telemetry.fishCollected} of {telemetry.fishTotal} fish with {telemetry.symmetry}% left/right balance.
              Your results are saved.
            </p>
            <button className="slalom-btn" onClick={() => { if (camera.status !== 'active') void camera.start(); start(); }}>Play again</button>
          </div>
        )}
      </section>

      <aside className="slalom-panel">
        <h3>Live results</h3>
        <div className="slalom-metric">
          <div className="slalom-metric-label">Weight shift amplitude</div>
          <div className="slalom-metric-value">{telemetry.amplitudeCm.toFixed(1)} cm</div>
        </div>
        <div className="slalom-metric">
          <div className="slalom-metric-label">Balance stability</div>
          <div className="slalom-metric-value">{telemetry.stability}%</div>
          <div className="slalom-bar"><span style={{ width: `${telemetry.stability}%` }} /></div>
        </div>
        <div className="slalom-metric">
          <div className="slalom-metric-label">Fish collected</div>
          <div className="slalom-metric-value">{telemetry.fishCollected} / {telemetry.fishTotal}</div>
          <div className="slalom-bar"><span style={{ width: `${(telemetry.fishCollected / telemetry.fishTotal) * 100}%` }} /></div>
        </div>
        <div className="slalom-metric">
          <div className="slalom-metric-label">Left/right symmetry</div>
          <div className="slalom-metric-value">{telemetry.symmetry}%</div>
          <div className="slalom-bar"><span style={{ width: `${telemetry.symmetry}%` }} /></div>
        </div>
      </aside>
    </div>
  );
}

