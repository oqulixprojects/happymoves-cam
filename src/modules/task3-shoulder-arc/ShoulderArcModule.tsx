import { useRef, useState } from "react";

import { useCamera } from "@/hooks/useCamera";
import { useTracker } from "@/hooks/useTracker";

import { calculateShoulderAngle, ShoulderArcTracker } from "./analytics";

import type { ShoulderSide, ShoulderArcAnalytics } from "./types";

import "./shoulderArc.css";

function ShoulderClockArc({ angle = 0 }: { angle: number }) {
  const progress = Math.min(Math.max(angle, 0), 180);

  const radius = 100;
  const circumference = Math.PI * radius;
  const progressOffset = circumference - (progress / 180) * circumference;

  const checkpointPosition = (value: number) => {
    const radians = (180 - (value / 180) * 180) * (Math.PI / 180);

    return {
      x: 150 + radius * Math.cos(radians),
      y: 150 - radius * Math.sin(radians),
    };
  };

  return (
    <div className="shoulder-arc-visual">
      <svg
        className="shoulder-arc-svg"
        viewBox="0 0 300 180"
        role="img"
        aria-label={`Shoulder angle ${angle} degrees`}
      >
        <path
          className="shoulder-arc-track"
          d="M 50 150 A 100 100 0 0 1 250 150"
        />

        <path
          className="shoulder-arc-progress"
          d="M 50 150 A 100 100 0 0 1 250 150"
          strokeDasharray={circumference}
          strokeDashoffset={progressOffset}
        />

        {[60, 90, 120].map((checkpoint) => {
          const position = checkpointPosition(checkpoint);

          return (
            <g key={checkpoint}>
              <circle
                className={`shoulder-arc-checkpoint ${
                  angle >= checkpoint ? "reached" : ""
                }`}
                cx={position.x}
                cy={position.y}
                r="7"
              />
              <text
                className="shoulder-arc-label"
                x={position.x}
                y={position.y - 14}
              >
                {checkpoint}°
              </text>
            </g>
          );
        })}

        <text x="150" y="125" className="shoulder-arc-angle">
          {Math.round(angle)}°
        </text>
      </svg>
    </div>
  );
}

export default function ShoulderArcModule() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [selectedSide, setSelectedSide] = useState<ShoulderSide>("left");

  const [analytics, setAnalytics] = useState<ShoulderArcAnalytics | null>(null);

  const trackerRef = useRef<ShoulderArcTracker>(new ShoulderArcTracker());
  const camera = useCamera(videoRef);

  useTracker({
    kind: "pose",
    videoRef,
    canvasRef,
    enabled: camera.status === "active",

    onFrame: (frame) => {
      if (!frame.pose || frame.pose.length < 33) return;

      const landmarks = frame.pose;
      // Left shoulder points
      const leftHip = landmarks[23];
      const leftShoulder = landmarks[11];
      const leftWrist = landmarks[15];

      // Right shoulder points
      const rightHip = landmarks[24];
      const rightShoulder = landmarks[12];
      const rightWrist = landmarks[16];

      // Calculate left shoulder angle
      const leftAngle = calculateShoulderAngle(
        leftHip,
        leftShoulder,
        leftWrist,
      );

      // Calculate right shoulder angle
      const rightAngle = calculateShoulderAngle(
        rightHip,
        rightShoulder,
        rightWrist,
      );

      // Select the angle based on the selected shoulder
      const currentAngle =
        selectedSide.toLowerCase() === "left" ? leftAngle : rightAngle;

      console.log({
        selectedSide,
        leftAngle,
        rightAngle,
        currentAngle,
      });

      // Update the exercise tracker
      trackerRef.current.update(currentAngle, selectedSide, 90);
      setAnalytics(trackerRef.current.getAnalytics(selectedSide, 10));
    },
  });

  return (
    <div className="shoulder-arc-container">
      <h1>Shoulder Clock Arc</h1>
      <p>Shoulder mobility tracking exercise</p>

      <div className="shoulder-arc-layout">
        {/* LEFT BOX - CAMERA */}
        <div className="shoulder-arc-left">
          <h2>Live Camera</h2>

          <div className="shoulder-arc-camera">
            <video ref={videoRef} autoPlay muted playsInline />
            <canvas ref={canvasRef} />
          </div>

          <p>Camera Status: {camera.status}</p>

          {camera.error && <p>{camera.error.message}</p>}

          <div className="shoulder-arc-controls">
            <button onClick={() => camera.start()}>Start Camera</button>

            <button onClick={() => setSelectedSide("left")}>
              Left Shoulder
            </button>

            <button onClick={() => setSelectedSide("right")}>
              Right Shoulder
            </button>

            <button
              onClick={() => {
                trackerRef.current.reset();
                setAnalytics(trackerRef.current.getAnalytics(selectedSide, 10));
              }}
            >
              Reset Exercise
            </button>
          </div>

          <p>Selected Shoulder: {selectedSide}</p>
        </div>

        {/* RIGHT BOX - RESULTS */}
        <div className="shoulder-arc-right">
          <h2>Exercise Results</h2>

          <ShoulderClockArc angle={analytics?.currentAngle ?? 0} />

          <div className="shoulder-arc-stats">
            <div className="shoulder-arc-stat">
              <span>Current Angle</span>
              <strong>{analytics?.currentAngle ?? 0}°</strong>
            </div>

            <div className="shoulder-arc-stat">
              <span>Peak Angle</span>
              <strong>{analytics?.peakAngle ?? 0}°</strong>
            </div>

            <div className="shoulder-arc-stat">
              <span>Hold Time</span>
              <strong>
                {(analytics?.currentHoldSeconds ?? 0).toFixed(1)} sec
              </strong>
            </div>

            <div className="shoulder-arc-stat">
              <span>Hold Progress</span>
              <strong>
                {(analytics?.holdProgressPercent ?? 0).toFixed(0)}%
              </strong>
            </div>

            <div className="shoulder-arc-stat">
              <span>Repetitions</span>
              <strong>
                {analytics?.repCount ?? 0} / {analytics?.targetReps ?? 10}
              </strong>
            </div>

            {/* completion msg */}
            {analytics && analytics.repCount >= analytics.targetReps && (
              <div className="target-completed">
                🎉 Target completed! You can continue if you want.
                
              </div>

            )}
            <div className="shoulder-arc-stat">
              <span>Exercise State</span>
              <strong>{analytics?.repState ?? "resting"}</strong>
            </div>
          </div>

          <div className="shoulder-arc-feedback">
            {analytics?.feedbackMessage ?? "Start the camera and get ready"}
          </div>

          <h3>Repetition History</h3>

          {analytics?.history.length ? (
            analytics.history.map((rep) => (
              <p key={rep.id}>
                {rep.side} shoulder - {rep.peakAngle}° -
                {rep.holdTimeSeconds.toFixed(1)} seconds
              </p>
            ))
          ) : (
            <p>No repetitions completed yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}
