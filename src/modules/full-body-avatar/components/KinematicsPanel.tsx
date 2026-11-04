import { Activity, Hand, Footprints, ShieldCheck } from 'lucide-react';
import type { BodyJointAngles } from '../character/types';
import '../avatar.css';

interface KinematicsPanelProps {
  kinematics: BodyJointAngles | null;
  tracking: boolean;
}

export function KinematicsPanel({ kinematics, tracking }: KinematicsPanelProps) {
  if (!tracking || !kinematics) {
    return (
      <div className="kinematics-card kinematics-card--standby">
        <div className="kinematics-standby-row">
          <Activity size={18} className="kinematics-standby-icon" />
          <span>Real-time joint, finger, and toe kinematics active when camera is started.</span>
        </div>
      </div>
    );
  }

  // Describe hand status
  const describeGrip = (grip: number) => {
    if (grip > 0.65) return 'Fist Closed';
    if (grip > 0.3) return 'Grip Holding';
    return 'Fingers Open';
  };

  // Describe toe status
  const describeToe = (toe: number) => {
    if (toe < -0.3) return 'Heel Raised';
    if (toe > 0.25) return 'Toes Lifted';
    return 'Foot Planted';
  };

  return (
    <div className="kinematics-card" aria-label="Real-time body kinematics">
      <div className="kinematics-header">
        <span className="kinematics-title">Real-Time Anatomical Kinematics</span>
        <span className="badge badge--available">
          <ShieldCheck size={13} />
          <span>Full Body Rig Synced</span>
        </span>
      </div>

      <div className="kinematics-grid">
        {/* 1. Upper Body & Hands */}
        <div className="kinematic-metric-box">
          <div className="metric-box-title">
            <Hand size={16} />
            <span>Fingers & Hands</span>
          </div>
          <div className="metric-row">
            <span className="metric-label">Left Hand (5 Fingers):</span>
            <span className="metric-val">{describeGrip(kinematics.leftHandGrip)}</span>
          </div>
          <div className="metric-row">
            <span className="metric-label">Right Hand (5 Fingers):</span>
            <span className="metric-val">{describeGrip(kinematics.rightHandGrip)}</span>
          </div>
          <div className="metric-row">
            <span className="metric-label">Elbows (L / R):</span>
            <span className="metric-val">{kinematics.leftElbow}° / {kinematics.rightElbow}°</span>
          </div>
        </div>

        {/* 2. Lower Body & Feet */}
        <div className="kinematic-metric-box">
          <div className="metric-box-title">
            <Footprints size={16} />
            <span>Toes & Feet</span>
          </div>
          <div className="metric-row">
            <span className="metric-label">Left Foot (5 Toes):</span>
            <span className="metric-val">{describeToe(kinematics.leftToeFlexion)}</span>
          </div>
          <div className="metric-row">
            <span className="metric-label">Right Foot (5 Toes):</span>
            <span className="metric-val">{describeToe(kinematics.rightToeFlexion)}</span>
          </div>
          <div className="metric-row">
            <span className="metric-label">Knees (L / R):</span>
            <span className="metric-val">{kinematics.leftKnee}° / {kinematics.rightKnee}°</span>
          </div>
        </div>

        {/* 3. Shoulders & Balance */}
        <div className="kinematic-metric-box">
          <div className="metric-box-title">
            <Activity size={16} />
            <span>Shoulders & Posture</span>
          </div>
          <div className="metric-row">
            <span className="metric-label">Shoulder Abduction (L / R):</span>
            <span className="metric-val">{kinematics.leftShoulder}° / {kinematics.rightShoulder}°</span>
          </div>
          <div className="metric-row">
            <span className="metric-label">Spine Lateral Tilt:</span>
            <span className="metric-val">{kinematics.spineTilt > 0 ? `+${kinematics.spineTilt}°` : `${kinematics.spineTilt}°`}</span>
          </div>
          <div className="metric-row">
            <span className="metric-label">Center of Balance:</span>
            <span className="metric-val">
              {Math.abs(kinematics.centerOfMass.x - 0.5) < 0.05 ? 'Centered' : kinematics.centerOfMass.x < 0.5 ? 'Shift Left' : 'Shift Right'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
