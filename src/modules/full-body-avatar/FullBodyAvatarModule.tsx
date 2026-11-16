import { useRef, useState, useEffect, useMemo } from 'react';
import {
  Camera,
  VideoOff,
  ArrowLeft,
  Compass,
  Sparkles,
  BarChart2,
  X,
  Maximize2,
  Eye,
  EyeOff,
} from 'lucide-react';
import { useCamera } from '@/hooks/useCamera';
import { useTracker } from '@/hooks/useTracker';
import type { OverlayStyle } from '@/services/tracking/drawing';
import { CameraBusy, CameraErrorOverlay, CameraPermissionPrompt } from '@/components/camera/CameraOverlays';
import { describeCameraError } from '@/services/camera/errorMessages';
import { describeTrackerError } from '@/services/tracking/errorMessages';
import { KinematicsPanel } from './components/KinematicsPanel';
import { computeBodyKinematics } from './character/kinematics';
import './avatar.css';

export interface SkeletonTheme {
  id: string;
  name: string;
  color: string;
  line: string;
  point: string;
}

export const SKELETON_THEMES: SkeletonTheme[] = [
  {
    id: 'cyan',
    name: 'Neon Cyan',
    color: '#2dd4bf',
    line: 'rgba(45, 212, 191, 0.95)',
    point: '#ffffff',
  },
  {
    id: 'blue',
    name: 'Electric Sky',
    color: '#38bdf8',
    line: 'rgba(56, 189, 248, 0.95)',
    point: '#ffffff',
  },
  {
    id: 'green',
    name: 'Clinical Emerald',
    color: '#22c55e',
    line: 'rgba(34, 197, 94, 0.95)',
    point: '#ffffff',
  },
  {
    id: 'violet',
    name: 'Cyber Violet',
    color: '#c084fc',
    line: 'rgba(192, 132, 252, 0.95)',
    point: '#ffffff',
  },
  {
    id: 'amber',
    name: 'Solar Amber',
    color: '#fbbf24',
    line: 'rgba(251, 191, 36, 0.95)',
    point: '#ffffff',
  },
  {
    id: 'rose',
    name: 'Vibrant Coral',
    color: '#fb7185',
    line: 'rgba(251, 113, 133, 0.95)',
    point: '#ffffff',
  },
];

export default function FullBodyAvatarModule() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [isFullScreen, setIsFullScreen] = useState(false);
  const [mirrored, setMirrored] = useState(true);
  const [showVideo, setShowVideo] = useState(true);
  const [themeId, setThemeId] = useState('cyan');
  const [showMetricsSheet, setShowMetricsSheet] = useState(false);

  const selectedTheme = SKELETON_THEMES.find((t) => t.id === themeId) ?? SKELETON_THEMES[0];

  const overlayStyle = useMemo<OverlayStyle>(
    () => ({
      line: selectedTheme.line,
      point: selectedTheme.point,
      lineWidth: 3.5,
      pointRadius: 4.5,
    }),
    [selectedTheme],
  );

  const camera = useCamera(videoRef);
  const cameraActive = camera.status === 'active';
  const tracker = useTracker({
    kind: 'pose',
    videoRef,
    canvasRef,
    enabled: cameraActive,
    overlayStyle,
  });
  const tracking = cameraActive && tracker.status === 'running';

  // Kinematics derived at throttled frame rate (125ms = ~8Hz) so React doesn't re-render at 60 FPS
  const kinematics = useMemo(() => {
    return tracker.frame?.pose ? computeBodyKinematics(tracker.frame.pose) : null;
  }, [tracker.frame?.pose]);

  // Automatically enter full screen mobile mode when starting tracking
  const startTracking = async () => {
    setIsFullScreen(true);
    await camera.start(camera.deviceId);
  };

  const stopTracking = () => {
    camera.stop();
    setIsFullScreen(false);
    setShowMetricsSheet(false);
  };

  const handleBackFromFullScreen = () => {
    setIsFullScreen(false);
    setShowMetricsSheet(false);
    camera.stop();
  };

  // Lock body scroll in fullscreen mobile view
  useEffect(() => {
    if (isFullScreen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isFullScreen]);

  let overlay: React.ReactNode = null;
  if (camera.status === 'idle') {
    overlay = <CameraPermissionPrompt onEnable={() => void startTracking()} />;
  } else if (camera.status === 'starting') {
    overlay = <CameraBusy label="Connecting optical camera sensor…" />;
  } else if (camera.status === 'error' && camera.error) {
    overlay = (
      <CameraErrorOverlay
        guidance={describeCameraError(camera.error)}
        onRetry={() => void startTracking()}
      />
    );
  } else if (tracker.status === 'loading') {
    overlay = <CameraBusy label="Loading MediaPipe tracking models…" />;
  } else if (tracker.status === 'error' && tracker.error) {
    overlay = <CameraErrorOverlay guidance={describeTrackerError(tracker.error)} onRetry={tracker.retry} />;
  }

  // -------------------------------------------------------------
  // RENDER (Unified stage keeps <video> and <canvas> permanently mounted)
  // -------------------------------------------------------------
  return (
    <div className={`avatar-module-flow ${isFullScreen ? 'avatar-module-flow--fullscreen' : ''}`}>
      {/* Overview Intro (Only visible when not full-screen) */}
      {!isFullScreen && (
        <div className="module-intro">
          <h1 className="module-intro__title">Full Body Tracking</h1>
          <p className="module-intro__desc">
            Stand back 6–8 ft. Real-time body pose tracking.
          </p>
        </div>
      )}

      {/* Main Unified Tracking Stage (Switches to full-screen mobile on start) */}
      <div
        className={`tracking-stage-container ${
          isFullScreen ? 'tracking-stage-container--fullscreen' : ''
        } ${mirrored ? 'tracking-stage--mirrored' : ''} ${
          !showVideo ? 'tracking-stage--pure-skeleton' : ''
        }`}
      >
        {/* Live Camera Video Feed */}
        <video
          ref={videoRef}
          className="tracking-stage__video"
          muted
          playsInline
        />

        {/* Real-time Native MediaPipe Canvas Lines (60 FPS requestAnimationFrame) */}
        <canvas
          ref={canvasRef}
          className="tracking-stage__canvas"
          aria-hidden="true"
        />

        {/* Live Tracking Status Tag in Overview mode */}
        {!isFullScreen && (
          <div className="preview-stage-badge">
            <span className={`status-dot ${tracking ? 'status-dot--active' : ''}`} />
            <span>
              {tracking
                ? `MediaPipe Tracking Active · ${tracker.fps} FPS (33 Landmarks)`
                : cameraActive
                ? 'Stand in Camera View (6–8 ft)'
                : 'Sensor Idle'}
            </span>
          </div>
        )}

        {/* FULLSCREEN TOP BAR (With Back Button on Top Left) */}
        {isFullScreen && (
          <header className="fullscreen-top-bar">
            {/* Back button on top left */}
            <button
              type="button"
              className="fullscreen-top-back-btn"
              onClick={handleBackFromFullScreen}
              aria-label="Back to overview"
            >
              <ArrowLeft size={18} />
              <span>Back</span>
            </button>

            {/* Center Status Badge */}
            <div className="fullscreen-top-status">
              <span className={`status-dot ${tracking ? 'status-dot--active' : ''}`} />
              <span>
                {tracking
                  ? `MediaPipe Tracking Active · ${tracker.fps} FPS`
                  : 'Stand in Frame (6–8 ft)'}
              </span>
            </div>

            {/* Top Right Toggle: Camera Background vs Pure Skeleton */}
            <div className="fullscreen-top-right">
              <button
                type="button"
                className={`fullscreen-icon-btn ${showVideo ? 'fullscreen-icon-btn--active' : ''}`}
                onClick={() => setShowVideo((v) => !v)}
                title={showVideo ? 'Pure Skeleton Mode (Hide Camera Video)' : 'Overlay Mode (Show Camera Video)'}
                aria-label="Toggle camera video background"
              >
                {showVideo ? <Eye size={18} /> : <EyeOff size={18} />}
              </button>
            </div>
          </header>
        )}

        {/* FULLSCREEN BOTTOM FLOATING BAR */}
        {isFullScreen && (
          <footer className="fullscreen-bottom-bar">
            {/* Theme Color Picker Dots */}
            <div className="fullscreen-themes-row">
              {SKELETON_THEMES.map((theme) => {
                const isSelected = themeId === theme.id;
                return (
                  <button
                    key={theme.id}
                    type="button"
                    className={`fs-color-dot-btn ${isSelected ? 'fs-color-dot-btn--active' : ''}`}
                    onClick={() => setThemeId(theme.id)}
                    aria-label={theme.name}
                    title={theme.name}
                  >
                    <span
                      className="fs-color-swatch"
                      style={{ backgroundColor: theme.color }}
                    />
                  </button>
                );
              })}
            </div>

            {/* Mirror Toggle */}
            <button
              type="button"
              className={`fs-tool-btn ${mirrored ? 'fs-tool-btn--active' : ''}`}
              onClick={() => setMirrored((prev) => !prev)}
              title="Mirror Mode"
            >
              <Compass size={16} />
              <span>Mirror</span>
            </button>

            {/* Metrics Toggle */}
            <button
              type="button"
              className={`fs-tool-btn ${showMetricsSheet ? 'fs-tool-btn--active' : ''}`}
              onClick={() => setShowMetricsSheet((prev) => !prev)}
              title="Live Joint Angles"
            >
              <BarChart2 size={16} />
              <span>Metrics</span>
            </button>

            {/* Stop Button */}
            <button
              type="button"
              className="fs-stop-btn"
              onClick={stopTracking}
              title="Stop Tracking"
            >
              <VideoOff size={16} />
              <span>Stop</span>
            </button>
          </footer>
        )}

        {/* Slide-up Kinematics Bottom Sheet in Fullscreen */}
        {isFullScreen && showMetricsSheet && (
          <div className="fullscreen-metrics-sheet">
            <div className="fullscreen-sheet-header">
              <span className="fullscreen-sheet-title">Live Anatomical Angles</span>
              <button
                type="button"
                className="fullscreen-sheet-close"
                onClick={() => setShowMetricsSheet(false)}
                aria-label="Close metrics"
              >
                <X size={18} />
              </button>
            </div>
            <KinematicsPanel kinematics={kinematics} tracking={tracking} />
          </div>
        )}

        {/* Overlay Slot (Permissions, Loading, Errors) */}
        {overlay && <div className="tracking-stage-overlay">{overlay}</div>}
      </div>

      {/* OVERVIEW CONTENT (Only rendered when not full-screen) */}
      {!isFullScreen && (
        <>
          {/* Start / Resume Action Bar */}
          <div className="avatar-action-bar">
            {cameraActive ? (
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  type="button"
                  className="btn btn--primary btn--full btn--lg"
                  onClick={() => setIsFullScreen(true)}
                >
                  <Maximize2 size={18} />
                  <span>Resume Tracking</span>
                </button>
                <button
                  type="button"
                  className="btn btn--danger btn--lg"
                  onClick={stopTracking}
                  style={{ width: 'auto', padding: '0.9rem 1.25rem' }}
                  title="Stop Camera"
                >
                  <VideoOff size={18} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="btn btn--primary btn--full btn--lg"
                onClick={() => void startTracking()}
                disabled={camera.status === 'starting'}
              >
                <Camera size={18} />
                <span>Start Tracking</span>
              </button>
            )}
          </div>

          {/* Controls: Color Theme, Mirror, Background */}
          <div className="avatar-controls-panel">
            <div className="control-group">
              <label className="control-group__label">
                <Sparkles size={15} />
                <span>Tracking Line Color</span>
              </label>
              <div className="outfit-themes-row">
                {SKELETON_THEMES.map((theme) => {
                  const isSelected = themeId === theme.id;
                  return (
                    <button
                      key={theme.id}
                      type="button"
                      className={`outfit-theme-pill ${isSelected ? 'outfit-theme-pill--active' : ''}`}
                      onClick={() => setThemeId(theme.id)}
                    >
                      <span
                        className="outfit-theme-color-dot"
                        style={{ backgroundColor: theme.color }}
                      />
                      <span>{theme.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="avatar-toggles-grid">
              <label className="avatar-checkbox-label">
                <input
                  type="checkbox"
                  checked={mirrored}
                  onChange={(e) => setMirrored(e.target.checked)}
                />
                <Compass size={15} />
                <span>Mirror Mode</span>
              </label>

              <label className="avatar-checkbox-label">
                <input
                  type="checkbox"
                  checked={showVideo}
                  onChange={(e) => setShowVideo(e.target.checked)}
                />
                <Eye size={15} />
                <span>Camera Video Feed</span>
              </label>
            </div>
          </div>

          {/* Kinematics Telemetry Panel */}
          <KinematicsPanel kinematics={kinematics} tracking={tracking} />
        </>
      )}
    </div>
  );
}
