import { useRef, useState, useEffect, useCallback } from 'react';
import {
  RotateCcw,
  Volume2,
  VolumeX,
  Trophy,
  Play,
  Flame,
  Camera,
  CameraOff,
  Sparkles,
  Award,
  ShieldCheck,
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
  createJetTrailParticles,
  createCelebrationConfetti,
  createInitialClouds,
  updateClouds,
  playCountdownBeep,
  TARGET_COINS_GOAL,
} from './analytics';
import type {
  GameState,
  SteeringSensitivity,
  NeckParticle,
  FloatingText,
  NeckHorizontalTelemetry,
  DroneState,
  TargetCoin,
  CloudItem,
} from './types';
import './neckHorizontal.css';

export default function NeckHorizontalModule() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const trackerInstanceRef = useRef<NeckHorizontalTracker>(new NeckHorizontalTracker());
  const particlesRef = useRef<NeckParticle[]>([]);
  const floatingTextsRef = useRef<FloatingText[]>([]);
  const cloudsRef = useRef<CloudItem[]>(createInitialClouds());
  const lastUiUpdateRef = useRef<number>(0);

  // Game lifecycle state
  const [gameState, setGameState] = useState<GameState>('ready');
  const [countdownNum, setCountdownNum] = useState<number>(3);
  const [showWebcamPip, setShowWebcamPip] = useState<boolean>(false);

  const [sensitivity, setSensitivity] = useState<SteeringSensitivity>('normal');
  useEffect(() => {
    trackerInstanceRef.current.sensitivity = sensitivity;
  }, [sensitivity]);

  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  useEffect(() => {
    trackerInstanceRef.current.soundEnabled = soundEnabled;
  }, [soundEnabled]);

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
    feedbackMessage: 'Center head and turn smoothly to steer the glider!',
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

  // Countdown timer handler
  useEffect(() => {
    if (gameState !== 'countdown') return;

    if (soundEnabled) {
      playCountdownBeep(countdownNum === 1);
    }

    if (countdownNum > 1) {
      const timer = setTimeout(() => {
        setCountdownNum((prev) => prev - 1);
      }, 1000);
      return () => clearTimeout(timer);
    } else {
      const timer = setTimeout(() => {
        setGameState('playing');
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [gameState, countdownNum, soundEnabled]);

  const handleStartGame = useCallback(() => {
    trackerInstanceRef.current.reset();
    particlesRef.current = [];
    floatingTextsRef.current = [];
    setCountdownNum(3);
    setGameState('countdown');
  }, []);

  const handleRestartGame = useCallback(() => {
    trackerInstanceRef.current.reset();
    particlesRef.current = [];
    floatingTextsRef.current = [];
    setCountdownNum(3);
    setGameState('countdown');
  }, []);

  // Resize canvas to match display size
  const syncCanvasDimensions = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const targetW = Math.round(rect.width * dpr);
    const targetH = Math.round(rect.height * dpr);

    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }
  }, []);

  useEffect(() => {
    window.addEventListener('resize', syncCanvasDimensions);
    return () => window.removeEventListener('resize', syncCanvasDimensions);
  }, [syncCanvasDimensions]);

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

      syncCanvasDimensions();

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const landmarks = frame.pose;

      // Update state machine
      const updated = trackerInstanceRef.current.update(
        landmarks,
        now,
        (coinX, coinY, currentStreak) => {
          particlesRef.current.push(...createCoinBurst(coinX, coinY));
          floatingTextsRef.current.push(createFloatingScore(coinX, coinY, 50, currentStreak));
        }
      );

      // Add jet flame trail behind glider during gameplay
      if (gameState === 'playing' && updated.isTrackingValid) {
        particlesRef.current.push(
          ...createJetTrailParticles(
            trackerInstanceRef.current.drone.x,
            trackerInstanceRef.current.drone.y,
            trackerInstanceRef.current.drone.tiltAngle
          )
        );
      }

      // Check for level victory completion
      if (gameState === 'playing' && updated.coinsCollected >= TARGET_COINS_GOAL) {
        setGameState('completed');
        particlesRef.current.push(...createCelebrationConfetti());
      }

      // Throttle React state updates to keep 60fps canvas buttery smooth
      if (
        now - lastUiUpdateRef.current >= 80 ||
        updated.coinsCollected !== telemetry.coinsCollected ||
        updated.currentTurnDirection !== telemetry.currentTurnDirection
      ) {
        lastUiUpdateRef.current = now;
        setTelemetry(updated);
      }

      // Update background clouds
      updateClouds(cloudsRef.current);

      // Render full game scene
      const width = canvas.width;
      const height = canvas.height;
      const drone = trackerInstanceRef.current.drone;
      const coin = trackerInstanceRef.current.currentCoin;

      drawGameScene(
        ctx,
        width,
        height,
        drone,
        coin,
        particlesRef.current,
        floatingTextsRef.current,
        cloudsRef.current,
        gameState
      );

      // Clean up dead particles
      particlesRef.current = particlesRef.current.filter((p) => p.life < p.maxLife);
      floatingTextsRef.current = floatingTextsRef.current.filter((ft) => ft.life < ft.maxLife);
    },
  });

  // Calculate star rating (1 to 3 stars based on symmetry and target goal)
  const calculateStars = (): number => {
    if (telemetry.coinsCollected < TARGET_COINS_GOAL) return 1;
    if (telemetry.symmetryBalance >= 80) return 3;
    if (telemetry.symmetryBalance >= 60) return 2;
    return 1;
  };

  return (
    <div className="sky-glider-wrapper">
      {/* Hidden processing video element (runs in background without cluttering UI) */}
      <video
        ref={videoRef}
        className={`sky-glider-hidden-video ${showWebcamPip ? 'pip-visible' : ''}`}
        playsInline
        muted
        autoPlay
      />

      {/* Main Full-Screen Game Canvas */}
      <canvas ref={canvasRef} className="sky-glider-canvas" />

      {/* Camera Status Overlays */}
      {camera.status === 'idle' && (
        <CameraPermissionPrompt onEnable={() => void camera.start()} />
      )}
      {camera.status === 'starting' && <CameraBusy label="Calibrating vision sensors..." />}
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

      {/* Top Floating Arcade HUD (Active during gameplay) */}
      {gameState === 'playing' && (
        <div className="sky-glider-hud-top">
          {/* Target Coins Progress */}
          <div className="sky-glider-hud-pill">
            <Trophy className="w-4 h-4 text-amber-300" />
            <span className="font-bold">
              {telemetry.coinsCollected} / {telemetry.targetCoinsGoal}
            </span>
            <span className="text-xs text-sky-200 uppercase tracking-wider">SUNS</span>
          </div>

          {/* Current Score */}
          <div className="sky-glider-hud-pill score-pill">
            <span className="text-xs text-amber-200">SCORE</span>
            <span className="font-black text-amber-300 text-lg tracking-wide">
              {telemetry.totalScore}
            </span>
          </div>

          {/* Dynamic Streak Badge */}
          {telemetry.streak > 1 && (
            <div className="sky-glider-hud-pill streak-pill animate-bounce">
              <Flame className="w-4 h-4 text-orange-400" />
              <span className="font-bold text-orange-200">{telemetry.streak}x STREAK!</span>
            </div>
          )}

          {/* Quick Controls & PIP toggle */}
          <div className="sky-glider-hud-controls">
            <button
              type="button"
              className="sky-glider-icon-btn"
              onClick={() => setShowWebcamPip((prev) => !prev)}
              title={showWebcamPip ? 'Hide Webcam PIP' : 'Show Webcam PIP'}
            >
              {showWebcamPip ? <CameraOff className="w-4 h-4" /> : <Camera className="w-4 h-4" />}
            </button>

            <button
              type="button"
              className="sky-glider-icon-btn"
              onClick={() => setSoundEnabled((prev) => !prev)}
              title={soundEnabled ? 'Mute Audio' : 'Enable Audio'}
            >
              {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>

            <button
              type="button"
              className="sky-glider-icon-btn"
              onClick={handleRestartGame}
              title="Restart Game"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Live Minimal Coaching Banner */}
      {gameState === 'playing' && (
        <div className="sky-glider-coaching-banner">
          <Sparkles className="w-4 h-4 text-amber-300 flex-shrink-0 animate-spin" />
          <span>{telemetry.feedbackMessage}</span>
          <span className="sky-glider-target-indicator">
            {telemetry.targetSide === 'left' ? '⬅️ GLIDE LEFT' : 'GLIDE RIGHT ➡️'}
          </span>
        </div>
      )}

      {/* START / READY MISSION SCREEN */}
      {gameState === 'ready' && (
        <div className="sky-glider-modal-overlay">
          <div className="sky-glider-card start-card">
            <div className="sky-glider-badge-tag">REHABILITATION ARCADE</div>
            <h1 className="sky-glider-title">Sky Glider: Aero Quest</h1>
            <p className="sky-glider-subtitle">
              Active cervical lateral rotation rehab. Smoothly rotate your head left and right to steer your glider craft and collect glowing sun coins!
            </p>

            <div className="sky-glider-preview-box">
              <div className="sky-glider-instruction-item">
                <span className="icon">⬅️</span>
                <span>Turn head <strong>LEFT</strong> to glide left</span>
              </div>
              <div className="sky-glider-instruction-item">
                <span className="icon">➡️</span>
                <span>Turn head <strong>RIGHT</strong> to glide right</span>
              </div>
              <div className="sky-glider-instruction-item">
                <span className="icon">🪙</span>
                <span>Collect <strong>{TARGET_COINS_GOAL}</strong> alternating sun coins to win!</span>
              </div>
            </div>

            {/* Posture alignment readiness indicator */}
            <div className="sky-glider-alignment-status">
              <ShieldCheck
                className={`w-5 h-5 ${
                  telemetry.isTrackingValid ? 'text-emerald-400' : 'text-amber-400'
                }`}
              />
              <span>
                {telemetry.isTrackingValid
                  ? 'Head & Shoulders detected! Ready to take flight.'
                  : 'Align your head and upper body in front of camera to begin.'}
              </span>
            </div>

            {/* Sensitivity settings selector */}
            <div className="sky-glider-sensitivity-row">
              <span className="text-xs text-sky-200 uppercase font-semibold">Steering Sensitivity:</span>
              <div className="sky-glider-sens-pills">
                {(['low', 'normal', 'high'] as SteeringSensitivity[]).map((level) => (
                  <button
                    key={level}
                    type="button"
                    className={`sky-glider-sens-btn ${sensitivity === level ? 'active' : ''}`}
                    onClick={() => setSensitivity(level)}
                  >
                    {level.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              className="sky-glider-btn primary-btn pulse-glow"
              onClick={handleStartGame}
              disabled={!telemetry.isTrackingValid}
            >
              <Play className="w-5 h-5 fill-current" />
              <span>START FLIGHT</span>
            </button>
          </div>
        </div>
      )}

      {/* COUNTDOWN SCREEN */}
      {gameState === 'countdown' && (
        <div className="sky-glider-countdown-overlay">
          <div className="sky-glider-countdown-number animate-ping-once">
            {countdownNum}
          </div>
          <div className="sky-glider-countdown-text">PREPARE TO GLIDE!</div>
        </div>
      )}

      {/* MISSION COMPLETED / CELEBRATION SCREEN */}
      {gameState === 'completed' && (
        <div className="sky-glider-modal-overlay">
          <div className="sky-glider-card victory-card">
            <div className="sky-glider-badge-tag success">MISSION ACCOMPLISHED</div>
            <h2 className="sky-glider-victory-title">Flight Complete!</h2>

            {/* 3-Star Rating */}
            <div className="sky-glider-stars-row">
              {[1, 2, 3].map((star) => (
                <Award
                  key={star}
                  className={`w-10 h-10 ${
                    star <= calculateStars()
                      ? 'text-amber-400 fill-amber-400 drop-shadow-glow'
                      : 'text-slate-600'
                  }`}
                />
              ))}
            </div>

            <div className="sky-glider-final-score">
              <span className="text-xs text-slate-400 uppercase font-bold">TOTAL SCORE</span>
              <span className="text-4xl font-black text-amber-300">{telemetry.totalScore}</span>
            </div>

            {/* Background Clinical Telemetry Summary */}
            <div className="sky-glider-clinical-report">
              <div className="sky-glider-clinical-item">
                <span className="label">Left Rotation</span>
                <span className="value text-sky-400">{telemetry.peakLeftAngle}° Left</span>
              </div>
              <div className="sky-glider-clinical-item">
                <span className="label">Right Rotation</span>
                <span className="value text-emerald-400">{telemetry.peakRightAngle}° Right</span>
              </div>
              <div className="sky-glider-clinical-item">
                <span className="label">Bilateral Symmetry</span>
                <span className="value text-amber-400">{telemetry.symmetryBalance}%</span>
              </div>
              <div className="sky-glider-clinical-item">
                <span className="label">Suns Captured</span>
                <span className="value text-white">{telemetry.coinsCollected}</span>
              </div>
            </div>

            <div className="sky-glider-actions-row">
              <button
                type="button"
                className="sky-glider-btn primary-btn"
                onClick={handleRestartGame}
              >
                <RotateCcw className="w-4 h-4" />
                <span>FLY AGAIN</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ========================================================================== */
/* Custom Multi-Layered 2D Canvas Game Renderer                               */
/* ========================================================================== */

function drawGameScene(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  drone: DroneState,
  coin: TargetCoin,
  particles: NeckParticle[],
  floatingTexts: FloatingText[],
  clouds: CloudItem[],
  _gameState: GameState
): void {
  // Clear frame
  ctx.clearRect(0, 0, width, height);

  // 1. Draw Vibrant Sky Gradient (Deep azure to warm horizon)
  const skyGrad = ctx.createLinearGradient(0, 0, 0, height);
  skyGrad.addColorStop(0, '#0284c7'); // Rich Sky Blue
  skyGrad.addColorStop(0.45, '#38bdf8'); // Bright Cyan
  skyGrad.addColorStop(0.75, '#bae6fd'); // Warm Horizon Sky
  skyGrad.addColorStop(1, '#fed7aa'); // Sunset Horizon Tint
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, width, height);

  // 2. Draw Distant Radiant Sun Glow
  const sunX = width * 0.5;
  const sunY = height * 0.22;
  const sunGrad = ctx.createRadialGradient(sunX, sunY, 10, sunX, sunY, Math.min(width, height) * 0.35);
  sunGrad.addColorStop(0, 'rgba(254, 240, 138, 0.45)');
  sunGrad.addColorStop(0.5, 'rgba(253, 224, 71, 0.15)');
  sunGrad.addColorStop(1, 'rgba(253, 224, 71, 0)');
  ctx.fillStyle = sunGrad;
  ctx.fillRect(0, 0, width, height);

  // 3. Draw Parallax Floating Clouds
  for (const c of clouds) {
    const cx = c.x * width;
    const cy = c.y * height;
    ctx.save();
    ctx.fillStyle = `rgba(255, 255, 255, ${c.opacity})`;
    ctx.beginPath();
    ctx.arc(cx, cy, c.height * 0.5, 0, Math.PI * 2);
    ctx.arc(cx + c.width * 0.25, cy - c.height * 0.2, c.height * 0.65, 0, Math.PI * 2);
    ctx.arc(cx + c.width * 0.55, cy - c.height * 0.15, c.height * 0.55, 0, Math.PI * 2);
    ctx.arc(cx + c.width * 0.8, cy, c.height * 0.45, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // 4. Draw Distant Mountain Silhouettes & Horizon
  drawMountainRidges(ctx, width, height);

  // 5. Draw Flight Horizon Guide Track
  const laneY = drone.y * height;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(0.06 * width, laneY);
  ctx.lineTo(0.94 * width, laneY);
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
  ctx.setLineDash([16, 12]);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  // 6. Draw Rotating Glowing Target Sun Coin
  drawTargetSunCoin(ctx, width, height, coin);

  // 7. Draw Sky Glider Aircraft with Dynamic Tilt
  drawSkyGlider(ctx, width, height, drone);

  // 8. Draw All Visual Particles (Explosions, Jet Trails)
  for (const p of particles) {
    p.x += p.vx;
    p.y += p.vy;
    p.life += 1;
    p.alpha = Math.max(0, 1 - p.life / p.maxLife);

    ctx.save();
    ctx.beginPath();
    ctx.arc(p.x * width, p.y * height, p.size, 0, Math.PI * 2);
    ctx.fillStyle = p.color;
    ctx.globalAlpha = p.alpha;
    ctx.shadowColor = p.color;
    ctx.shadowBlur = 10;
    ctx.fill();
    ctx.restore();
  }

  // 9. Draw Floating Score & Streak Texts
  for (const ft of floatingTexts) {
    ft.y -= 0.0014;
    ft.life += 1;
    ft.alpha = Math.max(0, 1 - ft.life / ft.maxLife);

    ctx.save();
    ctx.translate(ft.x * width, ft.y * height);
    ctx.font = 'bold 24px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillStyle = ft.color;
    ctx.globalAlpha = ft.alpha;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
    ctx.shadowBlur = 8;
    ctx.textAlign = 'center';
    ctx.fillText(ft.text, 0, 0);
    ctx.restore();
  }
}

/** Draw layered rolling hills and mountain ridges */
function drawMountainRidges(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  // Distant mountain ridge (violet-blue)
  ctx.save();
  ctx.fillStyle = 'rgba(71, 85, 105, 0.25)';
  ctx.beginPath();
  ctx.moveTo(0, height * 0.72);
  ctx.lineTo(width * 0.15, height * 0.62);
  ctx.lineTo(width * 0.35, height * 0.68);
  ctx.lineTo(width * 0.55, height * 0.60);
  ctx.lineTo(width * 0.75, height * 0.66);
  ctx.lineTo(width * 0.9, height * 0.58);
  ctx.lineTo(width, height * 0.65);
  ctx.lineTo(width, height);
  ctx.lineTo(0, height);
  ctx.closePath();
  ctx.fill();

  // Foreground rolling hills (soft emerald-slate)
  ctx.fillStyle = 'rgba(15, 118, 110, 0.2)';
  ctx.beginPath();
  ctx.moveTo(0, height * 0.82);
  ctx.quadraticCurveTo(width * 0.25, height * 0.72, width * 0.5, height * 0.82);
  ctx.quadraticCurveTo(width * 0.75, height * 0.90, width, height * 0.8);
  ctx.lineTo(width, height);
  ctx.lineTo(0, height);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** Draw radiant golden sun coin with pulsating rings and emblem */
function drawTargetSunCoin(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  coin: TargetCoin
): void {
  const cx = coin.x * width;
  const cy = coin.y * height;
  const cr = coin.radius * Math.min(width, height);
  const now = performance.now() * 0.003;
  const pulse = Math.sin(now) * 0.15 + 1;

  ctx.save();

  // Outer glowing pulse ring
  ctx.beginPath();
  ctx.arc(cx, cy, cr * 1.45 * pulse, 0, Math.PI * 2);
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(251, 191, 36, 0.6)';
  ctx.shadowColor = '#f59e0b';
  ctx.shadowBlur = 18;
  ctx.stroke();

  // Concentric sun disk
  const coinGrad = ctx.createRadialGradient(cx - cr * 0.35, cy - cr * 0.35, cr * 0.1, cx, cy, cr);
  coinGrad.addColorStop(0, '#fef08a');
  coinGrad.addColorStop(0.65, '#f59e0b');
  coinGrad.addColorStop(1, '#b45309');

  ctx.beginPath();
  ctx.arc(cx, cy, cr, 0, Math.PI * 2);
  ctx.fillStyle = coinGrad;
  ctx.fill();

  ctx.lineWidth = 2.5;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();

  // Golden rays surrounding the sun coin
  const rays = 8;
  ctx.strokeStyle = '#fef08a';
  ctx.lineWidth = 2;
  for (let i = 0; i < rays; i++) {
    const angle = (Math.PI * 2 * i) / rays + now * 0.5;
    const r1 = cr * 1.05;
    const r2 = cr * 1.25;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(angle) * r1, cy + Math.sin(angle) * r1);
    ctx.lineTo(cx + Math.cos(angle) * r2, cy + Math.sin(angle) * r2);
    ctx.stroke();
  }

  // Radiant star emblem inside coin
  ctx.font = `bold ${Math.round(cr * 0.9)}px sans-serif`;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
  ctx.shadowBlur = 4;
  ctx.fillText('★', cx, cy + 1);

  ctx.restore();
}

/** Draw sleek futuristic Sky Glider aircraft with banking roll */
function drawSkyGlider(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  drone: DroneState
): void {
  const dx = drone.x * width;
  const dy = drone.y * height;
  const size = drone.radius * Math.min(width, height) * 1.6;

  ctx.save();
  ctx.translate(dx, dy);
  ctx.rotate(drone.tiltAngle);

  // Glider energy aura
  ctx.shadowColor = '#0284c7';
  ctx.shadowBlur = 20;

  // 1. Aerodynamic Wings (swept back)
  ctx.beginPath();
  ctx.moveTo(0, -size * 0.85); // Nose tip
  ctx.lineTo(size * 1.6, size * 0.55); // Right wing tip
  ctx.lineTo(size * 0.35, size * 0.35); // Right inner wing
  ctx.lineTo(0, size * 0.7); // Tail center
  ctx.lineTo(-size * 0.35, size * 0.35); // Left inner wing
  ctx.lineTo(-size * 1.6, size * 0.55); // Left wing tip
  ctx.closePath();

  const wingGrad = ctx.createLinearGradient(-size, 0, size, 0);
  wingGrad.addColorStop(0, '#0369a1');
  wingGrad.addColorStop(0.5, '#0284c7');
  wingGrad.addColorStop(1, '#0369a1');
  ctx.fillStyle = wingGrad;
  ctx.fill();

  ctx.lineWidth = 2;
  ctx.strokeStyle = '#38bdf8';
  ctx.stroke();

  // 2. Wingtip Energy Beacons
  ctx.fillStyle = '#fde047';
  ctx.shadowColor = '#f59e0b';
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.arc(-size * 1.55, size * 0.52, 3.5, 0, Math.PI * 2);
  ctx.arc(size * 1.55, size * 0.52, 3.5, 0, Math.PI * 2);
  ctx.fill();

  // 3. Central Fuselage
  ctx.beginPath();
  ctx.ellipse(0, 0, size * 0.28, size * 0.7, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#0f172a';
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#38bdf8';
  ctx.stroke();

  // 4. Cockpit Glass Canopy
  ctx.beginPath();
  ctx.ellipse(0, -size * 0.15, size * 0.18, size * 0.36, 0, 0, Math.PI * 2);
  const cockpitGrad = ctx.createLinearGradient(0, -size * 0.4, 0, size * 0.1);
  cockpitGrad.addColorStop(0, '#bae6fd');
  cockpitGrad.addColorStop(1, '#0284c7');
  ctx.fillStyle = cockpitGrad;
  ctx.fill();

  ctx.restore();
}
