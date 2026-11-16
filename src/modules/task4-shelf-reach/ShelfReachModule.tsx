import { useRef, useState, useEffect, useCallback } from 'react';
import {
  RotateCcw,
  Volume2,
  VolumeX,
  CheckCircle2,
  Trophy,
  Gauge,
  Layers,
  Save,
  Sparkles,
  Package,
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
  ShelfReachTracker,
  createShelfBurst,
  createFloatingText,
  loadResultsFromStorage,
  saveResultsToStorage,
} from './analytics';
import type {
  TrackedArm,
  ShelfParticle,
  FloatingText,
  ShelfReachTelemetry,
  StoredShelfReachData,
  PantryItem,
  ShelfSlot,
} from './types';
import './shelfReach.css';

export default function ShelfReachModule() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const trackerInstanceRef = useRef<ShelfReachTracker>(new ShelfReachTracker());
  const particlesRef = useRef<ShelfParticle[]>([]);
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

  const [savedSession, setSavedSession] = useState<StoredShelfReachData | null>(() =>
    loadResultsFromStorage()
  );
  const [showSavedToast, setShowSavedToast] = useState<boolean>(false);

  const [telemetry, setTelemetry] = useState<ShelfReachTelemetry>({
    activeArm: 'right',
    currentReachPercent: 0,
    maxReachHeightPercent: 0,
    leftPeakReachPercent: 0,
    rightPeakReachPercent: 0,
    bilateralSymmetryPercent: 100,
    itemsArranged: 0,
    totalAttempts: 0,
    reachSpeed: 0,
    totalScore: 0,
    streak: 0,
    feedbackMessage: 'Stand or sit so your hips, shoulders, and arms are visible.',
    isHoldingItem: false,
    heldItemName: 'None',
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
      currentReachPercent: 0,
      maxReachHeightPercent: 0,
      leftPeakReachPercent: 0,
      rightPeakReachPercent: 0,
      bilateralSymmetryPercent: 100,
      itemsArranged: 0,
      totalAttempts: 0,
      reachSpeed: 0,
      totalScore: 0,
      streak: 0,
      feedbackMessage: 'Session reset. Touch item on counter to pick it up!',
      reps: [],
      isHoldingItem: false,
      heldItemName: 'None',
      isTrackingValid: false,
    });
  }, []);

  const handleManualSave = useCallback(() => {
    const data: StoredShelfReachData = {
      lastSessionDate: new Date().toISOString(),
      itemsArranged: telemetry.itemsArranged,
      maxReachHeightPercent: telemetry.maxReachHeightPercent,
      bilateralSymmetry: telemetry.bilateralSymmetryPercent,
      avgReachSpeed: telemetry.reachSpeed,
      totalScore: telemetry.totalScore,
      repsCount: telemetry.reps.length,
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

      // Update state machine
      const updated = trackerInstanceRef.current.update(
        landmarks,
        selectedArmRef.current,
        now,
        (snapX, snapY) => {
          particlesRef.current.push(...createShelfBurst(snapX, snapY, '#34d399'));
          floatingTextsRef.current.push(createFloatingText(snapX, snapY, 'PLACED! +100', '#34d399'));
        }
      );

      // Throttle React state updates to ~10 Hz
      if (
        now - lastUiUpdateRef.current >= 95 ||
        updated.itemsArranged !== telemetry.itemsArranged ||
        updated.isHoldingItem !== telemetry.isHoldingItem
      ) {
        lastUiUpdateRef.current = now;
        setTelemetry(updated);
      }

      // Draw custom 2D vector shelf layers
      const width = canvas.width;
      const height = canvas.height;
      const currentItem = trackerInstanceRef.current.currentItem;
      const targetSlot = trackerInstanceRef.current.targetSlot;

      drawShelfLayers(
        ctx,
        width,
        height,
        currentItem,
        targetSlot,
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

  const gaugePercent = Math.min(100, Math.max(0, (telemetry.currentReachPercent / 120) * 100));

  return (
    <div className="shelf-reach-container">
      {/* Header bar */}
      <div className="shelf-reach-header">
        <div className="shelf-reach-title-group">
          <h2>
            <Package className="w-5 h-5 text-sky-600" />
            2D Shelf Item Organizer (Shoulder Reaching)
          </h2>
          <p>
            Multi-tier active arm elevation, functional shoulder flexion/abduction, and vertical reaching
          </p>
        </div>

        <div className="shelf-reach-controls">
          {/* Arm selector */}
          <div className="shelf-reach-arm-selector">
            <button
              type="button"
              className={`shelf-reach-arm-btn ${selectedArm === 'auto' ? 'active' : ''}`}
              onClick={() => setSelectedArm('auto')}
            >
              Auto Arm
            </button>
            <button
              type="button"
              className={`shelf-reach-arm-btn ${selectedArm === 'left' ? 'active' : ''}`}
              onClick={() => setSelectedArm('left')}
            >
              Left Arm
            </button>
            <button
              type="button"
              className={`shelf-reach-arm-btn ${selectedArm === 'right' ? 'active' : ''}`}
              onClick={() => setSelectedArm('right')}
            >
              Right Arm
            </button>
          </div>

          {/* Sound toggle */}
          <button
            type="button"
            className="shelf-reach-action-btn"
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
            className="shelf-reach-action-btn"
            onClick={handleResetSession}
            title="Reset current session"
          >
            <RotateCcw className="w-3.5 h-3.5 text-slate-600" />
            <span>Reset</span>
          </button>

          {/* Manual Save button */}
          <button
            type="button"
            className="shelf-reach-action-btn primary"
            onClick={handleManualSave}
            title="Persist results to storage"
          >
            <Save className="w-3.5 h-3.5" />
            <span>Save Set</span>
          </button>
        </div>
      </div>

      {/* Main Layout Grid */}
      <div className="shelf-reach-layout">
        {/* Left: Viewport & Canvas Overlay */}
        <div className="shelf-reach-viewport">
          <video
            ref={videoRef}
            className="shelf-reach-video"
            playsInline
            muted
            autoPlay
          />
          <canvas ref={canvasRef} className="shelf-reach-canvas" />

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
          <div className="shelf-reach-overlay-badge">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                telemetry.isTrackingValid ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
              }`}
            />
            <span>TRACKING: {telemetry.activeArm.toUpperCase()} ARM</span>
            <span className="text-sky-300 font-bold ml-1">
              Reach: {telemetry.currentReachPercent}%
            </span>
          </div>

          {/* Score Badge */}
          <div className="shelf-reach-score-badge">
            <Trophy className="w-4 h-4 text-amber-400" />
            <span>{telemetry.itemsArranged} Arranged</span>
            <span className="text-xs text-emerald-400 ml-1 font-bold">
              ({telemetry.totalScore} PTS)
            </span>
          </div>

          {/* Live Coaching & Guidance Banner */}
          <div className="shelf-reach-feedback-banner">
            <Sparkles className="w-4 h-4 text-sky-400 flex-shrink-0 animate-spin" />
            <span>{telemetry.feedbackMessage}</span>
          </div>
        </div>

        {/* Right: Telemetry Dashboard */}
        <div className="shelf-reach-telemetry">
          {/* Key Stats Cards Grid */}
          <div className="shelf-reach-stats-grid">
            {/* Max Vertical Reach Height */}
            <div className="shelf-reach-stat-card">
              <span className="shelf-reach-stat-label">Max Vertical Reach</span>
              <div className="shelf-reach-stat-value">
                {telemetry.maxReachHeightPercent}
                <span className="shelf-reach-stat-unit">%</span>
              </div>
              <div className="shelf-reach-stat-sub">
                Above Shoulder Baseline
              </div>
            </div>

            {/* Bilateral Symmetry */}
            <div className="shelf-reach-stat-card">
              <span className="shelf-reach-stat-label">Bilateral Symmetry</span>
              <div className="shelf-reach-stat-value">
                {telemetry.bilateralSymmetryPercent}
                <span className="shelf-reach-stat-unit">%</span>
              </div>
              <div className="shelf-reach-stat-sub">
                L: {telemetry.leftPeakReachPercent}% | R: {telemetry.rightPeakReachPercent}%
              </div>
            </div>

            {/* Items Arranged */}
            <div className="shelf-reach-stat-card">
              <span className="shelf-reach-stat-label">Items Arranged</span>
              <div className="shelf-reach-stat-value">
                {telemetry.itemsArranged}
                <span className="shelf-reach-stat-unit">/ 10</span>
              </div>
              <div className="shelf-reach-stat-sub neutral">
                Held: {telemetry.heldItemName}
              </div>
            </div>

            {/* Reach Speed */}
            <div className="shelf-reach-stat-card">
              <span className="shelf-reach-stat-label flex items-center gap-1">
                <Gauge className="w-3 h-3 text-slate-400" />
                Reach Velocity
              </span>
              <div className="shelf-reach-stat-value">
                {telemetry.reachSpeed}
                <span className="shelf-reach-stat-unit">m/s</span>
              </div>
              <div className="shelf-reach-stat-sub">
                Vertical Arm Speed
              </div>
            </div>
          </div>

          {/* Live Vertical Reach Height Gauge */}
          <div className="shelf-reach-gauge-card">
            <div className="shelf-reach-gauge-header">
              <h3>Live Vertical Reach Height</h3>
              <span className="shelf-reach-gauge-badge">
                {telemetry.currentReachPercent >= 80
                  ? 'HIGH SHELF ZONE'
                  : telemetry.currentReachPercent >= 30
                  ? 'MID SHELF ZONE'
                  : 'COUNTER LEVEL'}
              </span>
            </div>

            <div className="shelf-reach-gauge-track">
              <div
                className="shelf-reach-gauge-fill"
                style={{ width: `${gaugePercent}%` }}
              />
            </div>

            <div className="shelf-reach-gauge-markers">
              <span>0% (Shoulder)</span>
              <span className="font-semibold text-sky-600">
                {telemetry.currentReachPercent}% Current
              </span>
              <span>120% (High Reach)</span>
            </div>
          </div>

          {/* 3-Tier Shelf Levels Indicator */}
          <div className="shelf-reach-tiers-card">
            <h3>Pantry Shelf Tiers</h3>
            <div className="shelf-reach-tiers-grid">
              <div className="shelf-reach-tier-item">
                <span className="shelf-reach-tier-name">Counter</span>
                <span className="shelf-reach-tier-sub">Pickup Zone</span>
              </div>
              <div
                className={`shelf-reach-tier-item ${
                  telemetry.currentReachPercent >= 30 && telemetry.currentReachPercent < 80 ? 'active' : ''
                }`}
              >
                <span className="shelf-reach-tier-name">Mid Shelf</span>
                <span className="shelf-reach-tier-sub">Eye Level (~40%)</span>
              </div>
              <div
                className={`shelf-reach-tier-item ${
                  telemetry.currentReachPercent >= 80 ? 'active' : ''
                }`}
              >
                <span className="shelf-reach-tier-name">High Shelf</span>
                <span className="shelf-reach-tier-sub">Overhead (&gt;80%)</span>
              </div>
            </div>
          </div>

          {/* Session Repetitions Telemetry Log */}
          <div className="shelf-reach-log-card">
            <div className="shelf-reach-log-header">
              <h3>Session Telemetry Log</h3>
              <span className="text-xs text-slate-500 font-medium">
                {telemetry.reps.length} arranged items
              </span>
            </div>

            <div className="shelf-reach-log-list">
              {telemetry.reps.length === 0 ? (
                <div className="text-xs text-slate-400 py-4 text-center">
                  No items placed yet. Reach down to counter to pick up an item!
                </div>
              ) : (
                telemetry.reps.map((rep) => (
                  <div key={rep.id} className="shelf-reach-log-item">
                    <div className="shelf-reach-log-item-details">
                      <div className="shelf-reach-log-item-title">
                        #{rep.id} · {rep.itemName} ({rep.arm.toUpperCase()})
                      </div>
                      <div className="shelf-reach-log-item-meta">
                        Placed on: {rep.targetShelf.toUpperCase()} Shelf | Reach: {rep.reachHeightPercent}% | Speed: {rep.reachVelocity} m/s
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
          <div className="shelf-reach-stored-card">
            <div className="flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-slate-500" />
              <span>
                {showSavedToast
                  ? 'Data successfully saved to localStorage!'
                  : savedSession
                  ? `Last session: ${savedSession.itemsArranged} items placed (${savedSession.maxReachHeightPercent}% Peak Reach)`
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
/* Custom 2D Flat Pantry Shelf Canvas Renderer                                */
/* ========================================================================== */

function drawShelfLayers(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  item: PantryItem,
  slot: ShelfSlot,
  telemetry: ShelfReachTelemetry,
  particles: ShelfParticle[],
  floatingTexts: FloatingText[],
  landmarks?: { x: number; y: number }[]
): void {
  // 1. Draw 3-Tier 2D Flat Shelves
  const shelfYPositions = [
    { label: 'HIGH SHELF', y: 0.22, height: 14 },
    { label: 'MID SHELF', y: 0.50, height: 14 },
    { label: 'BOTTOM COUNTER', y: 0.82, height: 18 },
  ];

  ctx.save();
  shelfYPositions.forEach((sh) => {
    const sy = sh.y * height;
    // Wooden / clean modern shelf board
    const shelfGrad = ctx.createLinearGradient(0, sy, width, sy);
    shelfGrad.addColorStop(0, 'rgba(51, 65, 85, 0.85)');
    shelfGrad.addColorStop(0.5, 'rgba(71, 85, 105, 0.95)');
    shelfGrad.addColorStop(1, 'rgba(51, 65, 85, 0.85)');

    ctx.fillStyle = shelfGrad;
    ctx.fillRect(0, sy, width, sh.height);

    // Shelf top highlight
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.fillRect(0, sy, width, 2);

    // Shelf Label (flipped horizontally for mirrored canvas)
    ctx.save();
    ctx.translate(60, sy + sh.height / 2);
    ctx.scale(-1, 1);
    ctx.font = 'bold 11px Inter, sans-serif';
    ctx.fillStyle = '#cbd5e1';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(sh.label, 0, 0);
    ctx.restore();
  });
  ctx.restore();

  // 2. Draw Target Dashed Slot on the requested shelf
  const slotX = slot.x * width;
  const slotY = slot.y * height;
  const slotW = slot.width * width;
  const slotH = slot.height * height;

  ctx.save();
  ctx.beginPath();
  ctx.roundRect?.(slotX - slotW / 2, slotY - slotH + 10, slotW, slotH, 8);
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#34d399';
  ctx.setLineDash([8, 6]);
  ctx.stroke();
  ctx.setLineDash([]);

  // Slot glow
  ctx.fillStyle = 'rgba(16, 185, 129, 0.15)';
  ctx.fill();

  // Slot prompt label
  ctx.save();
  ctx.translate(slotX, slotY - slotH / 2);
  ctx.scale(-1, 1);
  ctx.font = 'bold 12px Inter, sans-serif';
  ctx.fillStyle = '#34d399';
  ctx.textAlign = 'center';
  ctx.fillText('PLACE HERE', 0, 0);
  ctx.restore();

  ctx.restore();

  // 3. Draw 2D Illustrated Pantry Item
  const ix = item.x * width;
  const iy = item.y * height;
  const iw = item.width * width;
  const ih = item.height * height;

  ctx.save();
  // Item body
  ctx.fillStyle = item.color;
  ctx.shadowColor = item.color;
  ctx.shadowBlur = item.isHeld ? 16 : 8;
  ctx.beginPath();
  ctx.roundRect?.(ix - iw / 2, iy - ih + 10, iw, ih, 8);
  ctx.fill();

  // Border
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();

  // Item Emoji & Name (flipped horizontally so it reads normally)
  ctx.save();
  ctx.translate(ix, iy - ih / 2 + 5);
  ctx.scale(-1, 1);
  ctx.font = '22px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(item.emoji, 0, -8);
  ctx.font = 'bold 11px Inter, sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(item.name, 0, 14);
  ctx.restore();

  ctx.restore();

  // 4. Draw Wrist Hand Cursor
  if (landmarks) {
    const isLeft = telemetry.activeArm === 'left';
    const wristIdx = isLeft ? 15 : 16;
    const wristPt = landmarks[wristIdx];

    if (wristPt) {
      const wx = wristPt.x * width;
      const wy = wristPt.y * height;

      ctx.save();
      ctx.beginPath();
      ctx.arc(wx, wy, 16, 0, Math.PI * 2);
      ctx.lineWidth = 3;
      ctx.strokeStyle = item.isHeld ? '#10b981' : '#38bdf8';
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(wx, wy, 5, 0, Math.PI * 2);
      ctx.fillStyle = item.isHeld ? '#10b981' : '#38bdf8';
      ctx.fill();

      // Tether line connecting wrist to held item
      if (item.isHeld) {
        ctx.beginPath();
        ctx.moveTo(wx, wy);
        ctx.lineTo(ix, iy);
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'rgba(52, 211, 153, 0.7)';
        ctx.stroke();
      }

      ctx.restore();
    }
  }

  // 5. Draw Particles
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

  // 6. Draw Floating Texts
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
