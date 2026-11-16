import { useRef, useState, useEffect, useCallback } from 'react';
import {
  RotateCcw,
  Volume2,
  VolumeX,
  CheckCircle2,
  Trophy,
  Layers,
  Save,
  Sparkles,
  Compass,
  Coins,
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
  NeckHorizontalTracker,
  createCoinBurst,
  createFloatingScore,
  loadResultsFromStorage,
  saveResultsToStorage,
  TARGET_COINS_GOAL,
} from './analytics';
import type {
  SteeringSensitivity,
  NeckParticle,
  FloatingText,
  NeckHorizontalTelemetry,
  StoredNeckData,
  DroneState,
  TargetCoin,
} from './types';
import './neckHorizontal.css';

export default function NeckHorizontalModule() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const trackerInstanceRef = useRef<NeckHorizontalTracker>(new NeckHorizontalTracker());
  const particlesRef = useRef<NeckParticle[]>([]);
  const floatingTextsRef = useRef<FloatingText[]>([]);
  const lastUiUpdateRef = useRef<number>(0);

  const [sensitivity, setSensitivity] = useState<SteeringSensitivity>('normal');
  useEffect(() => {
    trackerInstanceRef.current.sensitivity = sensitivity;
  }, [sensitivity]);

  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  useEffect(() => {
    trackerInstanceRef.current.soundEnabled = soundEnabled;
  }, [soundEnabled]);

  const [savedSession, setSavedSession] = useState<StoredNeckData | null>(() =>
    loadResultsFromStorage()
  );
  const [showSavedToast, setShowSavedToast] = useState<boolean>(false);

  const [telemetry, setTelemetry] = useState<NeckHorizontalTelemetry>({
    currentYawRatio: 0.5,
    currentAngleDegrees: 0,
    currentTurnDirection: 'center',
    peakLeftAngle: 0,
    peakRightAngle: 0,
    symmetryBalance: 100,
    coinsCollected: 0,
    targetCoinsGoal: TARGET_COINS_GOAL,
    totalScore: 0,
    streak: 0,
    droneX: 0.5,
    targetSide: 'left',
    feedbackMessage: 'Position your head and shoulders clearly in frame to begin.',
    reps: [],
    isTrackingValid: false,
  });

  const camera = useCamera(videoRef);

  // Auto-start camera
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
      currentYawRatio: 0.5,
      currentAngleDegrees: 0,
      currentTurnDirection: 'center',
      peakLeftAngle: 0,
      peakRightAngle: 0,
      symmetryBalance: 100,
      coinsCollected: 0,
      targetCoinsGoal: TARGET_COINS_GOAL,
      totalScore: 0,
      streak: 0,
      droneX: 0.5,
      targetSide: 'left',
      feedbackMessage: 'Session reset. Turn head to steer drone toward target coin!',
      reps: [],
      isTrackingValid: false,
    });
  }, []);

  const handleManualSave = useCallback(() => {
    const data: StoredNeckData = {
      lastSessionDate: new Date().toISOString(),
      coinsCollected: telemetry.coinsCollected,
      peakLeftRotation: telemetry.peakLeftAngle,
      peakRightRotation: telemetry.peakRightAngle,
      symmetryBalance: telemetry.symmetryBalance,
      totalScore: telemetry.totalScore,
      repsCount: telemetry.reps.length,
    };
    saveResultsToStorage(data);
    setSavedSession(data);
    setShowSavedToast(true);
    setTimeout(() => setShowSavedToast(false), 3000);
  }, [telemetry]);

  // MediaPipe Pose tracker
  const tracker = useTracker({
    kind: 'pose',
    videoRef,
    canvasRef,
    enabled: camera.status === 'active',
    onFrame: (frame) => {
      const now = performance.now();
      const canvas = canvasRef.current;
      if (!canvas) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const landmarks = frame.pose;

      // Update state machine
      const updated = trackerInstanceRef.current.update(
        landmarks,
        now,
        (coinX, coinY) => {
          particlesRef.current.push(...createCoinBurst(coinX, coinY));
          floatingTextsRef.current.push(createFloatingScore(coinX, coinY, 50));
        }
      );

      // Throttle React state updates to maintain 60fps canvas smoothness
      if (
        now - lastUiUpdateRef.current >= 90 ||
        updated.coinsCollected !== telemetry.coinsCollected ||
        updated.currentTurnDirection !== telemetry.currentTurnDirection
      ) {
        lastUiUpdateRef.current = now;
        setTelemetry(updated);
      }

      // Draw custom drone & lane graphics
      const width = canvas.width;
      const height = canvas.height;
      const drone = trackerInstanceRef.current.drone;
      const coin = trackerInstanceRef.current.currentCoin;

      drawDroneLayers(
        ctx,
        width,
        height,
        drone,
        coin,
        particlesRef.current,
        floatingTextsRef.current
      );

      // Clean up dead particles
      particlesRef.current = particlesRef.current.filter((p) => p.life < p.maxLife);
      floatingTextsRef.current = floatingTextsRef.current.filter((ft) => ft.life < ft.maxLife);
    },
  });

  // Gauge fill calculations (0 to 50% left, 0 to 50% right)
  const leftFillPercent =
    telemetry.currentTurnDirection === 'left'
      ? Math.min(50, Math.round((telemetry.currentAngleDegrees / 70) * 50))
      : 0;
  const rightFillPercent =
    telemetry.currentTurnDirection === 'right'
      ? Math.min(50, Math.round((telemetry.currentAngleDegrees / 70) * 50))
      : 0;

  return (
    <div className="neck-horizontal-container">
      {/* Header bar */}
      <div className="neck-horizontal-header">
        <div className="neck-horizontal-title-group">
          <h2>
            <Compass className="w-5 h-5 text-sky-600" />
            Neck Horizontal – Head-Steered Lateral Movement
          </h2>
          <p>
            Active cervical lateral rotation ($0^\circ \to 70^\circ$) with intuitive head-steered drone navigation
          </p>
        </div>

        <div className="neck-horizontal-controls">
          {/* Steering sensitivity selector */}
          <div className="neck-horizontal-sensitivity-selector">
            <button
              type="button"
              className={`neck-horizontal-sensitivity-btn ${sensitivity === 'low' ? 'active' : ''}`}
              onClick={() => setSensitivity('low')}
            >
              Low Sens
            </button>
            <button
              type="button"
              className={`neck-horizontal-sensitivity-btn ${sensitivity === 'normal' ? 'active' : ''}`}
              onClick={() => setSensitivity('normal')}
            >
              Normal Sens
            </button>
            <button
              type="button"
              className={`neck-horizontal-sensitivity-btn ${sensitivity === 'high' ? 'active' : ''}`}
              onClick={() => setSensitivity('high')}
            >
              High Sens
            </button>
          </div>

          {/* Sound toggle */}
          <button
            type="button"
            className="neck-horizontal-action-btn"
            onClick={() => setSoundEnabled((prev) => !prev)}
            title={soundEnabled ? 'Mute Audio' : 'Enable Audio'}
          >
            {soundEnabled ? (
              <Volume2 className="w-3.5 h-3.5 text-emerald-600" />
            ) : (
              <VolumeX className="w-3.5 h-3.5 text-slate-400" />
            )}
            <span>{soundEnabled ? 'Audio ON' : 'Audio OFF'}</span>
          </button>

          {/* Reset button */}
          <button
            type="button"
            className="neck-horizontal-action-btn"
            onClick={handleResetSession}
            title="Reset current session"
          >
            <RotateCcw className="w-3.5 h-3.5 text-slate-600" />
            <span>Reset</span>
          </button>

          {/* Manual Save button */}
          <button
            type="button"
            className="neck-horizontal-action-btn primary"
            onClick={handleManualSave}
            title="Persist results to storage"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Save Set</span>
          </button>
        </div>
      </div>

      {/* Main Layout Grid */}
      <div className="neck-horizontal-layout">
        {/* Left: Viewport & Canvas Overlay */}
        <div className="neck-horizontal-viewport">
          <video
            ref={videoRef}
            className="neck-horizontal-video"
            playsInline
            muted
            autoPlay
          />
          <canvas ref={canvasRef} className="neck-horizontal-canvas" />

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

          {/* Active Status Badge */}
          <div className="neck-horizontal-overlay-badge">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                telemetry.isTrackingValid ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
              }`}
            />
            <span>
              {telemetry.isTrackingValid
                ? `HEAD YAW: ${telemetry.currentAngleDegrees}° ${telemetry.currentTurnDirection.toUpperCase()}`
                : 'WAITING FOR HEAD'}
            </span>
            <span className="text-sky-300 font-bold ml-1">
              Drone X: {Math.round(telemetry.droneX * 100)}%
            </span>
          </div>

          {/* Score Badge */}
          <div className="neck-horizontal-score-badge">
            <Trophy className="w-4 h-4 text-amber-400" />
            <span>{telemetry.coinsCollected} Coins</span>
            <span className="text-xs text-emerald-400 ml-1 font-bold">
              ({telemetry.totalScore} PTS)
            </span>
          </div>

          {/* Live Coaching & Guidance Banner */}
          <div className="neck-horizontal-feedback-banner">
            <Sparkles className="w-4 h-4 text-sky-400 flex-shrink-0 animate-spin" />
            <span>{telemetry.feedbackMessage}</span>
          </div>
        </div>

        {/* Right: Telemetry Dashboard */}
        <div className="neck-horizontal-telemetry">
          {/* Key Stats Cards Grid */}
          <div className="neck-horizontal-stats-grid">
            {/* Left Cervical Rotation */}
            <div className="neck-horizontal-stat-card">
              <span className="neck-horizontal-stat-label">Left Cervical Rotation</span>
              <div className="neck-horizontal-stat-value">
                {telemetry.peakLeftAngle}
                <span className="neck-horizontal-stat-unit">° Left</span>
              </div>
              <div className="neck-horizontal-stat-sub">
                Target Goal: ≥ 55°
              </div>
            </div>

            {/* Right Cervical Rotation */}
            <div className="neck-horizontal-stat-card">
              <span className="neck-horizontal-stat-label">Right Cervical Rotation</span>
              <div className="neck-horizontal-stat-value">
                {telemetry.peakRightAngle}
                <span className="neck-horizontal-stat-unit">° Right</span>
              </div>
              <div className="neck-horizontal-stat-sub">
                Target Goal: ≥ 55°
              </div>
            </div>

            {/* Symmetry Balance */}
            <div className="neck-horizontal-stat-card">
              <span className="neck-horizontal-stat-label">Symmetry Balance</span>
              <div className="neck-horizontal-stat-value">
                {telemetry.symmetryBalance}
                <span className="neck-horizontal-stat-unit">%</span>
              </div>
              <div className="neck-horizontal-stat-sub">
                Bilateral Equality
              </div>
            </div>

            {/* Target Coins Collected */}
            <div className="neck-horizontal-stat-card">
              <span className="neck-horizontal-stat-label flex items-center gap-1">
                <Coins className="w-3.5 h-3.5 text-amber-500" />
                Coins Collected
              </span>
              <div className="neck-horizontal-stat-value">
                {telemetry.coinsCollected}
                <span className="neck-horizontal-stat-unit">/ {telemetry.targetCoinsGoal}</span>
              </div>
              <div className="neck-horizontal-stat-sub neutral">
                Streak: {telemetry.streak}x
              </div>
            </div>
          </div>

          {/* Live Bipolar Cervical Rotation Gauge */}
          <div className="neck-horizontal-gauge-card">
            <div className="neck-horizontal-gauge-header">
              <h3>Live Cervical Transverse Rotation</h3>
              <span className="neck-horizontal-gauge-badge">
                {telemetry.currentAngleDegrees}° {telemetry.currentTurnDirection.toUpperCase()}
              </span>
            </div>

            <div className="neck-horizontal-bipolar-track">
              <div className="neck-horizontal-center-pin" />
              {/* Fill to the Left */}
              <div
                className="neck-horizontal-gauge-fill-left"
                style={{ width: `${leftFillPercent}%` }}
              />
              {/* Fill to the Right */}
              <div
                className="neck-horizontal-gauge-fill-right"
                style={{ width: `${rightFillPercent}%` }}
              />
            </div>

            <div className="neck-horizontal-gauge-markers">
              <span>70° Left</span>
              <span className="font-semibold text-slate-500">0° Neutral Center</span>
              <span>70° Right</span>
            </div>
          </div>

          {/* Steering Target Direction Card */}
          <div className="neck-horizontal-target-card">
            <div className="neck-horizontal-target-info">
              <span className="neck-horizontal-target-title">Target Steering Zone</span>
              <span className="neck-horizontal-target-desc">
                {telemetry.targetSide === 'left'
                  ? 'Rotate head to the left to steer drone into target'
                  : 'Rotate head to the right to steer drone into target'}
              </span>
            </div>
            <div className={`neck-horizontal-target-pill ${telemetry.targetSide}`}>
              {telemetry.targetSide === 'left' ? 'STEER LEFT ⬅️' : 'STEER RIGHT ➡️'}
            </div>
          </div>

          {/* Session Repetitions Telemetry Log */}
          <div className="neck-horizontal-log-card">
            <div className="neck-horizontal-log-header">
              <h3>Session Telemetry Log</h3>
              <span className="text-xs text-slate-500 font-medium">
                {telemetry.reps.length} collected targets
              </span>
            </div>

            <div className="neck-horizontal-log-list">
              {telemetry.reps.length === 0 ? (
                <div className="text-xs text-slate-400 py-4 text-center">
                  No targets collected yet. Turn head to steer drone toward the glowing coin!
                </div>
              ) : (
                telemetry.reps.map((rep) => (
                  <div key={rep.id} className="neck-horizontal-log-item">
                    <div className="neck-horizontal-log-item-details">
                      <div className="neck-horizontal-log-item-title">
                        Target #{rep.id} · {rep.side.toUpperCase()} COIN
                      </div>
                      <div className="neck-horizontal-log-item-meta">
                        Rotation: {rep.angleDegrees}° | Time: {new Date(rep.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
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
          <div className="neck-horizontal-stored-card">
            <div className="flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-slate-500" />
              <span>
                {showSavedToast
                  ? 'Data successfully saved to localStorage!'
                  : savedSession
                  ? `Last session: ${savedSession.coinsCollected} coins (${savedSession.symmetryBalance}% Symmetry)`
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
/* Custom Drone & Lane Canvas Renderer                                        */
/* ========================================================================== */

function drawDroneLayers(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  drone: DroneState,
  coin: TargetCoin,
  particles: NeckParticle[],
  floatingTexts: FloatingText[]
): void {
  const laneY = drone.y * height;

  // 1. Draw Flight Lane Track
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(0.1 * width, laneY);
  ctx.lineTo(0.9 * width, laneY);
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
  ctx.setLineDash([12, 8]);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  // 2. Draw Target Coin
  const cx = coin.x * width;
  const cy = coin.y * height;
  const cr = coin.radius * Math.min(width, height);

  ctx.save();
  // Outer pulsating halo ring
  ctx.beginPath();
  ctx.arc(cx, cy, cr * 1.35, 0, Math.PI * 2);
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = '#f59e0b';
  ctx.shadowColor = '#f59e0b';
  ctx.shadowBlur = 14;
  ctx.stroke();

  // Golden coin disk
  const coinGrad = ctx.createRadialGradient(cx - cr * 0.3, cy - cr * 0.3, cr * 0.1, cx, cy, cr);
  coinGrad.addColorStop(0, '#fef08a');
  coinGrad.addColorStop(0.7, '#f59e0b');
  coinGrad.addColorStop(1, '#b45309');

  ctx.beginPath();
  ctx.arc(cx, cy, cr, 0, Math.PI * 2);
  ctx.fillStyle = coinGrad;
  ctx.fill();

  ctx.lineWidth = 2;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();

  // Star symbol on coin (flipped to render correctly in mirrored canvas)
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(-1, 1);
  ctx.font = 'bold 16px Inter, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('★', 0, 0);
  ctx.restore();

  ctx.restore();

  // 3. Draw Floating Glider Drone / Character
  const dx = drone.x * width;
  const dy = drone.y * height;
  const dr = drone.radius * Math.min(width, height);

  ctx.save();
  ctx.translate(dx, dy);
  ctx.rotate(drone.tiltAngle);

  // Drone energy aura
  ctx.shadowColor = '#38bdf8';
  ctx.shadowBlur = 18;

  // Drone wings
  ctx.beginPath();
  ctx.moveTo(0, -dr * 0.9);
  ctx.lineTo(dr * 1.5, dr * 0.8);
  ctx.lineTo(0, dr * 0.35);
  ctx.lineTo(-dr * 1.5, dr * 0.8);
  ctx.closePath();
  ctx.fillStyle = '#0284c7';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#38bdf8';
  ctx.stroke();

  // Cockpit dome
  ctx.beginPath();
  ctx.arc(0, 0, dr * 0.45, 0, Math.PI * 2);
  ctx.fillStyle = '#38bdf8';
  ctx.fill();

  // Energy thrusters
  ctx.beginPath();
  ctx.arc(-dr * 0.85, dr * 0.65, 4, 0, Math.PI * 2);
  ctx.arc(dr * 0.85, dr * 0.65, 4, 0, Math.PI * 2);
  ctx.fillStyle = '#fde047';
  ctx.shadowColor = '#f59e0b';
  ctx.shadowBlur = 8;
  ctx.fill();

  ctx.restore();

  // 4. Draw Particles (Coin Bursts)
  for (const p of particles) {
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.0003;
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

  // 5. Draw Floating Texts
  for (const ft of floatingTexts) {
    ft.y -= 0.0015;
    ft.life += 1;
    ft.alpha = Math.max(0, 1 - ft.life / ft.maxLife);

    ctx.save();
    ctx.translate(ft.x * width, ft.y * height);
    ctx.scale(-1, 1);
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
