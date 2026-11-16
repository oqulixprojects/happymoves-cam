import { useRef, useState, useEffect } from 'react';
import {
  Activity,
  RotateCcw,
  Timer,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';
import { useCamera } from '@/hooks/useCamera';
import { useTracker } from '@/hooks/useTracker';
import { CameraBusy, CameraErrorOverlay, CameraPermissionPrompt } from '@/components/camera/CameraOverlays';
import { describeCameraError } from '@/services/camera/errorMessages';
import { describeTrackerError } from '@/services/tracking/errorMessages';
import { calculateJointAngle, KneeRehabTracker } from './analytics';
import type { TrackedLeg, GoniometerAnalytics } from './types';
import './goniometer.css';

export default function KneeGoniometerModule() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [selectedLeg, setSelectedLeg] = useState<TrackedLeg>('auto');
  const trackerRef = useRef<KneeRehabTracker>(new KneeRehabTracker());

  const [analytics, setAnalytics] = useState<GoniometerAnalytics>({
    activeLeg: 'right',
    currentAngle: 90,
    targetAngle: 150,
    minAngle: 90,
    maxAngle: 180,
    repCount: 0,
    repState: 'resting',
    holdProgressPercent: 0,
    currentHoldSeconds: 0,
    requiredHoldSeconds: 2.5,
    qualityScore: 100,
    historyAngles: [],
    reps: [],
    feedbackMessage: 'Position yourself seated so your legs are visible in frame.',
  });

  const camera = useCamera(videoRef);
  const tracker = useTracker({
    kind: 'pose',
    videoRef,
    canvasRef,
    enabled: camera.status === 'active',
    onFrame: (frame) => {
      if (!frame.pose || frame.pose.length < 33) return;

      const landmarks = frame.pose;
      // Left: Hip 23, Knee 25, Ankle 27
      // Right: Hip 24, Knee 26, Ankle 28
      const lHip = landmarks[23];
      const lKnee = landmarks[25];
      const lAnkle = landmarks[27];

      const rHip = landmarks[24];
      const rKnee = landmarks[26];
      const rAnkle = landmarks[28];

      const leftAngle = calculateJointAngle(lHip, lKnee, lAnkle);
      const rightAngle = calculateJointAngle(rHip, rKnee, rAnkle);

      const leftConf = (lKnee.visibility ?? 1) * 0.5 + (lAnkle.visibility ?? 1) * 0.5;
      const rightConf = (rKnee.visibility ?? 1) * 0.5 + (rAnkle.visibility ?? 1) * 0.5;

      const updated = trackerRef.current.update(
        leftAngle,
        rightAngle,
        leftConf,
        rightConf,
        selectedLeg,
        performance.now()
      );

      setAnalytics(updated);

      // Custom clinical canvas drawing overlay (Goniometer angle arc and ray vectors)
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const width = canvas.width;
      const height = canvas.height;

      const activeKnee = updated.activeLeg === 'left' ? lKnee : rKnee;
      const activeHip = updated.activeLeg === 'left' ? lHip : rHip;
      const activeAnkle = updated.activeLeg === 'left' ? lAnkle : rAnkle;

      const kx = activeKnee.x * width;
      const ky = activeKnee.y * height;
      const hx = activeHip.x * width;
      const hy = activeHip.y * height;
      const ax = activeAnkle.x * width;
      const ay = activeAnkle.y * height;

      // Draw goniometer lines
      ctx.save();
      ctx.lineWidth = 5;
      ctx.strokeStyle = updated.currentAngle >= 150 ? '#10b981' : '#38bdf8';
      ctx.lineCap = 'round';

      ctx.beginPath();
      ctx.moveTo(hx, hy);
      ctx.lineTo(kx, ky);
      ctx.lineTo(ax, ay);
      ctx.stroke();

      // Draw Joint Pivot Node
      ctx.beginPath();
      ctx.arc(kx, ky, 10, 0, 2 * Math.PI);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = updated.currentAngle >= 150 ? '#10b981' : '#0284c7';
      ctx.stroke();

      // Draw Angle Badge on screen near knee
      ctx.font = 'bold 16px Inter, sans-serif';
      const labelText = `${updated.currentAngle}°`;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.roundRect?.(kx + 15, ky - 20, 60, 30, 8);
      ctx.fill();
      ctx.fillStyle = updated.currentAngle >= 150 ? '#34d399' : '#38bdf8';
      ctx.fillText(labelText, kx + 25, ky + 1);

      ctx.restore();
    },
  });

  const handleResetSession = () => {
    trackerRef.current.reset();
    setAnalytics((prev) => ({
      ...prev,
      repCount: 0,
      repState: 'resting',
      holdProgressPercent: 0,
      currentHoldSeconds: 0,
      qualityScore: 100,
      reps: [],
      feedbackMessage: 'Session reset. Ready for next set!',
    }));
  };

  useEffect(() => {
    if (camera.status === 'idle') {
      camera.start();
    }
  }, [camera]);

  const anglePercent = Math.min(
    100,
    Math.max(0, ((analytics.currentAngle - 90) / (180 - 90)) * 100)
  );

  return (
    <div className="goniometer-container">
      {/* Top Header */}
      <div className="goniometer-header">
        <div className="goniometer-title-group">
          <h2>
            <Activity className="w-5 h-5 text-sky-600" />
            Clinical Knee Goniometer & Mobility
          </h2>
          <p>Real-time computer vision joint telemetry, hold duration tracking, and rehabilitation analytics</p>
        </div>

        <div className="goniometer-controls">
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
            onClick={handleResetSession}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset
          </button>
        </div>
      </div>

      {/* Main Layout Grid */}
      <div className="goniometer-layout">
        {/* Left: Camera Feed & Tracking Viewport */}
        <div className="goniometer-viewport">
          <video
            ref={videoRef}
            className="goniometer-video"
            playsInline
            muted
            autoPlay
          />
          <canvas ref={canvasRef} className="goniometer-canvas" />

          {/* Camera Status Overlay */}
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

          {/* Active Leg Badge */}
          <div className="goniometer-overlay-badge">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>Tracking: {analytics.activeLeg.toUpperCase()} KNEE</span>
            <span className="text-sky-300 font-bold ml-1">{analytics.currentAngle}°</span>
          </div>

          {/* Live Coaching & Feedback Banner */}
          <div className="goniometer-feedback-banner">
            <Sparkles className="w-4 h-4 text-sky-400 flex-shrink-0" />
            <span>{analytics.feedbackMessage}</span>
          </div>
        </div>

        {/* Right: Clinical Analytics & Metrics Dashboard */}
        <div className="analytics-panel">
          {/* Key Stats Cards */}
          <div className="stats-grid">
            <div className="stat-card">
              <span className="stat-label">Reps Completed</span>
              <div className="stat-value">
                {analytics.repCount}
                <span className="stat-unit">reps</span>
              </div>
              <div className="stat-indicator optimal">
                {analytics.repState === 'holding' ? 'Holding Peak' : 'Active Set'}
              </div>
            </div>

            <div className="stat-card">
              <span className="stat-label">Quality Score</span>
              <div className="stat-value">
                {analytics.qualityScore}
                <span className="stat-unit">%</span>
              </div>
              <div className="stat-indicator active">
                Clinical Form
              </div>
            </div>
          </div>

          {/* Live Goniometer ROM Gauge */}
          <div className="gauge-card">
            <div className="gauge-header">
              <h3>Live Knee Angle (ROM)</h3>
              <span className="gauge-target-badge">Goal: ≥ 150°</span>
            </div>

            <div className="gauge-track">
              <div
                className="gauge-fill"
                style={{ width: `${anglePercent}%` }}
              />
            </div>

            <div className="gauge-scale">
              <span>90° (Flexed)</span>
              <span className="font-semibold text-sky-600">{analytics.currentAngle}° Current</span>
              <span>180° (Straight)</span>
            </div>
          </div>

          {/* Hold Progress Timer */}
          <div className="hold-timer-section">
            <div className="hold-header">
              <span className="flex items-center gap-1.5">
                <Timer className="w-4 h-4 text-sky-600" />
                Hold Timer (2.5s Target)
              </span>
              <strong>{analytics.currentHoldSeconds}s / 2.5s</strong>
            </div>

            <div className="hold-track">
              <div
                className="hold-fill"
                style={{ width: `${analytics.holdProgressPercent}%` }}
              />
            </div>
          </div>

          {/* Session Repetitions History */}
          <div className="rep-log-card">
            <div className="flex items-center justify-between mb-3">
              <h3>Session Telemetry Log</h3>
              <span className="text-xs text-slate-500 font-medium">
                {analytics.reps.length} tracked
              </span>
            </div>

            <div className="rep-log-list">
              {analytics.reps.length === 0 ? (
                <div className="text-xs text-slate-400 py-4 text-center">
                  No reps recorded yet. Extend leg forward to begin!
                </div>
              ) : (
                analytics.reps.map((r) => (
                  <div
                    key={r.id}
                    className={`rep-item ${r.targetAchieved ? '' : 'missed'}`}
                  >
                    <div>
                      <div className="rep-item-title">
                        Rep #{r.id} ({r.leg.toUpperCase()})
                      </div>
                      <div className="rep-item-stats">
                        Peak: {r.peakAngle}° | Hold: {r.holdTimeSeconds}s
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {r.targetAchieved ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      ) : (
                        <span className="text-xs text-amber-500 font-medium">Sub-target</span>
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
