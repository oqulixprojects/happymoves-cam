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
  ArrowUpDown,
  Star,
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
  NeckVerticalTracker,
  createCatchBurst,
  createFloatingScore,
  loadResultsFromStorage,
  saveResultsToStorage,
  TARGET_STARS_GOAL,
} from './analytics';
import type {
  FlightSensitivity,
  VerticalParticle,
  FloatingText,
  NeckVerticalTelemetry,
  StoredNeckVerticalData,
  FlyingCharacter,
  TargetStar,
} from './types';
import './neckVertical.css';

export default function NeckVerticalModule() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const trackerInstanceRef = useRef<NeckVerticalTracker>(new NeckVerticalTracker());
  const particlesRef = useRef<VerticalParticle[]>([]);
  const floatingTextsRef = useRef<FloatingText[]>([]);
  const lastUiUpdateRef = useRef<number>(0);

  const [sensitivity, setSensitivity] = useState<FlightSensitivity>('normal');
  useEffect(() => {
    trackerInstanceRef.current.sensitivity = sensitivity;
  }, [sensitivity]);

  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  useEffect(() => {
    trackerInstanceRef.current.soundEnabled = soundEnabled;
  }, [soundEnabled]);

  const [savedSession, setSavedSession] = useState<StoredNeckVerticalData | null>(() =>
    loadResultsFromStorage()
  );
  const [showSavedToast, setShowSavedToast] = useState<boolean>(false);

  const [telemetry, setTelemetry] = useState<NeckVerticalTelemetry>({
    currentPitchDelta: 0,
    currentPitchAngle: 0,
    pitchDirection: 'neutral',
    peakExtensionAngle: 0,
    peakFlexionAngle: 0,
    catchAccuracy: 100,
    smoothnessIndex: 98,
    starsCollected: 0,
    targetStarsGoal: TARGET_STARS_GOAL,
    totalScore: 0,
    streak: 0,
    characterY: 0.5,
    targetAltitude: 'high',
    feedbackMessage: 'Position your head clearly in frame to begin.',
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
      currentPitchDelta: 0,
      currentPitchAngle: 0,
      pitchDirection: 'neutral',
      peakExtensionAngle: 0,
      peakFlexionAngle: 0,
      catchAccuracy: 100,
      smoothnessIndex: 98,
      starsCollected: 0,
      targetStarsGoal: TARGET_STARS_GOAL,
      totalScore: 0,
      streak: 0,
      characterY: 0.5,
      targetAltitude: 'high',
      feedbackMessage: 'Session reset. Tilt head up to fly into the sky!',
      reps: [],
      isTrackingValid: false,
    });
  }, []);

  const handleManualSave = useCallback(() => {
    const data: StoredNeckVerticalData = {
      lastSessionDate: new Date().toISOString(),
      starsCollected: telemetry.starsCollected,
      peakExtensionAngle: telemetry.peakExtensionAngle,
      peakFlexionAngle: telemetry.peakFlexionAngle,
      catchAccuracy: telemetry.catchAccuracy,
      smoothnessIndex: telemetry.smoothnessIndex,
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
        (starX, starY, isStar) => {
          particlesRef.current.push(...createCatchBurst(starX, starY, isStar));
          floatingTextsRef.current.push(createFloatingScore(starX, starY, 50, isStar ? '#f59e0b' : '#06b6d4'));
        }
      );

      // Throttle React state updates to maintain 60fps canvas performance
      if (
        now - lastUiUpdateRef.current >= 90 ||
        updated.starsCollected !== telemetry.starsCollected ||
        updated.pitchDirection !== telemetry.pitchDirection
      ) {
        lastUiUpdateRef.current = now;
        setTelemetry(updated);
      }

      // Draw custom flight character & altitude zones
      const width = canvas.width;
      const height = canvas.height;
      const character = trackerInstanceRef.current.character;
      const star = trackerInstanceRef.current.currentStar;

      drawCharacterLayers(
        ctx,
        width,
        height,
        character,
        star,
        particlesRef.current,
        floatingTextsRef.current
      );

      // Clean up dead particles
      particlesRef.current = particlesRef.current.filter((p) => p.life < p.maxLife);
      floatingTextsRef.current = floatingTextsRef.current.filter((ft) => ft.life < ft.maxLife);
    },
  });

  // Calculate inverted Y percentage (0% = ground, 100% = sky)
  const altitudePercent = Math.min(100, Math.max(0, Math.round((1 - telemetry.characterY) * 100)));

  return (
    <div className="neck-vertical-container">
      {/* Header bar */}
      <div className="neck-vertical-header">
        <div className="neck-vertical-title-group">
          <h2>
            <ArrowUpDown className="w-5 h-5 text-sky-600" />
            Neck Vertical – Up &amp; Down Character Star Catcher
          </h2>
          <p>
            Active cervical sagittal plane flexion (chin down) and extension (head up) flight control
          </p>
        </div>

        <div className="neck-vertical-controls">
          {/* Sensitivity selector */}
          <div className="neck-vertical-sensitivity-selector">
            <button
              type="button"
              className={`neck-vertical-sensitivity-btn ${sensitivity === 'low' ? 'active' : ''}`}
              onClick={() => setSensitivity('low')}
            >
              Low Sens
            </button>
            <button
              type="button"
              className={`neck-vertical-sensitivity-btn ${sensitivity === 'normal' ? 'active' : ''}`}
              onClick={() => setSensitivity('normal')}
            >
              Normal Sens
            </button>
            <button
              type="button"
              className={`neck-vertical-sensitivity-btn ${sensitivity === 'high' ? 'active' : ''}`}
              onClick={() => setSensitivity('high')}
            >
              High Sens
            </button>
          </div>

          {/* Sound toggle */}
          <button
            type="button"
            className="neck-vertical-action-btn"
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
            className="neck-vertical-action-btn"
            onClick={handleResetSession}
            title="Reset current session"
          >
            <RotateCcw className="w-3.5 h-3.5 text-slate-600" />
            <span>Reset</span>
          </button>

          {/* Manual Save button */}
          <button
            type="button"
            className="neck-vertical-action-btn primary"
            onClick={handleManualSave}
            title="Persist results to storage"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Save Set</span>
          </button>
        </div>
      </div>

      {/* Main Layout Grid */}
      <div className="neck-vertical-layout">
        {/* Left: Viewport & Canvas Overlay */}
        <div className="neck-vertical-viewport">
          <video
            ref={videoRef}
            className="neck-vertical-video"
            playsInline
            muted
            autoPlay
          />
          <canvas ref={canvasRef} className="neck-vertical-canvas" />

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

          {/* Active Pitch Badge */}
          <div className="neck-vertical-overlay-badge">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                telemetry.isTrackingValid ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
              }`}
            />
            <span>
              {telemetry.isTrackingValid
                ? `PITCH: ${telemetry.currentPitchAngle}° ${telemetry.pitchDirection.toUpperCase()}`
                : 'WAITING FOR HEAD'}
            </span>
            <span className="text-sky-300 font-bold ml-1">
              Altitude: {altitudePercent}%
            </span>
          </div>

          {/* Score Badge */}
          <div className="neck-vertical-score-badge">
            <Trophy className="w-4 h-4 text-amber-400" />
            <span>{telemetry.starsCollected} Caught</span>
            <span className="text-xs text-emerald-400 ml-1 font-bold">
              ({telemetry.totalScore} PTS)
            </span>
          </div>

          {/* Live Coaching & Guidance Banner */}
          <div className="neck-vertical-feedback-banner">
            <Sparkles className="w-4 h-4 text-sky-400 flex-shrink-0 animate-spin" />
            <span>{telemetry.feedbackMessage}</span>
          </div>
        </div>

        {/* Right: Telemetry Dashboard */}
        <div className="neck-vertical-telemetry">
          {/* Key Stats Cards Grid */}
          <div className="neck-vertical-stats-grid">
            {/* Upward Extension Angle */}
            <div className="neck-vertical-stat-card">
              <span className="neck-vertical-stat-label">Upward Extension Angle</span>
              <div className="neck-vertical-stat-value">
                {telemetry.peakExtensionAngle}
                <span className="neck-vertical-stat-unit">° Up</span>
              </div>
              <div className="neck-vertical-stat-sub">
                Target Goal: ≥ 40°
              </div>
            </div>

            {/* Downward Flexion Angle */}
            <div className="neck-vertical-stat-card">
              <span className="neck-vertical-stat-label">Downward Flexion Angle</span>
              <div className="neck-vertical-stat-value">
                {telemetry.peakFlexionAngle}
                <span className="neck-vertical-stat-unit">° Down</span>
              </div>
              <div className="neck-vertical-stat-sub">
                Target Goal: ≥ 35°
              </div>
            </div>

            {/* Star Catch Accuracy */}
            <div className="neck-vertical-stat-card">
              <span className="neck-vertical-stat-label">Catch Accuracy</span>
              <div className="neck-vertical-stat-value">
                {telemetry.catchAccuracy}
                <span className="neck-vertical-stat-unit">%</span>
              </div>
              <div className="neck-vertical-stat-sub">
                Target Success Rate
              </div>
            </div>

            {/* Smooth Tracking Index */}
            <div className="neck-vertical-stat-card">
              <span className="neck-vertical-stat-label flex items-center gap-1">
                <Star className="w-3.5 h-3.5 text-amber-500" />
                Smoothness Index
              </span>
              <div className="neck-vertical-stat-value">
                {telemetry.smoothnessIndex}
                <span className="neck-vertical-stat-unit">%</span>
              </div>
              <div className="neck-vertical-stat-sub neutral">
                Movement Quality
              </div>
            </div>
          </div>

          {/* Live Vertical Pitch Elevation Gauge */}
          <div className="neck-vertical-gauge-card">
            <div className="neck-vertical-gauge-header">
              <h3>Live Vertical Pitch Elevation</h3>
              <span className="neck-vertical-gauge-badge">
                {telemetry.currentPitchAngle}° {telemetry.pitchDirection.toUpperCase()}
              </span>
            </div>

            <div className="neck-vertical-track">
              <div
                className="neck-vertical-track-fill"
                style={{ width: `${altitudePercent}%` }}
              />
            </div>

            <div className="neck-vertical-gauge-markers">
              <span>Deep Dive (Flexion)</span>
              <span className="font-semibold text-slate-500">Neutral (Gaze Forward)</span>
              <span>Sky High (Extension)</span>
            </div>
          </div>

          {/* Target Altitude Prompt Card */}
          <div className="neck-vertical-target-card">
            <div className="neck-vertical-target-info">
              <span className="neck-vertical-target-title">Target Altitude Band</span>
              <span className="neck-vertical-target-desc">
                {telemetry.targetAltitude === 'high'
                  ? 'Tilt head upward into extension to fly character into high sky'
                  : 'Dip chin downward into flexion to dive character into deep zone'}
              </span>
            </div>
            <div className={`neck-vertical-target-pill ${telemetry.targetAltitude}`}>
              {telemetry.targetAltitude === 'high' ? 'FLY TO SKY ☁️' : 'DIVE TO DEEP 🌊'}
            </div>
          </div>

          {/* Session Repetitions Telemetry Log */}
          <div className="neck-vertical-log-card">
            <div className="neck-vertical-log-header">
              <h3>Session Telemetry Log</h3>
              <span className="text-xs text-slate-500 font-medium">
                {telemetry.reps.length} collected targets
              </span>
            </div>

            <div className="neck-vertical-log-list">
              {telemetry.reps.length === 0 ? (
                <div className="text-xs text-slate-400 py-4 text-center">
                  No targets caught yet. Tilt head up or down to fly the character!
                </div>
              ) : (
                telemetry.reps.map((rep) => (
                  <div key={rep.id} className="neck-vertical-log-item">
                    <div className="neck-vertical-log-item-details">
                      <div className="neck-vertical-log-item-title">
                        Target #{rep.id} · {rep.altitude.toUpperCase()} ({rep.pitchDirection.toUpperCase()})
                      </div>
                      <div className="neck-vertical-log-item-meta">
                        Angle: {rep.angleDegrees}° | Time: {new Date(rep.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
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
          <div className="neck-vertical-stored-card">
            <div className="flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-slate-500" />
              <span>
                {showSavedToast
                  ? 'Data successfully saved to localStorage!'
                  : savedSession
                  ? `Last session: ${savedSession.starsCollected} caught (${savedSession.peakExtensionAngle}° Up / ${savedSession.peakFlexionAngle}° Down)`
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
/* Custom Flight Character & Altitude Canvas Renderer                          */
/* ========================================================================== */

function drawCharacterLayers(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  character: FlyingCharacter,
  star: TargetStar,
  particles: VerticalParticle[],
  floatingTexts: FloatingText[]
): void {
  // 1. Draw Vertical Flight Corridor Lane
  const laneX = character.x * width;

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(laneX, 0.1 * height);
  ctx.lineTo(laneX, 0.9 * height);
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.3)';
  ctx.setLineDash([8, 6]);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  // 2. Draw Target Star or Pearl
  const tx = star.x * width;
  const ty = star.y * height;
  const tr = star.radius * Math.min(width, height);

  ctx.save();
  if (star.type === 'star') {
    // 5-Pointed Star
    ctx.shadowColor = '#fbbf24';
    ctx.shadowBlur = 16;

    const spikes = 5;
    const outerRadius = tr;
    const innerRadius = tr * 0.45;
    let rot = (Math.PI / 2) * 3;
    const step = Math.PI / spikes;

    ctx.beginPath();
    ctx.moveTo(tx, ty - outerRadius);
    for (let i = 0; i < spikes; i++) {
      ctx.lineTo(tx + Math.cos(rot) * outerRadius, ty + Math.sin(rot) * outerRadius);
      rot += step;
      ctx.lineTo(tx + Math.cos(rot) * innerRadius, ty + Math.sin(rot) * innerRadius);
      rot += step;
    }
    ctx.closePath();
    ctx.fillStyle = '#fbbf24';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#d97706';
    ctx.stroke();
  } else {
    // Glowing Ocean Pearl
    ctx.shadowColor = '#06b6d4';
    ctx.shadowBlur = 16;

    const pearlGrad = ctx.createRadialGradient(tx - tr * 0.3, ty - tr * 0.3, tr * 0.1, tx, ty, tr);
    pearlGrad.addColorStop(0, '#ffffff');
    pearlGrad.addColorStop(0.5, '#67e8f9');
    pearlGrad.addColorStop(1, '#0284c7');

    ctx.beginPath();
    ctx.arc(tx, ty, tr, 0, Math.PI * 2);
    ctx.fillStyle = pearlGrad;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();
  }
  ctx.restore();

  // 3. Draw Flying Character (Celestial Hot Air Balloon / Flying Astro-Bird)
  const cy = character.y * height;
  const cr = character.radius * Math.min(width, height);

  ctx.save();
  ctx.translate(laneX, cy);
  ctx.rotate(character.pitchAngle);

  // Outer character glow
  ctx.shadowColor = '#38bdf8';
  ctx.shadowBlur = 18;

  // Balloon / Bird body
  const bodyGrad = ctx.createRadialGradient(0, -cr * 0.2, cr * 0.1, 0, 0, cr);
  bodyGrad.addColorStop(0, '#bae6fd');
  bodyGrad.addColorStop(0.7, '#0284c7');
  bodyGrad.addColorStop(1, '#0369a1');

  ctx.beginPath();
  ctx.arc(0, 0, cr, 0, Math.PI * 2);
  ctx.fillStyle = bodyGrad;
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = '#38bdf8';
  ctx.stroke();

  // Character Visor / Wing details
  ctx.beginPath();
  ctx.arc(0, -cr * 0.15, cr * 0.45, 0, Math.PI * 2);
  ctx.fillStyle = '#fef08a';
  ctx.fill();

  // Propulsion sparkle flame underneath
  ctx.beginPath();
  ctx.moveTo(-cr * 0.4, cr * 0.8);
  ctx.lineTo(0, cr * 1.3);
  ctx.lineTo(cr * 0.4, cr * 0.8);
  ctx.closePath();
  ctx.fillStyle = '#f59e0b';
  ctx.shadowColor = '#f59e0b';
  ctx.shadowBlur = 10;
  ctx.fill();

  ctx.restore();

  // 4. Draw Particles (Burst Sparks)
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
    ctx.scale(-1, 1); // Flip text to display right-side in mirrored canvas
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
