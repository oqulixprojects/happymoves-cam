import * as THREE from 'three';
import * as Kalidokit from 'kalidokit';
import type { Landmark } from '@/services/tracking/types';

export interface RigOptions {
  mirror?: boolean;
}

export class RealAvatarRigController {
  private bones: Map<string, THREE.Bone> = new Map();
  private initialRotations: Map<string, THREE.Euler> = new Map();
  private initialHipsPosition: THREE.Vector3 = new THREE.Vector3();
  public mirror: boolean = true;

  constructor(scene: THREE.Group | THREE.Object3D, options?: RigOptions) {
    if (options?.mirror !== undefined) {
      this.mirror = options.mirror;
    }

    scene.traverse((child) => {
      if ((child as THREE.Bone).isBone) {
        const bone = child as THREE.Bone;
        this.bones.set(bone.name, bone);
        this.initialRotations.set(bone.name, bone.rotation.clone());

        if (bone.name.toLowerCase().includes('hips')) {
          this.initialHipsPosition.copy(bone.position);
        }
      }
    });
  }

  public getBone(name: string): THREE.Bone | undefined {
    return (
      this.bones.get(name) ||
      this.bones.get(`mixamorig${name}`) ||
      this.bones.get(`mixamorig:${name}`) ||
      this.bones.get(`mixamorig_${name}`)
    );
  }

  private rotateJoint(
    boneName: string,
    rotation: { x: number; y: number; z: number } | undefined,
    dampener = 1.0,
    mult = { x: 1, y: 1, z: 1 }
  ) {
    if (!rotation) return;
    const bone = this.getBone(boneName);
    if (!bone) return;

    // Target angles with dampener and multiplier
    const targetX = rotation.x * dampener * mult.x;
    const targetY = rotation.y * dampener * mult.y;
    const targetZ = rotation.z * dampener * mult.z;

    bone.rotation.x = THREE.MathUtils.lerp(bone.rotation.x, targetX, 0.4);
    bone.rotation.y = THREE.MathUtils.lerp(bone.rotation.y, targetY, 0.4);
    bone.rotation.z = THREE.MathUtils.lerp(bone.rotation.z, targetZ, 0.4);
  }

  /**
   * Applies 2D image-space and 3D world-space landmarks to the 3D rig.
   */
  public updatePose(landmarks2D: Landmark[], landmarks3D?: Landmark[]) {
    if (!landmarks2D || landmarks2D.length < 33) return;

    // Mirroring 2D landmarks: in video frame, left is user's right
    const norm2D = landmarks2D.map((lm) => ({
      x: this.mirror ? 1.0 - lm.x : lm.x,
      y: lm.y,
      z: lm.z,
      visibility: lm.visibility ?? 1.0,
    }));

    // Mirroring 3D world landmarks (measured in meters, hip centered)
    const norm3D = (landmarks3D || landmarks2D).map((lm) => ({
      x: this.mirror ? -lm.x : lm.x,
      y: lm.y,
      z: lm.z,
      visibility: lm.visibility ?? 1.0,
    }));

    try {
      const riggedPose = Kalidokit.Pose.solve(
        norm3D as any,
        norm2D as any,
        {
          runtime: 'mediapipe',
          enableLegs: true,
        }
      );

      if (!riggedPose) return;

      // 1. Spine, Chest, Neck, Head
      this.rotateJoint('Spine', riggedPose.Spine, 0.5);
      this.rotateJoint('Spine1', riggedPose.Spine, 0.5);
      this.rotateJoint('Spine2', riggedPose.Spine, 0.4);

      // 2. Arms (Mixamo T-pose mappings)
      this.rotateJoint('LeftArm', riggedPose.LeftUpperArm, 1.0, { x: 1, y: 1, z: -1 });
      this.rotateJoint('LeftForeArm', riggedPose.LeftLowerArm, 1.0, { x: 1, y: 1, z: -1 });
      this.rotateJoint('LeftHand', riggedPose.LeftHand, 0.8, { x: 1, y: 1, z: -1 });

      this.rotateJoint('RightArm', riggedPose.RightUpperArm, 1.0, { x: 1, y: 1, z: -1 });
      this.rotateJoint('RightForeArm', riggedPose.RightLowerArm, 1.0, { x: 1, y: 1, z: -1 });
      this.rotateJoint('RightHand', riggedPose.RightHand, 0.8, { x: 1, y: 1, z: -1 });

      // 3. Legs
      this.rotateJoint('LeftUpLeg', riggedPose.LeftUpperLeg, 0.8, { x: 1, y: 1, z: 1 });
      this.rotateJoint('LeftLeg', riggedPose.LeftLowerLeg, 0.9, { x: 1, y: 1, z: 1 });

      this.rotateJoint('RightUpLeg', riggedPose.RightUpperLeg, 0.8, { x: 1, y: 1, z: 1 });
      this.rotateJoint('RightLeg', riggedPose.RightLowerLeg, 0.9, { x: 1, y: 1, z: 1 });

      // 4. Hips Translation & Rotation
      const hips = this.getBone('Hips');
      if (hips && riggedPose.Hips) {
        this.rotateJoint('Hips', riggedPose.Hips.rotation, 0.5);

        if (riggedPose.Hips.worldPosition) {
          const wp = riggedPose.Hips.worldPosition;
          const targetX = this.initialHipsPosition.x + (this.mirror ? -wp.x : wp.x) * 0.5;
          const targetY = this.initialHipsPosition.y + wp.y * 0.3;
          hips.position.x = THREE.MathUtils.lerp(hips.position.x, targetX, 0.2);
          hips.position.y = THREE.MathUtils.lerp(hips.position.y, targetY, 0.2);
        }
      }
    } catch (e) {
      console.error('Pose solve error:', e);
    }
  }

  public reset() {
    this.initialRotations.forEach((rot, name) => {
      const bone = this.getBone(name);
      if (bone) bone.rotation.copy(rot);
    });
    const hips = this.getBone('Hips');
    if (hips) hips.position.copy(this.initialHipsPosition);
  }
}
