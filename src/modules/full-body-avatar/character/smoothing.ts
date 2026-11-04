import type { Landmark } from '@/services/tracking/types';

export class LandmarkSmoother {
  private smoothed: Landmark[] = [];
  private readonly defaultAlpha: number;

  constructor(alpha = 0.38) {
    this.defaultAlpha = alpha;
  }

  /**
   * Smooths incoming raw landmarks.
   * Dynamically adjusts alpha based on velocity to keep fast movements snappy
   * and subtle movements rock-solid without camera shaking.
   */
  smooth(raw: Landmark[] | undefined): Landmark[] | null {
    if (!raw || raw.length === 0) return this.smoothed.length > 0 ? this.smoothed : null;

    if (this.smoothed.length !== raw.length) {
      // First frame initialize
      this.smoothed = raw.map((l) => ({ ...l }));
      return this.smoothed;
    }

    this.smoothed = raw.map((curr, i) => {
      const prev = this.smoothed[i];
      if (!prev) return { ...curr };

      // Distance moved in normalized coords
      const dx = curr.x - prev.x;
      const dy = curr.y - prev.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Adaptive alpha: snap quickly if moving fast (>0.05 units), smooth heavily if stationary (<0.005)
      const dynamicAlpha = Math.min(0.85, Math.max(this.defaultAlpha, dist * 8));

      return {
        x: prev.x + (curr.x - prev.x) * dynamicAlpha,
        y: prev.y + (curr.y - prev.y) * dynamicAlpha,
        z: prev.z + (curr.z - prev.z) * dynamicAlpha,
        visibility: curr.visibility,
      };
    });

    return this.smoothed;
  }

  reset(): void {
    this.smoothed = [];
  }
}
