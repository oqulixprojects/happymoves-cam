import type { Landmark } from "@/services/tracking/types";

import type {
  ShoulderSide,
  ShoulderRepState,
  ShoulderRepLog,
  ShoulderArcAnalytics,
} from "./types";

export function calculateShoulderAngle(
  hip: Landmark,
  shoulder: Landmark,
  wrist: Landmark,
): number {
  // direction form the shoulder to hip
  const v1 = {
    x: hip.x - shoulder.x,
    y: hip.y - shoulder.y,
  };

  // direction from the shoulder to wrist
  const v2 = {
    x: wrist.x - shoulder.x,
    y: wrist.y - shoulder.y,
  };

  // mathematical calulation used to fine the angle btwn 2 vectors
  const dot = v1.x * v2.x + v1.y * v2.y;

  // magnitude means the length of a vector
  const mag1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y);
  const mag2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y);

  if (mag1 === 0 || mag2 === 0) return 0;

  const cos = Math.max(-1, Math.min(1, dot / (mag1 * mag2)));

  // converts cosine into an angle in radius and converts radius into degrees
  return Math.round((Math.acos(cos) * 180) / Math.PI);
}

// calculateShoulderAngle

export function getReachedCheckpoints(angle: number): number[] {

  return [60, 90, 120].filter((checkpoint) => angle >= checkpoint);
}

export function calculateHoldProgress(holdTimeSeconds: number): number {
  const requiredHoldSeconds = 3;      

  const progress = (holdTimeSeconds / requiredHoldSeconds) * 100;   

  return Math.min(progress, 100);
}

export class ShoulderArcTracker {
  private requiredHoldSec = 3;
  private state: ShoulderRepState = "resting";
  private holdStartTime: number | null = null;
  private currentHoldSec = 0;
  private currentAngle = 0;
  private peakAngle = 0;
  private repCounter = 0;
  private previousAngle: number | null = null;
  private repsHistory: ShoulderRepLog[] = [];

  
update(angle: number, side: ShoulderSide, targetAngle: number = 90): void {
  this.currentAngle = angle;

  // 1. Detect movement direction
  const isRaising =
    this.previousAngle !== null && angle > this.previousAngle;

  const isLowering =
    this.previousAngle !== null && angle < this.previousAngle;

  // 2. Save current angle for the next comparison
  this.previousAngle = angle;

  // 3. Check whether the arm has reached the target
  if (angle < targetAngle) {
    if (this.state === "holding" || this.state === "completed") {
      this.state = angle > 10 ? "lowering" : "resting";
      this.holdStartTime = null;
      this.currentHoldSec = 0;
    } else if (angle <= 10) {
      this.state = "resting";
      this.peakAngle = 0;
      this.currentHoldSec = 0;
    } else if (isLowering) {
      this.state = "lowering";
    } else if (isRaising) {
      this.state = "raising";
    }

    if (angle <= 10) {
      this.peakAngle = 0;
      this.state = "resting";
    }

    return;
  }

  // 4. Track the highest angle
  this.peakAngle = Math.max(this.peakAngle, angle);

  // 5. Start holding
  if (this.state !== "holding" && this.state !== "completed") {
    this.state = "holding";
    this.holdStartTime = Date.now();
    this.currentHoldSec = 0;
  }

  // 6. Calculate holding time
  if (this.state === "holding" && this.holdStartTime !== null) {
    this.currentHoldSec =
      (Date.now() - this.holdStartTime) / 1000;

    if (this.currentHoldSec >= this.requiredHoldSec) {
      this.repCounter += 1;
      this.state = "completed";

      this.repsHistory.push({
        id: `${Date.now()}`,
        side,
        peakAngle: this.peakAngle,
        holdTimeSeconds: this.currentHoldSec,
        checkpointsReached: getReachedCheckpoints(this.peakAngle),
        timestamp: Date.now(),
      });
    }
  }
}


  getAnalytics(
    side: ShoulderSide,
    targetReps: number = 10,
  ): ShoulderArcAnalytics {
    return {
      activeSide: side,
      currentAngle: this.currentAngle,
      peakAngle: this.peakAngle,
      currentHoldSeconds: this.currentHoldSec,
      holdProgressPercent: calculateHoldProgress(this.currentHoldSec),
      repCount: this.repCounter,
      targetReps,
      repState: this.state,
      checkpoints: [60, 90, 120].map((angle) => ({
        angle,
        collected: getReachedCheckpoints(this.peakAngle).includes(angle),
      })),
      history: [...this.repsHistory],
      feedbackMessage:
        this.state === "holding"
          ? "Hold your arm in position"
          : this.state === "completed"
            ? "Great! Repetition completed"
            : this.state === "lowering"
              ? "Slowly lower your arm"
              : this.state === "raising"
                ? "Keep raising your arm"
                : "Rest and get ready",
    };
  }

  reset(): void {
    this.state = "resting";
    this.holdStartTime = null;
    this.currentHoldSec = 0;
    this.currentAngle = 0;
    this.peakAngle = 0;
    this.repCounter = 0;
    this.repsHistory = [];
  }
}
