import { useEffect, useRef, type RefObject } from 'react';
import type { Landmark } from '@/services/tracking/types';
import { AvatarRenderer } from '../character/avatarRenderer';
import { LandmarkSmoother } from '../character/smoothing';
import { computeBodyKinematics } from '../character/kinematics';
import type { AvatarRenderOptions, BodyJointAngles } from '../character/types';
import '../avatar.css';

interface AvatarStageProps {
  landmarks: Landmark[] | undefined;
  options: AvatarRenderOptions;
  videoRef: RefObject<HTMLVideoElement | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  cameraActive: boolean;
  viewMode: 'avatar' | 'split' | 'pip' | 'fullscreen';
  isFullScreen?: boolean;
  onKinematicsUpdate?: (k: BodyJointAngles) => void;
}

export function AvatarStage({
  landmarks,
  options,
  videoRef,
  canvasRef,
  cameraActive,
  viewMode,
  isFullScreen = false,
  onKinematicsUpdate,
}: AvatarStageProps) {
  const avatarCanvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<AvatarRenderer>(new AvatarRenderer());
  const smootherRef = useRef<LandmarkSmoother>(new LandmarkSmoother(0.38));

  // Render loop whenever landmarks update
  useEffect(() => {
    const canvas = avatarCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Dynamically match canvas resolution to displayed container size
    const rect = canvas.getBoundingClientRect();
    const targetW = rect.width > 0 ? Math.round(rect.width) : 800;
    const targetH = rect.height > 0 ? Math.round(rect.height) : 600;

    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }

    const smoothed = smootherRef.current.smooth(landmarks);
    const kinematics = smoothed ? computeBodyKinematics(smoothed) : null;

    if (kinematics && onKinematicsUpdate) {
      onKinematicsUpdate(kinematics);
    }

    rendererRef.current.render(ctx, smoothed, kinematics, options);
  }, [landmarks, options, onKinematicsUpdate]);

  return (
    <div
      className={`avatar-stage-container avatar-stage--${viewMode} ${
        isFullScreen ? 'avatar-stage--fullscreen-active' : ''
      }`}
    >
      {/* Primary 2D Line Character Canvas */}
      <div className="avatar-canvas-wrapper">
        <canvas
          ref={avatarCanvasRef}
          className="avatar-canvas"
          aria-label="2D Line Character Avatar Stage"
        />

        {/* Live Tracking Status Tag (Only when not in full-screen) */}
        {!isFullScreen && (
          <div className="avatar-canvas-tag">
            <span className={`status-dot ${cameraActive && landmarks ? 'status-dot--active' : ''}`} />
            <span>
              {cameraActive
                ? landmarks
                  ? 'Line Character Active (10 Fingers & 10 Toes)'
                  : 'Awaiting Full Body Detection'
                : 'Sensor Idle'}
            </span>
          </div>
        )}
      </div>

      {/* Picture-in-Picture or Split Live Webcam Feed */}
      {(viewMode === 'split' || viewMode === 'pip' || isFullScreen) && (
        <div
          className={`camera-feed-box ${
            isFullScreen ? 'camera-feed-box--fullscreen-pip' : `camera-feed-box--${viewMode}`
          }`}
        >
          <div className="camera-feed-box__inner">
            <video
              ref={videoRef}
              className="camera-feed-video"
              muted
              playsInline
              style={{ transform: options.mirror ? 'scaleX(-1)' : 'none' }}
            />
            <canvas
              ref={canvasRef}
              className="camera-feed-canvas"
              style={{ transform: options.mirror ? 'scaleX(-1)' : 'none' }}
            />
            <span className="camera-feed-label">Live Camera Feed</span>
          </div>
        </div>
      )}
    </div>
  );
}
