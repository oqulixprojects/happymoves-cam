import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  RotateCcw,
  Trophy,
  Target,
  Zap,
  Camera,
} from "lucide-react";

import { useCamera } from "@/hooks/useCamera";
import { useTracker } from "@/hooks/useTracker";

import {
  CameraBusy,
  CameraErrorOverlay,
  CameraPermissionPrompt,
} from "@/components/camera/CameraOverlays";

import { describeCameraError } from "@/services/camera/errorMessages";
import { describeTrackerError } from "@/services/tracking/errorMessages";

import {
  calculateKneeAngle,
  calculateFootSpeed,
  getMetersPerUnit,
  getTargetCorner,
  isExtensionReached,
  isKickStrongEnough,
  calculateAccuracy,
  MovingAverage,
} from "./analytics";

import {
  createAudioContext,
  playGoalSound,
  playMissSound,
} from "./effects";

import type {
  GameStatus,
  LegSide,
  TargetCorner,
  SoccerAnalytics,
  SavedSession,
} from "./types";

import "./kneeSoccer.css";

const TOTAL_KICKS = 10;
const STORAGE_KEY = "task7_results";

const MIN_VISIBILITY = 0.5; // how clearly the knee and ankle must be seen
const MIN_HIP_VISIBILITY = 0.3; // the hip is often hidden by the chair
const LOST_GRACE_MS = 500; // short drops in tracking are ignored
const FLEXED_ANGLE = 120; // leg is bent and ready
const SWING_START_ANGLE = 130; // leg starts moving up
const KICK_COOLDOWN_MS = 1000;
const FLEXED_HOLD_MS = 300; // stay bent this long before a kick can start
const EXTENSION_HOLD_MS = 100; // stay straight this long for a goal
const MIN_SWING_MS = 150; // a real swing cannot be faster than this
const MAX_SWING_MS = 6000; // a real swing cannot be slower than this
const MIN_MISS_ANGLE = 140; // a miss needs a real swing, not small movement
const MAX_ANGLE_JUMP = 45; // bigger jump in one frame = tracking error
const MIN_FOOT_TRAVEL_M = 0.2; // the foot must really move this far (metres)
const MAX_FOOT_SPEED = 8; // m/s, faster than this = tracking error
const FALLBACK_ASPECT = 16 / 9;
const CONFETTI_COLORS = ["#22c55e", "#facc15", "#38bdf8", "#f472b6", "#ffffff"];

type Phase = "idle" | "armed" | "swinging";

export default function KneeSoccerModule() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const selectedLegRef = useRef<"auto" | LegSide>("auto");

  const previousFootRef = useRef<{
    x: number;
    y: number;
    time: number;
  } | null>(null);

  const lastKickTimeRef = useRef(0);
  const kickNumberRef = useRef(0);

  // Always-fresh copy of the game status (onFrame can see old state)
  const statusRef = useRef<GameStatus>("ready");

  // Kick detection
  const phaseRef = useRef<Phase>("idle");
  const swingPeakAngleRef = useRef(0);
  const swingPeakSpeedRef = useRef(0);
  const swingLaunchedRef = useRef(false);
  const swingStartRef = useRef(0);
  const flexedSinceRef = useRef(0);
  const extensionSinceRef = useRef(0);
  const lastAngleRef = useRef<number | null>(null);
  const glitchFramesRef = useRef(0);
  const swingStartFootRef = useRef<{ x: number; y: number } | null>(null);
  const swingTravelRef = useRef(0);
  const lostSinceRef = useRef(0);

  // The kick that is flying right now
  const pendingKickRef = useRef({ success: false, angle: 90, speed: 0 });
  const resolvedKickRef = useRef(0);

  // Smoothing
  const angleSmootherRef = useRef(new MovingAverage(5));
  const speedSmootherRef = useRef(new MovingAverage(3));

  // Sound
  const audioRef = useRef<AudioContext | null>(null);

  const [selectedLeg, setSelectedLeg] = useState<"auto" | LegSide>("auto");
  const [activeLeg, setActiveLeg] = useState<LegSide>("right");
  const [legVisible, setLegVisible] = useState(true);

  const [target, setTarget] = useState<TargetCorner>("top-left");
  const [ballKickId, setBallKickId] = useState(0);

  const [cameraMessage, setCameraMessage] = useState(
    "Sit comfortably and position your legs inside the camera view.",
  );

  const [analytics, setAnalytics] = useState<SoccerAnalytics>({
    currentAngle: 90,
    peakRom: 90,
    kickSpeed: 0,
    totalKicks: 0,
    successfulKicks: 0,
    accuracy: 0,
    score: 0,
    gameStatus: "ready",
    kickResults: [],
  });

  const camera = useCamera(videoRef);

  /* ---------- forget the current movement ---------- */
  const resetDetection = () => {
    phaseRef.current = "idle";
    swingPeakAngleRef.current = 0;
    swingPeakSpeedRef.current = 0;
    swingLaunchedRef.current = false;
    swingStartRef.current = 0;
    swingStartFootRef.current = null;
    swingTravelRef.current = 0;
    flexedSinceRef.current = 0;
    extensionSinceRef.current = 0;
    lastAngleRef.current = null;
    glitchFramesRef.current = 0;
    angleSmootherRef.current.reset();
    speedSmootherRef.current.reset();
    previousFootRef.current = null;
  };

  /* ---------- start a kick (goal or miss) ---------- */
  const canLaunchKick = (now: number) =>
    statusRef.current !== "kicking" &&
    statusRef.current !== "completed" &&
    kickNumberRef.current < TOTAL_KICKS &&
    now - lastKickTimeRef.current > KICK_COOLDOWN_MS;

  const launchKick = (
    success: boolean,
    angle: number,
    speed: number,
    now: number,
  ) => {
    const nextTarget = getTargetCorner(kickNumberRef.current);

    kickNumberRef.current += 1;
    const kickCount = kickNumberRef.current;

    lastKickTimeRef.current = now;
    statusRef.current = "kicking";
    pendingKickRef.current = { success, angle, speed };

    setTarget(nextTarget);
    setBallKickId((previous) => previous + 1);

    setAnalytics((previous) => ({
      ...previous,
      gameStatus: "kicking",
      totalKicks: kickCount,
      kickSpeed: speed,
    }));

    setCameraMessage(
      success
        ? "Great extension! Your kick is on its way!"
        : "Almost! Straighten your knee fully and kick a bit faster.",
    );
  };

  const tracker = useTracker({
    kind: "pose",
    videoRef,
    canvasRef,
    enabled: camera.status === "active",

    onFrame: (frame) => {
      if (!frame.pose || frame.pose.length < 33) {
        return;
      }

      const landmarks = frame.pose;

      const video = videoRef.current;
      const aspect =
        video && video.videoWidth && video.videoHeight
          ? video.videoWidth / video.videoHeight
          : FALLBACK_ASPECT;

      const sides = {
        left: {
          hip: landmarks[23],
          knee: landmarks[25],
          ankle: landmarks[27],
          foot: landmarks[31],
        },
        right: {
          hip: landmarks[24],
          knee: landmarks[26],
          ankle: landmarks[28],
          foot: landmarks[32],
        },
      };

      const confidence = (s: typeof sides.left) =>
        ((s.hip.visibility ?? 1) +
          (s.knee.visibility ?? 1) +
          (s.ankle.visibility ?? 1)) /
        3;

      let leg: LegSide;

      if (selectedLegRef.current === "left") {
        leg = "left";
      } else if (selectedLegRef.current === "right") {
        leg = "right";
      } else {
        leg =
          confidence(sides.left) >= confidence(sides.right)
            ? "left"
            : "right";
      }

      const side = sides[leg];
      setActiveLeg(leg);

      // Skip the frame if hip, knee or ankle is not clearly visible
      const legIsVisible =
        (side.hip.visibility ?? 1) >= MIN_HIP_VISIBILITY &&
        (side.knee.visibility ?? 1) >= MIN_VISIBILITY &&
        (side.ankle.visibility ?? 1) >= MIN_VISIBILITY;

      if (!legIsVisible) {
        const lostAt = performance.now();

        if (lostSinceRef.current === 0) {
          lostSinceRef.current = lostAt;
        }

        // Short drops are normal. Only react if tracking stays lost.
        if (lostAt - lostSinceRef.current >= LOST_GRACE_MS) {
          setCameraMessage(
            "Move back so your hip, knee and ankle are all visible.",
          );
          // Lost tracking: the next kick must start again from a bent knee
          setLegVisible(false);
          resetDetection();
        }

        return;
      }

      lostSinceRef.current = 0;

      setLegVisible(true);

      // Angle (smoothed)
      const rawAngle = calculateKneeAngle(
        side.hip,
        side.knee,
        side.ankle,
        aspect,
      );

      // A huge jump in one frame is a tracking error, not a real movement.
      // Forget the current movement and wait for a bent knee again.
      const lastAngle = lastAngleRef.current;
      if (
        lastAngle !== null &&
        Math.abs(rawAngle - lastAngle) > MAX_ANGLE_JUMP
      ) {
        resetDetection();
        lastAngleRef.current = rawAngle;
        setAnalytics((previous) => ({
          ...previous,
          currentAngle: Math.round(rawAngle),
        }));
        setCameraMessage(
          "Tracking jumped. Keep your whole leg in view and bend your knee to start.",
        );
        return;
      }
      lastAngleRef.current = rawAngle;

      const angle = Math.round(angleSmootherRef.current.push(rawAngle));

      // Foot speed in m/s (smoothed, estimated from thigh length)
      const now = performance.now();
      const currentFoot = { x: side.foot.x, y: side.foot.y, time: now };
      const previousFoot = previousFootRef.current;
      const metersPerUnit = getMetersPerUnit(side.hip, side.knee, aspect);

      const instantSpeed = previousFoot
        ? calculateFootSpeed(previousFoot, currentFoot, metersPerUnit, aspect)
        : 0;
      const speed = speedSmootherRef.current.push(
        instantSpeed > MAX_FOOT_SPEED ? 0 : instantSpeed,
      );

      previousFootRef.current = currentFoot;

      setAnalytics((previous) => ({
        ...previous,
        currentAngle: angle,
        peakRom: Math.max(previous.peakRom, angle),
      }));

      /* ---------- kick detection ---------- */

      // 1. Leg is bent
      if (angle <= FLEXED_ANGLE) {
        extensionSinceRef.current = 0;

        // The leg came back down after a swing
        if (phaseRef.current === "swinging") {
          const swingTime = now - swingStartRef.current;
          const wasRealSwing =
            swingPeakAngleRef.current >= MIN_MISS_ANGLE &&
            swingTime >= MIN_SWING_MS &&
            swingTime <= MAX_SWING_MS &&
            swingTravelRef.current >= MIN_FOOT_TRAVEL_M;

          // Real swing that never reached 160 degrees: a miss
          if (
            !swingLaunchedRef.current &&
            wasRealSwing &&
            canLaunchKick(now)
          ) {
            launchKick(
              false,
              swingPeakAngleRef.current,
              swingPeakSpeedRef.current,
              now,
            );
          }

          phaseRef.current = "idle";
          flexedSinceRef.current = now;
          swingPeakAngleRef.current = 0;
          swingPeakSpeedRef.current = 0;
          swingLaunchedRef.current = false;
          return;
        }

        // Stay bent for a moment before the next kick can start
        if (flexedSinceRef.current === 0) {
          flexedSinceRef.current = now;
        }

        if (
          phaseRef.current === "idle" &&
          now - flexedSinceRef.current >= FLEXED_HOLD_MS
        ) {
          phaseRef.current = "armed";
          setCameraMessage("Ready! Straighten your knee to kick the ball.");
        }
        return;
      }

      // The leg is not fully bent anymore
      flexedSinceRef.current = 0;

      if (phaseRef.current === "idle") {
        return;
      }

      // 2. Leg starts moving up
      if (phaseRef.current === "armed") {
        if (angle <= SWING_START_ANGLE) {
          return;
        }

        phaseRef.current = "swinging";
        swingStartRef.current = now;
        swingStartFootRef.current = { x: side.foot.x, y: side.foot.y };
        swingTravelRef.current = 0;
        swingPeakAngleRef.current = angle;
        swingPeakSpeedRef.current = speed;
        swingLaunchedRef.current = false;
        extensionSinceRef.current = 0;
      }

      // 3. Leg is swinging: remember the best angle and speed
      swingPeakAngleRef.current = Math.max(swingPeakAngleRef.current, angle);
      swingPeakSpeedRef.current = Math.max(swingPeakSpeedRef.current, speed);

      const startFoot = swingStartFootRef.current;
      if (startFoot) {
        const travel =
          Math.hypot(
            (side.foot.x - startFoot.x) * aspect,
            side.foot.y - startFoot.y,
          ) * metersPerUnit;
        swingTravelRef.current = Math.max(swingTravelRef.current, travel);
      }

      if (swingLaunchedRef.current) {
        return;
      }

      // 4. Knee must reach 160 degrees and stay there for a moment
      if (!isExtensionReached(angle)) {
        extensionSinceRef.current = 0;
        return;
      }

      if (extensionSinceRef.current === 0) {
        extensionSinceRef.current = now;
      }

      const heldLongEnough =
        now - extensionSinceRef.current >= EXTENSION_HOLD_MS;
      const swingTime = now - swingStartRef.current;
      const swingLooksReal =
        swingTime >= MIN_SWING_MS &&
        swingTime <= MAX_SWING_MS &&
        swingTravelRef.current >= MIN_FOOT_TRAVEL_M;

      if (heldLongEnough && swingLooksReal) {
        swingLaunchedRef.current = true;

        if (canLaunchKick(now)) {
          launchKick(
            isKickStrongEnough(swingPeakSpeedRef.current),
            swingPeakAngleRef.current,
            swingPeakSpeedRef.current,
            now,
          );
        }
      }
    },
  });

  useEffect(() => {
    selectedLegRef.current = selectedLeg;
    resetDetection();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLeg]);

  useEffect(() => {
    statusRef.current = analytics.gameStatus;
  }, [analytics.gameStatus]);

  useEffect(() => {
    if (camera.status === "idle") {
      camera.start();
    }
  }, [camera.status]);

  // Browsers block sound until the first click, so unlock it here
  useEffect(() => {
    const unlock = () => {
      if (!audioRef.current) {
        audioRef.current = createAudioContext();
      }
      audioRef.current?.resume();
    };

    window.addEventListener("pointerdown", unlock, { once: true });

    return () => window.removeEventListener("pointerdown", unlock);
  }, []);

  // Load the best saved range of motion
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);

      if (saved) {
        const previousSession = JSON.parse(saved) as Partial<SavedSession>;

        setAnalytics((previous) => ({
          ...previous,
          peakRom: Math.max(
            previous.peakRom,
            previousSession.peakRom ?? 90,
          ),
        }));
      }
    } catch {
      console.warn("Could not load previous Task 7 results.");
    }
  }, []);

  // Save only when a kick finishes (not on every camera frame)
  useEffect(() => {
    if (analytics.kickResults.length === 0) {
      return;
    }

    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const saved = raw ? (JSON.parse(raw) as Partial<SavedSession>) : null;

      const sessionPeakSpeed = Math.max(
        ...analytics.kickResults.map((kick) => kick.speed),
      );

      const savedSession: SavedSession = {
        peakRom: Math.max(analytics.peakRom, saved?.peakRom ?? 0),
        peakKickSpeed: Math.max(
          sessionPeakSpeed,
          saved?.peakKickSpeed ?? 0,
        ),
        totalKicks: analytics.totalKicks,
        successfulKicks: analytics.successfulKicks,
        score: analytics.score,
        completedAt: new Date().toISOString(),
      };

      localStorage.setItem(STORAGE_KEY, JSON.stringify(savedSession));
    } catch {
      console.warn("Could not save Task 7 results.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analytics.kickResults.length]);

  const handleBallAnimationEnd = () => {
    if (statusRef.current !== "kicking") {
      return;
    }

    // The animation can fire more than once. Count each kick only once.
    if (resolvedKickRef.current === ballKickId) {
      return;
    }
    resolvedKickRef.current = ballKickId;

    const { success, angle, speed } = pendingKickRef.current;
    const points = success ? 100 : 0;

    const nextTotalKicks = Math.min(kickNumberRef.current, TOTAL_KICKS);
    const nextStatus: GameStatus =
      nextTotalKicks >= TOTAL_KICKS ? "completed" : success ? "goal" : "miss";

    statusRef.current = nextStatus;

    const audio = audioRef.current;
    if (audio) {
      if (success) {
        playGoalSound(audio);
      } else {
        playMissSound(audio);
      }
    }

    setAnalytics((previous) => {
      const nextSuccessfulKicks =
        previous.successfulKicks + (success ? 1 : 0);

      return {
        ...previous,
        successfulKicks: nextSuccessfulKicks,
        accuracy: calculateAccuracy(nextSuccessfulKicks, nextTotalKicks),
        score: previous.score + points,
        gameStatus: nextStatus,
        kickResults: [
          ...previous.kickResults,
          {
            id: nextTotalKicks,
            target,
            success,
            angle,
            speed,
            points,
          },
        ],
      };
    });

    setCameraMessage(
      success
        ? "GOAL! Excellent knee extension!"
        : "Keep practising! Try a stronger extension.",
    );
  };

  const handleReset = () => {
    resetDetection();
    kickNumberRef.current = 0;
    lastKickTimeRef.current = 0;
    statusRef.current = "ready";
    phaseRef.current = "idle";
    swingPeakAngleRef.current = 0;
    swingPeakSpeedRef.current = 0;
    swingLaunchedRef.current = false;
    pendingKickRef.current = { success: false, angle: 90, speed: 0 };
    resolvedKickRef.current = 0;
    previousFootRef.current = null;
    angleSmootherRef.current.reset();
    speedSmootherRef.current.reset();

    setBallKickId(0);
    setTarget("top-left");

    setCameraMessage("Session reset. Get ready for your first kick!");

    setAnalytics({
      currentAngle: 90,
      peakRom: 90,
      kickSpeed: 0,
      totalKicks: 0,
      successfulKicks: 0,
      accuracy: 0,
      score: 0,
      gameStatus: "ready",
      kickResults: [],
    });
  };

  const anglePercent = Math.min(
    100,
    Math.max(0, ((analytics.currentAngle - 90) / 90) * 100),
  );

  const gameFinished = analytics.gameStatus === "completed";

  const confettiPieces = useMemo(
    () =>
      Array.from({ length: 28 }, (_, i) => ({
        id: i,
        left: 10 + Math.random() * 80,
        drift: (Math.random() - 0.5) * 200,
        delay: Math.random() * 0.3,
        rot: Math.random() * 360,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
      })),
    // New confetti for every kick
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ballKickId],
  );

  return (
    <div className="soccer-container">
      <header className="soccer-header">
        <div>
          <h2>
            <Activity size={22} />
            Knee Extension Soccer Challenge
          </h2>
          <p>
            Extend your knee, kick the ball and score goals through
            camera-based rehabilitation tracking.
          </p>
        </div>

        <div className="soccer-header-actions">
          <select
            value={selectedLeg}
            onChange={(event) =>
              setSelectedLeg(event.target.value as "auto" | LegSide)
            }
          >
            <option value="auto">Auto Detect</option>
            <option value="left">Left Leg</option>
            <option value="right">Right Leg</option>
          </select>

          <button onClick={handleReset} className="soccer-reset">
            <RotateCcw size={15} />
            Reset
          </button>
        </div>
      </header>

      <div className="soccer-game-layout">
        <main className="soccer-game-main">
          <div className="soccer-scoreboard">
            <div>
              <span>YOUR SCORE</span>
              <strong>{analytics.score}</strong>
            </div>

            <div>
              <span>KICKS</span>
              <strong>
                {analytics.totalKicks}/{TOTAL_KICKS}
              </strong>
            </div>

            <div>
              <span>GOALS</span>
              <strong>{analytics.successfulKicks}</strong>
            </div>
          </div>

          <div className="soccer-pitch">
            <div className="pitch-center-line" />
            <div className="pitch-center-circle" />

            <div className="soccer-target target-top-left">
              <Target size={25} />
            </div>

            <div className="soccer-target target-top-right">
              <Target size={25} />
            </div>

            <div className="soccer-target target-bottom-left">
              <Target size={25} />
            </div>

            <div className="soccer-goal">
              <span>GOAL</span>
            </div>

            <div
              key={ballKickId}
              className={`soccer-ball ${
                analytics.gameStatus === "kicking"
                  ? `ball-kicking kick-${target}`
                  : ""
              }`}
              onAnimationEnd={handleBallAnimationEnd}
            >
              ⚽
            </div>

            {analytics.gameStatus === "goal" && (
              <>
                <div className="soccer-result goal-result">
                  GOAL! +100 PTS
                </div>

                <div className="soccer-confetti" aria-hidden="true">
                  {confettiPieces.map((piece) => (
                    <i
                      key={piece.id}
                      style={
                        {
                          left: `${piece.left}%`,
                          background: piece.color,
                          animationDelay: `${piece.delay}s`,
                          "--drift": `${piece.drift}px`,
                          "--rot": `${piece.rot}deg`,
                        } as React.CSSProperties
                      }
                    />
                  ))}
                </div>
              </>
            )}

            {analytics.gameStatus === "miss" && (
              <div className="soccer-result miss-result">
                TRY AGAIN!
              </div>
            )}

            {gameFinished && (
              <div className="soccer-result finished-result">
                <Trophy size={30} />
                SESSION COMPLETED!
                <strong>{analytics.score} POINTS</strong>
              </div>
            )}
          </div>

          <div className="soccer-instruction">
            <Zap size={18} />
            <span>{cameraMessage}</span>
          </div>

          <section className="soccer-camera-section">
            <div className="camera-section-title">
              <Camera size={18} />
              <h3>Live Body Tracking</h3>
              <span className="tracking-leg">
                {activeLeg.toUpperCase()} LEG
              </span>
            </div>

            <div className="soccer-camera">
              <video
                ref={videoRef}
                className="soccer-video"
                playsInline
                muted
                autoPlay
              />

              <canvas ref={canvasRef} className="soccer-canvas" />

              {camera.status === "idle" && (
                <CameraPermissionPrompt onEnable={() => camera.start()} />
              )}

              {camera.status === "starting" && (
                <CameraBusy label="Starting camera..." />
              )}

              {camera.status === "error" && camera.error && (
                <CameraErrorOverlay
                  guidance={describeCameraError(camera.error)}
                  onRetry={() => camera.start()}
                />
              )}

              {tracker.status === "error" && tracker.error && (
                <CameraErrorOverlay
                  guidance={describeTrackerError(tracker.error)}
                  onRetry={() => tracker.retry()}
                />
              )}
            </div>
          </section>
        </main>

        <aside className="soccer-analytics">
          <div className="soccer-metric-card">
            <span className="metric-label">LIVE KNEE ANGLE</span>
            <strong>{legVisible ? `${analytics.currentAngle}°` : "--"}</strong>

            <div className="angle-progress">
              <div style={{ width: `${anglePercent}%` }} />
            </div>

            <div className="angle-scale">
              <span>90° Flexed</span>
              <span>180° Straight</span>
            </div>

            <p>Extension target: 160°</p>
          </div>

          <div className="soccer-metric-card">
            <span className="metric-label">PEAK RANGE OF MOTION</span>
            <strong>{analytics.peakRom}°</strong>
            <p>Best knee extension angle</p>
          </div>

          <div className="soccer-metric-card">
            <span className="metric-label">KICK SPEED</span>
            <strong>{analytics.kickSpeed.toFixed(1)} m/s</strong>
            <p>Estimate from your thigh length, last kick</p>
          </div>

          <div className="soccer-metric-card">
            <span className="metric-label">TARGET ACCURACY</span>
            <strong>{analytics.accuracy}%</strong>
            <p>
              {analytics.successfulKicks} successful kicks out of{" "}
              {analytics.totalKicks}
            </p>
          </div>

          <div className="soccer-history-card">
            <h3>Kick History</h3>

            {analytics.kickResults.length === 0 ? (
              <p className="empty-kick-history">
                Your kicks will appear here.
              </p>
            ) : (
              analytics.kickResults.map((kick) => (
                <div className="kick-history-item" key={kick.id}>
                  <span>Kick #{kick.id}</span>

                  <strong
                    className={kick.success ? "kick-success" : "kick-miss"}
                  >
                    {kick.success ? "+100 PTS" : "MISS"}
                  </strong>
                </div>
              ))
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}