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
  Save,
  Compass,
} from 'lucide-react';
import { useCamera } from '@/hooks/useCamera';
import { useTracker } from '@/hooks/useTracker';
import { CameraBusy, CameraErrorOverlay, CameraPermissionPrompt } from '@/components/camera/CameraOverlays';
import { describeCameraError } from '@/services/camera/errorMessages';
import { describeTrackerError } from '@/services/tracking/errorMessages';
import {
  SlalomBalanceTracker,
  createSnowSplash,
  createFloatingScore,
  loadResultsFromStorage,
} from './analytics';
import type {
  SensitivityLevel,
  SlalomBalanceTelemetry,
  SnowParticle,
  FloatingScore,
  SlideItem,
} from './types';
import './slalomBalance.css';

export default function SlalomBalanceModule() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [sensitivity, setSensitivity] = useState<SensitivityLevel>('normal');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const trackerRef = useRef<SlalomBalanceTracker>(new SlalomBalanceTracker());
  const particlesRef = useRef<SnowParticle[]>([]);
  const floatingScoresRef = useRef<FloatingScore[]>([]);

  const [telemetry, setTelemetry] = useState<SlalomBalanceTelemetry>({
    currentShiftRatio: 0,
    currentShiftCm: 0,
    peakLeftShiftCm: 0,
    peakRightShiftCm: 0,
    activeLane: 'center',
    balanceStability: 95,
    slalomSymmetry: 100,
    fishCollected: 0,
    targetFishGoal: 16,
    totalScore: 0,
    streak: 0,
    feedbackMessage: 'Stand comfortably with hips and feet visible to begin.',
    isTrackingValid: false,
    reps: [],
  });

  // Load prior session stats on initial mount
  useEffect(() => {
    const prior = loadResultsFromStorage();
    if (prior && prior.fishCollected > 0) {
      setTelemetry((prev) => ({
        ...prev,
        peakLeftShiftCm: prior.peakLeftDisplacementCm,
        peakRightShiftCm: prior.peakRightDisplacementCm,
      }));
    }
  }, []);

  const camera = useCamera(videoRef);

  const handleCollect = useCallback((item: SlideItem) => {
    const splash = createSnowSplash(item.x, item.y);
    particlesRef.current.push(...splash);

    const scoreColor = item.kind === 'gem' ? '#38bdf8' : '#facc15';
    const scoreText = createFloatingScore(`+${item.points} PTS`, item.x, item.y, scoreColor);
    floatingScoresRef.current.push(scoreText);
  }, []);

  const handleObstacle = useCallback((item: SlideItem) => {
    const splash = createSnowSplash(item.x, item.y);
    particlesRef.current.push(...splash);

    const scoreText = createFloatingScore('BUMP!', item.x, item.y, '#f87171');
    floatingScoresRef.current.push(scoreText);
  }, []);

  const tracker = useTracker({
    kind: 'pose',
    videoRef,
    canvasRef,
    enabled: camera.status === 'active',
    onFrame: (frame) => {
      const now = performance.now();
      trackerRef.current.sensitivity = sensitivity;
      trackerRef.current.soundEnabled = soundEnabled;

      const updated = trackerRef.current.update(
        frame.pose,
        now,
        handleCollect,
        handleObstacle
      );

      setTelemetry(updated);

      // Render 2D Vector Arctic Slide, Penguin, Items, Snow Particles
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const w = canvas.width;
      const h = canvas.height;

      ctx.clearRect(0, 0, w, h);

      /* ---------------------------------------------------------------------- */
      /* 1. Draw Arctic Ice Flume Track                                         */
      /* ---------------------------------------------------------------------- */
      const flumeLeft = w * 0.16;
      const flumeRight = w * 0.84;
      const flumeW = flumeRight - flumeLeft;

      ctx.save();

      // Deep icy water/ice gradient
      const iceGrad = ctx.createLinearGradient(0, 0, 0, h);
      iceGrad.addColorStop(0, 'rgba(8, 47, 73, 0.55)');
      iceGrad.addColorStop(0.5, 'rgba(12, 74, 110, 0.45)');
      iceGrad.addColorStop(1, 'rgba(8, 47, 73, 0.65)');
      ctx.fillStyle = iceGrad;
      ctx.fillRect(flumeLeft, 0, flumeW, h);

      // Snow bank boundaries with soft glow
      ctx.strokeStyle = '#bae6fd';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(flumeLeft, 0);
      ctx.lineTo(flumeLeft, h);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(flumeRight, 0);
      ctx.lineTo(flumeRight, h);
      ctx.stroke();

      // Lane Guide Lines (dashed translucent cyan)
      const lane1X = w * 0.38;
      const lane2X = w * 0.62;

      ctx.strokeStyle = 'rgba(186, 230, 253, 0.22)';
      ctx.lineWidth = 2;
      ctx.setLineDash([16, 14]);
      const scrollOffset = (now * 0.12) % 30;

      ctx.beginPath();
      ctx.moveTo(lane1X, -30 + scrollOffset);
      ctx.lineTo(lane1X, h + 30);
      ctx.moveTo(lane2X, -30 + scrollOffset);
      ctx.lineTo(lane2X, h + 30);
      ctx.stroke();
      ctx.setLineDash([]);

      /* ---------------------------------------------------------------------- */
      /* 2. Draw Scrolling Items (Golden Fish & Ice Gems)                       */
      /* ---------------------------------------------------------------------- */
      const items = trackerRef.current.items;
      items.forEach((item) => {
        if (item.collected) return;
        const ix = item.x * w;
        const iy = item.y * h;
        const ir = item.radius * Math.min(w, h);

        ctx.save();
        ctx.translate(ix, iy);

        if (item.kind === 'gem') {
          // Sparkling Ice Crystal Gem
          const pulse = (Math.sin(now * 0.01 + iy) + 1) * 0.5;
          ctx.rotate(now * 0.002);

          // Outer crystal glow
          ctx.beginPath();
          ctx.arc(0, 0, ir + 4 + pulse * 4, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(56, 189, 248, 0.25)';
          ctx.fill();

          // Hexagonal gem body
          ctx.beginPath();
          for (let g = 0; g < 6; g++) {
            const ga = (g * Math.PI) / 3;
            const gx = Math.cos(ga) * ir;
            const gy = Math.sin(ga) * ir;
            if (g === 0) ctx.moveTo(gx, gy);
            else ctx.lineTo(gx, gy);
          }
          ctx.closePath();
          ctx.fillStyle = '#38bdf8';
          ctx.fill();
          ctx.lineWidth = 2.5;
          ctx.strokeStyle = '#e0f2fe';
          ctx.stroke();

          // Inner facets
          ctx.beginPath();
          ctx.arc(0, 0, ir * 0.45, 0, Math.PI * 2);
          ctx.fillStyle = '#ffffff';
          ctx.fill();
        } else {
          // Golden Arctic Fish
          const bob = Math.sin(now * 0.008 + ix) * 3;
          ctx.translate(0, bob);

          // Golden glow
          ctx.beginPath();
          ctx.arc(0, 0, ir + 4, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(250, 204, 21, 0.22)';
          ctx.fill();

          // Fish oval body
          ctx.beginPath();
          ctx.ellipse(0, 0, ir * 0.95, ir * 0.65, 0, 0, Math.PI * 2);
          ctx.fillStyle = '#facc15';
          ctx.fill();
          ctx.lineWidth = 2;
          ctx.strokeStyle = '#ca8a04';
          ctx.stroke();

          // Fish tail fin
          ctx.beginPath();
          ctx.moveTo(ir * 0.7, 0);
          ctx.lineTo(ir * 1.35, -ir * 0.55);
          ctx.lineTo(ir * 1.35, ir * 0.55);
          ctx.closePath();
          ctx.fillStyle = '#eab308';
          ctx.fill();
          ctx.stroke();

          // Fish Eye
          ctx.beginPath();
          ctx.arc(-ir * 0.45, -ir * 0.15, 3.5, 0, Math.PI * 2);
          ctx.fillStyle = '#0f172a';
          ctx.fill();
          ctx.beginPath();
          ctx.arc(-ir * 0.5, -ir * 0.2, 1.2, 0, Math.PI * 2);
          ctx.fillStyle = '#ffffff';
          ctx.fill();
        }

        ctx.restore();
      });

      /* ---------------------------------------------------------------------- */
      /* 3. Draw Cartoon Penguin Player Sliding on Belly                         */
      /* ---------------------------------------------------------------------- */
      const penguin = trackerRef.current.penguin;
      const px = penguin.x * w;
      const py = penguin.y * h;
      const pr = 0.065 * Math.min(w, h);

      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(penguin.tiltAngle);

      // Ski trails / icy spray trailing behind
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.lineWidth = 3.5;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-pr * 0.65, -pr * 0.8);
      ctx.lineTo(-pr * 0.65, -pr * 1.8);
      ctx.moveTo(pr * 0.65, -pr * 0.8);
      ctx.lineTo(pr * 0.65, -pr * 1.8);
      ctx.stroke();

      // Penguin Black Tuxedo Back / Body
      ctx.beginPath();
      ctx.ellipse(0, 0, pr * 0.9, pr * 1.2, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#0f172a';
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = '#334155';
      ctx.stroke();

      // White chest / belly patch
      ctx.beginPath();
      ctx.ellipse(0, pr * 0.15, pr * 0.62, pr * 0.85, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#f8fafc';
      ctx.fill();

      // Left and Right flippers (animated flapping)
      ctx.save();
      ctx.translate(-pr * 0.85, -pr * 0.1);
      ctx.rotate(-0.4 + penguin.flipperAngle);
      ctx.beginPath();
      ctx.ellipse(0, 0, pr * 0.35, pr * 0.75, -0.3, 0, Math.PI * 2);
      ctx.fillStyle = '#1e293b';
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.translate(pr * 0.85, -pr * 0.1);
      ctx.rotate(0.4 - penguin.flipperAngle);
      ctx.beginPath();
      ctx.ellipse(0, 0, pr * 0.35, pr * 0.75, 0.3, 0, Math.PI * 2);
      ctx.fillStyle = '#1e293b';
      ctx.fill();
      ctx.restore();

      // Trailing Red Winter Scarf
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.roundRect(-pr * 0.5, pr * 0.55, pr * 1.0, pr * 0.25, 4);
      ctx.fill();

      // Round Penguin Head
      ctx.beginPath();
      ctx.arc(0, pr * 0.88, pr * 0.52, 0, Math.PI * 2);
      ctx.fillStyle = '#0f172a';
      ctx.fill();

      // Eyes
      ctx.beginPath();
      ctx.arc(-pr * 0.18, pr * 0.92, 4.5, 0, Math.PI * 2);
      ctx.arc(pr * 0.18, pr * 0.92, 4.5, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();

      ctx.beginPath();
      ctx.arc(-pr * 0.18, pr * 0.94, 2.2, 0, Math.PI * 2);
      ctx.arc(pr * 0.18, pr * 0.94, 2.2, 0, Math.PI * 2);
      ctx.fillStyle = '#0f172a';
      ctx.fill();

      // Cute Orange Beak
      ctx.beginPath();
      ctx.moveTo(-pr * 0.14, pr * 1.05);
      ctx.lineTo(pr * 0.14, pr * 1.05);
      ctx.lineTo(0, pr * 1.28);
      ctx.closePath();
      ctx.fillStyle = '#f97316';
      ctx.fill();

      ctx.restore();

      /* ---------------------------------------------------------------------- */
      /* 4. Particle & Floating Score Updates                                   */
      /* ---------------------------------------------------------------------- */
      const particles = particlesRef.current;
      for (let pIdx = particles.length - 1; pIdx >= 0; pIdx--) {
        const pt = particles[pIdx];
        pt.x += pt.vx;
        pt.y += pt.vy;
        pt.life += 1;
        pt.alpha = Math.max(0, 1 - pt.life / pt.maxLife);

        if (pt.life >= pt.maxLife) {
          particles.splice(pIdx, 1);
          continue;
        }

        ctx.save();
        ctx.globalAlpha = pt.alpha;
        ctx.fillStyle = pt.color;
        ctx.beginPath();
        ctx.arc(pt.x * w, pt.y * h, pt.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      const scores = floatingScoresRef.current;
      for (let sIdx = scores.length - 1; sIdx >= 0; sIdx--) {
        const sc = scores[sIdx];
        sc.y -= 0.0018;
        sc.life += 1;
        sc.alpha = Math.max(0, 1 - sc.life / sc.maxLife);

        if (sc.life >= sc.maxLife) {
          scores.splice(sIdx, 1);
          continue;
        }

        ctx.save();
        ctx.globalAlpha = sc.alpha;
        ctx.font = 'bold 18px Inter, sans-serif';
        ctx.fillStyle = sc.color;
        ctx.textAlign = 'center';
        ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
        ctx.shadowBlur = 6;
        ctx.fillText(sc.text, sc.x * w, sc.y * h);
        ctx.restore();
      }

      /* ---------------------------------------------------------------------- */
      /* 5. Pelvic Center-of-Gravity Tracking Overlay on Patient                 */
      /* ---------------------------------------------------------------------- */
      if (frame.pose && frame.pose.length >= 29) {
        const lHip = frame.pose[23];
        const rHip = frame.pose[24];
        const lAnkle = frame.pose[27];
        const rAnkle = frame.pose[28];

        const hipMidX = ((1 - lHip.x) + (1 - rHip.x)) / 2 * w;
        const hipMidY = (lHip.y + rHip.y) / 2 * h;

        const ankleMidX = ((1 - lAnkle.x) + (1 - rAnkle.x)) / 2 * w;
        const ankleMidY = (lAnkle.y + rAnkle.y) / 2 * h;

        ctx.save();

        // Plumb line from Pelvis down to base of support
        ctx.lineWidth = 3;
        ctx.strokeStyle = updated.activeLane === 'center' ? '#38bdf8' : '#10b981';
        ctx.setLineDash([6, 6]);
        ctx.beginPath();
        ctx.moveTo(hipMidX, hipMidY);
        ctx.lineTo(ankleMidX, ankleMidY);
        ctx.stroke();
        ctx.setLineDash([]);

        // Pelvic center node
        ctx.beginPath();
        ctx.arc(hipMidX, hipMidY, 9, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#0284c7';
        ctx.stroke();

        // Ankle base node
        ctx.beginPath();
        ctx.arc(ankleMidX, ankleMidY, 7, 0, Math.PI * 2);
        ctx.fillStyle = '#38bdf8';
        ctx.fill();

        // Live Shift Numerical Badge
        ctx.font = 'bold 14px Inter, sans-serif';
        const shiftLabel = `${updated.currentShiftCm} cm ${updated.activeLane.toUpperCase()}`;
        const bWidth = ctx.measureText(shiftLabel).width + 20;
        const bx = Math.min(w - bWidth - 10, Math.max(10, hipMidX - bWidth / 2));
        const by = Math.max(20, hipMidY - 24);

        ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
        ctx.beginPath();
        ctx.roundRect(bx, by, bWidth, 26, 6);
        ctx.fill();
        ctx.strokeStyle = updated.activeLane === 'center' ? '#38bdf8' : '#34d399';
        ctx.lineWidth = 1.2;
        ctx.stroke();

        ctx.fillStyle = updated.activeLane === 'center' ? '#7dd3fc' : '#34d399';
        ctx.fillText(shiftLabel, bx + 10, by + 18);

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
    floatingScoresRef.current = [];
    setTelemetry({
      currentShiftRatio: 0,
      currentShiftCm: 0,
      peakLeftShiftCm: 0,
      peakRightShiftCm: 0,
      activeLane: 'center',
      balanceStability: 95,
      slalomSymmetry: 100,
      fishCollected: 0,
      targetFishGoal: 16,
      totalScore: 0,
      streak: 0,
      feedbackMessage: 'Session reset! Stand upright and shift weight to glide.',
      isTrackingValid: false,
      reps: [],
    });
    setToastMessage('Session has been reset.');
    setTimeout(() => setToastMessage(null), 2500);
  };

  const handleCalibrateCenter = () => {
    if (videoRef.current) {
      trackerRef.current.calibrateNeutral(trackerRef.current.shiftHistory.length > 0 ? undefined : undefined);
      setToastMessage('Neutral center calibrated!');
      setTimeout(() => setToastMessage(null), 2500);
    }
  };

  const handleManualSave = () => {
    trackerRef.current.persistSession();
    setToastMessage('Session results saved to localStorage!');
    setTimeout(() => setToastMessage(null), 2500);
  };

  // Balance Gauge pip position (shift ratio mapped from -0.15 .. +0.15 to 0% .. 100%)
  const gaugePercent = Math.min(
    95,
    Math.max(5, ((telemetry.currentShiftRatio + 0.12) / 0.24) * 100)
  );

  return (
    <div className="slalom-balance-container">
      {/* Top Header Card */}
      <div className="slalom-balance-header">
        <div className="slalom-title-group">
          <h2>
            <Activity className="w-5 h-5 text-sky-600" />
            Toony Penguin Ice Slide (Weight Shift & Balance)
          </h2>
          <p>
            Mediolateral pelvic shift and lower-limb balance stabilization: shift weight left or right to steer the penguin down the arctic flume.
          </p>
        </div>

        <div className="slalom-controls">
          <div className="sensitivity-selector">
            <button
              className={`sens-btn ${sensitivity === 'low' ? 'active' : ''}`}
              onClick={() => setSensitivity('low')}
            >
              Low Sens
            </button>
            <button
              className={`sens-btn ${sensitivity === 'normal' ? 'active' : ''}`}
              onClick={() => setSensitivity('normal')}
            >
              Normal
            </button>
            <button
              className={`sens-btn ${sensitivity === 'high' ? 'active' : ''}`}
              onClick={() => setSensitivity('high')}
            >
              High Sens
            </button>
          </div>

          <button
            onClick={handleCalibrateCenter}
            className="icon-action-btn"
            title="Recalibrate neutral standing baseline"
          >
            <Compass className="w-4 h-4 text-sky-600" />
            <span>Calibrate</span>
          </button>

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
      <div className="slalom-balance-layout">
        {/* Left: Arctic Ice Slide & Camera Viewport */}
        <div className="slalom-balance-viewport">
          <video
            ref={videoRef}
            className="slalom-video"
            playsInline
            muted
            autoPlay
          />
          <canvas ref={canvasRef} className="slalom-canvas" />

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
          <div className="slalom-badges">
            <div className="lane-status-pill">
              <span className="w-2.5 h-2.5 rounded-full bg-sky-400 animate-pulse" />
              <span>
                LANE: {telemetry.activeLane.toUpperCase()}
              </span>
              <span className="text-emerald-300 ml-1">{telemetry.currentShiftCm} cm</span>
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

          {/* Bottom Live Feedback Banner */}
          <div className="slalom-feedback-banner">
            <Sparkles className="w-4 h-4 text-sky-400 flex-shrink-0" />
            <span>{telemetry.feedbackMessage}</span>
            {toastMessage && (
              <span className="ml-auto text-emerald-400 font-bold text-xs bg-slate-900/80 px-2 py-1 rounded">
                {toastMessage}
              </span>
            )}
          </div>
        </div>

        {/* Right: Real-Time Clinical Telemetry Dashboard */}
        <div className="slalom-balance-telemetry">
          {/* 4 Metric Cards */}
          <div className="telemetry-grid">
            {/* Lateral Weight Shift Amplitude */}
            <div className="metric-card">
              <span className="metric-label">Pelvic Shift Amplitude</span>
              <div className="metric-value-row">
                <span className="metric-value">{telemetry.currentShiftCm}</span>
                <span className="metric-unit">cm</span>
              </div>
              <div
                className={`metric-badge ${
                  telemetry.currentShiftCm >= 12
                    ? 'green'
                    : telemetry.currentShiftCm >= 6
                    ? 'blue'
                    : 'amber'
                }`}
              >
                {telemetry.activeLane === 'center' ? 'Neutral Plumb' : `Shifted ${telemetry.activeLane}`}
              </div>
            </div>

            {/* Postural Balance Stability */}
            <div className="metric-card">
              <span className="metric-label">Balance Stability</span>
              <div className="metric-value-row">
                <span className="metric-value">{telemetry.balanceStability}</span>
                <span className="metric-unit">%</span>
              </div>
              <div className="metric-badge green">Postural Smoothness</div>
            </div>

            {/* Fish Collected */}
            <div className="metric-card">
              <span className="metric-label">Fish Collected</span>
              <div className="metric-value-row">
                <span className="metric-value">
                  {telemetry.fishCollected} / {telemetry.targetFishGoal}
                </span>
              </div>
              <div className="metric-badge blue">Goal Set Progress</div>
            </div>

            {/* Slalom Symmetry */}
            <div className="metric-card">
              <span className="metric-label">L/R Symmetry</span>
              <div className="metric-value-row">
                <span className="metric-value">{telemetry.slalomSymmetry}</span>
                <span className="metric-unit">%</span>
              </div>
              <div className="metric-badge blue">Bilateral Equality</div>
            </div>
          </div>

          {/* Live Mediolateral Balance Gauge */}
          <div className="balance-gauge-card">
            <div className="gauge-header-row">
              <div className="gauge-header-title">
                <Target className="w-4 h-4 text-sky-600" />
                <span>Live Mediolateral Balance Gauge</span>
              </div>
              <span className="gauge-target-pill">Target: ±0.06 Shift</span>
            </div>

            <div className="bipolar-track-wrapper">
              <div className="bipolar-center-line" title="Center Neutral (0.00)" />
              <div className="bipolar-left-threshold" title="Left Target (-0.06)" />
              <div className="bipolar-right-threshold" title="Right Target (+0.06)" />
              <div
                className="bipolar-indicator-pip"
                style={{ left: `${gaugePercent}%` }}
                title={`Pelvic Shift: ${telemetry.currentShiftRatio}`}
              />
            </div>

            <div className="bipolar-scale-labels">
              <span>◀ Left Shift (Max: {telemetry.peakLeftShiftCm}cm)</span>
              <span className="font-bold text-sky-700">Neutral Center</span>
              <span>Right Shift (Max: {telemetry.peakRightShiftCm}cm) ▶</span>
            </div>
          </div>

          {/* Active Lane Indicator Card */}
          <div className="lane-map-card">
            <div className="gauge-header-row">
              <div className="gauge-header-title">
                <Compass className="w-4 h-4 text-sky-600" />
                <span>Active Track Lane</span>
              </div>
              <span className="text-xs text-slate-500 font-semibold uppercase">
                {telemetry.activeLane}
              </span>
            </div>

            <div className="lane-map-grid">
              <div
                className={`lane-node-item ${
                  telemetry.activeLane === 'left' ? 'active' : ''
                }`}
              >
                <span>Left Lane</span>
                <span className="lane-dot" />
              </div>

              <div
                className={`lane-node-item ${
                  telemetry.activeLane === 'center' ? 'active' : ''
                }`}
              >
                <span>Center Lane</span>
                <span className="lane-dot" />
              </div>

              <div
                className={`lane-node-item ${
                  telemetry.activeLane === 'right' ? 'active' : ''
                }`}
              >
                <span>Right Lane</span>
                <span className="lane-dot" />
              </div>
            </div>
          </div>

          {/* Fish Collection History Log */}
          <div className="reps-history-card">
            <div className="reps-history-header">
              <span className="reps-history-title">Collection History Log</span>
              <span className="text-xs text-slate-500 font-semibold">
                {telemetry.reps.length} Recorded
              </span>
            </div>

            <div className="reps-list">
              {telemetry.reps.length === 0 ? (
                <div className="text-xs text-slate-400 py-3 text-center">
                  No items collected yet. Shift weight laterally to steer penguin!
                </div>
              ) : (
                telemetry.reps.map((rep) => (
                  <div key={rep.id} className="rep-row">
                    <div>
                      <div className="rep-title">
                        {rep.kind === 'gem' ? '💎 Ice Gem' : '🐟 Golden Fish'} #{rep.id} ({rep.lane.toUpperCase()})
                      </div>
                      <div className="rep-meta">
                        Shift Displacement: {rep.shiftCm} cm
                      </div>
                    </div>
                    <div className="flex items-center gap-1 text-emerald-600 font-bold text-xs">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>COLLECTED</span>
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
