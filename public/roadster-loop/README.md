# Roadster Loop — Night Run

A cinematic 3D night-time sports car ramp stunt game prototype built with HTML, CSS, JavaScript, and Three.js. The game features realistic procedural vehicle modeling, a giant curved wall ramp, drag-strip countdown lights, cold-gas thrusters, flip stunts, ring collectibles, real-time G-force and altitude gauges, and comprehensive landing physics.

## Visual & Gameplay Target
- Exact reproduction of the high-contrast midnight neon racing aesthetic matching reference screenshots.
- 4-light drag-strip starting tree with sequenced amber/red and all-green launch signaling.
- Dynamic camera tracking: starts in chase perspective behind the sports car, ascends the vertical ramp, and pulls into a cinematic tracking shot for airborne stunts.
- Real-time physics engine evaluating pitch rotation, cold-gas thrusters, G-forces, altitude, flip counts, ring pickups, and sink speed touchdown limits (< 39 ft/s).

## Run Locally
1. Extract the `roadster-loop` folder.
2. Open `index.html` directly in any modern browser (Chrome, Safari, Edge, Firefox).
3. Alternatively, run a lightweight local server:
   ```bash
   python -m http.server 8000
   ```
   and visit `http://localhost:8000`.

## Controls
- **Start**: Click **START RUN** or press **Space**.
- **Launch**: Press **Space**, click the screen, or tap **GO** on green.
- **Flip**: Use **Left / Right arrow keys** or **A / D** (or on-screen **← / →** buttons) to rotate.
- **Cold-Gas Thrusters**: Hold **Space**, **W / Up Arrow**, or on-screen **THRUST** button to fire thrusters.
- **Restart**: Press **Space** or **Enter**, or click **RUN IT AGAIN**.

## Deliverable Quality Assurance
- Countdown state machine fixed: no stuck `00` or contradictory instructions.
- All 4 traffic lights turn emerald green with `GO!` on launch.
- Jump starts (< 3.2s) properly trigger warning toast and lockout.
- Zero duplicate render loops, listeners, or canvas contexts on reset.
