import { useRef, useState, useEffect, useCallback } from 'react';
import {
  Sparkles,
  RotateCcw,
  Volume2,
  VolumeX,
  CheckCircle2,
  Trophy,
  Flame,
  Timer,
  Layers,
  Save,
  Hand,
} from 'lucide-react';
import { useCamera } from '@/hooks/useCamera';
import { useTracker } from '@/hooks/useTracker';
import {
  CameraBusy,
  CameraErrorOverlay,
  CameraPermissionPrompt,
} from '@/components/camera/CameraOverlays';
import { describeCameraError } from '@/services/camera/errorMessages';
import { describeTrackerError } from '@/services/tracking/errorMessages';
import {
  ReachGraspTracker,
  createEmeraldBurst,
  createFloatingScore,
  loadResultsFromStorage,
  saveResultsToStorage,
  OPEN_THRESHOLD,
  CLOSED_THRESHOLD,
} from './analytics';
import type {
  HandPreference,
  Particle,
  FloatingText,
  ReachGraspTelemetry,
  StoredSessionData,
  TargetObject,
  BasketZone,
} from './types';
import './reachGrasp.css';

export default function ReachGraspModule() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const trackerInstanceRef = useRef<ReachGraspTracker>(new ReachGraspTracker());
  const particlesRef = useRef<Particle[]>([]);
  const floatingTextsRef = useRef<FloatingText[]>([]);
  const lastUiUpdateRef = useRef<number>(0);

  const [handPreference, setHandPreference] = useState<HandPreference>('auto');
  const handPreferenceRef = useRef<HandPreference>('auto');
  useEffect(() => {
    handPreferenceRef.current = handPreference;
  }, [handPreference]);

  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  useEffect(() => {
    trackerInstanceRef.current.soundEnabled = soundEnabled;
  }, [soundEnabled]);

  const [savedSession, setSavedSession] = useState<StoredSessionData | null>(() =>
    loadResultsFromStorage()
  );
  const [showSavedToast, setShowSavedToast] = useState<boolean>(false);

  const [telemetry, setTelemetry] = useState<ReachGraspTelemetry>({
    cyclesCompleted: 0,
    totalAttempts: 0,
    gripSuccessRate: 100,
    currentROM: 0,
    peakROMInCycle: 0,
    currentGraspTime: 0,
    avgGraspTime: 0,
    totalScore: 0,
    streak: 0,
    currentPhase: 'idle',
    handState: 'partial',
    avgFingertipDist: 0,
    feedbackMessage: 'Position your hand in front of the camera to begin.',
    reps: [],
    activeHand: 'None',
  });

  const camera = useCamera(videoRef);

  // Auto-start camera if idle
  useEffect(() => {
    if (camera.status === 'idle') {
      void camera.start();
    }
  }, [camera]);

  const handleResetSession = useCallback(() => {
    trackerInstanceRef.current.reset();
    particlesRef.current = [];
    floatingTextsRef.current = [];
    setTelemetry({
      cyclesCompleted: 0,
      totalAttempts: 0,
      gripSuccessRate: 100,
      currentROM: 0,
      peakROMInCycle: 0,
      currentGraspTime: 0,
      avgGraspTime: 0,
      totalScore: 0,
      streak: 0,
      currentPhase: 'idle',
      handState: 'partial',
      avgFingertipDist: 0,
      feedbackMessage: 'Session reset. Position hand to start new set!',
      reps: [],
      activeHand: 'None',
    });
  }, []);

  const handleManualSave = useCallback(() => {
    const data: StoredSessionData = {
      lastSessionDate: new Date().toISOString(),
      cyclesCompleted: telemetry.cyclesCompleted,
      gripSuccessRate: telemetry.gripSuccessRate,
      avgGraspTime: telemetry.avgGraspTime,
      peakROM: telemetry.peakROMInCycle,
      totalScore: telemetry.totalScore,
      repsCount: telemetry.reps.length,
    };
    saveResultsToStorage(data);
    setSavedSession(data);
    setShowSavedToast(true);
    setTimeout(() => setShowSavedToast(false), 3000);
  }, [telemetry]);

  // Main tracking hook
  const tracker = useTracker({
    kind: 'hands',
    videoRef,
    canvasRef,
    enabled: camera.status === 'active',
    onFrame: (frame) => {
      const now = performance.now();
      const canvas = canvasRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Select active hand based on user preference
      let activeHand = frame.hands?.[0];
      if (frame.hands && frame.hands.length > 1) {
        if (handPreferenceRef.current === 'Left') {
          activeHand = frame.hands.find((h) => h.handedness === 'Left') ?? frame.hands[0];
        } else if (handPreferenceRef.current === 'Right') {
          activeHand = frame.hands.find((h) => h.handedness === 'Right') ?? frame.hands[0];
        }
      }

      // Update state machine
      const updated = trackerInstanceRef.current.update(
        activeHand,
        now,
        (burstX, burstY) => {
          particlesRef.current.push(...createEmeraldBurst(burstX, burstY));
          floatingTextsRef.current.push(createFloatingScore(burstX, burstY, 100));
        }
      );

      // Throttle React state updates to ~10 Hz (or on phase changes) to maintain 60fps canvas performance
      if (now - lastUiUpdateRef.current >= 100 || updated.currentPhase !== telemetry.currentPhase) {
        lastUiUpdateRef.current = now;
        setTelemetry(updated);
      }

      // Draw custom gamified layers on canvas
      const width = canvas.width;
      const height = canvas.height;
      const currentTarget = trackerInstanceRef.current.target;
      const currentBasket = trackerInstanceRef.current.basket;

      drawGameLayers(
        ctx,
        width,
        height,
        currentTarget,
        currentBasket,
        updated,
        particlesRef.current,
        floatingTextsRef.current,
        activeHand?.landmarks
      );

      // Clean up dead particles
      particlesRef.current = particlesRef.current.filter((p) => p.life < p.maxLife);
      floatingTextsRef.current = floatingTextsRef.current.filter((ft) => ft.life < ft.maxLife);
    },
  });

  // Calculate ROM fill percentage for gauge
  const romPercent = Math.min(100, Math.max(0, telemetry.currentROM));

  return (
    <div className="reach-grasp-container">
      {/* Header bar */}
      <div className="reach-grasp-header">
        <div className="reach-grasp-title-group">
          <h2>
            <Hand className="w-5 h-5 text-sky-600" />
            Open Hand Reach &amp; Grasp (Gross Motor)
          </h2>
          <p>
            Relearn finger extension, gross grip acquisition, and pick-and-place object transport
          </p>
        </div>

        <div className="reach-grasp-controls">
          {/* Hand selector */}
          <div className="reach-grasp-hand-selector">
            <button
              type="button"
              className={`reach-grasp-hand-btn ${handPreference === 'auto' ? 'active' : ''}`}
              onClick={() => setHandPreference('auto')}
            >
              Auto Hand
            </button>
            <button
              type="button"
              className={`reach-grasp-hand-btn ${handPreference === 'Left' ? 'active' : ''}`}
              onClick={() => setHandPreference('Left')}
            >
              Left Hand
            </button>
            <button
              type="button"
              className={`reach-grasp-hand-btn ${handPreference === 'Right' ? 'active' : ''}`}
              onClick={() => setHandPreference('Right')}
            >
              Right Hand
            </button>
          </div>

          {/* Sound toggle */}
          <button
            type="button"
            className="reach-grasp-action-btn"
            onClick={() => setSoundEnabled((prev) => !prev)}
            title={soundEnabled ? 'Mute Sound FX' : 'Enable Sound FX'}
          >
            {soundEnabled ? <Volume2 className="w-3.5 h-3.5 text-emerald-600" /> : <VolumeX className="w-3.5 h-3.5 text-slate-400" />}
            <span>{soundEnabled ? 'Audio ON' : 'Audio OFF'}</span>
          </button>

          {/* Reset button */}
          <button
            type="button"
            className="reach-grasp-action-btn"
            onClick={handleResetSession}
            title="Reset current session"
          >
            <RotateCcw className="w-3.5 h-3.5 text-slate-600" />
            <span>Reset</span>
          </button>

          {/* Manual Save button */}
          <button
            type="button"
            className="reach-grasp-action-btn primary"
            onClick={handleManualSave}
            title="Persist results to storage"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Save Set</span>
          </button>
        </div>
      </div>

      {/* Main Layout Grid */}
      <div className="reach-grasp-layout">
        {/* Left: Viewport and Canvas Overlay */}
        <div className="reach-grasp-viewport">
          <video
            ref={videoRef}
            className="reach-grasp-video"
            playsInline
            muted
            autoPlay
          />
          <canvas ref={canvasRef} className="reach-grasp-canvas" />

          {/* Camera Status Overlays */}
          {camera.status === 'idle' && (
            <CameraPermissionPrompt onEnable={() => void camera.start()} />
          )}
          {camera.status === 'starting' && <CameraBusy label="Initializing camera feed..." />}
          {camera.status === 'error' && camera.error && (
            <CameraErrorOverlay
              guidance={describeCameraError(camera.error)}
              onRetry={() => void camera.start()}
            />
          )}
          {tracker.status === 'error' && tracker.error && (
            <CameraErrorOverlay
              guidance={describeTrackerError(tracker.error)}
              onRetry={tracker.retry}
            />
          )}

          {/* Active Hand Badge */}
          <div className="reach-grasp-overlay-badge">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                telemetry.activeHand !== 'None'
                  ? 'bg-emerald-400 animate-pulse'
                  : 'bg-amber-400'
              }`}
            />
            <span>
              {telemetry.activeHand !== 'None'
                ? `TRACKING: ${telemetry.activeHand.toUpperCase()} HAND`
                : 'WAITING FOR HAND'}
            </span>
            <span className="text-sky-300 font-bold ml-1">
              D̄: {telemetry.avgFingertipDist}
            </span>
          </div>

          {/* Live Score & Streak Badge */}
          <div className="reach-grasp-score-badge">
            <Trophy className="w-4 h-4 text-amber-400" />
            <span>{telemetry.totalScore} PTS</span>
            {telemetry.streak > 1 && (
              <span className="flex items-center text-xs text-orange-400 ml-1 font-bold">
                <Flame className="w-3.5 h-3.5 fill-orange-400" />
                {telemetry.streak}x
              </span>
            )}
          </div>

          {/* Live Coaching & Guidance Banner */}
          <div className="reach-grasp-feedback-banner">
            <Sparkles className="w-4 h-4 text-sky-400 flex-shrink-0 animate-spin" />
            <span>{telemetry.feedbackMessage}</span>
          </div>
        </div>

        {/* Right: Telemetry Dashboard */}
        <div className="reach-grasp-telemetry">
          {/* Key Stats Cards Grid */}
          <div className="reach-grasp-stats-grid">
            {/* Grasp & Release Cycles */}
            <div className="reach-grasp-stat-card">
              <span className="reach-grasp-stat-label">Grasp &amp; Release Cycles</span>
              <div className="reach-grasp-stat-value">
                {telemetry.cyclesCompleted}
                <span className="reach-grasp-stat-unit">reps</span>
              </div>
              <div className="reach-grasp-stat-sub">
                Target: 10 reps
              </div>
            </div>

            {/* Hand Opening ROM */}
            <div className="reach-grasp-stat-card">
              <span className="reach-grasp-stat-label">Hand Opening ROM</span>
              <div className="reach-grasp-stat-value">
                {telemetry.currentROM}
                <span className="reach-grasp-stat-unit">%</span>
              </div>
              <div className="reach-grasp-stat-sub">
                Peak: {telemetry.peakROMInCycle}%
              </div>
            </div>

            {/* Time to Grasp */}
            <div className="reach-grasp-stat-card">
              <span className="reach-grasp-stat-label flex items-center gap-1">
                <Timer className="w-3 h-3 text-slate-400" />
                Time to Grasp
              </span>
              <div className="reach-grasp-stat-value">
                {telemetry.currentPhase === 'transporting' || telemetry.currentPhase === 'success'
                  ? `${telemetry.currentGraspTime}s`
                  : telemetry.avgGraspTime > 0
                  ? `${telemetry.avgGraspTime}s`
                  : '--'}
                <span className="reach-grasp-stat-unit">sec</span>
              </div>
              <div className="reach-grasp-stat-sub neutral">
                Avg: {telemetry.avgGraspTime > 0 ? `${telemetry.avgGraspTime}s` : 'N/A'}
              </div>
            </div>

            {/* Grip Success Rate */}
            <div className="reach-grasp-stat-card">
              <span className="reach-grasp-stat-label">Grip Success Rate</span>
              <div className="reach-grasp-stat-value">
                {telemetry.gripSuccessRate}
                <span className="reach-grasp-stat-unit">%</span>
              </div>
              <div className="reach-grasp-stat-sub">
                {telemetry.totalAttempts} total attempts
              </div>
            </div>
          </div>

          {/* Live Hand Opening Gauge Card */}
          <div className="reach-grasp-gauge-card">
            <div className="reach-grasp-gauge-header">
              <h3>Live Finger Extension ROM</h3>
              <span className="reach-grasp-gauge-badge">
                State: {telemetry.handState.toUpperCase()}
              </span>
            </div>

            <div className="reach-grasp-gauge-track">
              <div
                className="reach-grasp-gauge-fill"
                style={{ width: `${romPercent}%` }}
              />
            </div>

            <div className="reach-grasp-gauge-markers">
              <span>Closed Fist (&lt; {CLOSED_THRESHOLD.toFixed(2)})</span>
              <span className="font-semibold text-sky-600">
                D̄: {telemetry.avgFingertipDist} ({romPercent}%)
              </span>
              <span>Open Hand (≥ {OPEN_THRESHOLD.toFixed(2)})</span>
            </div>
          </div>

          {/* Gameplay Phase Flow Indicator */}
          <div className="reach-grasp-phase-flow">
            <h3>Therapy Task Progression</h3>
            <div className="reach-grasp-phase-steps">
              <div
                className={`reach-grasp-phase-step ${
                  telemetry.currentPhase === 'reaching' ? 'active' : ''
                } ${
                  telemetry.currentPhase === 'grabbing' ||
                  telemetry.currentPhase === 'transporting' ||
                  telemetry.currentPhase === 'success'
                    ? 'completed'
                    : ''
                }`}
              >
                1. Open &amp; Reach
              </div>

              <div
                className={`reach-grasp-phase-step ${
                  telemetry.currentPhase === 'grabbing' ? 'active' : ''
                } ${
                  telemetry.currentPhase === 'transporting' ||
                  telemetry.currentPhase === 'success'
                    ? 'completed'
                    : ''
                }`}
              >
                2. Close Grip
              </div>

              <div
                className={`reach-grasp-phase-step ${
                  telemetry.currentPhase === 'transporting' ? 'active' : ''
                } ${telemetry.currentPhase === 'success' ? 'completed' : ''}`}
              >
                3. Basket Drop
              </div>
            </div>
          </div>

          {/* Session Repetitions Telemetry Log */}
          <div className="reach-grasp-log-card">
            <div className="reach-grasp-log-header">
              <h3>Session Telemetry Log</h3>
              <span className="text-xs text-slate-500 font-medium">
                {telemetry.reps.length} tracked reps
              </span>
            </div>

            <div className="reach-grasp-log-list">
              {telemetry.reps.length === 0 ? (
                <div className="text-xs text-slate-400 py-4 text-center">
                  No completed reps yet. Extend hand and grab the floating target!
                </div>
              ) : (
                telemetry.reps.map((rep) => (
                  <div key={rep.id} className="reach-grasp-log-item success">
                    <div className="reach-grasp-log-item-details">
                      <div className="reach-grasp-log-item-title">
                        Cycle #{rep.id} · {rep.objectType.toUpperCase()}
                      </div>
                      <div className="reach-grasp-log-item-meta">
                        Grasp: {rep.graspTimeSeconds}s | Peak ROM: {rep.peakOpenROM}%
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Stored Results Footer Card */}
          <div className="reach-grasp-stored-card">
            <div className="flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-slate-500" />
              <span>
                {showSavedToast
                  ? 'Data successfully saved to localStorage!'
                  : savedSession
                  ? `Last session: ${savedSession.cyclesCompleted} reps (${savedSession.gripSuccessRate}% success)`
                  : 'Ready to record clinical session data'}
              </span>
            </div>
            {savedSession && (
              <span className="font-semibold text-sky-600">
                Score: {savedSession.totalScore}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ========================================================================== */
/* Custom Canvas Game Renderer                                                */
/* ========================================================================== */

function drawGameLayers(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  target: TargetObject,
  basket: BasketZone,
  telemetry: ReachGraspTelemetry,
  particles: Particle[],
  floatingTexts: FloatingText[],
  landmarks?: { x: number; y: number }[]
): void {
  // 1. Draw Target Basket Zone
  const bx = basket.x * width;
  const by = basket.y * height;
  const bw = basket.width * width;
  const bh = basket.height * height;

  ctx.save();
  // Container glow
  ctx.shadowColor = 'rgba(16, 185, 129, 0.4)';
  ctx.shadowBlur = 16;

  // Basket background
  const basketGrad = ctx.createLinearGradient(bx - bw / 2, by - bh / 2, bx + bw / 2, by + bh / 2);
  basketGrad.addColorStop(0, 'rgba(6, 78, 59, 0.65)');
  basketGrad.addColorStop(1, 'rgba(15, 23, 42, 0.85)');
  ctx.fillStyle = basketGrad;

  // Rounded container
  ctx.beginPath();
  ctx.roundRect?.(bx - bw / 2, by - bh / 2, bw, bh, 16);
  ctx.fill();

  // Dashed glowing border
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#34d399';
  ctx.setLineDash([8, 6]);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  // Basket Label text (flipped horizontally to display correctly in mirrored canvas)
  ctx.save();
  ctx.translate(bx, by);
  ctx.scale(-1, 1);
  ctx.font = 'bold 14px Inter, sans-serif';
  ctx.fillStyle = '#34d399';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('TARGET BASKET', 0, -8);
  ctx.font = '500 11px Inter, sans-serif';
  ctx.fillStyle = '#94a3b8';
  ctx.fillText('Open hand here to drop', 0, 12);
  ctx.restore();

  // 2. Draw Floating Target Object
  const tx = target.x * width;
  const ty = target.y * height;
  const tr = target.radius * Math.min(width, height);

  ctx.save();
  // Hover & grab effects
  if (telemetry.currentPhase === 'grabbing') {
    // Pulsating target reticle
    ctx.beginPath();
    ctx.arc(tx, ty, tr * 1.55, 0, Math.PI * 2);
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#f59e0b';
    ctx.stroke();
  } else if (telemetry.currentPhase === 'transporting') {
    // Glowing energy lock tether
    ctx.shadowColor = target.glowColor;
    ctx.shadowBlur = 24;
    ctx.beginPath();
    ctx.arc(tx, ty, tr * 1.35, 0, Math.PI * 2);
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#38bdf8';
    ctx.stroke();

    // Electric energy arcs connecting to fingertips
    if (landmarks) {
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.6)';
      const tipIndices = [4, 8, 12, 16, 20];
      for (const idx of tipIndices) {
        const pt = landmarks[idx];
        if (pt) {
          ctx.beginPath();
          ctx.moveTo(tx, ty);
          ctx.lineTo(pt.x * width, pt.y * height);
          ctx.stroke();
        }
      }
    }
  }

  // Draw object based on type
  drawTargetItem(ctx, tx, ty, tr, target);
  ctx.restore();

  // 3. Draw Hand Cursor / Palm Reticle
  if (landmarks && landmarks[0]) {
    const palmX =
      (landmarks[0].x +
        landmarks[5].x +
        landmarks[9].x +
        landmarks[13].x +
        landmarks[17].x) /
      5 *
      width;
    const palmY =
      (landmarks[0].y +
        landmarks[5].y +
        landmarks[9].y +
        landmarks[13].y +
        landmarks[17].y) /
      5 *
      height;

    ctx.save();
    let cursorColor = '#38bdf8';
    if (telemetry.handState === 'open') {
      cursorColor = '#10b981';
    } else if (telemetry.handState === 'closed') {
      cursorColor = '#818cf8';
    } else {
      cursorColor = '#f59e0b';
    }

    // Outer cursor reticle
    ctx.beginPath();
    ctx.arc(palmX, palmY, 14, 0, Math.PI * 2);
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = cursorColor;
    ctx.stroke();

    // Inner reticle dot
    ctx.beginPath();
    ctx.arc(palmX, palmY, 4, 0, Math.PI * 2);
    ctx.fillStyle = cursorColor;
    ctx.fill();

    ctx.restore();
  }

  // 4. Draw Particles (Emerald Burst)
  for (const p of particles) {
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.0003; // subtle gravity
    p.life += 1;
    p.alpha = Math.max(0, 1 - p.life / p.maxLife);

    ctx.save();
    ctx.beginPath();
    ctx.arc(p.x * width, p.y * height, p.size, 0, Math.PI * 2);
    ctx.fillStyle = p.color;
    ctx.globalAlpha = p.alpha;
    ctx.shadowColor = p.color;
    ctx.shadowBlur = 8;
    ctx.fill();
    ctx.restore();
  }

  // 5. Draw Floating Scores (`+100 PTS`)
  for (const ft of floatingTexts) {
    ft.y -= 0.0015;
    ft.life += 1;
    ft.alpha = Math.max(0, 1 - ft.life / ft.maxLife);

    ctx.save();
    ctx.translate(ft.x * width, ft.y * height);
    ctx.scale(-1, 1); // Flip text to display right-side on mirrored canvas
    ctx.font = 'bold 20px Inter, sans-serif';
    ctx.fillStyle = ft.color;
    ctx.globalAlpha = ft.alpha;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
    ctx.shadowBlur = 6;
    ctx.textAlign = 'center';
    ctx.fillText(ft.text, 0, 0);
    ctx.restore();
  }
}

/** Draws custom virtual object shapes (apple, star, gem, ball, block) */
function drawTargetItem(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  target: TargetObject
): void {
  ctx.shadowColor = target.glowColor;
  ctx.shadowBlur = 14;

  if (target.type === 'star') {
    // 5-pointed star
    const spikes = 5;
    const outerRadius = radius;
    const innerRadius = radius * 0.45;
    let rot = (Math.PI / 2) * 3;
    const step = Math.PI / spikes;

    ctx.beginPath();
    ctx.moveTo(x, y - outerRadius);
    for (let i = 0; i < spikes; i++) {
      ctx.lineTo(x + Math.cos(rot) * outerRadius, y + Math.sin(rot) * outerRadius);
      rot += step;
      ctx.lineTo(x + Math.cos(rot) * innerRadius, y + Math.sin(rot) * innerRadius);
      rot += step;
    }
    ctx.closePath();
    ctx.fillStyle = '#fbbf24';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#d97706';
    ctx.stroke();
  } else if (target.type === 'gem') {
    // Diamond / gem hexagon
    ctx.beginPath();
    const sides = 6;
    for (let i = 0; i < sides; i++) {
      const angle = (i * 2 * Math.PI) / sides;
      const gx = x + radius * Math.cos(angle);
      const gy = y + radius * Math.sin(angle);
      if (i === 0) ctx.moveTo(gx, gy);
      else ctx.lineTo(gx, gy);
    }
    ctx.closePath();
    ctx.fillStyle = '#06b6d4';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
  } else if (target.type === 'apple') {
    // Red apple sphere with stem
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = '#ef4444';
    ctx.fill();

    // Stem
    ctx.beginPath();
    ctx.moveTo(x, y - radius);
    ctx.quadraticCurveTo(x + 4, y - radius - 8, x + 8, y - radius - 10);
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#15803d';
    ctx.stroke();
  } else if (target.type === 'block') {
    // Rounded block / cube
    ctx.beginPath();
    ctx.roundRect?.(x - radius, y - radius, radius * 2, radius * 2, 8);
    ctx.fillStyle = '#10b981';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#059669';
    ctx.stroke();
  } else {
    // Shaded 3D sphere
    const sphereGrad = ctx.createRadialGradient(
      x - radius * 0.3,
      y - radius * 0.3,
      radius * 0.1,
      x,
      y,
      radius
    );
    sphereGrad.addColorStop(0, '#93c5fd');
    sphereGrad.addColorStop(0.7, '#2563eb');
    sphereGrad.addColorStop(1, '#1e3a8a');

    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = sphereGrad;
    ctx.fill();
  }
}
