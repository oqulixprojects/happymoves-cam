import type { PoseLandmarker } from '@mediapipe/tasks-vision';
import { MEDIAPIPE_CONFIG } from './config';
import { createWithDelegateFallback, loadVisionRuntime, resolveModelUrl } from './mediapipeLoader';
import type { Connection, Tracker, TrackingFrame } from './types';

/** Full-body pose tracking (33 landmarks). */
export class PoseTracker implements Tracker {
  readonly kind = 'pose' as const;
  readonly hiddenLandmarks: ReadonlySet<number> = new Set<number>();
  connections: Connection[] = [];

  private landmarker: PoseLandmarker | null = null;

  async init(): Promise<void> {
    const { vision, fileset } = await loadVisionRuntime();
    const { local, remote } = MEDIAPIPE_CONFIG.models.pose;
    const modelAssetPath = await resolveModelUrl(local, remote);

    this.landmarker = await createWithDelegateFallback((delegate) =>
      vision.PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath, delegate },
        runningMode: 'VIDEO',
        numPoses: MEDIAPIPE_CONFIG.numPoses,
      }),
    );

    // Full 33-point MediaPipe POSE_CONNECTIONS + head-to-shoulder connections
    const baseConnections = vision.PoseLandmarker.POSE_CONNECTIONS;
    this.connections = [
      ...baseConnections,
      { start: 0, end: 11 },
      { start: 0, end: 12 },
    ];
  }

  detect(video: HTMLVideoElement, timestampMs: number): TrackingFrame {
    const aspect = video.videoWidth && video.videoHeight ? video.videoWidth / video.videoHeight : 1;
    if (!this.landmarker) return { timestamp: timestampMs, aspect };
    const result = this.landmarker.detectForVideo(video, timestampMs);
    const first = result.landmarks[0];
    return {
      timestamp: timestampMs,
      aspect,
      pose: first?.map((l) => ({ x: l.x, y: l.y, z: l.z, visibility: l.visibility })),
    };
  }

  dispose(): void {
    this.landmarker?.close();
    this.landmarker = null;
  }
}
