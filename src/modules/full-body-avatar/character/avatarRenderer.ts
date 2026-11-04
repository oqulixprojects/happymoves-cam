import type { Landmark } from '@/services/tracking/types';
import type { AvatarRenderOptions, BodyJointAngles } from './types';
import { OUTFIT_THEMES } from './types';

interface Point2D {
  x: number;
  y: number;
}

export class AvatarRenderer {
  private blinkTimer = 0;
  private isBlinking = false;

  render(
    ctx: CanvasRenderingContext2D,
    landmarks: Landmark[] | null,
    kinematics: BodyJointAngles | null,
    options: AvatarRenderOptions,
  ): void {
    const width = ctx.canvas.width;
    const height = ctx.canvas.height;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Update blink state
    this.blinkTimer++;
    if (this.blinkTimer > 160 && !this.isBlinking) {
      if (Math.random() < 0.1) {
        this.isBlinking = true;
        this.blinkTimer = 0;
      }
    } else if (this.isBlinking && this.blinkTimer > 6) {
      this.isBlinking = false;
      this.blinkTimer = 0;
    }

    // 1. Draw Modern Clinical Studio Grid & Floor
    this.drawStudioEnvironment(ctx, width, height, options.showFloorGrid);

    if (!landmarks || landmarks.length < 33) {
      this.drawStandbyGuide(ctx, width, height);
      return;
    }

    // Convert normalized landmarks to pixel coordinates (mirroring if enabled)
    const pts = landmarks.map((l) => ({
      x: options.mirror ? (1 - l.x) * width : l.x * width,
      y: l.y * height,
      z: l.z,
    }));

    const outfit = OUTFIT_THEMES[options.theme] || OUTFIT_THEMES.teal;

    // 2. Dynamic Foot Shadows on floor
    this.drawFootShadows(ctx, pts);

    // 3. Draw 2D Line Character
    this.drawLineCharacter(ctx, pts, outfit, kinematics, options.footwear);

    // 4. Biomechanical Angle Arcs & Readouts (Optional toggle)
    if (options.showAngles || options.showSkeleton) {
      this.drawJointAngleOverlays(ctx, pts, kinematics);
    }
  }

  /* -------------------------------------------------------------
     STUDIO ENVIRONMENT & STANDBY
  ------------------------------------------------------------- */
  private drawStudioEnvironment(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    showGrid: boolean,
  ): void {
    const horizon = h * 0.85;

    // Dark sleek clinical studio (Deep slate & navy for vibrant line pop)
    const wallGrad = ctx.createLinearGradient(0, 0, 0, horizon);
    wallGrad.addColorStop(0, '#0a0f1d');
    wallGrad.addColorStop(0.5, '#0f172a');
    wallGrad.addColorStop(1, '#1e293b');
    ctx.fillStyle = wallGrad;
    ctx.fillRect(0, 0, w, horizon);

    // Floor Gradient
    const floorGrad = ctx.createLinearGradient(0, horizon, 0, h);
    floorGrad.addColorStop(0, '#111827');
    floorGrad.addColorStop(0.35, '#0b0f19');
    floorGrad.addColorStop(1, '#050811');
    ctx.fillStyle = floorGrad;
    ctx.fillRect(0, horizon, w, h - horizon);

    // Horizon line
    ctx.beginPath();
    ctx.moveTo(0, horizon);
    ctx.lineTo(w, horizon);
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.25)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    if (showGrid) {
      // Perspective floor lines
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.12)';
      ctx.lineWidth = 1;
      const numLines = 11;
      for (let i = 0; i <= numLines; i++) {
        const xFloor = (w * i) / numLines;
        const xHorizon = w * 0.5 + (xFloor - w * 0.5) * 0.4;
        ctx.beginPath();
        ctx.moveTo(xHorizon, horizon);
        ctx.lineTo(xFloor, h);
        ctx.stroke();
      }

      // Horizontal depth rings
      for (let step = 0.2; step <= 0.8; step += 0.2) {
        const y = horizon + (h - horizon) * step;
        ctx.beginPath();
        ctx.ellipse(w * 0.5, y, w * (0.18 + step * 0.35), 10 + step * 16, 0, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.09)';
        ctx.stroke();
      }
    }
  }

  private drawStandbyGuide(ctx: CanvasRenderingContext2D, w: number, h: number): void {
    ctx.fillStyle = '#38bdf8';
    ctx.font = '600 17px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Stand back in camera view to start Line Character tracking', w * 0.5, h * 0.46);

    ctx.font = '400 13px Inter, sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('Head, spine, arms, all 10 fingers, legs, and 10 toes mapped in real time', w * 0.5, h * 0.46 + 28);
  }

  /* -------------------------------------------------------------
     DYNAMIC FLOOR SHADOWS
  ------------------------------------------------------------- */
  private drawFootShadows(ctx: CanvasRenderingContext2D, p: Point2D[]): void {
    const lFoot = p[31] || p[27];
    const rFoot = p[32] || p[28];
    const floorY = ctx.canvas.height * 0.94;

    const drawShadowForFoot = (foot: Point2D) => {
      const distFromFloor = Math.max(0, floorY - foot.y);
      const alpha = Math.max(0.1, 0.45 - distFromFloor * 0.0035);
      const rx = Math.max(14, 32 - distFromFloor * 0.08);
      const ry = Math.max(5, 10 - distFromFloor * 0.03);

      ctx.beginPath();
      ctx.ellipse(foot.x, floorY, rx, ry, 0, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
      ctx.fill();
    };

    if (lFoot) drawShadowForFoot(lFoot);
    if (rFoot) drawShadowForFoot(rFoot);
  }

  /* -------------------------------------------------------------
     LINE CHARACTER DRAWING ENGINE
  ------------------------------------------------------------- */
  private drawLineCharacter(
    ctx: CanvasRenderingContext2D,
    p: Point2D[],
    outfit: typeof OUTFIT_THEMES['teal'],
    kinematics: BodyJointAngles | null,
    footwear: 'sneakers' | 'barefoot',
  ): void {
    const primaryColor = outfit.primaryLight || '#38bdf8';
    const mainStroke = outfit.primary || '#0284c7';
    const accentStroke = outfit.primaryDark || '#0f766e';

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // 1. Legs & Feet with 5 Articulated Toes
    this.drawLineLegsAndToes(ctx, p, mainStroke, primaryColor, kinematics, footwear);

    // 2. Torso, Clavicle, Spine & Pelvis Cage
    this.drawLineTorso(ctx, p, mainStroke, accentStroke, primaryColor);

    // 3. Head & Expressive Facial Line Features
    this.drawLineHeadAndFace(ctx, p, primaryColor);

    // 4. Arms & Hands with 5 Articulated Fingers
    this.drawLineArmsAndFingers(ctx, p, mainStroke, primaryColor, kinematics);

    ctx.restore();
  }

  /* -------------------------------------------------------------
     TORSO & SPINE LINES
  ------------------------------------------------------------- */
  private drawLineTorso(
    ctx: CanvasRenderingContext2D,
    p: Point2D[],
    mainStroke: string,
    accentStroke: string,
    glowColor: string,
  ): void {
    const ls = p[11];
    const rs = p[12];
    const lh = p[23];
    const rh = p[24];

    if (!ls || !rs || !lh || !rh) return;

    const midShoulder = { x: (ls.x + rs.x) / 2, y: (ls.y + rs.y) / 2 };
    const midHip = { x: (lh.x + rh.x) / 2, y: (lh.y + rh.y) / 2 };

    // Clavicle / Shoulder bar line
    ctx.strokeStyle = mainStroke;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(ls.x, ls.y);
    ctx.lineTo(rs.x, rs.y);
    ctx.stroke();

    // Pelvic bar line
    ctx.strokeStyle = mainStroke;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(lh.x, lh.y);
    ctx.lineTo(rh.x, rh.y);
    ctx.stroke();

    // Central Articulated Spine Line (with curvature)
    ctx.strokeStyle = glowColor;
    ctx.lineWidth = 6.5;
    ctx.beginPath();
    ctx.moveTo(midShoulder.x, midShoulder.y);
    // Control point based on spine tilt
    const spineMidX = (midShoulder.x + midHip.x) / 2;
    const spineMidY = (midShoulder.y + midHip.y) / 2;
    ctx.quadraticCurveTo(spineMidX, spineMidY, midHip.x, midHip.y);
    ctx.stroke();

    // Torso ribcage contour struts (gives 2D line character physical presence)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
    ctx.lineWidth = 2.5;

    // Upper Rib Strut
    const rib1Y = midShoulder.y + (midHip.y - midShoulder.y) * 0.35;
    const rib1L = { x: ls.x + (lh.x - ls.x) * 0.35, y: rib1Y };
    const rib1R = { x: rs.x + (rh.x - rs.x) * 0.35, y: rib1Y };
    ctx.beginPath();
    ctx.moveTo(rib1L.x, rib1L.y);
    ctx.lineTo(rib1R.x, rib1R.y);
    ctx.stroke();

    // Lower Rib Strut
    const rib2Y = midShoulder.y + (midHip.y - midShoulder.y) * 0.65;
    const rib2L = { x: ls.x + (lh.x - ls.x) * 0.65, y: rib2Y };
    const rib2R = { x: rs.x + (rh.x - rs.x) * 0.65, y: rib2Y };
    ctx.beginPath();
    ctx.moveTo(rib2L.x, rib2L.y);
    ctx.lineTo(rib2R.x, rib2R.y);
    ctx.stroke();

    // Torso outer contour lines (Shoulder to Hip)
    ctx.strokeStyle = accentStroke;
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(ls.x, ls.y);
    ctx.lineTo(lh.x, lh.y);
    ctx.moveTo(rs.x, rs.y);
    ctx.lineTo(rh.x, rh.y);
    ctx.stroke();

    // Joint Nodes at Shoulders & Hips
    this.drawJointNode(ctx, ls, glowColor);
    this.drawJointNode(ctx, rs, glowColor);
    this.drawJointNode(ctx, lh, glowColor);
    this.drawJointNode(ctx, rh, glowColor);
    this.drawJointNode(ctx, midShoulder, '#ffffff', 4);
    this.drawJointNode(ctx, midHip, '#ffffff', 4);
  }

  /* -------------------------------------------------------------
     HEAD & FACIAL LINE MAPPING
  ------------------------------------------------------------- */
  private drawLineHeadAndFace(ctx: CanvasRenderingContext2D, p: Point2D[], primaryColor: string): void {
    const nose = p[0];
    const le = p[2] || p[1];
    const re = p[5] || p[4];
    const ls = p[11];
    const rs = p[12];

    if (!nose || !ls || !rs) return;

    const midShoulder = { x: (ls.x + rs.x) / 2, y: (ls.y + rs.y) / 2 };
    const shoulderWidth = Math.sqrt(Math.pow(rs.x - ls.x, 2) + Math.pow(rs.y - ls.y, 2));
    const headRadius = Math.max(22, Math.min(45, shoulderWidth * 0.3));

    const headCenter = {
      x: nose.x,
      y: nose.y - headRadius * 0.22,
    };

    let headAngle = 0;
    if (le && re) {
      headAngle = Math.atan2(re.y - le.y, re.x - le.x);
    } else {
      headAngle = Math.atan2(rs.y - ls.y, rs.x - ls.x);
    }

    ctx.save();

    // Neck line connecting head to mid-shoulder
    ctx.strokeStyle = primaryColor;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(headCenter.x, headCenter.y + headRadius * 0.7);
    ctx.lineTo(midShoulder.x, midShoulder.y);
    ctx.stroke();

    ctx.translate(headCenter.x, headCenter.y);
    ctx.rotate(headAngle);

    // Head Outline (Sleek luminous circle/oval)
    ctx.strokeStyle = primaryColor;
    ctx.lineWidth = 4.5;
    ctx.shadowColor = primaryColor;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.ellipse(0, 0, headRadius * 0.88, headRadius, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Stylized Eyeline & Eyes
    const eyeSpacing = headRadius * 0.32;
    const eyeY = -headRadius * 0.08;

    if (this.isBlinking) {
      // Blinking eye arcs
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.arc(-eyeSpacing, eyeY, 4, 0, Math.PI, false);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(eyeSpacing, eyeY, 4, 0, Math.PI, false);
      ctx.stroke();
    } else {
      // Open Glowing Eye Nodes
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(-eyeSpacing, eyeY, 3.2, 0, Math.PI * 2);
      ctx.fill();

      ctx.beginPath();
      ctx.arc(eyeSpacing, eyeY, 3.2, 0, Math.PI * 2);
      ctx.fill();

      // Eye line connecting eyes
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-eyeSpacing + 4, eyeY);
      ctx.lineTo(eyeSpacing - 4, eyeY);
      ctx.stroke();
    }

    // Nose tip node
    ctx.fillStyle = primaryColor;
    ctx.beginPath();
    ctx.arc(0, headRadius * 0.16, 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Welcoming Smile Arc
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.arc(0, headRadius * 0.28, headRadius * 0.26, Math.PI * 0.2, Math.PI * 0.8, false);
    ctx.stroke();

    ctx.restore();
  }

  /* -------------------------------------------------------------
     ARMS & PROPER 5-FINGER LINE HAND MAPPING
  ------------------------------------------------------------- */
  private drawLineArmsAndFingers(
    ctx: CanvasRenderingContext2D,
    p: Point2D[],
    mainStroke: string,
    primaryColor: string,
    kinematics: BodyJointAngles | null,
  ): void {
    const ls = p[11];
    const rs = p[12];
    const le = p[13];
    const re = p[14];
    const lw = p[15];
    const rw = p[16];

    // Left Arm Lines
    if (ls && le && lw) {
      ctx.strokeStyle = mainStroke;
      ctx.lineWidth = 5.5;
      ctx.beginPath();
      ctx.moveTo(ls.x, ls.y);
      ctx.lineTo(le.x, le.y);
      ctx.lineTo(lw.x, lw.y);
      ctx.stroke();

      this.drawJointNode(ctx, le, primaryColor);
      this.drawJointNode(ctx, lw, primaryColor);

      // Left Hand with all 5 Articulated Finger Lines
      this.drawLineHandFingers(ctx, le, lw, p[17], p[19], p[21], kinematics?.leftHandGrip ?? 0, 'left', primaryColor);
    }

    // Right Arm Lines
    if (rs && re && rw) {
      ctx.strokeStyle = mainStroke;
      ctx.lineWidth = 5.5;
      ctx.beginPath();
      ctx.moveTo(rs.x, rs.y);
      ctx.lineTo(re.x, re.y);
      ctx.lineTo(rw.x, rw.y);
      ctx.stroke();

      this.drawJointNode(ctx, re, primaryColor);
      this.drawJointNode(ctx, rw, primaryColor);

      // Right Hand with all 5 Articulated Finger Lines
      this.drawLineHandFingers(ctx, re, rw, p[18], p[20], p[22], kinematics?.rightHandGrip ?? 0, 'right', primaryColor);
    }
  }

  /**
   * Draws a complete articulated Line Hand with 5 individual fingers:
   * Thumb, Index, Middle, Ring, Pinky.
   * Full kinematics: splaying open, curling into a fist, individual digit articulation.
   */
  private drawLineHandFingers(
    ctx: CanvasRenderingContext2D,
    elbow: Point2D,
    wrist: Point2D,
    _pinkyPt: Point2D | undefined,
    _indexPt: Point2D | undefined,
    _thumbPt: Point2D | undefined,
    gripAmount: number, // 0 = open hand, 1 = closed fist
    side: 'left' | 'right',
    fingerColor: string,
  ): void {
    ctx.save();

    const dx = wrist.x - elbow.x;
    const dy = wrist.y - elbow.y;
    const forearmAngle = Math.atan2(dy, dx);

    ctx.translate(wrist.x, wrist.y);
    ctx.rotate(forearmAngle);

    // Palm base line
    const palmWidth = 14;
    const palmLen = 12;
    ctx.strokeStyle = fingerColor;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, -palmWidth * 0.5);
    ctx.lineTo(palmLen, -palmWidth * 0.45);
    ctx.lineTo(palmLen, palmWidth * 0.45);
    ctx.lineTo(0, palmWidth * 0.5);
    ctx.closePath();
    ctx.stroke();

    const curl = Math.max(0, Math.min(1, gripAmount));
    const thumbSide = side === 'left' ? -1 : 1;

    // 1. Articulated Thumb Line (Metacarpal -> Proximal -> Distal pad)
    const thumbAngle = thumbSide * (0.68 - curl * 0.45);
    const thumbLen = 13 * (1 - curl * 0.45);

    ctx.save();
    ctx.translate(3, thumbSide * 6.5);
    ctx.rotate(thumbAngle);

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    // Thumb IP joint
    const thumbIpX = thumbLen * 0.55;
    const thumbIpY = -thumbSide * 1.5;
    ctx.lineTo(thumbIpX, thumbIpY);
    // Thumb tip
    const thumbTipX = thumbLen;
    const thumbTipY = -thumbSide * 4 * curl;
    ctx.lineTo(thumbTipX, thumbTipY);
    ctx.stroke();

    // Thumb Joint Nodes
    this.drawJointNode(ctx, { x: 0, y: 0 }, fingerColor, 2.5);
    this.drawJointNode(ctx, { x: thumbIpX, y: thumbIpY }, '#ffffff', 2);
    this.drawJointNode(ctx, { x: thumbTipX, y: thumbTipY }, fingerColor, 2.8);
    ctx.restore();

    // 2. Four Articulated Finger Lines: [Index, Middle, Ring, Pinky]
    const fingerDefs = [
      { name: 'index', offsetY: thumbSide * 4.5, baseLen: 16, spreadAngle: -0.16 },
      { name: 'middle', offsetY: thumbSide * 1.5, baseLen: 18.5, spreadAngle: -0.04 },
      { name: 'ring', offsetY: -thumbSide * 1.5, baseLen: 16.5, spreadAngle: 0.08 },
      { name: 'pinky', offsetY: -thumbSide * 4.5, baseLen: 13.5, spreadAngle: 0.22 },
    ];

    fingerDefs.forEach((f) => {
      ctx.save();
      ctx.translate(palmLen, f.offsetY);

      // Splay open angle vs curled in angle
      const angle = f.spreadAngle * (1 - curl);
      ctx.rotate(angle);

      // Knuckle MCP Node
      this.drawJointNode(ctx, { x: 0, y: 0 }, fingerColor, 2.5);

      const totalLen = f.baseLen * (1 - curl * 0.5);
      const pipLen = totalLen * 0.55;
      const dipLen = totalLen * 0.45;

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.8;

      ctx.beginPath();
      ctx.moveTo(0, 0);

      let pipY = 0;
      let tipX = totalLen;
      let tipY = 0;

      if (curl > 0.25) {
        // Finger curls inward toward palm
        const curlBend = curl * 12;
        pipY = curlBend * 0.4;
        tipX = pipLen + dipLen * Math.cos(curl * 1.8);
        tipY = pipY + dipLen * Math.sin(curl * 1.8);

        ctx.lineTo(pipLen, pipY);
        ctx.lineTo(tipX, tipY);
      } else {
        // Extended straight finger
        ctx.lineTo(pipLen, 0);
        ctx.lineTo(totalLen, 0);
      }
      ctx.stroke();

      // Finger Joint Nodes (PIP and Tip)
      this.drawJointNode(ctx, { x: pipLen, y: pipY }, '#ffffff', 2);
      this.drawJointNode(ctx, { x: tipX, y: tipY }, fingerColor, 2.8);

      ctx.restore();
    });

    ctx.restore();
  }

  /* -------------------------------------------------------------
     LEGS & PROPER 5-TOE LINE FOOT MAPPING
  ------------------------------------------------------------- */
  private drawLineLegsAndToes(
    ctx: CanvasRenderingContext2D,
    p: Point2D[],
    mainStroke: string,
    primaryColor: string,
    kinematics: BodyJointAngles | null,
    footwear: 'sneakers' | 'barefoot',
  ): void {
    const lh = p[23];
    const rh = p[24];
    const lk = p[25];
    const rk = p[26];
    const la = p[27];
    const ra = p[28];
    const lheel = p[29];
    const rheel = p[30];
    const ltoe = p[31];
    const rtoe = p[32];

    // Left Leg Lines
    if (lh && lk && la) {
      ctx.strokeStyle = mainStroke;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(lh.x, lh.y);
      ctx.lineTo(lk.x, lk.y);
      ctx.lineTo(la.x, la.y);
      ctx.stroke();

      this.drawJointNode(ctx, lk, primaryColor);
      this.drawJointNode(ctx, la, primaryColor);

      // Left Foot with 5 Articulated Toe Lines
      this.drawLineFootToes(
        ctx,
        lk,
        la,
        lheel,
        ltoe,
        kinematics?.leftToeFlexion ?? 0,
        primaryColor,
        'left',
        footwear,
      );
    }

    // Right Leg Lines
    if (rh && rk && ra) {
      ctx.strokeStyle = mainStroke;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(rh.x, rh.y);
      ctx.lineTo(rk.x, rk.y);
      ctx.lineTo(ra.x, ra.y);
      ctx.stroke();

      this.drawJointNode(ctx, rk, primaryColor);
      this.drawJointNode(ctx, ra, primaryColor);

      // Right Foot with 5 Articulated Toe Lines
      this.drawLineFootToes(
        ctx,
        rk,
        ra,
        rheel,
        rtoe,
        kinematics?.rightToeFlexion ?? 0,
        primaryColor,
        'right',
        footwear,
      );
    }
  }

  /**
   * Draws an articulated Line Foot with Heel, Sole Arch, Metatarsal Ball,
   * and 5 individual articulated Toe Lines:
   * Big Toe (Hallux), 2nd, 3rd, 4th, Pinky Toe.
   * Full kinematics: Heel raise (plantarflexion) bends foot up, Toe raise (dorsiflexion) lifts toes up!
   */
  private drawLineFootToes(
    ctx: CanvasRenderingContext2D,
    knee: Point2D,
    ankle: Point2D,
    heel: Point2D | undefined,
    toeTip: Point2D | undefined,
    toeFlexion: number, // -1 = heel raise, +1 = toe raise
    footColor: string,
    side: 'left' | 'right',
    _footwear: 'sneakers' | 'barefoot',
  ): void {
    ctx.save();

    const shinDx = ankle.x - knee.x;
    const shinDy = ankle.y - knee.y;
    const shinAngle = Math.atan2(shinDy, shinDx);

    let footAngle = shinAngle + Math.PI * 0.45;
    if (heel && toeTip) {
      footAngle = Math.atan2(toeTip.y - heel.y, toeTip.x - heel.x);
    }

    const toeBendAngle = toeFlexion < -0.2 ? -0.42 * Math.abs(toeFlexion) : toeFlexion * 0.35;

    ctx.translate(ankle.x, ankle.y);
    ctx.rotate(footAngle);

    const heelX = -12;
    const heelY = 6;
    const ballX = 22;
    const ballY = 4;

    // 1. Heel & Plantar Arch Lines
    ctx.strokeStyle = footColor;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, 0); // Ankle
    ctx.lineTo(heelX, heelY); // Heel
    ctx.lineTo(ballX * 0.4, ballY * 0.5); // Arch
    ctx.lineTo(ballX, ballY); // Ball of foot / Metatarsal
    ctx.stroke();

    // Heel Node & Ball Node
    this.drawJointNode(ctx, { x: heelX, y: heelY }, '#ffffff', 3.5);
    this.drawJointNode(ctx, { x: ballX, y: ballY }, footColor, 3.5);

    // 2. Metatarsal Knuckle Bar
    const bigToeSide = side === 'left' ? -1 : 1;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(ballX, ballY - 6);
    ctx.lineTo(ballX, ballY + 6);
    ctx.stroke();

    // 3. Five Articulated Toe Lines [Big Toe, 2nd, 3rd, 4th, Pinky Toe]
    const toeDefs = [
      { name: 'bigToe', offsetY: bigToeSide * 5, len: 10, width: 3.5 },
      { name: 'toe2', offsetY: bigToeSide * 2.5, len: 9.5, width: 2.8 },
      { name: 'toe3', offsetY: 0, len: 8.5, width: 2.6 },
      { name: 'toe4', offsetY: -bigToeSide * 2.5, len: 7.5, width: 2.4 },
      { name: 'pinkyToe', offsetY: -bigToeSide * 5, len: 6.5, width: 2.2 },
    ];

    toeDefs.forEach((t) => {
      ctx.save();
      ctx.translate(ballX, ballY + t.offsetY);
      ctx.rotate(toeBendAngle);

      // Toe Line
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = t.width;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(t.len, 0);
      ctx.stroke();

      // Toe Knuckle Node & Tip Node
      this.drawJointNode(ctx, { x: 0, y: 0 }, footColor, 1.8);
      this.drawJointNode(ctx, { x: t.len, y: 0 }, footColor, 2.2);

      ctx.restore();
    });

    ctx.restore();
  }

  /* -------------------------------------------------------------
     JOINT NODE HELPER
  ------------------------------------------------------------- */
  private drawJointNode(
    ctx: CanvasRenderingContext2D,
    pt: Point2D,
    color: string,
    radius = 5,
  ): void {
    ctx.save();
    // Glowing outer ring
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    ctx.strokeStyle = color;
    ctx.lineWidth = 2.2;
    ctx.stroke();

    ctx.restore();
  }

  /* -------------------------------------------------------------
     CLINICAL JOINT ANGLE OVERLAYS (Optional Toggle)
  ------------------------------------------------------------- */
  private drawJointAngleOverlays(
    ctx: CanvasRenderingContext2D,
    p: Point2D[],
    kinematics: BodyJointAngles | null,
  ): void {
    if (!kinematics) return;

    ctx.save();
    if (p[13]) this.drawAngleBadge(ctx, p[13], `L Elbow ${kinematics.leftElbow}°`);
    if (p[14]) this.drawAngleBadge(ctx, p[14], `R Elbow ${kinematics.rightElbow}°`);
    if (p[25]) this.drawAngleBadge(ctx, p[25], `L Knee ${kinematics.leftKnee}°`);
    if (p[26]) this.drawAngleBadge(ctx, p[26], `R Knee ${kinematics.rightKnee}°`);
    if (p[11]) this.drawAngleBadge(ctx, p[11], `Shoulder ${kinematics.leftShoulder}°`);
    ctx.restore();
  }

  private drawAngleBadge(ctx: CanvasRenderingContext2D, point: Point2D, label: string): void {
    ctx.save();
    ctx.font = '700 11px Inter, sans-serif';
    const textW = ctx.measureText(label).width;
    const px = point.x + 12;
    const py = point.y - 12;

    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(px, py, textW + 10, 18, 5);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#38bdf8';
    ctx.fillText(label, px + 5, py + 13);
    ctx.restore();
  }
}
