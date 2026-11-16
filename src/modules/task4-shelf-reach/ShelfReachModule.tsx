import { useEffect, useRef, useState } from 'react';
import { useCamera } from '@/hooks/useCamera';
import { useTracker } from '@/hooks/useTracker';
import {
  H,
  ITEM_H,
  ITEM_W,
  SHELF_Y,
  W,
  buildResult,
  buildTelemetry,
  createGame,
  extractPose,
  getTarget,
  processPose,
  saveResult,
  stepStars,
} from './analytics';
import type { GamePhase, GameState, ItemKind, SessionResult, Telemetry } from './types';
import './shelfReach.css';

// ------------------------------------------------------------------ audio
let audioCtx: AudioContext | null = null;

type ActivationNavigator = Navigator & { userActivation?: { hasBeenActive: boolean } };

/** Creates/resumes audio only after the browser confirms a real user gesture happened. */
function unlockAudio(): void {
  const activation = (navigator as ActivationNavigator).userActivation;
  if (activation && !activation.hasBeenActive) return; // e.g. Ctrl/Shift key presses don't count
  try {
    if (!audioCtx) audioCtx = new AudioContext();
    if (audioCtx.state === 'suspended') void audioCtx.resume();
  } catch {
    /* audio not supported - ignore */
  }
}

function playClick(): void {
  // stay silent until the user has clicked once (audio unlocked)
  if (!audioCtx || audioCtx.state !== 'running') return;
  const ctx = audioCtx;
  const t = ctx.currentTime;
  [880, 1320].forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const start = t + i * 0.07;
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.25, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.18);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start);
    osc.stop(start + 0.2);
  });
}

// ---------------------------------------------------------------- drawing
function rect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawStar(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * 0.45;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    const px = x + Math.cos(a) * rad;
    const py = y + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
}

function drawItem(ctx: CanvasRenderingContext2D, kind: ItemKind, cx: number, cy: number, lifted: boolean): void {
  ctx.save();
  ctx.translate(cx, cy);
  if (lifted) {
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = 14;
    ctx.shadowOffsetY = 6;
  }
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(20,20,20,0.55)';

  if (kind === 'cereal') {
    ctx.fillStyle = '#f08a24';
    rect(ctx, -25, -36, 50, 72, 4);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#c96a0f';
    ctx.fillRect(-25, -36, 50, 8);
    ctx.fillStyle = '#fff3d6';
    ctx.beginPath();
    ctx.arc(0, 2, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f08a24';
    ctx.beginPath();
    ctx.arc(0, 4, 8, 0, Math.PI);
    ctx.fill();
  } else if (kind === 'juice') {
    ctx.fillStyle = '#3b82c4';
    ctx.beginPath();
    ctx.moveTo(-22, 36);
    ctx.lineTo(-22, -24);
    ctx.lineTo(-13, -36);
    ctx.lineTo(13, -36);
    ctx.lineTo(22, -24);
    ctx.lineTo(22, 36);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffb347';
    ctx.beginPath();
    ctx.arc(0, 8, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-4, -34, 8, 6);
  } else if (kind === 'soup') {
    ctx.fillStyle = '#d83a3a';
    rect(ctx, -23, -30, 46, 66, 5);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-23, -8, 46, 24);
    ctx.fillStyle = '#d83a3a';
    ctx.beginPath();
    ctx.arc(0, 4, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#c9ced3';
    ctx.beginPath();
    ctx.ellipse(0, -30, 23, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else {
    ctx.fillStyle = '#f0b429';
    rect(ctx, -24, -20, 48, 56, 12);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#8b5a2b';
    rect(ctx, -20, -34, 40, 15, 4);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#fff3d6';
    rect(ctx, -15, -2, 30, 22, 3);
    ctx.fill();
    ctx.fillStyle = '#f0b429';
    ctx.beginPath();
    ctx.arc(0, 9, 5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawShelf(ctx: CanvasRenderingContext2D, y: number, label: string, thick: number): void {
  ctx.fillStyle = '#b88a4a';
  ctx.fillRect(28, y, W - 56, thick);
  ctx.fillStyle = '#8f6a33';
  ctx.fillRect(28, y + thick - 4, W - 56, 4);
  // brackets
  ctx.fillStyle = '#8f6a33';
  [60, W - 60].forEach((bx) => {
    ctx.beginPath();
    ctx.moveTo(bx - 10, y + thick);
    ctx.lineTo(bx + 10, y + thick);
    ctx.lineTo(bx, y + thick + 18);
    ctx.closePath();
    ctx.fill();
  });
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = '600 13px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(label, 34, y + thick + 16);
}

function drawScene(ctx: CanvasRenderingContext2D, g: GameState): void {
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(8, 28, 26, 0.38)';
  ctx.fillRect(0, 0, W, H);

  drawShelf(ctx, SHELF_Y.top, 'High shelf', 12);
  drawShelf(ctx, SHELF_Y.middle, 'Middle shelf', 12);
  drawShelf(ctx, SHELF_Y.counter, 'Counter', 20);

  // dashed target slot (only while carrying an item)
  if (g.heldId !== null) {
    const t = getTarget(g.placed);
    ctx.save();
    ctx.setLineDash([8, 6]);
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#3ddc84';
    ctx.fillStyle = 'rgba(61, 220, 132, 0.16)';
    rect(ctx, t.x - (ITEM_W + 12) / 2, t.y - (ITEM_H + 12) / 2, ITEM_W + 12, ITEM_H + 12, 8);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // items (held item last so it is on top)
  for (const it of g.items) {
    if (it.state !== 'held') drawItem(ctx, it.kind, it.x, it.y, false);
  }
  for (const it of g.items) {
    if (it.state === 'held') drawItem(ctx, it.kind, it.x, it.y, true);
  }

  // wrist cursors
  const cursors: Array<['left' | 'right', string]> = [
    ['left', '#5ad1ff'],
    ['right', '#ffd166'],
  ];
  for (const [side, color] of cursors) {
    const w = g.wrists[side];
    if (!w) continue;
    ctx.beginPath();
    ctx.arc(w.x, w.y, 13, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.85;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
  }

  // stars
  ctx.fillStyle = '#ffd34d';
  for (const s of g.stars) {
    ctx.globalAlpha = Math.max(Math.min(s.life * 1.5, 1), 0);
    drawStar(ctx, s.x, s.y, s.size);
  }
  ctx.globalAlpha = 1;

  if (g.phase === 'waiting') {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    rect(ctx, W / 2 - 230, H / 2 - 34, 460, 68, 12);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = '600 17px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Step back until your head, shoulders and hips are in view', W / 2, H / 2 + 6);
  }
}

// -------------------------------------------------------------- component
export default function ShelfReachModule() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null); // tracker skeleton overlay
  const gameCanvasRef = useRef<HTMLCanvasElement>(null); // shelves, items, cursors
  const gameRef = useRef<GameState>(createGame());
  const savedRef = useRef(false);

  const [telemetry, setTelemetry] = useState<Telemetry>(() => buildTelemetry(gameRef.current));
  const [phase, setPhase] = useState<GamePhase>('waiting');
  const [result, setResult] = useState<SessionResult | null>(null);

  const camera = useCamera(videoRef);
  useTracker({
    kind: 'pose',
    videoRef,
    canvasRef,
    enabled: camera.status === 'active',
    onFrame: (frame) => {
      const lm = extractPose((frame as unknown as { pose?: unknown }).pose);
      const snapped = processPose(gameRef.current, lm, performance.now());
      if (snapped) playClick();
    },
  });

  useEffect(() => {
    if (camera.status === 'idle') camera.start();
  }, [camera]);

  // unlock audio on the first user gesture (browser autoplay policy)
  useEffect(() => {
    const events = ['pointerdown', 'click', 'touchend'] as const;
    events.forEach((e) => window.addEventListener(e, unlockAudio));
    return () => events.forEach((e) => window.removeEventListener(e, unlockAudio));
  }, []);

  // render loop
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const canvas = gameCanvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (ctx) {
        stepStars(gameRef.current, Math.min((now - last) / 1000, 0.1));
        drawScene(ctx, gameRef.current);
      }
      last = now;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  // telemetry + completion check (10 Hz keeps React cheap)
  useEffect(() => {
    const id = window.setInterval(() => {
      const g = gameRef.current;
      setTelemetry(buildTelemetry(g));
      setPhase(g.phase);
      if (g.phase === 'complete' && !savedRef.current) {
        savedRef.current = true;
        const r = buildResult(g);
        saveResult(r);
        setResult(r);
      }
    }, 100);
    return () => window.clearInterval(id);
  }, []);

  // save partial progress if the user leaves mid-session
  useEffect(() => {
    return () => {
      const g = gameRef.current;
      if (!savedRef.current && g.placed > 0) saveResult(buildResult(g));
    };
  }, []);

  const restart = () => {
    gameRef.current = createGame();
    savedRef.current = false;
    setResult(null);
    setPhase('waiting');
    setTelemetry(buildTelemetry(gameRef.current));
  };

  const progress = Math.round((telemetry.itemsPlaced / telemetry.itemsTotal) * 100);

  return (
    <div className="sr-layout">
      <section className="sr-stage">
        <div className="sr-frame">
          <video ref={videoRef} className="sr-video" playsInline muted autoPlay />
          <canvas ref={canvasRef} className="sr-tracker" />
          <canvas ref={gameCanvasRef} className="sr-game" width={W} height={H} />

     {camera.status !== 'active' && (
  <div className="sr-overlay">
    {camera.status === 'error' ? (
      <>
        {/* <p>
          Camera problem: {camera.error?.code ?? 'unknown'}
        </p> */}
        <p style={{ fontSize: 14, maxWidth: 360 }}>
          {camera.error?.code === 'insecure-context'
            ? 'Open this page at http://localhost:5173 (not the 192.168... address).'
            : 'Close other apps or tabs using the webcam, allow camera access in the address bar, then try again.'}
        </p>
        <button type="button" className="sr-button" onClick={() => camera.start()}>
         Start again
        </button>
      </>
    ) : (
      <>
        <p>Starting camera. Allow access if your browser asks.</p>
        {/* <p style={{ fontSize: 13 }}>status: {String(camera.status)}</p> */}
      </>
    )}
  </div>
)}

          {phase === 'complete' && result && (
            <div className="sr-overlay sr-done">
              <h2>Pantry organized</h2>
              <p>
                Highest reach {result.maxReachPct}% above shoulder, arm balance {result.symmetryPct}%,
                finished in {result.durationSec}s.
              </p>
              <button type="button" className="sr-button" onClick={restart}>
                Play again
              </button>
            </div>
          )}
        </div>
        <p className="sr-hint">
          Hold a hand over an item on the counter to pick it up, then lift it into the dashed green slot.
        </p>
      </section>

      <aside className="sr-panel" aria-label="Session telemetry">
        <h2 className="sr-panel-title">Session</h2>

        <div className="sr-stat sr-stat-main">
          <span className="sr-stat-label">Max vertical reach</span>
          <span className="sr-stat-value">{telemetry.maxReachPct}%</span>
          <span className="sr-stat-sub">above shoulder line (now {telemetry.currentReachPct}%)</span>
        </div>

        <div className="sr-stat">
          <span className="sr-stat-label">Bilateral symmetry</span>
          <span className="sr-stat-value">{telemetry.symmetryPct}%</span>
        </div>

        <div className="sr-stat">
          <span className="sr-stat-label">Items arranged</span>
          <span className="sr-stat-value">
            {telemetry.itemsPlaced} / {telemetry.itemsTotal}
          </span>
          <div className="sr-bar" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
            <div className="sr-bar-fill" style={{ width: `${progress}%` }} />
          </div>
        </div>

        <div className="sr-stat">
          <span className="sr-stat-label">Reach speed</span>
          <span className="sr-stat-value">{telemetry.reachSpeed.toFixed(1)} m/s</span>
        </div>

        <button type="button" className="sr-button sr-button-quiet" onClick={restart}>
          Restart session
        </button>
      </aside>
    </div>
  );
}