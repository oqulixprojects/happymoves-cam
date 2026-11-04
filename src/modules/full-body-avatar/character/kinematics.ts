import type { Landmark } from '@/services/tracking/types';
import type { BodyJointAngles } from './types';

function distance(a: Landmark, b: Landmark): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Computes the interior angle at joint `b` between `a-b` and `b-c` in degrees (0–180°). */
export function calculateAngle(a: Landmark, b: Landmark, c: Landmark): number {
  const v1 = { x: a.x - b.x, y: a.y - b.y };
  const v2 = { x: c.x - b.x, y: c.y - b.y };

  const dot = v1.x * v2.x + v1.y * v2.y;
  const mag1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y);
  const mag2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y);

  if (mag1 === 0 || mag2 === 0) return 0;
  const cos = Math.max(-1, Math.min(1, dot / (mag1 * mag2)));
  return Math.round((Math.acos(cos) * 180) / Math.PI);
}

export function computeBodyKinematics(landmarks: Landmark[]): BodyJointAngles {
  // Indices from MediaPipe Pose 33-point model:
  // 11: L Shoulder, 12: R Shoulder
  // 13: L Elbow,    14: R Elbow
  // 15: L Wrist,    16: R Wrist
  // 17: L Pinky,    18: R Pinky
  // 19: L Index,    20: R Index
  // 21: L Thumb,    22: R Thumb
  // 23: L Hip,      24: R Hip
  // 25: L Knee,     26: R Knee
  // 27: L Ankle,    28: R Ankle
  // 29: L Heel,     30: R Heel
  // 31: L Foot Index (Toe), 32: R Foot Index (Toe)

  const ls = landmarks[11];
  const rs = landmarks[12];
  const le = landmarks[13];
  const re = landmarks[14];
  const lw = landmarks[15];
  const rw = landmarks[16];
  const lp = landmarks[17];
  const rp = landmarks[18];
  const li = landmarks[19];
  const ri = landmarks[20];
  const lt = landmarks[21];
  const rt = landmarks[22];

  const lh = landmarks[23];
  const rh = landmarks[24];
  const lk = landmarks[25];
  const rk = landmarks[26];
  const la = landmarks[27];
  const ra = landmarks[28];
  const lheel = landmarks[29];
  const rheel = landmarks[30];
  const ltoe = landmarks[31];
  const rtoe = landmarks[32];

  // Fallbacks if any landmark missing
  if (!ls || !rs || !lh || !rh) {
    return {
      leftShoulder: 0,
      rightShoulder: 0,
      leftElbow: 180,
      rightElbow: 180,
      leftHip: 180,
      rightHip: 180,
      leftKnee: 180,
      rightKnee: 180,
      leftAnkle: 90,
      rightAnkle: 90,
      spineTilt: 0,
      leftHandGrip: 0,
      rightHandGrip: 0,
      leftToeFlexion: 0,
      rightToeFlexion: 0,
      centerOfMass: { x: 0.5, y: 0.5 },
    };
  }

  // Elbow angles (Shoulder - Elbow - Wrist)
  const leftElbow = le && lw ? calculateAngle(ls, le, lw) : 180;
  const rightElbow = re && rw ? calculateAngle(rs, re, rw) : 180;

  // Shoulder abduction angles (Hip - Shoulder - Elbow)
  const leftShoulder = le ? calculateAngle(lh, ls, le) : 0;
  const rightShoulder = re ? calculateAngle(rh, rs, re) : 0;

  // Knee angles (Hip - Knee - Ankle)
  const leftKnee = lk && la ? calculateAngle(lh, lk, la) : 180;
  const rightKnee = rk && ra ? calculateAngle(rh, rk, ra) : 180;

  // Hip angles (Shoulder - Hip - Knee)
  const leftHip = lk ? calculateAngle(ls, lh, lk) : 180;
  const rightHip = rk ? calculateAngle(rs, rh, rk) : 180;

  // Ankle angles (Knee - Ankle - Toe)
  const leftAnkle = lk && la && ltoe ? calculateAngle(lk, la, ltoe) : 90;
  const rightAnkle = rk && ra && rtoe ? calculateAngle(rk, ra, rtoe) : 90;

  // Hand Grip Estimation: Ratio of (wrist-to-index distance) vs (elbow-to-wrist forearm length)
  let leftHandGrip = 0;
  if (lw && li && le) {
    const forearmLen = distance(le, lw);
    const handLen = distance(lw, li);
    const span = lp && lt ? distance(lp, lt) / (forearmLen || 1) : 0.3;
    const ratio = forearmLen > 0 ? handLen / forearmLen : 0.3;
    leftHandGrip = Math.max(0, Math.min(1, (0.35 - ratio * 0.7 - span * 0.3) / 0.2));
  }

  let rightHandGrip = 0;
  if (rw && ri && re) {
    const forearmLen = distance(re, rw);
    const handLen = distance(rw, ri);
    const span = rp && rt ? distance(rp, rt) / (forearmLen || 1) : 0.3;
    const ratio = forearmLen > 0 ? handLen / forearmLen : 0.3;
    rightHandGrip = Math.max(0, Math.min(1, (0.35 - ratio * 0.7 - span * 0.3) / 0.2));
  }

  // Toe / Foot Articulation: Heel vs Toe height relative to ankle
  // Positive value = Toe raised (dorsiflexion), Negative = Heel raised (plantarflexion)
  let leftToeFlexion = 0;
  if (lheel && ltoe) {
    // If heel is significantly higher (lower y in canvas) than toe => Heel raise
    const dy = ltoe.y - lheel.y; // positive when heel is higher than toe
    leftToeFlexion = Math.max(-1, Math.min(1, dy * 12));
  }

  let rightToeFlexion = 0;
  if (rheel && rtoe) {
    const dy = rtoe.y - rheel.y;
    rightToeFlexion = Math.max(-1, Math.min(1, dy * 12));
  }

  // Spine tilt angle from vertical
  const midShoulder = { x: (ls.x + rs.x) / 2, y: (ls.y + rs.y) / 2 };
  const midHip = { x: (lh.x + rh.x) / 2, y: (lh.y + rh.y) / 2 };
  const spineAngleRad = Math.atan2(midShoulder.x - midHip.x, -(midShoulder.y - midHip.y));
  const spineTilt = Math.round((spineAngleRad * 180) / Math.PI);

  // Center of mass (approximate mid-torso/pelvis)
  const centerOfMass = {
    x: (midShoulder.x * 0.4 + midHip.x * 0.6),
    y: (midShoulder.y * 0.4 + midHip.y * 0.6),
  };

  return {
    leftShoulder,
    rightShoulder,
    leftElbow,
    rightElbow,
    leftHip,
    rightHip,
    leftKnee,
    rightKnee,
    leftAnkle,
    rightAnkle,
    spineTilt,
    leftHandGrip,
    rightHandGrip,
    leftToeFlexion,
    rightToeFlexion,
    centerOfMass,
  };
}
