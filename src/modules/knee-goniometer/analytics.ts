import type { Landmark } from '@/services/tracking/types';
import type { RepState, RepetitionLog, TrackedLeg } from './types';

/**
 * 3-point planar angle calculation (Hip -> Knee -> Ankle).
 * Returns the interior knee angle in degrees (90° flexed, ~170-180° full extension).
 */
export function calculateJointAngle(hip: Landmark, knee: Landmark, ankle: Landmark): number {
  const v1 = { x: hip.x - knee.x, y: hip.y - knee.y };
  const v2 = { x: ankle.x - knee.x, y: ankle.y - knee.y };

  const dot = v1.x * v2.x + v1.y * v2.y;
  const mag1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y);
  const mag2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y);

  if (mag1 === 0 || mag2 === 0) return 90;
  const cos = Math.max(-1, Math.min(1, dot / (mag1 * mag2)));
  return Math.round((Math.acos(cos) * 180) / Math.PI);
}

export class KneeRehabTracker {
  private targetExtensionAngle = 150; // Clinical extension goal threshold
  private flexedThreshold = 105;      // Return threshold to reset rep
  private requiredHoldSec = 2.5;      // Required sustained hold time in seconds

  private state: RepState = 'resting';
  private holdStartTime: number | null = null;
  private currentHoldSec = 0;
  private peakAngleInRep = 0;
  private repCounter = 0;
  private repsHistory: RepetitionLog[] = [];
  private angleBuffer: number[] = [];

  public update(
    leftAngle: number,
    rightAngle: number,
    leftConfidence: number,
    rightConfidence: number,
    userSelectedLeg: TrackedLeg,
    now: number
  ) {
    // Determine active leg
    let activeLeg: 'left' | 'right' = 'right';
    if (userSelectedLeg === 'left') {
      activeLeg = 'left';
    } else if (userSelectedLeg === 'right') {
      activeLeg = 'right';
    } else {
      // Auto: select leg with greater range/confidence or active extension
      activeLeg = (leftAngle > rightAngle && leftConfidence > 0.4) || rightConfidence < 0.3 ? 'left' : 'right';
    }

    const currentAngle = activeLeg === 'left' ? leftAngle : rightAngle;

    // Maintain recent history (last 30 samples)
    this.angleBuffer.push(currentAngle);
    if (this.angleBuffer.length > 30) this.angleBuffer.shift();

    let feedback = 'Sit comfortably and extend your knee forward.';

    // State machine for Clinical Extension & Hold Timer
    if (currentAngle < this.flexedThreshold) {
      if (this.state === 'holding' || this.state === 'extending') {
        // Returned to flexed position
        if (this.currentHoldSec >= this.requiredHoldSec || this.peakAngleInRep >= this.targetExtensionAngle) {
          this.repCounter++;
          this.repsHistory.unshift({
            id: this.repCounter,
            leg: activeLeg,
            peakAngle: this.peakAngleInRep,
            holdTimeSeconds: Number(this.currentHoldSec.toFixed(1)),
            targetAchieved: this.peakAngleInRep >= this.targetExtensionAngle,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          });
          feedback = 'Rep completed! Great job.';
        }
      }
      this.state = 'flexed';
      this.holdStartTime = null;
      this.currentHoldSec = 0;
      this.peakAngleInRep = currentAngle;
      feedback = 'Ready: Kick leg out gently towards 160°';
    } else if (currentAngle >= this.targetExtensionAngle) {
      // In target extension zone
      this.peakAngleInRep = Math.max(this.peakAngleInRep, currentAngle);

      if (!this.holdStartTime) {
        this.holdStartTime = now;
        this.state = 'holding';
      }

      const elapsed = (now - this.holdStartTime) / 1000;
      this.currentHoldSec = Math.min(elapsed, this.requiredHoldSec);

      if (this.currentHoldSec >= this.requiredHoldSec) {
        feedback = 'Perfect hold! Now lower slowly back down.';
        this.state = 'holding';
      } else {
        const remaining = (this.requiredHoldSec - this.currentHoldSec).toFixed(1);
        feedback = `Hold knee steady! ${remaining}s remaining...`;
        this.state = 'holding';
      }
    } else if (currentAngle >= this.flexedThreshold && currentAngle < this.targetExtensionAngle) {
      // Extending or lowering
      this.peakAngleInRep = Math.max(this.peakAngleInRep, currentAngle);
      if (this.state === 'holding') {
        feedback = 'Lowering leg... Return to start for next rep.';
        this.state = 'retracting';
      } else {
        feedback = `Push a bit further! Reach ${this.targetExtensionAngle}°`;
        this.state = 'extending';
      }
    }

    const holdProgressPercent = Math.min(100, Math.round((this.currentHoldSec / this.requiredHoldSec) * 100));

    // Quality Score calculation based on target hit & hold compliance
    let qualityScore = 100;
    if (this.repsHistory.length > 0) {
      const successfulReps = this.repsHistory.filter((r) => r.targetAchieved && r.holdTimeSeconds >= 2.0).length;
      qualityScore = Math.round((successfulReps / this.repsHistory.length) * 100);
    }

    return {
      activeLeg,
      currentAngle,
      targetAngle: this.targetExtensionAngle,
      minAngle: 90,
      maxAngle: 180,
      repCount: this.repCounter,
      repState: this.state,
      holdProgressPercent,
      currentHoldSeconds: Number(this.currentHoldSec.toFixed(1)),
      requiredHoldSeconds: this.requiredHoldSec,
      qualityScore,
      historyAngles: [...this.angleBuffer],
      reps: [...this.repsHistory],
      feedbackMessage: feedback,
    };
  }

  public reset() {
    this.state = 'resting';
    this.holdStartTime = null;
    this.currentHoldSec = 0;
    this.peakAngleInRep = 0;
    this.repCounter = 0;
    this.repsHistory = [];
    this.angleBuffer = [];
  }
}
