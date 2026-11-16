import { useRef, useState, useEffect, useCallback } from 'react';
import {
  Trophy,
  Activity,
  RotateCcw,
  Sparkles,
  Volume2,
  VolumeX,
  Target,
  Flame,
  CheckCircle2,
  XCircle,
  Save,
} from 'lucide-react';
import { useCamera } from '@/hooks/useCamera';
import { useTracker } from '@/hooks/useTracker';
import { CameraBusy, CameraErrorOverlay, CameraPermissionPrompt } from '@/components/camera/CameraOverlays';
import { describeCameraError } from '@/services/camera/errorMessages';
import { describeTrackerError } from '@/services/tracking/errorMessages';
import {
  KneeSoccerTracker,
  CORNER_TARGETS,
  createGoalConfetti,
  createGoalText,
  loadResultsFromStorage,
} from './analytics';
import type {
  TrackedLeg,
  KneeSoccerTelemetry,
  SoccerParticle,
  FloatingText,
} from './types';
import './kneeSoccer.css';

export default function KneeSoccerModule() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [selectedLeg, setSelectedLeg] = useState<TrackedLeg>('auto');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [showGoalBanner, setShowGoalBanner] = useState(false);
  const [bannerScore, setBannerScore] = useState(100);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const trackerRef = useRef<KneeSoccerTracker>(new KneeSoccerTracker());
  const particlesRef = useRef<SoccerParticle[]>([]);
  const floatingTextsRef = useRef<FloatingText[]>([]);

  const [telemetry, setTelemetry] = useState<KneeSoccerTelemetry>({
    activeLeg: 'right',
    currentAngle: 90,
    targetAngle: 160,
    peakAngle: 90,
    sessionMaxROM: 90,
    kickSpeed: 0,
    targetAccuracy: 100,
    kicksCompleted: 0,
    targetKicksGoal: 10,
    totalScore: 0,
    streak: 0,
    kickPhase: 'ready',
    activeTargetCorner: 'top-left',
    feedbackMessage: 'Sit comfortably with your knees and feet visible in camera view.',
    reps: [],
    isTrackingValid: false,
  });

  // Load prior session stats on initial mount
  useEffect(() => {
    const prior = loadResultsFromStorage();
    if (prior && prior.kicksCompleted > 0) {
      setTelemetry((prev) => ({
        ...prev,
        sessionMaxROM: prior.peakROM,
      }));
    }
  }, []);

  const camera = useCamera(videoRef);

  const handleGoalScored = useCallback((gx: number, gy: number) => {
    // Generate celebratory confetti and floating score text
    const newParticles = createGoalConfetti(gx, gy);
    particlesRef.current.push(...newParticles);

    const goalText = createGoalText(gx, gy, 100);
    floatingTextsRef.current.push(goalText);

    setBannerScore(100 + Math.min(50, trackerRef.current.streak * 10));
    setShowGoalBanner(true);
    setTimeout(() => {
      setShowGoalBanner(false);
    }, 1800);
  }, []);

  const tracker = useTracker({
    kind: 'pose',
    videoRef,
    canvasRef,
    enabled: camera.status === 'active',
    onFrame: (frame) => {
      const now = performance.now();
      trackerRef.current.soundEnabled = soundEnabled;

      const updated = trackerRef.current.update(
        frame.pose,
        selectedLeg,
        now,
        1.0,
        handleGoalScored
      );

      setTelemetry(updated);

      // Render 2D Vector Soccer Pitch, Ball, Targets, Confetti, and Goniometer Overlay
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const w = canvas.width;
      const h = canvas.height;

      // Clear previous frame
      ctx.clearRect(0, 0, w, h);

      /* ---------------------------------------------------------------------- */
      /* 1. Draw 2D Soccer Goal Pitch & Crossbar Frame                          */
      /* ---------------------------------------------------------------------- */
      const goalLeft = w * 0.16;
      const goalRight = w * 0.84;
      const goalTop = h * 0.08;
      const goalBottom = h * 0.44;
      const goalW = goalRight - goalLeft;
      const goalH = goalBottom - goalTop;

      ctx.save();

      // Goal net backing fill
      const netGrad = ctx.createLinearGradient(0, goalTop, 0, goalBottom);
      netGrad.addColorStop(0, 'rgba(15, 23, 42, 0.45)');
      netGrad.addColorStop(1, 'rgba(15, 23, 42, 0.2)');
      ctx.fillStyle = netGrad;
      ctx.fillRect(goalLeft, goalTop, goalW, goalH);

      // Net mesh pattern grid
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
      ctx.lineWidth = 1.2;
      const meshStepX = goalW / 14;
      const meshStepY = goalH / 7;

      for (let x = goalLeft; x <= goalRight; x += meshStepX) {
        ctx.beginPath();
        ctx.moveTo(x, goalTop);
        ctx.lineTo(x, goalBottom);
        ctx.stroke();
      }
      for (let y = goalTop; y <= goalBottom; y += meshStepY) {
        ctx.beginPath();
        ctx.moveTo(goalLeft, y);
        ctx.lineTo(goalRight, y);
        ctx.stroke();
      }

      // Sturdy Goal Frame posts (white with metallic shadow)
      ctx.lineWidth = 8;
      ctx.strokeStyle = '#ffffff';
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      ctx.beginPath();
      // Left post
      ctx.moveTo(goalLeft, goalBottom);
      ctx.lineTo(goalLeft, goalTop);
      // Crossbar
      ctx.lineTo(goalRight, goalTop);
      // Right post
      ctx.lineTo(goalRight, goalBottom);
      ctx.stroke();

      // Goal base pitch line
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.beginPath();
      ctx.moveTo(w * 0.1, goalBottom);
      ctx.lineTo(w * 0.9, goalBottom);
      ctx.stroke();

      /* ---------------------------------------------------------------------- */
      /* 2. Draw Target Bullseyes in 4 Corners                                  */
      /* ---------------------------------------------------------------------- */
      const activeCorner = updated.activeTargetCorner;

      CORNER_TARGETS.forEach((target) => {
        const tx = target.x * w;
        const ty = target.y * h;
        const tr = target.radius * Math.min(w, h);
        const isActive = target.corner === activeCorner;

        ctx.save();

        if (isActive) {
          // Pulsing animation glow ring
          const pulse = (Math.sin(now * 0.008) + 1) * 0.5;
          ctx.beginPath();
          ctx.arc(tx, ty, tr + 6 + pulse * 6, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(34, 197, 94, ${0.4 + pulse * 0.4})`;
          ctx.lineWidth = 3;
          ctx.stroke();

          // Outer Target Circle
          ctx.beginPath();
          ctx.arc(tx, ty, tr, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(34, 197, 94, 0.25)';
          ctx.fill();
          ctx.lineWidth = 3.5;
          ctx.strokeStyle = '#22c55e';
          ctx.stroke();

          // Inner Bullseye Ring
          ctx.beginPath();
          ctx.arc(tx, ty, tr * 0.55, 0, Math.PI * 2);
          ctx.fillStyle = '#22c55e';
          ctx.fill();

          // Center white pin
          ctx.beginPath();
          ctx.arc(tx, ty, tr * 0.2, 0, Math.PI * 2);
          ctx.fillStyle = '#ffffff';
          ctx.fill();

          // Crosshair lines
          ctx.beginPath();
          ctx.moveTo(tx - tr - 4, ty);
          ctx.lineTo(tx + tr + 4, ty);
          ctx.moveTo(tx, ty - tr - 4);
          ctx.lineTo(tx, ty + tr + 4);
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2;
          ctx.stroke();
        } else {
          // Inactive corner targets
          ctx.beginPath();
          ctx.arc(tx, ty, tr * 0.8, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
          ctx.fill();
          ctx.lineWidth = 2;
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
          ctx.stroke();

          // Small inactive center dot
          ctx.beginPath();
          ctx.arc(tx, ty, 3, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
          ctx.fill();
        }

        ctx.restore();
      });

      /* ---------------------------------------------------------------------- */
      /* 3. Clinical Knee Joint Angle & Goniometer Overlay                      */
      /* ---------------------------------------------------------------------- */
      if (frame.pose && frame.pose.length >= 33) {
        const isLeft = updated.activeLeg === 'left';
        // Note: Mirrored coordinates for intuitive patient mirror reflection
        const hipLm = frame.pose[isLeft ? 23 : 24];
        const kneeLm = frame.pose[isLeft ? 25 : 26];
        const ankleLm = frame.pose[isLeft ? 27 : 28];

        const hx = (1 - hipLm.x) * w;
        const hy = hipLm.y * h;
        const kx = (1 - kneeLm.x) * w;
        const ky = kneeLm.y * h;
        const ax = (1 - ankleLm.x) * w;
        const ay = ankleLm.y * h;

        ctx.save();

        // Goniometer Bones Ray (Hip -> Knee -> Ankle)
        ctx.lineWidth = 5;
        ctx.strokeStyle = updated.currentAngle >= 160 ? '#10b981' : '#38bdf8';
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(hx, hy);
        ctx.lineTo(kx, ky);
        ctx.lineTo(ax, ay);
        ctx.stroke();

        // Joint Node on Knee
        ctx.beginPath();
        ctx.arc(kx, ky, 9, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.lineWidth = 3.5;
        ctx.strokeStyle = updated.currentAngle >= 160 ? '#10b981' : '#0284c7';
        ctx.stroke();

        // Ankle node
        ctx.beginPath();
        ctx.arc(ax, ay, 6, 0, Math.PI * 2);
        ctx.fillStyle = '#38bdf8';
        ctx.fill();

        // Knee Angle Numerical Pill Badge near the joint
        ctx.font = 'bold 16px Inter, sans-serif';
        const angleLabel = `${updated.currentAngle}°`;
        const textWidth = ctx.measureText(angleLabel).width;
        const badgeW = textWidth + 24;
        const badgeH = 30;
        const bx = Math.min(w - badgeW - 10, Math.max(10, kx + 16));
        const by = Math.max(20, ky - 18);

        ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
        ctx.beginPath();
        ctx.roundRect(bx, by, badgeW, badgeH, 8);
        ctx.fill();
        ctx.strokeStyle = updated.currentAngle >= 160 ? '#10b981' : '#38bdf8';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.fillStyle = updated.currentAngle >= 160 ? '#34d399' : '#38bdf8';
        ctx.fillText(angleLabel, bx + 12, by + 21);

        ctx.restore();
      }

      /* ---------------------------------------------------------------------- */
      /* 4. Draw 2D Vector Soccer Ball with Physics & Rotation                  */
      /* ---------------------------------------------------------------------- */
      const ball = trackerRef.current.ball;
      // Mirror ball X for natural mirrored display
      const bx = (1 - ball.x) * w;
      const by = ball.y * h;
      const br = ball.radius * Math.min(w, h);

      ctx.save();
      ctx.translate(bx, by);

      // Flight motion speed trails
      if (ball.isFlying) {
        ctx.save();
        const dirAngle = Math.atan2(ball.vy, -ball.vx);
        ctx.rotate(dirAngle);
        ctx.fillStyle = 'rgba(56, 189, 248, 0.35)';
        for (let i = 1; i <= 3; i++) {
          ctx.beginPath();
          ctx.ellipse(-i * br * 0.9, 0, br * 0.7, br * 0.35, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      // Ball rotation
      ctx.rotate(ball.rotation);

      // Ball base white sphere
      ctx.beginPath();
      ctx.arc(0, 0, br, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = '#0f172a';
      ctx.stroke();

      // Center black pentagon
      ctx.fillStyle = '#1e293b';
      ctx.beginPath();
      for (let p = 0; p < 5; p++) {
        const pa = (p * 2 * Math.PI) / 5 - Math.PI / 2;
        const px = Math.cos(pa) * (br * 0.42);
        const py = Math.sin(pa) * (br * 0.42);
        if (p === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();

      // Outer pattern seams
      for (let s = 0; s < 5; s++) {
        const sa = (s * 2 * Math.PI) / 5 - Math.PI / 2;
        const p1x = Math.cos(sa) * (br * 0.42);
        const p1y = Math.sin(sa) * (br * 0.42);
        const p2x = Math.cos(sa) * (br * 0.98);
        const p2y = Math.sin(sa) * (br * 0.98);

        ctx.beginPath();
        ctx.moveTo(p1x, p1y);
        ctx.lineTo(p2x, p2y);
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#334155';
        ctx.stroke();
      }

      ctx.restore();

      /* ---------------------------------------------------------------------- */
      /* 5. Update & Draw Confetti Particles and Floating Scores                */
      /* ---------------------------------------------------------------------- */
      const particles = particlesRef.current;
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.0003; // Soft gravity
        p.life += 1;
        p.alpha = Math.max(0, 1 - p.life / p.maxLife);

        if (p.life >= p.maxLife) {
          particles.splice(i, 1);
          continue;
        }

        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc((1 - p.x) * w, p.y * h, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      const floatingTexts = floatingTextsRef.current;
      for (let j = floatingTexts.length - 1; j >= 0; j--) {
        const ft = floatingTexts[j];
        ft.y -= 0.0015;
        ft.life += 1;
        ft.alpha = Math.max(0, 1 - ft.life / ft.maxLife);

        if (ft.life >= ft.maxLife) {
          floatingTexts.splice(j, 1);
          continue;
        }

        ctx.save();
        ctx.globalAlpha = ft.alpha;
        ctx.font = 'bold 20px Inter, sans-serif';
        ctx.fillStyle = ft.color;
        ctx.textAlign = 'center';
        ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
        ctx.shadowBlur = 8;
        ctx.fillText(ft.text, (1 - ft.x) * w, ft.y * h);
        ctx.restore();
      }

      ctx.restore();
    },
  });

  // Start camera on mount
  useEffect(() => {
    if (camera.status === 'idle') {
      camera.start();
    }
  }, [camera]);

  const handleResetSession = () => {
    trackerRef.current.reset();
    particlesRef.current = [];
    floatingTextsRef.current = [];
    setTelemetry({
      activeLeg: 'right',
      currentAngle: 90,
      targetAngle: 160,
      peakAngle: 90,
      sessionMaxROM: 90,
      kickSpeed: 0,
      targetAccuracy: 100,
      kicksCompleted: 0,
      targetKicksGoal: 10,
      totalScore: 0,
      streak: 0,
      kickPhase: 'ready',
      activeTargetCorner: 'top-left',
      feedbackMessage: 'Session reset! Flex knee and extend forward to shoot.',
      reps: [],
      isTrackingValid: false,
    });
    setToastMessage('Session has been reset.');
    setTimeout(() => setToastMessage(null), 2500);
  };

  const handleManualSave = () => {
    trackerRef.current.persistSession();
    setToastMessage('Session results saved to localStorage!');
    setTimeout(() => setToastMessage(null), 2500);
  };

  // ROM Bar calculation: map angle 90° -> 180° to 0% -> 100%
  const romPercent = Math.min(
    100,
    Math.max(0, ((telemetry.currentAngle - 90) / (180 - 90)) * 100)
  );

  return (
    <div className="knee-soccer-container">
      {/* Top Header Card */}
      <div className="knee-soccer-header">
        <div className="knee-soccer-title-group">
          <h2>
            <Activity className="w-5 h-5 text-emerald-600" />
            2D Leg Kick Soccer Game (Knee Extension)
          </h2>
          <p>
            Strengthen quadriceps and practice active terminal knee extension ($90^\circ \to 180^\circ$) by kicking into goal corners.
          </p>
        </div>

        <div className="knee-soccer-controls">
          <div className="leg-selector">
            <button
              className={`leg-btn ${selectedLeg === 'auto' ? 'active' : ''}`}
              onClick={() => setSelectedLeg('auto')}
            >
              Auto Detect
            </button>
            <button
              className={`leg-btn ${selectedLeg === 'left' ? 'active' : ''}`}
              onClick={() => setSelectedLeg('left')}
            >
              Left Leg
            </button>
            <button
              className={`leg-btn ${selectedLeg === 'right' ? 'active' : ''}`}
              onClick={() => setSelectedLeg('right')}
            >
              Right Leg
            </button>
          </div>

          <button
            onClick={() => setSoundEnabled((prev) => !prev)}
            className={`icon-action-btn ${soundEnabled ? 'active' : ''}`}
            title="Toggle Sound Effects"
          >
            {soundEnabled ? (
              <>
                <Volume2 className="w-4 h-4 text-emerald-600" />
                <span>Audio ON</span>
              </>
            ) : (
              <>
                <VolumeX className="w-4 h-4 text-slate-400" />
                <span>Muted</span>
              </>
            )}
          </button>

          <button
            onClick={handleManualSave}
            className="icon-action-btn"
            title="Save session stats"
          >
            <Save className="w-4 h-4 text-sky-600" />
            <span>Save Set</span>
          </button>

          <button
            onClick={handleResetSession}
            className="icon-action-btn"
            title="Reset tracking session"
          >
            <RotateCcw className="w-4 h-4 text-slate-500" />
            <span>Reset</span>
          </button>
        </div>
      </div>

      {/* Main Split Layout */}
      <div className="knee-soccer-layout">
        {/* Left: Interactive 2D Pitch & Camera Viewport */}
        <div className="knee-soccer-viewport">
          <video
            ref={videoRef}
            className="knee-soccer-video"
            playsInline
            muted
            autoPlay
          />
          <canvas ref={canvasRef} className="knee-soccer-canvas" />

          {/* Camera Lifecycle Overlays */}
          {camera.status === 'idle' && (
            <CameraPermissionPrompt onEnable={() => camera.start()} />
          )}
          {camera.status === 'starting' && <CameraBusy label="Starting camera..." />}
          {camera.status === 'error' && camera.error && (
            <CameraErrorOverlay
              guidance={describeCameraError(camera.error)}
              onRetry={() => camera.start()}
            />
          )}
          {tracker.status === 'error' && tracker.error && (
            <CameraErrorOverlay
              guidance={describeTrackerError(tracker.error)}
              onRetry={() => tracker.retry()}
            />
          )}

          {/* Floating HUD Badges */}
          <div className="knee-soccer-badges">
            <div className="leg-status-pill">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
              <span>TRACKING: {telemetry.activeLeg.toUpperCase()} LEG</span>
              <span className="text-sky-300 ml-1">{telemetry.currentAngle}°</span>
            </div>

            <div className="score-streak-pill">
              <Trophy className="w-4 h-4 text-amber-400" />
              <span>{telemetry.totalScore} PTS</span>
              {telemetry.streak > 1 && (
                <span className="flex items-center gap-1 text-orange-400 text-xs ml-1">
                  <Flame className="w-3.5 h-3.5" />
                  {telemetry.streak}x
                </span>
              )}
            </div>
          </div>

          {/* Goal Pop-in Celebration Banner */}
          {showGoalBanner && (
            <div className="goal-banner-overlay">
              <div className="goal-banner-text">⚽ GOAL! ⚽</div>
              <div className="goal-banner-sub">+{bannerScore} POINTS AWARDED</div>
            </div>
          )}

          {/* Bottom Live Feedback Banner */}
          <div className="knee-soccer-feedback-banner">
            <Sparkles className="w-4 h-4 text-sky-400 flex-shrink-0" />
            <span>{telemetry.feedbackMessage}</span>
            {toastMessage && (
              <span className="ml-auto text-emerald-400 font-bold text-xs bg-slate-900/80 px-2 py-1 rounded">
                {toastMessage}
              </span>
            )}
          </div>
        </div>

        {/* Right: Clinical Telemetry & Game Dashboard */}
        <div className="knee-soccer-telemetry">
          {/* 4 Metric Cards */}
          <div className="telemetry-grid">
            {/* Live Knee Angle */}
            <div className="metric-card">
              <span className="metric-label">Live Knee Angle</span>
              <div className="metric-value-row">
                <span className="metric-value">{telemetry.currentAngle}°</span>
                <span className="metric-unit">ROM</span>
              </div>
              <div
                className={`metric-badge ${
                  telemetry.currentAngle >= 160
                    ? 'green'
                    : telemetry.currentAngle >= 130
                    ? 'blue'
                    : 'amber'
                }`}
              >
                {telemetry.currentAngle >= 160 ? 'Terminal Extension' : 'Extending...'}
              </div>
            </div>

            {/* Kick Speed */}
            <div className="metric-card">
              <span className="metric-label">Kick Velocity</span>
              <div className="metric-value-row">
                <span className="metric-value">{telemetry.kickSpeed}</span>
                <span className="metric-unit">m/s</span>
              </div>
              <div className="metric-badge blue">Foot Velocity</div>
            </div>

            {/* Target Accuracy */}
            <div className="metric-card">
              <span className="metric-label">Target Accuracy</span>
              <div className="metric-value-row">
                <span className="metric-value">{telemetry.targetAccuracy}</span>
                <span className="metric-unit">%</span>
              </div>
              <div className="metric-badge green">Shot Precision</div>
            </div>

            {/* Kicks Completed */}
            <div className="metric-card">
              <span className="metric-label">Kicks Completed</span>
              <div className="metric-value-row">
                <span className="metric-value">
                  {telemetry.kicksCompleted} / {telemetry.targetKicksGoal}
                </span>
              </div>
              <div className="metric-badge blue">Goal Set Progress</div>
            </div>
          </div>

          {/* Live Knee Goniometer ROM Gauge */}
          <div className="rom-gauge-card">
            <div className="gauge-header-row">
              <div className="gauge-header-title">
                <Target className="w-4 h-4 text-emerald-600" />
                <span>Knee Extension ROM Track</span>
              </div>
              <span className="gauge-target-pill">Target: ≥ 160°</span>
            </div>

            <div className="rom-track-wrapper">
              <div className="rom-fill-bar" style={{ width: `${romPercent}%` }} />
              <div className="rom-target-line" title="160° Target Marker" />
            </div>

            <div className="rom-scale-labels">
              <span>90° (Flexed Sitting)</span>
              <span className="font-bold text-sky-600">{telemetry.currentAngle}° Current</span>
              <span>180° (Straight Leg)</span>
            </div>
          </div>

          {/* Active Target Corner Diagram */}
          <div className="target-map-card">
            <div className="gauge-header-row">
              <div className="gauge-header-title">
                <Target className="w-4 h-4 text-sky-600" />
                <span>Goal Corner Target</span>
              </div>
              <span className="text-xs text-slate-500 font-semibold uppercase">
                {telemetry.activeTargetCorner.replace('-', ' ')}
              </span>
            </div>

            <div className="target-map-grid">
              <div
                className={`target-node-item ${
                  telemetry.activeTargetCorner === 'top-left' ? 'active' : ''
                }`}
              >
                <span>Top Left</span>
                <span className="target-dot" />
              </div>
              <div
                className={`target-node-item ${
                  telemetry.activeTargetCorner === 'top-right' ? 'active' : ''
                }`}
              >
                <span>Top Right</span>
                <span className="target-dot" />
              </div>
              <div
                className={`target-node-item ${
                  telemetry.activeTargetCorner === 'bottom-left' ? 'active' : ''
                }`}
              >
                <span>Bottom Left</span>
                <span className="target-dot" />
              </div>
              <div
                className={`target-node-item ${
                  telemetry.activeTargetCorner === 'bottom-right' ? 'active' : ''
                }`}
              >
                <span>Bottom Right</span>
                <span className="target-dot" />
              </div>
            </div>
          </div>

          {/* Reps History Telemetry */}
          <div className="reps-history-card">
            <div className="reps-history-header">
              <span className="reps-history-title">Shot History Log</span>
              <span className="text-xs text-slate-500 font-semibold">
                {telemetry.reps.length} Recorded
              </span>
            </div>

            <div className="reps-list">
              {telemetry.reps.length === 0 ? (
                <div className="text-xs text-slate-400 py-3 text-center">
                  No kicks recorded yet. Kick ball forward to start!
                </div>
              ) : (
                telemetry.reps.map((rep) => (
                  <div
                    key={rep.id}
                    className={`rep-row ${rep.hitTarget ? '' : 'missed'}`}
                  >
                    <div>
                      <div className="rep-title">
                        Kick #{rep.id} ({rep.leg.toUpperCase()}) - {rep.targetCorner}
                      </div>
                      <div className="rep-meta">
                        Peak: {rep.peakAngle}° | Velocity: {rep.velocity} m/s
                      </div>
                    </div>
                    <div>
                      {rep.hitTarget ? (
                        <div className="flex items-center gap-1 text-emerald-600 font-bold text-xs">
                          <CheckCircle2 className="w-4 h-4" />
                          <span>GOAL</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 text-amber-600 font-semibold text-xs">
                          <XCircle className="w-4 h-4" />
                          <span>WIDE</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
