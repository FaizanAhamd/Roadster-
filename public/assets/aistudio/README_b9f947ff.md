# Roadster Loop — Night Run

A browser-based 3D stunt-game prototype built with HTML, CSS, JavaScript, and Three.js. The vehicle uses curved extruded geometry, alloy-style wheels, glass canopy shading, road lighting, a loop ramp, ring pickups, thruster effects, a score HUD, and crash/landing results.

## Run locally
1. Extract the `roadster-loop` folder.
2. Open `index.html` in a modern browser with an internet connection.
3. If local-file restrictions interfere, run `python -m http.server 8000` inside the folder, then visit `http://localhost:8000`.

Three.js is loaded from cdnjs, and the styles use Google Fonts when available. Those external resources require a network connection; the game itself has no backend.

## Controls
- Click **START ENGINE** and wait for the green light.
- Press **Space** or tap **GO** after green to launch.
- Use **Left / Right arrows** or **A / D** to rotate in flight.
- Hold **Space** or the mobile **THRUST** control during flight.
- On narrow screens, use the on-screen left/right and GO/THRUST buttons.
- Use the sound button to toggle effects.
- Click **RUN IT AGAIN** to restart.

## QA and diagnostics
- Run `node --check game.js` to check JavaScript syntax.
- Once the game loads, open the browser console and run `runRoadsterLoopSanityTest()` for element, Three.js, renderer, and canvas checks. The root HTML element receives `data-roadster-sanity="PASS"` or `"FAIL"`.
- Runtime JavaScript errors are logged to the console with the `[Roadster Loop runtime error]` prefix.
- Source-level checks passed for JavaScript syntax, required HTML IDs, and duplicate IDs. A full Chromium runtime test could not be completed in the build environment because external CDN DNS was unavailable. The page now shows an initialization message if Three.js or WebGL fails; after opening with internet access, run the sanity test and play-test both desktop and mobile controls. A clean stunt landing is a gameplay outcome and has not been certified.

## Project files
- `index.html` — game page, HUD, touch controls, and Three.js loader
- `style.css` — responsive layout and visual styling
- `game.js` — scene, car geometry, game loop, inputs, scoring, sanity tests
- `privacy.html` — privacy notice
- `ads.txt` — placeholder; no ad provider is configured
- `README.md` — setup, controls, and QA instructions

The game stores the best score in browser `localStorage`. It is an unofficial fan prototype and is not affiliated with Tesla.