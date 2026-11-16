# HappyMoves Cam — Intern Engineering Guide & Instructions

Welcome to the **HappyMoves Cam** project!

This document contains everything you need to set up the repository, pick your assigned module task, implement the code in the correct folder, and submit your work through GitHub without breaking anyone else's code.

---

## 1. Quick Project Overview
**HappyMoves Cam** is a computer-vision rehabilitation web application. It uses real-time webcam tracking (MediaPipe) to track patient body movements (pose, hands, face) and turns physiotherapy exercises into engaging, measurable arcade games.

- **Stack**: React 19 + TypeScript + Vite.
- **Tracking**: In-browser MediaPipe (`useTracker` hook).
- **Architecture**: Pluggable modules. Every subfolder in `src/modules/` is automatically registered and discovered by the app.

---

## 2. Initial Setup (First-Time Only)

1. **Clone the repository:**
   ```bash
   git clone <REPO_URL>
   cd happymoves-cam
   ```
2. **Install dependencies:**
   ```bash
   npm install
   ```
3. **Start local development server:**
   ```bash
   npm run dev
   ```
   Open `http://localhost:5173` in Chrome or Edge to view the app and test your camera.

---

## 3. Branching Rule (CRITICAL)

> [!IMPORTANT]
> **NEVER code directly on the `main` branch.**
> Always create a feature branch dedicated to your task.

Before writing any code, create and switch to your branch:
```bash
git checkout -b feature/<your-task-name>
```
*(Example: `git checkout -b feature/task1-reach-grasp`)*

---

## 4. Task Assignments & Folders Matrix

Find your assigned task below. Read the full specification file in the `tasks/` directory before coding:

| Task # | Task Document | Assigned Folder to Create | Feature Branch Name | Vision Tracker Type |
| :---: | :--- | :--- | :--- | :--- |
| **Task 1** | [`tasks/TASK_01_FINE_MOTOR_PINCH.md`](./TASK_01_FINE_MOTOR_PINCH.md) | `src/modules/task1-reach-grasp/` | `feature/task1-reach-grasp` | `useTracker({ kind: 'hands' })` |
| **Task 2** | [`tasks/TASK_02_FINGER_MOTION_PIANO.md`](./TASK_02_FINGER_MOTION_PIANO.md) | `src/modules/task2-gesture-match/` | `feature/task2-gesture-match` | `useTracker({ kind: 'hands' })` |
| **Task 3** | [`tasks/TASK_03_SHOULDER_CLOCK_ARC.md`](./TASK_03_SHOULDER_CLOCK_ARC.md) | `src/modules/task3-shoulder-arc/` | `feature/task3-shoulder-arc` | `useTracker({ kind: 'pose' })` |
| **Task 4** | [`tasks/TASK_04_SHOULDER_SHELF_REACH.md`](./TASK_04_SHOULDER_SHELF_REACH.md) | `src/modules/task4-shelf-reach/` | `feature/task4-shelf-reach` | `useTracker({ kind: 'pose' })` |
| **Task 5** | [`tasks/TASK_05_NECK_HORIZONTAL_GLANCE.md`](./TASK_05_NECK_HORIZONTAL_GLANCE.md) | `src/modules/task5-neck-horizontal/` | `feature/task5-neck-horizontal` | `useTracker({ kind: 'pose' })` |
| **Task 6** | [`tasks/TASK_06_NECK_VERTICAL_STARS.md`](./TASK_06_NECK_VERTICAL_STARS.md) | `src/modules/task6-neck-vertical/` | `feature/task6-neck-vertical` | `useTracker({ kind: 'pose' })` |
| **Task 7** | [`tasks/TASK_07_LEG_KNEE_SOCCER.md`](./TASK_07_LEG_KNEE_SOCCER.md) | `src/modules/task7-knee-soccer/` | `feature/task7-knee-soccer` | `useTracker({ kind: 'pose' })` |
| **Task 8** | [`tasks/TASK_08_LEG_SLALOM_BALANCE.md`](./TASK_08_LEG_SLALOM_BALANCE.md) | `src/modules/task8-slalom-balance/` | `feature/task8-slalom-balance` | `useTracker({ kind: 'pose' })` |

---

## 5. Folder & File Structure for Your Module

Inside your assigned module folder (e.g. `src/modules/task1-reach-grasp/`), create these standard files:

```
src/modules/<your-assigned-folder>/
├── index.ts               # Module manifest (Registers your module)
├── <ModuleName>Module.tsx # Main React component (Split view: Camera/Game on Left, Telemetry on Right)
├── analytics.ts           # Math, landmark formulas, scoring, thresholds
├── types.ts               # TypeScript types for telemetry & game state
└── <moduleName>.css       # Custom component styling
```

### Module Registration Template (`index.ts`)
Copy and adapt this snippet into your `index.ts`:

```typescript
import { lazy } from 'react';
import { defineModule } from '@/core/types/module';

export default defineModule({
  id: 'your-module-id',                // e.g. 'reach-and-grasp'
  title: 'Your Module Title',          // e.g. 'Reach & Grasp Exercise'
  summary: 'Brief 1-sentence description of the exercise.',
  categoryId: 'hand-gross-motor',      // category ID specified in your task doc
  activityId: 'gross-grasp-and-release',// activity slug specified in your task doc
  status: 'demo',
  requiresCamera: true,
  tracking: ['hands'],                 // 'hands' or 'pose'
  component: lazy(() => import('./YourModuleNameModule')),
});
```
*(Because of `import.meta.glob`, the app automatically discovers your module. You do NOT need to touch central config files).*

---

## 6. How to Hook into the Camera & Vision Tracker

In your main `<ModuleName>Module.tsx`, use our built-in hooks:

```typescript
import { useRef, useEffect } from 'react';
import { useCamera } from '@/hooks/useCamera';
import { useTracker } from '@/hooks/useTracker';

export default function YourModuleNameModule() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const camera = useCamera(videoRef);
  const tracker = useTracker({
    kind: 'hands', // or 'pose' depending on your task
    videoRef,
    canvasRef,
    enabled: camera.status === 'active',
    onFrame: (frame) => {
      // 1. For hand tracking: frame.hands[0].landmarks
      // 2. For pose tracking: frame.pose (33 points)
      // Call your math functions from analytics.ts here!
    },
  });

  useEffect(() => {
    if (camera.status === 'idle') camera.start();
  }, [camera]);

  return (
    <div className="module-layout">
      {/* Viewport & Canvas Overlay */}
      <video ref={videoRef} playsInline muted autoPlay />
      <canvas ref={canvasRef} />

      {/* Your Telemetry Dashboard on Right */}
    </div>
  );
}
```

---

## 7. Quality Checklist Before Submitting

Before pushing your branch, you **MUST** verify these 4 points:

- [ ] **Typecheck Passes**: Run `npm run typecheck` or `npm run build` in your terminal. It must finish with **0 errors**.
- [ ] **No Unused Imports**: TypeScript will fail the build if you have unused variables or imports (`noUnusedLocals`).
- [ ] **Isolated Code**: You only created/modified files inside your assigned module folder.
- [ ] **Data Persisted**: At the end of a session, results are saved to `localStorage` (e.g. `localStorage.setItem('taskX_results', ...)`).

---

## 8. Submitting Your Code (Pull Request Workflow)

1. **Commit your changes:**
   ```bash
   git add .
   git commit -m "feat: implement task X module"
   ```
2. **Push your branch to GitHub:**
   ```bash
   git push origin feature/<your-task-name>
   ```
3. **Open a Pull Request:**
   - Go to the repository page on GitHub.
   - Click the green **"Compare & pull request"** button.
   - Add a brief description of what you implemented and attach a screenshot.
   - Click **"Create pull request"**.
4. **Notify the Lead**: Let the lead know your PR is ready for review. Once approved, it will be merged into `main`!

Happy coding! Let's build the future of physical therapy together.

