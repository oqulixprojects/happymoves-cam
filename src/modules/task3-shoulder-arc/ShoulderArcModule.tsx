import { useRef, useState, useEffect, useCallback } from 'react';
import {
  Activity,
  RotateCcw,
  Volume2,
  VolumeX,
  CheckCircle2,
  Trophy,
  Timer,
  Layers,
  Save,
  Star,
  Sparkles,
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
  ShoulderArcTracker,
  createStarBurst,
  createFloatingText,
  loadResultsFromStorage,
  saveResultsToStorage,
  REQUIRED_HOLD_SECONDS,
  DEFAULT_TARGET_ANGLE,
} from './analytics';
import type {
  TrackedArm,
  ArcParticle,
  FloatingText,
  ShoulderArcTelemetry,
  StoredShoulderArcData,
} from './types';
import './shoulderArc.css';

export default function ShoulderArcModule() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const trackerInstanceRef = useRef<ShoulderArcTracker>(new ShoulderArcTracker());
  const particlesRef = useRef<ArcParticle[]>([]);
  const floatingTextsRef = useRef<FloatingText[]>([]);
  const lastUiUpdateRef = useRef<number>(0);

  const [selectedArm, setSelectedArm] = useState<TrackedArm>('auto');
  const selectedArmRef = useRef<TrackedArm>('auto');
  useEffect(() => {
    selectedArmRef.current = selectedArm;
  }, [selectedArm]);

  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  useEffect(() => {
    trackerInstanceRef.current.soundEnabled = soundEnabled;
  }, [soundEnabled]);

  const [savedSession, setSavedSession] = useState<StoredShoulderArcData | null>(() =>
    loadResultsFromStorage()
  );
  const [showSavedToast, setShowSavedToast] = useState<boolean>(false);

  const [telemetry, setTelemetry] = useState<ShoulderArcTelemetry>({
    activeArm: 'right',
    currentAngle: 0,
    targetAngle: DEFAULT_TARGET_ANGLE,
    peakAngle: 0,
    sessionMaxROM: 0,
    repCount: 0,
    repState: 'resting',
    holdProgressPercent: 0,
    currentHoldSeconds: 0,
    requiredHoldSeconds: REQUIRED_HOLD_SECONDS,
    therapeuticTimeSeconds: 0,
    qualityScore: 100,
    checkpoints: [
      { angle: 60, label: '60° Star', collected: false },
      { angle: 90, label: '90° Star', collected: false },
      { angle: 120, label: '120° Star', collected: false },
    ],
    feedbackMessage: 'Stand or sit back so upper body is visible.',
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
      activeArm: 'right',
      currentAngle: 0,
      targetAngle: DEFAULT_TARGET_ANGLE,
      peakAngle: 0,
      sessionMaxROM: 0,
      repCount: 0,
      repState: 'resting',
      holdProgressPercent: 0,
      currentHoldSeconds: 0,
      requiredHoldSeconds: REQUIRED_HOLD_SECONDS,
      therapeuticTimeSeconds: 0,
      qualityScore: 100,
      checkpoints: [
        { angle: 60, label: '60° Star', collected: false },
        { angle: 90, label: '90° Star', collected: false },
        { angle: 120, label: '120° Star', collected: false },
      ],
      feedbackMessage: 'Session reset. Raise arm out to side to begin!',
      reps: [],
      isTrackingValid: false,
    });
  }, []);

  const handleManualSave = useCallback(() => {
    const data: StoredShoulderArcData = {
      lastSessionDate: new Date().toISOString(),
      repsCompleted: telemetry.repCount,
      peakROM: telemetry.sessionMaxROM,
      therapeuticZoneSeconds: telemetry.therapeuticTimeSeconds,
      avgHoldTime: REQUIRED_HOLD_SECONDS,
      totalScore: telemetry.repCount * 100,
      activeArm: telemetry.activeArm,
    };
    saveResultsToStorage(data);
    setSavedSession(data);
    setShowSavedToast(true);
    setTimeout(() => setShowSavedToast(false), 3000);
  }, [telemetry]);

  // MediaPipe Pose Tracker
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
      const aspect = frame.aspect || 1.0;

      // Update goniometer state machine
      const updated = trackerInstanceRef.current.update(
        landmarks,
        selectedArmRef.current,
        now,
        aspect,
        (starAngle) => {
          // Checkpoint collected burst
          const shoulderIdx = updated.activeArm === 'left' ? 11 : 12;
          const sx = landmarks?.[shoulderIdx]?.x ?? 0.5;
          const sy = landmarks?.[shoulderIdx]?.y ?? 0.4;
          particlesRef.current.push(...createStarBurst(sx, sy, '#fde047'));
          floatingTextsRef.current.push(createFloatingText(sx, sy, `${starAngle}° STAR!`, '#facc15'));
        },
        (repX, repY) => {
          // Rep completed fanfare burst
          particlesRef.current.push(...createStarBurst(repX, repY, '#34d399'));
          floatingTextsRef.current.push(createFloatingText(repX, repY, 'REP COMPLETE! +100', '#34d399'));
        }
      );

      // Throttle React state updates to ~10 Hz
      if (
        now - lastUiUpdateRef.current >= 95 ||
        updated.repCount !== telemetry.repCount ||
        updated.repState !== telemetry.repState
      ) {
        lastUiUpdateRef.current = now;
        setTelemetry(updated);
      }

      // Draw custom clinical goniometer clock arc overlay
      const width = canvas.width;
      const height = canvas.height;
      drawGoniometerLayers(
        ctx,
        width,
        height,
        updated,
        particlesRef.current,
        floatingTextsRef.current,
        landmarks
      );

      // Clean up dead particles
      particlesRef.current = particlesRef.current.filter((p) => p.life < p.maxLife);
      floatingTextsRef.current = floatingTextsRef.current.filter((ft) => ft.life < ft.maxLife);
    },
  });

  const romPercent = Math.min(100, Math.max(0, (telemetry.currentAngle / 180) * 100));

  return (
    <div className="shoulder-arc-container">
      {/* Header bar */}
      <div className="shoulder-arc-header">
        <div className="shoulder-arc-title-group">
          <h2>
            <Activity className="w-5 h-5 text-sky-600" />
            Shoulder Mobility – Clock Arc Sweep Goniometer
          </h2>
          <p>
            Coronal plane shoulder abduction goniometer with star checkpoints and peak hold duration
          </p>
        </div>

        <div className="shoulder-arc-controls">
          {/* Arm selector */}
          <div className="shoulder-arc-arm-selector">
            <button
              type="button"
              className={`shoulder-arc-arm-btn ${selectedArm === 'auto' ? 'active' : ''}`}
              onClick={() => setSelectedArm('auto')}
            >
              Auto Arm
            </button>
            <button
              type="button"
              className={`shoulder-arc-arm-btn ${selectedArm === 'left' ? 'active' : ''}`}
              onClick={() => setSelectedArm('left')}
            >
              Left Arm
            </button>
            <button
              type="button"
              className={`shoulder-arc-arm-btn ${selectedArm === 'right' ? 'active' : ''}`}
              onClick={() => setSelectedArm('right')}
            >
              Right Arm
            </button>
          </div>

          {/* Sound toggle */}
          <button
            type="button"
            className="shoulder-arc-action-btn"
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
            className="shoulder-arc-action-btn"
            onClick={handleResetSession}
            title="Reset current session"
          >
            <RotateCcw className="w-3.5 h-3.5 text-slate-600" />
            <span>Reset</span>
          </button>

          {/* Manual Save button */}
          <button
            type="button"
            className="shoulder-arc-action-btn primary"
            onClick={handleManualSave}
            title="Persist results to storage"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Save Set</span>
          </button>
        </div>
      </div>

      {/* Main Layout Grid */}
      <div className="shoulder-arc-layout">
        {/* Left: Viewport & Canvas Overlay */}
        <div className="shoulder-arc-viewport">
          <video
            ref={videoRef}
            className="shoulder-arc-video"
            playsInline
            muted
            autoPlay
          />
          <canvas ref={canvasRef} className="shoulder-arc-canvas" />

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

          {/* Active Arm Badge */}
          <div className="shoulder-arc-overlay-badge">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                telemetry.isTrackingValid ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
              }`}
            />
            <span>TRACKING: {telemetry.activeArm.toUpperCase()} SHOULDER</span>
            <span className="text-sky-300 font-bold ml-1">{telemetry.currentAngle}°</span>
          </div>

          {/* Score & Reps Badge */}
          <div className="shoulder-arc-score-badge">
            <Trophy className="w-4 h-4 text-amber-400" />
            <span>Rep {telemetry.repCount}</span>
            <span className="text-xs text-emerald-400 ml-1 font-bold">
              ({telemetry.sessionMaxROM}° Max)
            </span>
          </div>

          {/* Live Coaching & Guidance Banner */}
          <div className="shoulder-arc-feedback-banner">
            <Sparkles className="w-4 h-4 text-sky-400 flex-shrink-0 animate-spin" />
            <span>{telemetry.feedbackMessage}</span>
          </div>
        </div>

        {/* Right: Telemetry Dashboard */}
        <div className="shoulder-arc-telemetry">
          {/* Key Stats Cards Grid */}
          <div className="shoulder-arc-stats-grid">
            {/* Live Shoulder Angle */}
            <div className="shoulder-arc-stat-card">
              <span className="shoulder-arc-stat-label">Live Shoulder Angle</span>
              <div className="shoulder-arc-stat-value">
                {telemetry.currentAngle}
                <span className="shoulder-arc-stat-unit">deg (°)</span>
              </div>
              <div className="shoulder-arc-stat-sub">
                Target Goal: ≥ {telemetry.targetAngle}°
              </div>
            </div>

            {/* Peak Abduction Angle */}
            <div className="shoulder-arc-stat-card">
              <span className="shoulder-arc-stat-label">Peak Abduction Angle</span>
              <div className="shoulder-arc-stat-value">
                {telemetry.sessionMaxROM}
                <span className="shoulder-arc-stat-unit">° ROM</span>
              </div>
              <div className="shoulder-arc-stat-sub">
                Current Rep: {telemetry.peakAngle}°
              </div>
            </div>

            {/* Target Zone Hold Time */}
            <div className="shoulder-arc-stat-card">
              <span className="shoulder-arc-stat-label flex items-center gap-1">
                <Timer className="w-3 h-3 text-slate-400" />
                Therapeutic Overhead Time
              </span>
              <div className="shoulder-arc-stat-value">
                {telemetry.therapeuticTimeSeconds}
                <span className="shoulder-arc-stat-unit">sec</span>
              </div>
              <div className="shoulder-arc-stat-sub neutral">
                Time spent &gt; 90°
              </div>
            </div>

            {/* Repetition Progress */}
            <div className="shoulder-arc-stat-card">
              <span className="shoulder-arc-stat-label">Repetition Progress</span>
              <div className="shoulder-arc-stat-value">
                {telemetry.repCount}
                <span className="shoulder-arc-stat-unit">/ 10 reps</span>
              </div>
              <div className="shoulder-arc-stat-sub">
                State: {telemetry.repState.toUpperCase()}
              </div>
            </div>
          </div>

          {/* Live Goniometer Angle Gauge */}
          <div className="shoulder-arc-gauge-card">
            <div className="shoulder-arc-gauge-header">
              <h3>Live Shoulder Goniometer Gauge</h3>
              <span className="shoulder-arc-gauge-badge">
                Goal: ≥ {telemetry.targetAngle}°
              </span>
            </div>

            <div className="shoulder-arc-gauge-track">
              <div
                className="shoulder-arc-gauge-fill"
                style={{ width: `${romPercent}%` }}
              />
            </div>

            <div className="shoulder-arc-gauge-markers">
              <span>0° (Resting)</span>
              <span className="font-semibold text-sky-600">
                {telemetry.currentAngle}° Current
              </span>
              <span>180° (Full Overhead)</span>
            </div>
          </div>

          {/* 3.0s Hold Progress Section */}
          <div className="shoulder-arc-hold-card">
            <div className="shoulder-arc-hold-header">
              <span className="flex items-center gap-1.5 font-bold text-slate-800">
                <Timer className="w-4 h-4 text-sky-600" />
                Peak Target Hold Timer (3.0s Goal)
              </span>
              <strong className="text-sky-600">
                {telemetry.currentHoldSeconds}s / {REQUIRED_HOLD_SECONDS}s
              </strong>
            </div>

            <div className="shoulder-arc-hold-track">
              <div
                className="shoulder-arc-hold-fill"
                style={{ width: `${telemetry.holdProgressPercent}%` }}
              />
            </div>
          </div>

          {/* Checkpoint Stars Card */}
          <div className="shoulder-arc-stars-card">
            <h3>Sweep Checkpoint Stars</h3>
            <div className="shoulder-arc-stars-grid">
              {telemetry.checkpoints.map((cp) => (
                <div
                  key={cp.angle}
                  className={`shoulder-arc-star-item ${cp.collected ? 'collected' : ''}`}
                >
                  <Star
                    className={`w-3.5 h-3.5 ${
                      cp.collected ? 'text-amber-500 fill-amber-500' : 'text-slate-400'
                    }`}
                  />
                  <span>{cp.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Session Repetitions Telemetry Log */}
          <div className="shoulder-arc-log-card">
            <div className="shoulder-arc-log-header">
              <h3>Session Telemetry Log</h3>
              <span className="text-xs text-slate-500 font-medium">
                {telemetry.reps.length} tracked reps
              </span>
            </div>

            <div className="shoulder-arc-log-list">
              {telemetry.reps.length === 0 ? (
                <div className="text-xs text-slate-400 py-4 text-center">
                  No reps recorded yet. Sweep arm out to side to begin!
                </div>
              ) : (
                telemetry.reps.map((rep) => (
                  <div key={rep.id} className="shoulder-arc-log-item">
                    <div className="shoulder-arc-log-item-details">
                      <div className="shoulder-arc-log-item-title">
                        Rep #{rep.id} ({rep.arm.toUpperCase()})
                      </div>
                      <div className="shoulder-arc-log-item-meta">
                        Peak: {rep.peakAngle}° | Hold: {rep.holdTimeSeconds}s | Stars: {rep.checkpointsCollected}/3
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
          <div className="shoulder-arc-stored-card">
            <div className="flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-slate-500" />
              <span>
                {showSavedToast
                  ? 'Data successfully saved to localStorage!'
                  : savedSession
                  ? `Last session: ${savedSession.repsCompleted} reps (${savedSession.peakROM}° Max ROM)`
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
/* Custom Clinical Goniometer Arc Canvas Drawing                             */
/* ========================================================================== */

function drawGoniometerLayers(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  telemetry: ShoulderArcTelemetry,
  particles: ArcParticle[],
  floatingTexts: FloatingText[],
  landmarks?: { x: number; y: number }[]
): void {
  if (!landmarks || landmarks.length < 33) return;

  const isLeft = telemetry.activeArm === 'left';
  const shoulderIdx = isLeft ? 11 : 12;
  const wristIdx = isLeft ? 15 : 16;
  const hipIdx = isLeft ? 23 : 24;

  const s = landmarks[shoulderIdx];
  const w = landmarks[wristIdx];
  const h = landmarks[hipIdx];

  if (!s || !w || !h) return;

  const sx = s.x * width;
  const sy = s.y * height;
  const wx = w.x * width;
  const wy = w.y * height;
  const hx = h.x * width;
  const hy = h.y * height;

  const arcRadius = 110;

  ctx.save();

  // 1. Draw Torso baseline vector (Shoulder to Hip)
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(hx, hy);
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
  ctx.setLineDash([4, 4]);
  ctx.stroke();
  ctx.setLineDash([]);

  // 2. Draw Active Arm vector (Shoulder to Wrist)
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(wx, wy);
  ctx.lineWidth = 4;
  ctx.strokeStyle = telemetry.currentAngle >= telemetry.targetAngle ? '#10b981' : '#38bdf8';
  ctx.stroke();

  // 3. Draw Semi-Circular Goniometer Guide Arc
  // Direction: If mirrored left/right, calculate sweep angle
  const torsoAngle = Math.atan2(hy - sy, hx - sx);
  const sweepSign = isLeft ? -1 : 1;

  ctx.beginPath();
  ctx.arc(sx, sy, arcRadius, torsoAngle, torsoAngle + sweepSign * Math.PI, sweepSign < 0);
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
  ctx.stroke();

  // Active Swept Arc
  const currentRad = (telemetry.currentAngle * Math.PI) / 180;
  ctx.beginPath();
  ctx.arc(sx, sy, arcRadius, torsoAngle, torsoAngle + sweepSign * currentRad, sweepSign < 0);
  ctx.lineWidth = 6;
  ctx.strokeStyle = telemetry.currentAngle >= telemetry.targetAngle ? '#10b981' : '#38bdf8';
  ctx.shadowColor = telemetry.currentAngle >= telemetry.targetAngle ? '#10b981' : '#38bdf8';
  ctx.shadowBlur = 10;
  ctx.stroke();
  ctx.shadowBlur = 0;

  // 4. Draw Checkpoint Stars on Arc
  const checkpoints = [60, 90, 120];
  checkpoints.forEach((cpAngle) => {
    const cpRad = (cpAngle * Math.PI) / 180;
    const starAngleRad = torsoAngle + sweepSign * cpRad;
    const starX = sx + Math.cos(starAngleRad) * arcRadius;
    const starY = sy + Math.sin(starAngleRad) * arcRadius;
    const isCollected = telemetry.checkpoints.find((c) => c.angle === cpAngle)?.collected;

    ctx.save();
    ctx.beginPath();
    ctx.arc(starX, starY, 9, 0, Math.PI * 2);
    ctx.fillStyle = isCollected ? '#fbbf24' : 'rgba(15, 23, 42, 0.7)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = isCollected ? '#f59e0b' : '#94a3b8';
    ctx.stroke();
    ctx.restore();
  });

  // 5. Shoulder Pivot Node & Angle Badge
  ctx.beginPath();
  ctx.arc(sx, sy, 8, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#0284c7';
  ctx.stroke();

  // Angle text (flipped horizontally to display correctly on mirrored canvas)
  ctx.save();
  ctx.translate(sx, sy - 18);
  ctx.scale(-1, 1);
  ctx.font = 'bold 15px Inter, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.fillText(`${telemetry.currentAngle}°`, 0, 0);
  ctx.restore();

  ctx.restore();

  // 6. Draw Particles (Star Bursts)
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

  // 7. Draw Floating Texts
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
