import { useCallback, useEffect, useRef, useState } from 'react';
import { useCamera } from '@/hooks/useCamera';
import { useTracker } from '@/hooks/useTracker';
import {
  MIRRORED,
  TOTAL_FISH,
  computeShift,
  extractPose,
  shiftToLane,
  stabilityScore,
  symmetryScore,
} from './analytics';
import type { GamePhase, Item, Particle, SessionResult, Snowflake, Telemetry } from './types';
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

/** Tiny sound effects made with the browser's audio (no sound files needed). */
function playTone(ctx: AudioContext | null, freqs: number[], dur = 0.09, type: OscillatorType = 'triangle') {
  if (!ctx) return;
  try {
    freqs.forEach((f, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.value = f;
      const t0 = ctx.currentTime + i * dur;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.18, t0 + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    });
  } catch {
    /* audio not available: ignore */
  }
}

export default function SlalomBalanceModule() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<HTMLCanvasElement>(null);

  const [phase, setPhase] = useState<GamePhase>('ready');
  const [telemetry, setTelemetry] = useState<Telemetry>(EMPTY);
  const [flipped, setFlipped] = useState(false);
  const [gems, setGems] = useState(0);

  const phaseRef = useRef<GamePhase>('ready');
  const mirroredRef = useRef(MIRRORED);
  const audioRef = useRef<AudioContext | null>(null);
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
    snow: [] as Snowflake[],
    scroll: 0,
    spawnTimer: 0,
    fishSpawned: 0,
    fishCollected: 0,
    gemsCollected: 0,
    bumps: 0,
    shake: 0,
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
      const r = computeShift(lm, mirroredRef.current);
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
    const onKey = (e: KeyboardEvent) => {
      const lane = e.key === 'ArrowLeft' ? 0 : e.key === 'ArrowRight' ? 2 : e.key === 'ArrowDown' ? 1 : null;
      if (lane === null) return;
      keyRef.current = { lane, until: performance.now() + 700 };
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const flipDirection = useCallback(() => {
    mirroredRef.current = !mirroredRef.current;
    setFlipped((f) => !f);
  }, []);

  const start = useCallback(() => {
    // Camera and audio must start from a click, so we do it here.
    if (camera.status !== 'active') void camera.start();
    try {
      if (!audioRef.current) audioRef.current = new AudioContext();
      void audioRef.current.resume();
    } catch {
      audioRef.current = null;
    }

    const g = game.current;
    g.pos = 1;
    g.items = [];
    g.particles = [];
    g.scroll = 0;
    g.spawnTimer = 0.6;
    g.fishSpawned = 0;
    g.fishCollected = 0;
    g.gemsCollected = 0;
    g.bumps = 0;
    g.shake = 0;
    maxLeftRef.current = 0;
    maxRightRef.current = 0;
    setGems(0);
    setTelemetry(EMPTY);
    phaseRef.current = 'playing';
    setPhase('playing');
  }, [camera]);

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

    // ambient falling snow
    const g0 = game.current;
    if (g0.snow.length === 0) {
      for (let i = 0; i < 45; i++) {
        g0.snow.push({
          x: Math.random() * W,
          y: Math.random() * H,
          r: 1.5 + Math.random() * 2.5,
          speed: 30 + Math.random() * 60,
          drift: (Math.random() - 0.5) * 20,
        });
      }
    }

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
      playTone(audioRef.current, [523, 659, 784, 1047], 0.12);
      const result: SessionResult = {
        timestamp: new Date().toISOString(),
        amplitudeCm: Math.round(Math.max(maxLeftRef.current, maxRightRef.current) * 10) / 10,
        stability: stabilityScore(historyRef.current),
        fishCollected: game.current.fishCollected,
        fishTotal: TOTAL_FISH,
        symmetry: symmetryScore(maxLeftRef.current, maxRightRef.current),
        maxLeftCm: Math.round(maxLeftRef.current * 10) / 10,
        maxRightCm: Math.round(maxRightRef.current * 10) / 10,
        gemsCollected: game.current.gemsCollected,
      };
      setGems(game.current.gemsCollected);
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
      g.shake = Math.max(0, g.shake - dt * 3);

      // snow
      for (const s of g.snow) {
        s.y += s.speed * dt;
        s.x += s.drift * dt;
        if (s.y > H + 5) { s.y = -5; s.x = Math.random() * W; }
        if (s.x < -5) s.x = W + 5;
        if (s.x > W + 5) s.x = -5;
      }

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
        const others = ([0, 1, 2] as const).filter((l) => l !== fishLane);
        const roll = Math.random();
        if (roll < 0.5) {
          g.items.push({ kind: 'ice', lane: others[Math.floor(Math.random() * 2)], y: -30, hit: false });
        } else if (roll < 0.75) {
          g.items.push({ kind: 'gem', lane: others[Math.floor(Math.random() * 2)], y: -30, hit: false });
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
            burst(laneX(it.lane), it.y, '#ffc83d', 16);
            playTone(audioRef.current, [660, 880], 0.08);
          } else if (it.kind === 'gem') {
            g.gemsCollected++;
            burst(laneX(it.lane), it.y, '#7ee8ff', 16);
            playTone(audioRef.current, [988, 1319], 0.07, 'sine');
          } else {
            g.bumps++;
            g.shake = 1;
            burst(laneX(it.lane), it.y, '#ffffff', 14);
            playTone(audioRef.current, [196, 147], 0.12, 'square');
          }
        }
      }
      g.items = g.items.filter((it) => it.y < H + 40 && !it.hit);

      if (g.fishSpawned >= TOTAL_FISH && g.items.length === 0) finish();
    };

    // Penguin seen from above, sliding on its belly (head up the screen).
    const drawPenguin = (x: number, y: number, tilt: number) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(tilt);
      // soft shadow on the ice
      ctx.fillStyle = 'rgba(30, 90, 140, 0.25)';
      ctx.beginPath(); ctx.ellipse(6, 10, 36, 52, 0, 0, Math.PI * 2); ctx.fill();
      // flippers spread out to the sides
      ctx.fillStyle = '#16213f';
      ctx.beginPath(); ctx.ellipse(-40, -4, 11, 28, -0.9, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(40, -4, 11, 28, 0.9, 0, Math.PI * 2); ctx.fill();
      // little orange feet at the back
      ctx.fillStyle = '#ff8a3d';
      ctx.beginPath(); ctx.ellipse(-13, 52, 12, 7, 0.3, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(13, 52, 12, 7, -0.3, 0, Math.PI * 2); ctx.fill();
      // body (back, since it is on its belly)
      ctx.fillStyle = '#1d2b53';
      ctx.beginPath(); ctx.ellipse(0, 6, 31, 50, 0, 0, Math.PI * 2); ctx.fill();
      // highlight
      ctx.fillStyle = 'rgba(255,255,255,0.14)';
      ctx.beginPath(); ctx.ellipse(-9, 2, 8, 30, 0, 0, Math.PI * 2); ctx.fill();
      // head
      ctx.fillStyle = '#1d2b53';
      ctx.beginPath(); ctx.arc(0, -42, 22, 0, Math.PI * 2); ctx.fill();
      // white cheeks
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.ellipse(-11, -40, 7, 9, 0.2, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(11, -40, 7, 9, -0.2, 0, Math.PI * 2); ctx.fill();
      // eyes
      ctx.fillStyle = '#111';
      ctx.beginPath(); ctx.arc(-9, -46, 3, 0, Math.PI * 2); ctx.arc(9, -46, 3, 0, Math.PI * 2); ctx.fill();
      // beak
      ctx.fillStyle = '#ff8a3d';
      ctx.beginPath(); ctx.moveTo(-7, -56); ctx.lineTo(7, -56); ctx.lineTo(0, -70); ctx.closePath(); ctx.fill();
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

    const drawGem = (x: number, y: number) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.fillStyle = '#7ee8ff';
      ctx.strokeStyle = '#2aa7d6';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, -22); ctx.lineTo(20, -4); ctx.lineTo(0, 22); ctx.lineTo(-20, -4);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.beginPath(); ctx.moveTo(-8, -6); ctx.lineTo(0, -16); ctx.lineTo(4, -6); ctx.closePath(); ctx.fill();
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
      ctx.save();
      if (g.shake > 0) ctx.translate((Math.random() - 0.5) * 8 * g.shake, (Math.random() - 0.5) * 8 * g.shake);
      ctx.clearRect(-10, -10, W + 20, H + 20);
      ctx.fillStyle = '#d9f1ff';
      ctx.fillRect(-10, -10, W + 20, H + 20);
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
        else if (it.kind === 'gem') drawGem(laneX(it.lane), it.y);
        else drawIce(laneX(it.lane), it.y);
      }
      const lane = keyRef.current && keyRef.current.until > performance.now()
        ? keyRef.current.lane : shiftToLane(shiftRef.current);
      drawPenguin(laneX(g.pos), PENGUIN_Y, (lane - g.pos) * 0.25);
      // falling snow
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      for (const s of g.snow) {
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
      }
      // sparkles
      for (const p of g.particles) {
        ctx.globalAlpha = Math.max(0, p.life * 2);
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.restore();
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
            <p>Stand back so the camera sees you from head to feet. Keep your feet still and sway your hips left or right to steer the penguin. Catch the golden fish, grab the gems, and dodge the ice blocks.</p>
            <button className="slalom-btn" onClick={start}>Start sliding</button>
            <button className="slalom-btn slalom-btn-small" onClick={flipDirection}>
              Penguin goes the wrong way? Flip left/right{flipped ? ' (flipped)' : ''}
            </button>
            <p className="slalom-status">Camera: {String(camera.status)}. No camera? Use the arrow keys.</p>
          </div>
        )}

        {phase === 'done' && (
          <div className="slalom-overlay">
            <h2>Great sliding!</h2>
            <p>
              You caught {telemetry.fishCollected} of {telemetry.fishTotal} fish and {gems} gems, with {telemetry.symmetry}% left/right balance.
              Your results are saved.
            </p>
            <button className="slalom-btn" onClick={start}>Play again</button>
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
