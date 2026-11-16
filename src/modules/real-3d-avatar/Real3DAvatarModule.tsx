import { useRef, useEffect, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  UserCheck,
  Sparkles,
  RotateCcw,
  Video,
  Compass,
  FlipHorizontal,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { useCamera } from '@/hooks/useCamera';
import { useTracker } from '@/hooks/useTracker';
import { CameraBusy, CameraErrorOverlay, CameraPermissionPrompt } from '@/components/camera/CameraOverlays';
import { describeCameraError } from '@/services/camera/errorMessages';
import { describeTrackerError } from '@/services/tracking/errorMessages';
import { RealAvatarRigController } from './rigController';
import './avatar3d.css';

export default function Real3DAvatarModule() {
  const mountRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const cameraCanvasRef = useRef<HTMLCanvasElement>(null);

  const [loadingModel, setLoadingModel] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [trackingActive, setTrackingActive] = useState(false);
  const [mirrorMode, setMirrorMode] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const controllerRef = useRef<RealAvatarRigController | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);

  const camera = useCamera(videoRef);
  const tracker = useTracker({
    kind: 'pose',
    videoRef,
    canvasRef: cameraCanvasRef,
    enabled: camera.status === 'active',
    onFrame: (frame) => {
      if (frame.pose && frame.pose.length >= 33 && controllerRef.current) {
        controllerRef.current.updatePose(frame.pose, frame.poseWorld);
        setTrackingActive(true);
      }
    },
  });

  useEffect(() => {
    if (camera.status === 'idle') {
      camera.start();
    }
  }, [camera]);

  // Three.js Scene Setup & 3D Character Loading
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || 500;
    const height = container.clientHeight || 400;

    // 1. Scene, Camera, Renderer
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.background = new THREE.Color(0x0a0f1d);

    const perspCamera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    perspCamera.position.set(0, 1.4, 3.2);
    cameraRef.current = perspCamera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    rendererRef.current = renderer;

    container.appendChild(renderer.domElement);
    renderer.domElement.className = 'real-3d-canvas';

    // 2. Lighting & Environment
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.4);
    dirLight.position.set(3, 8, 5);
    dirLight.castShadow = true;
    scene.add(dirLight);

    const fillLight = new THREE.DirectionalLight(0x38bdf8, 0.6);
    fillLight.position.set(-3, 3, -2);
    scene.add(fillLight);

    // Floor Grid / Platform
    const grid = new THREE.GridHelper(10, 20, 0x38bdf8, 0x1e293b);
    grid.position.y = 0;
    scene.add(grid);

    // Controls
    const controls = new OrbitControls(perspCamera, renderer.domElement);
    controls.target.set(0, 1.0, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2 + 0.05; // don't go below ground

    // 3. Load Real Rigged 3D Character
    const loader = new GLTFLoader();
    loader.load(
      '/models/human_rig.glb',
      (gltf) => {
        const model = gltf.scene;
        model.scale.set(1.0, 1.0, 1.0);
        model.position.set(0, 0, 0);

        model.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });

        scene.add(model);
        controllerRef.current = new RealAvatarRigController(model, { mirror: mirrorMode });
        setLoadingModel(false);
      },
      undefined,
      (err) => {
        console.error('Error loading 3D avatar:', err);
        setLoadError('Failed to load real 3D avatar.');
        setLoadingModel(false);
      }
    );

    // 4. Render Animation Loop
    let animationFrameId: number;
    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, perspCamera);
    };
    animate();

    // Resize Handler
    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      perspCamera.aspect = w / h;
      perspCamera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  // Handle Fullscreen Resize Dynamic Trigger
  useEffect(() => {
    const timer = setTimeout(() => {
      const container = mountRef.current;
      const renderer = rendererRef.current;
      const perspCamera = cameraRef.current;
      if (!container || !renderer || !perspCamera) return;

      const w = container.clientWidth;
      const h = container.clientHeight;
      perspCamera.aspect = w / h;
      perspCamera.updateProjectionMatrix();
      renderer.setSize(w, h);
    }, 50);

    return () => clearTimeout(timer);
  }, [isFullscreen]);

  const handleReset = () => {
    if (controllerRef.current) {
      controllerRef.current.reset();
    }
  };

  const toggleMirror = () => {
    setMirrorMode((prev) => {
      const next = !prev;
      if (controllerRef.current) {
        controllerRef.current.mirror = next;
      }
      return next;
    });
  };

  const toggleFullscreen = () => {
    setIsFullscreen((prev) => !prev);
  };

  return (
    <div className="real-avatar-container">
      {/* Header */}
      <div className="real-avatar-header">
        <div className="real-avatar-title">
          <h2>
            <UserCheck className="w-5 h-5 text-sky-500" />
            Live 3D Realistic Character Tracking
          </h2>
          <p>
            Real anatomical 3D skeletal mesh animated in real time using your body movements
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={toggleFullscreen}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 transition-colors shadow-sm"
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            {isFullscreen ? 'Exit Fullscreen' : 'Full Screen'}
          </button>

          <button
            onClick={toggleMirror}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
              mirrorMode
                ? 'bg-sky-50 text-sky-700 border-sky-200'
                : 'bg-slate-100 text-slate-700 border-slate-200'
            }`}
          >
            <FlipHorizontal className="w-3.5 h-3.5" />
            Mirror: {mirrorMode ? 'ON' : 'OFF'}
          </button>

          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors border border-slate-200"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset T-Pose
          </button>
        </div>
      </div>

      {/* Viewport Grid: Real 3D Mesh on Left, WebCam Vision on Right */}
      <div className="real-avatar-grid">
        {/* 3D Character Viewport */}
        <div
          className={`viewport-card ${isFullscreen ? 'is-fullscreen' : ''}`}
          ref={mountRef}
        >
          {/* Top Left Badge */}
          <div className="view-badge">
            <Sparkles className="w-4 h-4 text-sky-400" />
            <span>3D Physical Rig (WebGL)</span>
          </div>

          {/* Top Right Quick Controls in Fullscreen */}
          <div className="absolute top-4 right-4 z-[100001] flex items-center gap-2">
            <button
              onClick={toggleFullscreen}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-slate-900/80 hover:bg-slate-800 rounded-lg border border-slate-700 backdrop-blur transition-colors"
            >
              {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              {isFullscreen ? 'Exit Fullscreen' : 'Full Screen'}
            </button>
          </div>

          {loadingModel && (
            <div className="status-indicator">
              <span>Loading 3D Human Skeletal Mesh...</span>
            </div>
          )}

          {loadError && (
            <div className="status-indicator text-rose-400">
              <span>{loadError}</span>
            </div>
          )}

          <div className="absolute bottom-3 left-4 text-[11px] text-slate-400 bg-slate-900/80 px-2.5 py-1 rounded backdrop-blur border border-slate-700 flex items-center gap-1 z-10">
            <Compass className="w-3 h-3 text-sky-400" /> Drag to rotate 360° · Scroll to zoom
          </div>

          {/* Picture-in-picture camera view inside fullscreen */}
          {isFullscreen && (
            <div className="fullscreen-pip-cam">
              <video
                ref={(el) => {
                  if (el && videoRef.current && el.srcObject !== videoRef.current.srcObject) {
                    el.srcObject = videoRef.current.srcObject;
                  }
                }}
                className="real-camera-video"
                playsInline
                muted
                autoPlay
              />
              <div className="view-badge !top-2 !left-2 !text-[10px] !py-0.5 !px-1.5">
                <Video className="w-3 h-3 text-emerald-400" />
                <span>Webcam</span>
              </div>
            </div>
          )}
        </div>

        {/* Video Camera & MediaPipe Vision Pose Viewport (Default split view) */}
        <div className="viewport-card">
          <video ref={videoRef} className="real-camera-video" playsInline muted autoPlay />
          <canvas ref={cameraCanvasRef} className="real-camera-canvas" />

          {/* Camera Status */}
          {camera.status === 'idle' && <CameraPermissionPrompt onEnable={() => camera.start()} />}
          {camera.status === 'starting' && <CameraBusy label="Starting vision camera..." />}
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

          <div className="view-badge">
            <Video className="w-4 h-4 text-emerald-400" />
            <span>AI Motion Capture</span>
          </div>

          <div className="status-indicator">
            {trackingActive ? (
              <span className="text-emerald-400 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                Live: Mirroring Your Arms, Spine & Leg Movement in 3D
              </span>
            ) : (
              <span>Stand in frame so full body is visible to animate character</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
