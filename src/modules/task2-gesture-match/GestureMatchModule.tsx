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
  Target,
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
  GestureMatchTracker,
  createConfettiBurst,
  createFloatingText,
  loadResultsFromStorage,
  saveResultsToStorage,
  REQUIRED_HOLD_SECONDS,
  GESTURE_DEFINITIONS,
} from './analytics';
import type {
  HandPreference,
  Particle,
  FloatingText,
  GestureMatchTelemetry,
  StoredGestureSessionData,
} from './types';
import './gestureMatch.css';

export default function GestureMatchModule() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const trackerInstanceRef = useRef<GestureMatchTracker>(new GestureMatchTracker());
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

  const [savedSession, setSavedSession] = useState<StoredGestureSessionData | null>(() =>
    loadResultsFromStorage()
  );
  const [showSavedToast, setShowSavedToast] = useState<boolean>(false);

  const [telemetry, setTelemetry] = useState<GestureMatchTelemetry>({
    gesturesCompleted: 0,
    totalAttempts: 0,
    accuracyRate: 100,
    currentLatency: 0,
    avgLatency: 0,
    currentIsolationScore: 0,
    avgIsolationScore: 0,
    holdProgressPercent: 0,
    isHoldingTarget: false,
    currentHoldSeconds: 0,
    requiredHoldSeconds: REQUIRED_HOLD_SECONDS,
    totalScore: 0,
    streak: 0,
    detectedGesture: 'unknown',
    targetGesture: GESTURE_DEFINITIONS[0],
    fingerStates: { thumb: false, index: false, middle: false, ring: false, pinky: false },
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
      gesturesCompleted: 0,
      totalAttempts: 0,
      accuracyRate: 100,
      currentLatency: 0,
      avgLatency: 0,
      currentIsolationScore: 0,
      avgIsolationScore: 0,
      holdProgressPercent: 0,
      isHoldingTarget: false,
      currentHoldSeconds: 0,
      requiredHoldSeconds: REQUIRED_HOLD_SECONDS,
      totalScore: 0,
      streak: 0,
      detectedGesture: 'unknown',
      targetGesture: GESTURE_DEFINITIONS[0],
      fingerStates: { thumb: false, index: false, middle: false, ring: false, pinky: false },
      feedbackMessage: 'Session reset. Replicate prompt gesture to start!',
      reps: [],
      activeHand: 'None',
    });
  }, []);

  const handleManualSave = useCallback(() => {
    const data: StoredGestureSessionData = {
      lastSessionDate: new Date().toISOString(),
      gesturesCompleted: telemetry.gesturesCompleted,
      accuracyRate: telemetry.accuracyRate,
      avgLatencySeconds: telemetry.avgLatency,
      avgIsolationScore: telemetry.avgIsolationScore,
      totalScore: telemetry.totalScore,
      repsCount: telemetry.reps.length,
    };
    saveResultsToStorage(data);
    setSavedSession(data);
    setShowSavedToast(true);
    setTimeout(() => setShowSavedToast(false), 3000);
  }, [telemetry]);

  // MediaPipe hand tracker
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
          particlesRef.current.push(...createConfettiBurst(burstX, burstY));
          floatingTextsRef.current.push(createFloatingText(burstX, burstY, 'MATCH! +50 PTS'));
        }
      );

      // Throttle React state updates to maintain 60fps canvas performance
      if (
        now - lastUiUpdateRef.current >= 90 ||
        updated.isHoldingTarget !== telemetry.isHoldingTarget ||
        updated.gesturesCompleted !== telemetry.gesturesCompleted
      ) {
        lastUiUpdateRef.current = now;
        setTelemetry(updated);
      }

      // Draw custom gamified layers on canvas
      const width = canvas.width;
      const height = canvas.height;
      drawGameLayers(
        ctx,
        width,
        height,
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

  return (
    <div className="gesture-match-container">
      {/* Header bar */}
      <div className="gesture-match-header">
        <div className="gesture-match-title-group">
          <h2>
            <Hand className="w-5 h-5 text-sky-600" />
            Finger Gesture Match (Match The Reference Pose)
          </h2>
          <p>
            Dynamic finger isolation, motor cognition, and proprioceptive gesture replication
          </p>
        </div>

        <div className="gesture-match-controls">
          {/* Hand preference selector */}
          <div className="gesture-match-hand-selector">
            <button
              type="button"
              className={`gesture-match-hand-btn ${handPreference === 'auto' ? 'active' : ''}`}
              onClick={() => setHandPreference('auto')}
            >
              Auto Hand
            </button>
            <button
              type="button"
              className={`gesture-match-hand-btn ${handPreference === 'Left' ? 'active' : ''}`}
              onClick={() => setHandPreference('Left')}
            >
              Left Hand
            </button>
            <button
              type="button"
              className={`gesture-match-hand-btn ${handPreference === 'Right' ? 'active' : ''}`}
              onClick={() => setHandPreference('Right')}
            >
              Right Hand
            </button>
          </div>

          {/* Sound toggle */}
          <button
            type="button"
            className="gesture-match-action-btn"
            onClick={() => setSoundEnabled((prev) => !prev)}
            title={soundEnabled ? 'Mute Sound FX' : 'Enable Sound FX'}
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
            className="gesture-match-action-btn"
            onClick={handleResetSession}
            title="Reset current session"
          >
            <RotateCcw className="w-3.5 h-3.5 text-slate-600" />
            <span>Reset</span>
          </button>

          {/* Manual Save button */}
          <button
            type="button"
            className="gesture-match-action-btn primary"
            onClick={handleManualSave}
            title="Persist results to storage"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Save Set</span>
          </button>
        </div>
      </div>

      {/* Main Layout Grid */}
      <div className="gesture-match-layout">
        {/* Left: Viewport & Canvas Overlay */}
        <div className="gesture-match-viewport">
          <video
            ref={videoRef}
            className="gesture-match-video"
            playsInline
            muted
            autoPlay
          />
          <canvas ref={canvasRef} className="gesture-match-canvas" />

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
          <div className="gesture-match-overlay-badge">
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
              DETECTED: {telemetry.detectedGesture.toUpperCase()}
            </span>
          </div>

          {/* Score & Streak Badge */}
          <div className="gesture-match-score-badge">
            <Trophy className="w-4 h-4 text-amber-400" />
            <span>{telemetry.totalScore} PTS</span>
            {telemetry.streak > 1 && (
              <span className="flex items-center text-xs text-orange-400 ml-1 font-bold">
                <Flame className="w-3.5 h-3.5 fill-orange-400" />
                {telemetry.streak}x
              </span>
            )}
          </div>

          {/* Reference Prompt Card inside Viewport */}
          <div className="gesture-match-prompt-card">
            <div className="gesture-match-prompt-emoji">
              {telemetry.targetGesture.emoji}
            </div>
            <div className="gesture-match-prompt-info">
              <span className="gesture-match-prompt-tag">Current Challenge</span>
              <span className="gesture-match-prompt-title">
                {telemetry.targetGesture.name}
              </span>
              <span className="gesture-match-prompt-desc">
                {telemetry.targetGesture.instructions}
              </span>
            </div>
          </div>

          {/* Live Coaching & Guidance Banner */}
          <div className="gesture-match-feedback-banner">
            <Sparkles className="w-4 h-4 text-sky-400 flex-shrink-0 animate-spin" />
            <span>{telemetry.feedbackMessage}</span>
          </div>
        </div>

        {/* Right: Telemetry Dashboard */}
        <div className="gesture-match-telemetry">
          {/* Key Stats Cards Grid */}
          <div className="gesture-match-stats-grid">
            {/* Gesture Accuracy */}
            <div className="gesture-match-stat-card">
              <span className="gesture-match-stat-label">Gesture Accuracy</span>
              <div className="gesture-match-stat-value">
                {telemetry.accuracyRate}
                <span className="gesture-match-stat-unit">%</span>
              </div>
              <div className="gesture-match-stat-sub">
                Target: ≥ 90%
              </div>
            </div>

            {/* Recognition Latency */}
            <div className="gesture-match-stat-card">
              <span className="gesture-match-stat-label flex items-center gap-1">
                <Timer className="w-3 h-3 text-slate-400" />
                Recognition Latency
              </span>
              <div className="gesture-match-stat-value">
                {telemetry.isHoldingTarget
                  ? `${telemetry.currentLatency}s`
                  : telemetry.avgLatency > 0
                  ? `${telemetry.avgLatency}s`
                  : '--'}
                <span className="gesture-match-stat-unit">sec</span>
              </div>
              <div className="gesture-match-stat-sub neutral">
                Avg: {telemetry.avgLatency > 0 ? `${telemetry.avgLatency}s` : 'N/A'}
              </div>
            </div>

            {/* Gestures Completed */}
            <div className="gesture-match-stat-card">
              <span className="gesture-match-stat-label">Gestures Completed</span>
              <div className="gesture-match-stat-value">
                {telemetry.gesturesCompleted}
                <span className="gesture-match-stat-unit">/ 10</span>
              </div>
              <div className="gesture-match-stat-sub">
                {telemetry.totalAttempts} total attempts
              </div>
            </div>

            {/* Finger Isolation Score */}
            <div className="gesture-match-stat-card">
              <span className="gesture-match-stat-label">Finger Isolation</span>
              <div className="gesture-match-stat-value">
                {telemetry.currentIsolationScore}
                <span className="gesture-match-stat-unit">%</span>
              </div>
              <div className="gesture-match-stat-sub">
                Avg: {telemetry.avgIsolationScore > 0 ? `${telemetry.avgIsolationScore}%` : '100%'}
              </div>
            </div>
          </div>

          {/* 1.5s Hold Timer Progress Section */}
          <div className="gesture-match-hold-card">
            <div className="gesture-match-hold-header">
              <span className="flex items-center gap-1.5 font-bold text-slate-800">
                <Target className="w-4 h-4 text-sky-600" />
                1.5s Stable Hold Confirmation
              </span>
              <strong className="text-sky-600">
                {telemetry.currentHoldSeconds}s / {REQUIRED_HOLD_SECONDS}s
              </strong>
            </div>

            <div className="gesture-match-hold-track">
              <div
                className="gesture-match-hold-fill"
                style={{ width: `${telemetry.holdProgressPercent}%` }}
              />
            </div>
          </div>

          {/* Live Digits Extension State Card */}
          <div className="gesture-match-digits-card">
            <div className="gesture-match-digits-header">
              <h3>Live Digits Extension State</h3>
              <span className="gesture-match-digits-badge">
                {telemetry.detectedGesture === telemetry.targetGesture.id
                  ? 'PERFECT MATCH'
                  : 'ADJUSTING'}
              </span>
            </div>

            <div className="gesture-match-digits-grid">
              {/* Thumb */}
              <div
                className={`gesture-match-digit-pill ${
                  telemetry.fingerStates.thumb ? 'extended' : 'folded'
                }`}
              >
                <span className="gesture-match-digit-name">Thumb</span>
                <span className="gesture-match-digit-state">
                  {telemetry.fingerStates.thumb ? 'Extended' : 'Folded'}
                </span>
              </div>

              {/* Index */}
              <div
                className={`gesture-match-digit-pill ${
                  telemetry.fingerStates.index ? 'extended' : 'folded'
                }`}
              >
                <span className="gesture-match-digit-name">Index</span>
                <span className="gesture-match-digit-state">
                  {telemetry.fingerStates.index ? 'Extended' : 'Folded'}
                </span>
              </div>

              {/* Middle */}
              <div
                className={`gesture-match-digit-pill ${
                  telemetry.fingerStates.middle ? 'extended' : 'folded'
                }`}
              >
                <span className="gesture-match-digit-name">Middle</span>
                <span className="gesture-match-digit-state">
                  {telemetry.fingerStates.middle ? 'Extended' : 'Folded'}
                </span>
              </div>

              {/* Ring */}
              <div
                className={`gesture-match-digit-pill ${
                  telemetry.fingerStates.ring ? 'extended' : 'folded'
                }`}
              >
                <span className="gesture-match-digit-name">Ring</span>
                <span className="gesture-match-digit-state">
                  {telemetry.fingerStates.ring ? 'Extended' : 'Folded'}
                </span>
              </div>

              {/* Pinky */}
              <div
                className={`gesture-match-digit-pill ${
                  telemetry.fingerStates.pinky ? 'extended' : 'folded'
                }`}
              >
                <span className="gesture-match-digit-name">Pinky</span>
                <span className="gesture-match-digit-state">
                  {telemetry.fingerStates.pinky ? 'Extended' : 'Folded'}
                </span>
              </div>
            </div>
          </div>

          {/* Session Repetitions Telemetry Log */}
          <div className="gesture-match-log-card">
            <div className="gesture-match-log-header">
              <h3>Session Telemetry Log</h3>
              <span className="text-xs text-slate-500 font-medium">
                {telemetry.reps.length} matched gestures
              </span>
            </div>

            <div className="gesture-match-log-list">
              {telemetry.reps.length === 0 ? (
                <div className="text-xs text-slate-400 py-4 text-center">
                  No completed gestures yet. Match the prompt and hold for 1.5s!
                </div>
              ) : (
                telemetry.reps.map((rep) => (
                  <div key={rep.id} className="gesture-match-log-item">
                    <div className="gesture-match-log-item-details">
                      <div className="gesture-match-log-item-title">
                        #{rep.id} · {rep.gestureName}
                      </div>
                      <div className="gesture-match-log-item-meta">
                        Latency: {rep.latencySeconds}s | Isolation: {rep.isolationScore}%
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
          <div className="gesture-match-stored-card">
            <div className="flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-slate-500" />
              <span>
                {showSavedToast
                  ? 'Data successfully saved to localStorage!'
                  : savedSession
                  ? `Last session: ${savedSession.gesturesCompleted} completed (${savedSession.accuracyRate}% accuracy)`
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
/* Custom Canvas Overlay Drawing                                              */
/* ========================================================================== */

function drawGameLayers(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  telemetry: GestureMatchTelemetry,
  particles: Particle[],
  floatingTexts: FloatingText[],
  landmarks?: { x: number; y: number }[]
): void {
  // 1. Draw Hold Ring around palm center if matching
  if (landmarks && landmarks[9] && telemetry.isHoldingTarget) {
    const palmX = landmarks[9].x * width;
    const palmY = landmarks[9].y * height;
    const radius = 38;

    ctx.save();
    // Track background
    ctx.beginPath();
    ctx.arc(palmX, palmY, radius, 0, Math.PI * 2);
    ctx.lineWidth = 5;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.stroke();

    // Progress arc
    const startAngle = -Math.PI / 2;
    const progressAngle = startAngle + (Math.PI * 2 * telemetry.holdProgressPercent) / 100;

    ctx.beginPath();
    ctx.arc(palmX, palmY, radius, startAngle, progressAngle);
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#34d399';
    ctx.shadowColor = '#34d399';
    ctx.shadowBlur = 12;
    ctx.stroke();
    ctx.restore();
  }

  // 2. Draw Particles (Confetti Burst)
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

  // 3. Draw Floating Text (MATCH! +50 PTS)
  for (const ft of floatingTexts) {
    ft.y -= 0.0015;
    ft.life += 1;
    ft.alpha = Math.max(0, 1 - ft.life / ft.maxLife);

    ctx.save();
    ctx.translate(ft.x * width, ft.y * height);
    ctx.scale(-1, 1); // Flip text to display correctly on mirrored canvas
    ctx.font = 'bold 22px Inter, sans-serif';
    ctx.fillStyle = ft.color;
    ctx.globalAlpha = ft.alpha;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
    ctx.shadowBlur = 6;
    ctx.textAlign = 'center';
    ctx.fillText(ft.text, 0, 0);
    ctx.restore();
  }
}
