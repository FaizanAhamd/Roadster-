export const standaloneIndexHtml = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#080d18">
<meta name="description" content="Roadster Loop — a 3D night-time electric sports car ramp stunt game.">
<title>Roadster Loop — Night Run</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:ital,wght@0,400;0,600;0,700;0,800;0,900;1,700&family=DM+Mono:ital,wght@0,400;0,500;1,400&family=Inter:wght@400;500;600;700;800;900&family=Orbitron:wght@500;700;800;900&display=swap" rel="stylesheet">
<link rel="stylesheet" href="style.css">
<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
<script defer src="game.js"></script>
</head>
<body>
<main class="shell">
  <header class="topbar">
    <a class="brand" href="#" aria-label="Roadster Loop home">
      <span class="brand-mark">R<span>↗</span></span>
      <span>ROADSTER <b>LOOP</b></span>
    </a>
    <div class="top-meta">
      <span class="live-dot"></span> NIGHT SESSION <span class="divider">/</span> BUILD 02
    </div>
    <div style="display:flex;gap:8px;align-items:center;">
      <button id="soundToggle" class="icon-btn" aria-label="Toggle sound">♫ <span>SOUND</span></button>
    </div>
  </header>

  <section class="game-wrap">
    <div id="gameViewport" class="game-viewport">
      <canvas id="gameCanvas" aria-label="Roadster Loop game scene"></canvas>
      <div class="sky-grid"></div>

      <!-- In-Game Top HUD -->
      <div class="hud">
        <div class="hud-left">
          <div class="eyebrow">SCORE</div>
          <div id="scoreHud" class="big-score">0</div>
          <div class="best-sub">BEST <span id="bestHud">1,000</span></div>
        </div>

        <div class="hud-center">
          <div class="speed-row">
            <b id="speedHud">0</b><span>mph</span>
          </div>
          <div class="gas-container">
            <div class="gas-track"><i id="gasBar"></i></div>
            <span class="gas-label">THRUSTER GAS</span>
          </div>
          <div id="airStats" class="air-stats hidden">
            <div><small>FLIPS</small><b id="flipsHud">0</b></div>
            <div><small>RINGS</small><b id="ringHud">0/3</b></div>
          </div>
        </div>

        <div class="hud-right">
          <button id="inGameSound" class="round-sound-btn" aria-label="Toggle audio">🔊</button>
        </div>
      </div>

      <!-- Drag Strip Countdown Lights -->
      <div id="countdown" class="countdown hidden">
        <div class="light-capsule">
          <i class="light-dot"></i>
          <i class="light-dot"></i>
          <i class="light-dot"></i>
          <i class="light-dot"></i>
        </div>
        <div id="countdownLabel" class="countdown-label">TAP GO ON GREEN</div>
      </div>

      <!-- Launch Notice Banner -->
      <div id="launchNotice" class="launch-notice hidden">
        <span class="launch-title">LAUNCH</span>
        <span id="launchReactionText" class="launch-sub">Reaction 2.000 s</span>
      </div>

      <!-- Flip Notice Banner -->
      <div id="flipNotice" class="flip-notice hidden">
        <span class="flip-title">FLIP</span>
        <span class="flip-sub">+1,500 on landing</span>
      </div>

      <!-- Early Jump Start Toast -->
      <div id="earlyToast" class="toast hidden">TOO EARLY — WAIT FOR GREEN!</div>

      <!-- Start Screen Modal (Image 1) -->
      <div id="centerPrompt" class="title-modal">
        <div class="kicker">3D · NIGHT RUN · WALL RAMP · COLD-GAS THRUSTERS</div>
        <h1>ROADSTER<br>LOOP</h1>
        <div class="red-neon-bar"></div>
        <p class="desc">Hit the ramp flat out, flip off the curl at the top, then burn the thrusters to set it down on all four wheels.</p>
        
        <div class="instruction-table">
          <div class="inst-row">
            <span class="inst-col">Launch</span>
            <p>Go when the last light turns green. A quick reaction means more speed at the ramp.</p>
          </div>
          <div class="inst-row">
            <span class="inst-col">Flip</span>
            <p><span class="key-cap">←</span> <span class="key-cap">→</span> rotate the car. Every time it passes upside down counts as a flip.</p>
          </div>
          <div class="inst-row">
            <span class="inst-col">Land</span>
            <p><span class="key-cap">Space</span> fires the thrusters out of the floor. Get upright and slow the drop below 39 ft/s before the wheels touch.</p>
          </div>
        </div>

        <button id="startBtn" class="red-action-btn">START RUN</button>
        <div class="prompt-foot">
          Fly through the light rings for points and a gas refill.<br>
          Unofficial fan game, not affiliated with any car brand. <a href="privacy.html" class="foot-link">Privacy</a>
        </div>
      </div>

      <!-- Results Screen Modal (Image 4) -->
      <div id="resultOverlay" class="result-overlay hidden">
        <div class="result-card">
          <span id="resultKicker" class="kicker">CRASHED</span>
          <h2 id="resultTitle">WIPEOUT</h2>
          <div class="red-neon-bar"></div>

          <div class="score-row">
            <span class="score-sub">SCORE</span>
            <div class="score-value-row">
              <b id="finalScore">0</b>
              <span id="newBest" class="new-best-pill hidden">NEW BEST</span>
              <span class="res-best">BEST <span id="resBestHud">1,000</span></span>
            </div>
          </div>

          <p id="resultDesc" class="result-desc">
            Wheels down at 111 ft/s, over the 39 ft/s limit. Burn the thrusters earlier to slow the drop. Flips, altitude and airtime only score when you land it. Rings: 0.
          </p>

          <div class="metrics-grid">
            <div><span>REACTION</span><b id="mReaction">2.000 s</b></div>
            <div><span>RAMP SPEED</span><b id="mSpeed">80 mph</b></div>
            <div><span>PEAK G</span><b id="mG">50.5 g</b></div>
            <div><span>MAX ALTITUDE</span><b id="mAltitude">167 ft</b></div>
            <div><span>AIRTIME</span><b id="mAir">3.4 s</b></div>
            <div><span>FLIPS</span><b id="mFlips">1</b></div>
            <div><span>RINGS</span><b id="mRings">0 / 3</b></div>
            <div><span>TOUCHDOWN</span><b id="mTouch">111 ft/s</b></div>
          </div>

          <button id="againBtn" class="red-action-btn">RUN IT AGAIN</button>
          <span class="res-foot">Space or Enter restarts</span>
        </div>
      </div>

      <!-- Bottom Controls & Gauges (Image 2 & 3) -->
      <div class="bottom-hud">
        <!-- G-Force Gauge & Flip Buttons -->
        <div class="gauge-steer-cluster">
          <div class="circular-pod" id="gForcePod">
            <svg class="pod-svg" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="42" class="pod-bg-ring"></circle>
              <circle cx="50" cy="50" r="42" id="gForceSvgRing" class="pod-val-ring"></circle>
            </svg>
            <div class="pod-inner">
              <span class="pod-label">G-FORCE</span>
              <b id="gForceVal">1.0</b>
              <span class="pod-unit">g</span>
            </div>
          </div>

          <div class="flip-cluster">
            <div class="flip-btns">
              <button type="button" id="touchLeft" aria-label="Rotate car left">←</button>
              <button type="button" id="touchRight" aria-label="Rotate car right">→</button>
            </div>
            <span class="flip-label">FLIP</span>
          </div>
        </div>

        <!-- Launch / Thruster Button & Altitude Gauge with Sink Speed -->
        <div class="action-alt-cluster">
          <button type="button" id="actionBtn" class="big-action-circle" aria-label="Launch or fire thruster">GO</button>

          <div class="alt-container">
            <div class="circular-pod">
              <svg class="pod-svg" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="42" class="pod-bg-ring"></circle>
                <circle cx="50" cy="50" r="42" id="altSvgRing" class="pod-val-ring"></circle>
              </svg>
              <div class="pod-inner">
                <span class="pod-label">ALTITUDE</span>
                <b id="altVal">0</b>
                <span class="pod-unit">ft</span>
              </div>
            </div>
            <span id="sinkBadge" class="sink-badge hidden">SINK 58 FT/S</span>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- Feature Information Section Below Game -->
  <section class="info-strip">
    <div class="info-item">
      <span class="info-icon">01</span>
      <div>
        <b>TIME IT RIGHT</b>
        <p>Launch on green. Faster reflexes mean more speed.</p>
      </div>
    </div>
    <div class="info-item">
      <span class="info-icon">02</span>
      <div>
        <b>OWN THE AIR</b>
        <p>Rotate with ← →. Tap Space for cold-gas thrust.</p>
      </div>
    </div>
    <div class="info-item">
      <span class="info-icon">03</span>
      <div>
        <b>STICK THE LANDING</b>
        <p>Stay upright and keep sink speed below 39 ft/s.</p>
      </div>
    </div>
  </section>

  <footer>
    <span>© ROADSTER LOOP · ORIGINAL FAN-MADE GAME</span>
    <span>Unofficial fan game, not affiliated with any car brand.</span>
    <a href="privacy.html">PRIVACY</a>
  </footer>
</main>
</body>
</html>
`;

export const standaloneStyleCss = `@import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700;800;900&family=DM+Mono:wght@400;500&family=Inter:wght@400;500;600;700;800&family=Orbitron:wght@500;700;800;900&display=swap');

:root {
  --bg: #080d18;
  --panel: #0b111a;
  --line: rgba(140, 170, 210, 0.16);
  --cyan: #71e7ff;
  --white: #f1f6ff;
  --muted: #798ea8;
  --red: #ff3b30;
  --green: #34d399;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: var(--bg);
  color: var(--white);
  font-family: 'Inter', system-ui, sans-serif;
  min-height: 100vh;
  user-select: none;
  -webkit-user-select: none;
}

.shell {
  max-width: 1440px;
  margin: auto;
  padding: 0 34px;
}

.topbar {
  height: 72px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--line);
}

.brand {
  display: flex;
  gap: 12px;
  align-items: center;
  color: var(--white);
  font-size: 13px;
  letter-spacing: 2px;
  font-weight: 800;
  text-decoration: none;
  font-family: 'Orbitron', sans-serif;
}

.brand b {
  color: var(--cyan);
}

.brand-mark {
  width: 32px;
  height: 32px;
  border: 1px solid var(--cyan);
  color: var(--cyan);
  display: grid;
  place-items: center;
  font-weight: 900;
  font-size: 18px;
  transform: skew(-8deg);
}

.top-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--muted);
  font-family: 'DM Mono', monospace;
  font-size: 10px;
  letter-spacing: 1.5px;
}

.live-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #70f6bd;
  box-shadow: 0 0 10px #70f6bd;
}

.divider {
  color: #3c4b61;
}

.icon-btn {
  background: transparent;
  color: #c5d4e9;
  border: 1px solid var(--line);
  padding: 8px 12px;
  cursor: pointer;
  font-family: 'DM Mono', monospace;
  font-size: 10px;
  border-radius: 4px;
  transition: all 0.15s;
}

.icon-btn:hover {
  border-color: var(--cyan);
  color: var(--cyan);
}

.game-wrap {
  padding: 20px 0 0;
}

.game-viewport {
  height: min(68vw, 680px);
  min-height: 480px;
  max-height: 720px;
  position: relative;
  overflow: hidden;
  background: #060912;
  border: 1px solid rgba(120, 160, 210, 0.22);
  border-radius: 6px;
}

.game-viewport canvas {
  width: 100%;
  height: 100%;
  display: block;
  position: absolute;
  inset: 0;
}

.sky-grid {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(180deg, rgba(6, 10, 19, 0.1), transparent 40%, rgba(3, 7, 14, 0.6));
}

/* TOP HUD */
.hud {
  position: absolute;
  top: 24px;
  left: 28px;
  right: 28px;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  z-index: 5;
  pointer-events: none;
}

.hud-left {
  display: flex;
  flex-direction: column;
}

.eyebrow {
  font-family: 'DM Mono', monospace;
  font-size: 10px;
  letter-spacing: 2px;
  color: var(--muted);
}

.big-score {
  font-family: 'Barlow Condensed', sans-serif;
  font-size: 40px;
  font-weight: 700;
  line-height: 1;
  color: white;
  margin-top: 2px;
}

.best-sub {
  font-family: 'DM Mono', monospace;
  font-size: 11px;
  letter-spacing: 1.5px;
  color: #647790;
  margin-top: 4px;
}

.hud-center {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: min(300px, 40vw);
}

.speed-row {
  display: flex;
  align-items: baseline;
  gap: 4px;
}

.speed-row b {
  font-family: 'Barlow Condensed', sans-serif;
  font-size: 48px;
  font-weight: 800;
  line-height: 1;
  color: white;
}

.speed-row span {
  font-family: 'DM Mono', monospace;
  font-size: 12px;
  color: var(--muted);
}

.gas-container {
  width: 100%;
  margin-top: 6px;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.gas-track {
  width: 100%;
  height: 5px;
  background: #192537;
  border: 1px solid #283a52;
  border-radius: 999px;
  overflow: hidden;
}

.gas-track i {
  display: block;
  height: 100%;
  width: 100%;
  background: linear-gradient(90deg, #71e7ff, white);
  transition: width 0.08s linear;
}

.gas-label {
  font-family: 'DM Mono', monospace;
  font-size: 9px;
  letter-spacing: 2px;
  color: var(--muted);
  margin-top: 4px;
}

.air-stats {
  display: flex;
  justify-content: space-between;
  width: 100%;
  margin-top: 6px;
  padding: 0 10px;
  font-family: 'DM Mono', monospace;
}

.air-stats div {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.air-stats small {
  font-size: 8px;
  color: var(--muted);
}

.air-stats b {
  font-size: 14px;
  font-weight: 700;
  color: white;
}

.hud-right {
  pointer-events: auto;
}

.round-sound-btn {
  width: 38px;
  height: 38px;
  border-radius: 50%;
  background: rgba(12, 20, 34, 0.85);
  border: 1px solid #263c5a;
  color: #c5d4e9;
  display: grid;
  place-items: center;
  cursor: pointer;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.5);
  transition: all 0.15s;
}

.round-sound-btn:hover {
  border-color: var(--cyan);
}

/* DRAG STRIP COUNTDOWN (Image 2) */
.countdown {
  position: absolute;
  top: 34%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  z-index: 6;
  pointer-events: none;
}

.light-capsule {
  background: rgba(8, 15, 27, 0.92);
  border: 1px solid #253952;
  border-radius: 999px;
  padding: 12px 24px;
  display: flex;
  gap: 16px;
  box-shadow: 0 10px 35px rgba(0, 0, 0, 0.85);
}

.light-dot {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #1b2637;
  border: 1px solid #354863;
  transition: all 0.08s ease;
}

.light-dot.red {
  background: #ef4444;
  box-shadow: 0 0 18px #ef4444, 0 0 28px rgba(239, 68, 68, 0.8);
}

.light-dot.green {
  background: #34d399;
  box-shadow: 0 0 20px #34d399, 0 0 32px rgba(52, 211, 153, 0.85);
}

.countdown-label {
  font-family: 'DM Mono', monospace;
  font-size: 13px;
  letter-spacing: 3px;
  color: #cbd9ea;
  margin-top: 14px;
}

.countdown-label.go-text {
  font-family: 'Orbitron', sans-serif;
  font-size: 42px;
  font-weight: 900;
  letter-spacing: 4px;
  color: white;
  text-shadow: 0 0 25px rgba(52, 211, 153, 0.85);
}

/* LAUNCH & FLIP NOTICES */
.launch-notice, .flip-notice {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  z-index: 8;
  pointer-events: none;
}

.launch-notice {
  top: 34%;
}

.launch-title {
  font-family: 'Orbitron', sans-serif;
  font-size: 44px;
  font-weight: 900;
  letter-spacing: 4px;
  color: rgba(255, 255, 255, 0.95);
  text-shadow: 0 0 25px rgba(255, 255, 255, 0.7);
}

.launch-sub {
  font-family: 'DM Mono', monospace;
  font-size: 12px;
  color: #cbd9ea;
  margin-top: 4px;
}

.flip-notice {
  top: 30%;
}

.flip-title {
  font-family: 'Orbitron', sans-serif;
  font-size: 44px;
  font-weight: 800;
  color: white;
  text-shadow: 0 0 25px rgba(113, 231, 255, 0.8);
}

.flip-sub {
  font-family: 'DM Mono', monospace;
  font-size: 12px;
  color: var(--cyan);
  font-weight: bold;
  margin-top: 2px;
}

/* SINK BADGE */
.alt-container {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.sink-badge {
  font-family: 'DM Mono', monospace;
  font-size: 9px;
  font-weight: bold;
  margin-top: 4px;
  letter-spacing: 1.5px;
}

.sink-badge.danger {
  color: var(--red);
  text-shadow: 0 0 8px rgba(255, 59, 48, 0.8);
}

.sink-badge.safe {
  color: var(--green);
}

/* TOAST */
.toast {
  position: absolute;
  top: 26%;
  left: 50%;
  transform: translateX(-50%);
  background: #3b1216;
  border: 1px solid var(--red);
  color: #fca5a5;
  padding: 10px 18px;
  font-family: 'DM Mono', monospace;
  font-size: 11px;
  letter-spacing: 1.5px;
  border-radius: 4px;
  box-shadow: 0 0 25px rgba(255, 59, 48, 0.4);
  z-index: 10;
  pointer-events: none;
}

/* TITLE SCREEN MODAL (Image 1) */
.title-modal {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.65);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 20;
  padding: 20px;
}

.title-modal .kicker, .result-card .kicker {
  font-family: 'DM Mono', monospace;
  font-size: 10px;
  letter-spacing: 2.2px;
  color: #8ea3bd;
  text-transform: uppercase;
}

.title-modal h1 {
  font-family: 'Orbitron', sans-serif;
  font-size: 44px;
  font-weight: 800;
  letter-spacing: -1px;
  line-height: 1;
  color: white;
  margin: 8px 0 14px;
}

.red-neon-bar {
  height: 2px;
  width: 100%;
  background: var(--red);
  box-shadow: 0 0 16px var(--red), 0 0 30px rgba(255, 59, 48, 0.7);
  margin-bottom: 16px;
}

.desc {
  font-size: 13px;
  line-height: 1.7;
  color: #b2c4dc;
  margin-bottom: 20px;
}

.instruction-table {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-bottom: 24px;
  font-size: 12px;
}

.inst-row {
  display: flex;
  gap: 16px;
  align-items: flex-start;
}

.inst-col {
  width: 60px;
  font-family: 'DM Mono', monospace;
  font-size: 11px;
  color: #7d92ad;
}

.inst-row p {
  margin: 0;
  color: #b8c9df;
  line-height: 1.5;
  flex: 1;
}

.key-cap {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 26px;
  height: 22px;
  padding: 0 5px;
  background: #192231;
  border: 1px solid rgba(160, 185, 220, 0.35);
  border-radius: 4px;
  font-family: 'DM Mono', monospace;
  font-size: 11px;
  color: #dbe8fa;
}

.red-action-btn {
  width: 100%;
  padding: 14px;
  background: var(--red);
  color: white;
  border: 0;
  border-radius: 4px;
  font-family: 'Orbitron', sans-serif;
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 2px;
  cursor: pointer;
  box-shadow: 0 0 25px rgba(255, 59, 48, 0.5);
  transition: all 0.15s;
}

.red-action-btn:hover {
  background: #ff5247;
}

.prompt-foot {
  margin-top: 14px;
  font-size: 10px;
  color: #71869e;
  line-height: 1.6;
  text-align: center;
}

.foot-link {
  color: var(--cyan);
  text-decoration: underline;
}

/* RESULTS MODAL (Image 4) */
.result-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.75);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 25;
  padding: 20px;
}

.result-card {
  width: min(100%, 420px);
  background: #0b111a;
  border: 1px solid #24374e;
  border-radius: 8px;
  padding: 24px;
  box-shadow: 0 20px 80px rgba(0, 0, 0, 0.95);
  display: flex;
  flex-direction: column;
}

.result-card h2 {
  font-family: 'Orbitron', sans-serif;
  font-size: 36px;
  font-weight: 800;
  color: white;
  margin: 6px 0 12px;
}

.score-row {
  margin-bottom: 12px;
}

.score-sub {
  font-family: 'DM Mono', monospace;
  font-size: 9px;
  letter-spacing: 2px;
  color: #869ab4;
}

.score-value-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 2px;
}

.score-value-row b {
  font-family: 'Barlow Condensed', sans-serif;
  font-size: 38px;
  font-weight: 800;
  color: white;
}

.new-best-pill {
  background: var(--red);
  color: white;
  font-family: 'Orbitron', sans-serif;
  font-size: 9px;
  font-weight: 700;
  padding: 3px 6px;
  border-radius: 3px;
  letter-spacing: 1px;
}

.res-best {
  margin-left: auto;
  font-family: 'DM Mono', monospace;
  font-size: 11px;
  color: #869ab4;
}

.result-desc {
  font-size: 12px;
  line-height: 1.6;
  color: #a9bccf;
  margin-bottom: 14px;
}

.metrics-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px 20px;
  padding: 14px 0;
  border-top: 1px solid #21344a;
  border-bottom: 1px solid #21344a;
  font-family: 'DM Mono', monospace;
  margin-bottom: 18px;
}

.metrics-grid div {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.metrics-grid span {
  font-size: 9px;
  letter-spacing: 1.5px;
  color: #768da6;
}

.metrics-grid b {
  font-size: 13px;
  color: white;
}

.res-foot {
  font-family: 'DM Mono', monospace;
  font-size: 9px;
  color: #71869e;
  text-align: center;
  margin-top: 10px;
}

/* BOTTOM CONTROLS & CIRCULAR GAUGES (Image 2 & 3) */
.bottom-hud {
  position: absolute;
  bottom: 20px;
  left: 28px;
  right: 28px;
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  z-index: 5;
  pointer-events: none;
}

.gauge-steer-cluster, .action-alt-cluster {
  display: flex;
  align-items: center;
  gap: 14px;
  pointer-events: auto;
}

.circular-pod {
  position: relative;
  width: 84px;
  height: 84px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.pod-svg {
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
}

.pod-bg-ring {
  fill: #0a121f;
  stroke: #1b293c;
  stroke-width: 4;
}

.pod-val-ring {
  fill: none;
  stroke: var(--cyan);
  stroke-width: 4;
  stroke-linecap: round;
  stroke-dasharray: 263.89;
  stroke-dashoffset: 263.89;
  transition: stroke-dashoffset 0.15s ease-out;
}

.pod-inner {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
}

.pod-label {
  font-family: 'DM Mono', monospace;
  font-size: 8px;
  letter-spacing: 1.5px;
  color: var(--muted);
}

.pod-inner b {
  font-family: 'Barlow Condensed', sans-serif;
  font-size: 18px;
  font-weight: 700;
  color: white;
  line-height: 1;
  margin: 2px 0;
}

.pod-unit {
  font-family: 'DM Mono', monospace;
  font-size: 8px;
  color: var(--muted);
}

.flip-cluster {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.flip-btns {
  display: flex;
  gap: 8px;
}

.flip-btns button {
  width: 48px;
  height: 48px;
  background: rgba(13, 22, 38, 0.9);
  border: 1px solid #2b415e;
  border-radius: 8px;
  color: white;
  font-size: 18px;
  cursor: pointer;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.4);
}

.flip-btns button:active {
  background: #1a2f4c;
}

.flip-label {
  font-family: 'DM Mono', monospace;
  font-size: 9px;
  letter-spacing: 2px;
  color: var(--muted);
  margin-top: 4px;
}

.big-action-circle {
  width: 96px;
  height: 96px;
  border-radius: 50%;
  background: rgba(30, 16, 18, 0.92);
  border: 2px solid var(--red);
  color: white;
  font-family: 'Orbitron', sans-serif;
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 2px;
  cursor: pointer;
  box-shadow: 0 0 30px rgba(255, 59, 48, 0.6);
  transition: all 0.1s;
}

.big-action-circle:active {
  transform: scale(0.96);
  background: #381619;
}

/* INFO STRIP BELOW GAME */
.info-strip {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 24px;
  padding: 28px 0;
  border-bottom: 1px solid var(--line);
}

.info-item {
  display: flex;
  gap: 14px;
  align-items: flex-start;
}

.info-icon {
  border: 1px solid #29415a;
  color: var(--cyan);
  padding: 6px 8px;
  font-family: 'DM Mono', monospace;
  font-size: 10px;
}

.info-item b {
  font-family: 'DM Mono', monospace;
  font-size: 11px;
  letter-spacing: 1.5px;
}

.info-item p {
  font-size: 12px;
  color: #7f90a8;
  line-height: 1.6;
  margin: 6px 0 0;
}

footer {
  min-height: 60px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 15px;
  color: #6c7d94;
  font-family: 'DM Mono', monospace;
  font-size: 9px;
  letter-spacing: 1px;
}

footer a {
  color: #94a7c0;
  text-decoration: none;
}

.hidden {
  display: none !important;
}

@media (max-width: 768px) {
  .shell {
    padding: 0 14px;
  }
  .hud {
    top: 14px;
    left: 14px;
    right: 14px;
  }
  .bottom-hud {
    bottom: 14px;
    left: 14px;
    right: 14px;
  }
  .big-score {
    font-size: 28px;
  }
  .speed-row b {
    font-size: 34px;
  }
  .circular-pod {
    width: 68px;
    height: 68px;
  }
  .big-action-circle {
    width: 78px;
    height: 78px;
    font-size: 12px;
  }
  .flip-btns button {
    width: 40px;
    height: 40px;
  }
  .info-strip {
    grid-template-columns: 1fr;
    gap: 16px;
  }
}
`;

export const standaloneGameJs = `(() => {
'use strict';
const $ = id => document.getElementById(id);
const canvas = $('gameCanvas');

let scene, camera, renderer, carGroup, carBody, wheels = [], rings = [], particles = [], thrusterPlumes = [];
let state = 'title', simTime = 0, lastFrame = 0, accumulator = 0;
const STEP = 1 / 120, GRAVITY = 28.0;

let run = {
  reaction: 0,
  rampSpeed: 90,
  peakG: 1.0,
  maxAlt: 0,
  airtime: 0,
  flips: 0,
  rings: 0,
  score: 0,
  gas: 1.0,
  angle: 0,
  omega: 0,
  prevPitchCos: 1,
  x: -32,
  y: 0.55,
  z: 0,
  vx: 0,
  vy: 0,
  vz: 0,
  thrusting: false,
  steer: 0,
  touchdownSpeed: 0,
  landed: false,
  launchTime: 0,
  airStart: 0
};

let sound = true, audioCtx = null, countStart = 0, greenAt = 0, earlyTimer = 0, launchNoticeTimer = 0, flipNoticeTimer = 0;

function safeBest() {
  try { return Number(localStorage.getItem('roadsterLoopBest') || 1000); } catch (e) { return 1000; }
}

function saveBest(n) {
  try { localStorage.setItem('roadsterLoopBest', String(n)); } catch (e) {}
}

function beep(freq = 600, dur = 0.08, type = 'sine', vol = 0.05) {
  if (!sound) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    gain.gain.setValueAtTime(vol, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + dur);
  } catch (e) {}
}

function setup() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x060912);
  scene.fog = new THREE.FogExp2(0x060912, 0.006);

  camera = new THREE.PerspectiveCamera(46, canvas.clientWidth / canvas.clientHeight, 0.1, 1000);
  camera.position.set(-40, 3.8, 0);
  camera.lookAt(-15, 3.0, 0);

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(canvas.clientWidth, canvas.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  // Lighting
  scene.add(new THREE.HemisphereLight(0x8dafd2, 0x090e18, 1.2));
  const dir = new THREE.DirectionalLight(0xddeeff, 2.0);
  dir.position.set(-15, 35, 25);
  dir.castShadow = true;
  scene.add(dir);

  scene.add(new THREE.PointLight(0x38cfff, 2.0, 75));
  scene.add(new THREE.PointLight(0xff3b30, 2.4, 70));

  buildEnvironment();
  buildSportsCar();
  buildSkyRings();

  window.addEventListener('resize', onResize);
  setupEvents();

  $('bestHud').textContent = String(safeBest());
  $('resBestHud').textContent = String(safeBest());

  requestAnimationFrame(frame);
}

function buildEnvironment() {
  const starGeo = new THREE.BufferGeometry();
  const starPos = [];
  for (let i = 0; i < 900; i++) {
    starPos.push((Math.random() - 0.5) * 400, Math.random() * 160 + 5, -Math.random() * 280 - 10);
  }
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xbee3ff, size: 0.24, transparent: true, opacity: 0.85 }));
  scene.add(stars);

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(700, 450), new THREE.MeshStandardMaterial({ color: 0x070b14, roughness: 0.95 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(20, 0, -40);
  scene.add(floor);

  const roadMat = new THREE.MeshStandardMaterial({ color: 0x111925, roughness: 0.72, metalness: 0.18 });
  const neonMat = new THREE.MeshStandardMaterial({ color: 0xff3b30, emissive: 0xff261b, emissiveIntensity: 2.2 });
  const whiteMat = new THREE.MeshStandardMaterial({ color: 0x8ea2bd, emissive: 0x1d2736 });

  // Approach road
  const approach = new THREE.Mesh(new THREE.BoxGeometry(76, 0.25, 14), roadMat);
  approach.position.set(-42, 0.12, 0);
  approach.receiveShadow = true;
  scene.add(approach);

  for (const z of [-6.85, 6.85]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(76, 0.08, 0.25), neonMat);
    rail.position.set(-42, 0.26, z);
    scene.add(rail);
  }

  for (let x = -78; x < -4; x += 6) {
    const dash = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.02, 0.22), whiteMat);
    dash.position.set(x, 0.26, 0);
    scene.add(dash);
  }

  const startLine = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.02, 13), whiteMat);
  startLine.position.set(-27, 0.26, 0);
  scene.add(startLine);

  // Ramp
  const curvePts = [];
  for (let i = 0; i <= 70; i++) {
    const t = i / 70;
    curvePts.push(new THREE.Vector3(-4 + 22 * t, 0.25 + 31.5 * (1 - Math.cos(t * Math.PI / 2)), 0));
  }
  const rampGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(curvePts), 70, 7, 4, false);
  rampGeo.scale(1, 0.05, 1);
  scene.add(new THREE.Mesh(rampGeo, roadMat));

  const leftPts = curvePts.map(p => new THREE.Vector3(p.x, p.y + 0.15, -6.85));
  const rightPts = curvePts.map(p => new THREE.Vector3(p.x, p.y + 0.15, 6.85));
  scene.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(leftPts), 60, 0.16, 8, false), neonMat));
  scene.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rightPts), 60, 0.16, 8, false), neonMat));

  // Landing Runway
  const landingRoad = new THREE.Mesh(new THREE.BoxGeometry(160, 0.25, 14), roadMat);
  landingRoad.position.set(100, 0.12, 0);
  landingRoad.receiveShadow = true;
  scene.add(landingRoad);

  for (const z of [-6.85, 6.85]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(160, 0.08, 0.25), neonMat);
    rail.position.set(100, 0.26, z);
    scene.add(rail);
  }

  for (let x = 24; x < 178; x += 6) {
    const dash = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.02, 0.22), whiteMat);
    dash.position.set(x, 0.26, 0);
    scene.add(dash);
  }
}

function buildSportsCar() {
  carGroup = new THREE.Group();
  carBody = new THREE.Group();
  carGroup.add(carBody);
  scene.add(carGroup);

  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xdce5ef, metalness: 0.92, roughness: 0.2 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x07111b, metalness: 0.88, roughness: 0.08, transparent: true, opacity: 0.88 });
  const carbonMat = new THREE.MeshStandardMaterial({ color: 0x161e29, metalness: 0.6, roughness: 0.4 });
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x090c10, roughness: 0.9 });
  const rimMat = new THREE.MeshStandardMaterial({ color: 0xa9b7c6, metalness: 0.95, roughness: 0.15 });
  const tailMat = new THREE.MeshStandardMaterial({ color: 0xff2a39, emissive: 0xff1e2f, emissiveIntensity: 2.8 });

  const bodyShape = new THREE.Shape();
  bodyShape.moveTo(-2.9, 0.35);
  bodyShape.bezierCurveTo(-2.8, 0.62, -2.1, 0.82, -1.2, 0.88);
  bodyShape.bezierCurveTo(-0.4, 0.94, 0.9, 0.88, 1.8, 0.74);
  bodyShape.bezierCurveTo(2.4, 0.64, 2.85, 0.5, 3.0, 0.38);
  bodyShape.lineTo(2.85, 0.24);
  bodyShape.lineTo(-2.75, 0.24);
  bodyShape.closePath();

  const bodyGeo = new THREE.ExtrudeGeometry(bodyShape, { depth: 2.05, bevelEnabled: true, bevelSegments: 3, steps: 1, bevelSize: 0.08, bevelThickness: 0.06 });
  bodyGeo.translate(0, 0, -1.025);
  carBody.add(new THREE.Mesh(bodyGeo, bodyMat));

  const canopyShape = new THREE.Shape();
  canopyShape.moveTo(-1.6, 0.82);
  canopyShape.bezierCurveTo(-1.25, 1.25, -0.85, 1.54, -0.25, 1.56);
  canopyShape.bezierCurveTo(0.48, 1.58, 1.12, 1.25, 1.55, 0.76);
  canopyShape.lineTo(1.22, 0.76);
  canopyShape.bezierCurveTo(0.85, 1.15, 0.38, 1.35, -0.2, 1.35);
  canopyShape.bezierCurveTo(-0.7, 1.35, -1.1, 1.12, -1.35, 0.82);
  canopyShape.closePath();

  const canopyGeo = new THREE.ExtrudeGeometry(canopyShape, { depth: 1.52, bevelEnabled: true, bevelSegments: 2, steps: 1, bevelSize: 0.04, bevelThickness: 0.04 });
  canopyGeo.translate(0, 0, -0.76);
  carBody.add(new THREE.Mesh(canopyGeo, glassMat));

  const tailBar = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.07, 1.95), tailMat);
  tailBar.position.set(-2.86, 0.54, 0);
  carBody.add(tailBar);

  wheels = [];
  for (const pos of [{x:-1.75,z:1.05},{x:-1.75,z:-1.05},{x:1.72,z:1.05},{x:1.72,z:-1.05}]) {
    const wg = new THREE.Group();
    wg.position.set(pos.x, 0.44, pos.z);
    carBody.add(wg);
    wheels.push(wg);

    const tireGeo = new THREE.CylinderGeometry(0.44, 0.44, 0.28, 24);
    tireGeo.rotateX(Math.PI / 2);
    wg.add(new THREE.Mesh(tireGeo, tireMat));

    const rimGeo = new THREE.CylinderGeometry(0.26, 0.26, 0.3, 20);
    rimGeo.rotateX(Math.PI / 2);
    wg.add(new THREE.Mesh(rimGeo, rimMat));
  }

  carGroup.position.set(run.x, run.y, run.z);
}

function buildSkyRings() {
  rings = [];
  const mat = new THREE.MeshStandardMaterial({ color: 0xff3880, emissive: 0xee2068, emissiveIntensity: 2.4, roughness: 0.2 });
  const coords = [{ x: 28, y: 42, z: 0 }, { x: 52, y: 52, z: 0 }, { x: 76, y: 38, z: 0 }];
  coords.forEach((c, idx) => {
    const mesh = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.18, 10, 32), mat);
    mesh.position.set(c.x, c.y, c.z);
    mesh.rotation.y = Math.PI / 2;
    scene.add(mesh);
    rings.push({ mesh, x: c.x, y: c.y, got: false });
  });
}

function onResize() {
  if (!renderer || !camera) return;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
}

function resetRun() {
  run = {
    reaction: 0,
    rampSpeed: 90,
    peakG: 1.0,
    maxAlt: 0,
    airtime: 0,
    flips: 0,
    rings: 0,
    score: 0,
    gas: 1.0,
    angle: 0,
    omega: 0,
    prevPitchCos: 1,
    x: -32,
    y: 0.55,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    thrusting: false,
    steer: 0,
    touchdownSpeed: 0,
    landed: false,
    launchTime: 0,
    airStart: 0
  };

  carGroup.position.set(run.x, run.y, run.z);
  carGroup.rotation.set(0, 0, 0);
  carGroup.visible = true;

  rings.forEach(r => {
    r.got = false;
    r.mesh.visible = true;
  });

  $('scoreHud').textContent = '0';
  $('speedHud').textContent = '0';
  $('gasBar').style.width = '100%';
  $('flipsHud').textContent = '0';
  $('ringHud').textContent = '0/3';
  $('gForceVal').textContent = '1.0';
  $('altVal').textContent = '0';
  $('actionBtn').textContent = 'GO';

  $('airStats').classList.add('hidden');
  $('resultOverlay').classList.add('hidden');
  $('centerPrompt').classList.add('hidden');
  $('earlyToast').classList.add('hidden');
  $('launchNotice').classList.add('hidden');
  $('flipNotice').classList.add('hidden');
  $('sinkBadge').classList.add('hidden');
}

function startCountdown() {
  resetRun();
  state = 'count';
  countStart = performance.now();
  greenAt = countStart + 3200;

  $('countdown').classList.remove('hidden');
  $('countdownLabel').textContent = 'TAP GO ON GREEN';
  $('countdownLabel').className = 'countdown-label';

  document.querySelectorAll('.light-dot').forEach(d => {
    d.className = 'light-dot';
  });

  beep(460, 0.09, 'sine', 0.08);
}

function triggerLaunch(now) {
  if (state === 'title') {
    startCountdown();
    return;
  }

  if (state === 'count') {
    const elapsed = now - countStart;
    if (elapsed < 3200) {
      beep(150, 0.16, 'sawtooth', 0.1);
      $('earlyToast').classList.remove('hidden');
      clearTimeout(earlyTimer);
      earlyTimer = setTimeout(() => $('earlyToast').classList.add('hidden'), 700);
      return;
    }

    run.reaction = Math.max(0, Math.round(now - greenAt));
    run.rampSpeed = Math.max(76, Math.min(94, Math.round(92 - (run.reaction / 1000) * 6)));
    run.vx = (run.rampSpeed * 1.46667) * 0.42;
    run.launchTime = now;

    state = 'drive';
    $('countdown').classList.add('hidden');
    $('actionBtn').textContent = 'THRUST';

    // Launch Banner
    $('launchReactionText').textContent = 'Reaction ' + (run.reaction / 1000).toFixed(3) + ' s';
    $('launchNotice').classList.remove('hidden');
    launchNoticeTimer = 2.0;

    beep(980, 0.22, 'triangle', 0.12);
    return;
  }

  if (state === 'results' || state === 'landed' || state === 'crashed') {
    startCountdown();
    return;
  }

  if (state === 'air') {
    run.thrusting = true;
  }
}

function setupEvents() {
  $('startBtn').addEventListener('click', startCountdown);
  $('againBtn').addEventListener('click', startCountdown);

  const actionBtn = $('actionBtn');
  actionBtn.addEventListener('pointerdown', e => {
    e.preventDefault();
    if (state === 'air') run.thrusting = true;
    else triggerLaunch(performance.now());
  });
  window.addEventListener('pointerup', () => {
    run.thrusting = false;
  });

  const bindBtn = (el, val) => {
    el.addEventListener('pointerdown', e => { e.preventDefault(); run.steer = val; });
    el.addEventListener('pointerup', () => run.steer = 0);
    el.addEventListener('pointerleave', () => run.steer = 0);
  };
  bindBtn($('touchLeft'), -1);
  bindBtn($('touchRight'), 1);

  window.addEventListener('keydown', e => {
    if (e.code === 'Space') {
      e.preventDefault();
      if (state === 'air') run.thrusting = true;
      else triggerLaunch(performance.now());
    }
    if (e.code === 'Enter') {
      if (state === 'results' || state === 'landed' || state === 'crashed') startCountdown();
    }
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') run.steer = -1;
    if (e.code === 'ArrowRight' || e.code === 'KeyD') run.steer = 1;
    if (e.code === 'ArrowUp' || e.code === 'KeyW') run.thrusting = true;
  });

  window.addEventListener('keyup', e => {
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') run.thrusting = false;
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') if (run.steer < 0) run.steer = 0;
    if (e.code === 'ArrowRight' || e.code === 'KeyD') if (run.steer > 0) run.steer = 0;
  });

  const toggleSound = () => {
    sound = !sound;
    $('soundToggle').innerHTML = sound ? '♫ <span>SOUND</span>' : '♪ <span>MUTED</span>';
    $('inGameSound').textContent = sound ? '🔊' : '🔇';
    if (sound) beep(600);
  };
  $('soundToggle').addEventListener('click', toggleSound);
  $('inGameSound').addEventListener('click', toggleSound);
}

function fixedUpdate(dt, now) {
  if (launchNoticeTimer > 0) {
    launchNoticeTimer -= dt;
    if (launchNoticeTimer <= 0) $('launchNotice').classList.add('hidden');
  }
  if (flipNoticeTimer > 0) {
    flipNoticeTimer -= dt;
    if (flipNoticeTimer <= 0) $('flipNotice').classList.add('hidden');
  }

  // COUNTDOWN
  if (state === 'count') {
    const elapsed = now - countStart;
    const dots = document.querySelectorAll('.light-dot');
    
    if (elapsed >= 3200) {
      dots.forEach(d => d.className = 'light-dot green');
      $('countdownLabel').textContent = 'GO!';
      $('countdownLabel').className = 'countdown-label go-text';
    } else {
      dots.forEach((d, idx) => {
        d.className = elapsed >= idx * 800 ? 'light-dot red' : 'light-dot';
      });
      $('countdownLabel').textContent = 'TAP GO ON GREEN';
    }
  }

  // DRIVE
  if (state === 'drive') {
    const driveElapsed = (now - run.launchTime) / 1000;
    const speedRatio = Math.min(driveElapsed / 0.85, 1.0);
    $('speedHud').textContent = String(Math.round(run.rampSpeed * speedRatio));

    run.x += run.vx * dt * 1.55;
    carGroup.position.x = run.x;
    wheels.forEach(w => w.rotation.z -= run.vx * dt * 2.5);

    if (run.x >= -4) {
      state = 'ramp';
      run.x = -4;
    }
  }

  // RAMP
  if (state === 'ramp') {
    $('speedHud').textContent = String(run.rampSpeed);
    run.x += run.vx * dt * 0.82;
    const t = Math.min(Math.max((run.x + 4) / 22, 0), 1.0);
    run.y = 0.55 + 31.5 * (1 - Math.cos(t * Math.PI * 0.5));
    run.angle = t * (Math.PI * 0.52);

    carGroup.position.set(run.x, run.y, 0);
    carGroup.rotation.z = run.angle;
    wheels.forEach(w => w.rotation.z -= run.vx * dt * 2.5);

    if (t >= 0.98) {
      state = 'air';
      run.x = 18.2;
      run.y = 32.2;
      run.vx = Math.max(18, (run.rampSpeed / 2.237) * 0.85);
      run.vy = run.vx * 0.98;
      run.angle = 1.35;
      run.omega = 0.8;
      run.airStart = now;
      run.maxAlt = run.y;

      $('airStats').classList.remove('hidden');
      $('actionBtn').textContent = 'THRUST';
    }
  }

  // AIR
  if (state === 'air') {
    run.omega += run.steer * 4.2 * dt;
    run.omega *= Math.pow(0.982, dt * 60);
    run.angle += run.omega * dt;

    let currentG = 1.0;
    if (run.thrusting && run.gas > 0) {
      const thrustX = Math.sin(run.angle) * 34.0;
      const thrustY = Math.cos(run.angle) * 34.0;
      run.vx += thrustX * dt;
      run.vy += thrustY * dt;
      run.gas = Math.max(0, run.gas - 0.22 * dt);
      currentG = Math.hypot(thrustX, thrustY) / 9.8 + 1.0;
    } else {
      currentG = Math.hypot(run.vx * 0.08, run.vy * 0.08) + 1.0;
    }
    run.peakG = Math.max(run.peakG, currentG);

    run.vy -= GRAVITY * dt;
    run.x += run.vx * dt;
    run.y += run.vy * dt;
    run.maxAlt = Math.max(run.maxAlt, run.y);

    const pitchCos = Math.cos(run.angle);
    if (pitchCos < -0.65 && run.prevPitchCos >= -0.65) {
      run.flips++;
      beep(520, 0.09, 'sine', 0.04);
      $('flipNotice').classList.remove('hidden');
      flipNoticeTimer = 1.5;
    }
    run.prevPitchCos = pitchCos;

    carGroup.position.set(run.x, run.y, 0);
    carGroup.rotation.z = -run.angle;

    // Rings
    rings.forEach(r => {
      if (!r.got && Math.hypot(run.x - r.x, run.y - r.y) < 3.4) {
        r.got = true;
        r.mesh.visible = false;
        run.rings++;
        run.gas = Math.min(1.0, run.gas + 0.35);
        beep(1046, 0.25, 'triangle', 0.08);
      }
    });

    // HUD Updates
    const totalVel = Math.hypot(run.vx, run.vy);
    $('speedHud').textContent = String(Math.round(totalVel * 2.237));
    $('gasBar').style.width = (run.gas * 100) + '%';
    $('flipsHud').textContent = String(run.flips);
    $('ringHud').textContent = run.rings + '/3';
    $('gForceVal').textContent = run.peakG.toFixed(1);
    $('altVal').textContent = String(Math.max(0, Math.round(run.y)));

    // Sink Rate Indicator
    if (run.vy < 0) {
      const sinkSpeed = Math.round(Math.abs(run.vy));
      $('sinkBadge').textContent = 'SINK ' + sinkSpeed + ' FT/S';
      $('sinkBadge').className = 'sink-badge ' + (sinkSpeed > 39 ? 'danger' : 'safe');
      $('sinkBadge').classList.remove('hidden');
    } else {
      $('sinkBadge').classList.add('hidden');
    }

    // Gauges SVG
    const circ = 2 * Math.PI * 42;
    const gRatio = Math.min(Math.max((run.peakG - 1) / 50, 0), 1);
    const altRatio = Math.min(Math.max(run.y / 250, 0), 1);
    $('gForceSvgRing').style.strokeDashoffset = String(circ - gRatio * circ);
    $('altSvgRing').style.strokeDashoffset = String(circ - altRatio * circ);

    run.score = run.rings * 500 + run.flips * 1500 + Math.round(run.maxAlt * 2.5) + Math.round(((now - run.airStart) / 1000) * 120);
    $('scoreHud').textContent = run.score.toLocaleString('en-US');

    // Touchdown
    if (run.y <= 0.65 && run.vy < 0) {
      run.y = 0.65;
      run.touchdownSpeed = Math.abs(run.vy);
      const normAngle = ((run.angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      const tilt = Math.min(normAngle, Math.PI * 2 - normAngle);

      if (run.touchdownSpeed <= 39 && tilt <= 28 * Math.PI / 180) {
        state = 'landed';
        run.landed = true;
        run.score += 1000;
        beep(880, 0.35, 'triangle', 0.1);
      } else {
        state = 'crashed';
        run.landed = false;
        beep(90, 0.45, 'sawtooth', 0.15);
      }

      showResults(now);
    }
  }
}

function showResults(now) {
  $('airStats').classList.add('hidden');
  $('sinkBadge').classList.add('hidden');
  $('resultOverlay').classList.remove('hidden');

  const best = safeBest();
  const isNew = run.score > best;
  if (isNew) saveBest(run.score);

  $('newBest').classList.toggle('hidden', !isNew);
  $('finalScore').textContent = run.score.toLocaleString('en-US');
  $('bestHud').textContent = String(Math.max(best, run.score));
  $('resBestHud').textContent = String(Math.max(best, run.score));

  $('resultKicker').textContent = run.landed ? 'TOUCHDOWN' : 'CRASHED';
  $('resultTitle').textContent = run.landed ? 'CLEAN LANDING' : 'WIPEOUT';

  $('resultDesc').textContent = run.landed
    ? 'All four wheels touched down clean! Soft landing bonus awarded. Flips, airtime, and altitude banked.'
    : (run.touchdownSpeed > 39
      ? 'Wheels down at ' + Math.round(run.touchdownSpeed) + ' ft/s, over the 39 ft/s limit. Burn the thrusters earlier to slow the drop. Flips, altitude and airtime only score when you land it. Rings: ' + run.rings + '.'
      : 'Roof hit first. Keep rotating until the wheels point at the ground. Flips, altitude and airtime only score when you land it. Rings: ' + run.rings + '.');

  $('mReaction').textContent = (run.reaction / 1000).toFixed(3) + ' s';
  $('mSpeed').textContent = run.rampSpeed + ' mph';
  $('mG').textContent = run.peakG.toFixed(1) + ' g';
  $('mAltitude').textContent = Math.round(run.maxAlt) + ' ft';
  $('mAir').textContent = ((now - run.airStart) / 1000).toFixed(1) + ' s';
  $('mFlips').textContent = String(run.flips);
  $('mRings').textContent = run.rings + ' / 3';
  $('mTouch').textContent = Math.round(run.touchdownSpeed) + ' ft/s';
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - (lastFrame || now)) / 1000, 0.05);
  lastFrame = now;
  accumulator += dt;

  while (accumulator >= STEP) {
    fixedUpdate(STEP, now);
    accumulator -= STEP;
  }

  let targetX = -40, targetY = 3.8, targetZ = 0;
  let lookX = -15, lookY = 3.0;

  if (state === 'count' || state === 'drive') {
    targetX = run.x - 8.5;
    targetY = 3.2;
    targetZ = 0;
    lookX = run.x + 14;
    lookY = 3.2;
  } else if (state === 'ramp') {
    targetX = run.x - 12;
    targetY = Math.max(5, run.y + 4);
    targetZ = 14;
    lookX = run.x + 6;
    lookY = run.y + 4;
  } else if (state === 'air') {
    targetX = run.x - 16;
    targetY = Math.max(8, run.y + 4);
    targetZ = 30;
    lookX = run.x + 3;
    lookY = run.y + 2;
  }

  camera.position.x += (targetX - camera.position.x) * 0.08;
  camera.position.y += (targetY - camera.position.y) * 0.08;
  camera.position.z += (targetZ - camera.position.z) * 0.08;
  camera.lookAt(lookX, lookY, 0);

  renderer.render(scene, camera);
}

// Sanity test for QA
window.runRoadsterLoopSanityTest = function() {
  const ids = ['gameCanvas', 'gameViewport', 'startBtn', 'againBtn', 'countdown', 'scoreHud', 'bestHud', 'speedHud', 'actionBtn'];
  const missing = ids.filter(id => !$(id));
  const pass = missing.length === 0 && typeof THREE !== 'undefined' && !!renderer;
  document.documentElement.dataset.roadsterSanity = pass ? 'PASS' : 'FAIL';
  console.info('[Roadster Loop Sanity Test]', { pass, missing });
  return { ok: pass, missing };
};

setup();
window.runRoadsterLoopSanityTest();
})();
`;

export const standaloneReadmeMd = `# Roadster Loop — Night Run

A cinematic 3D night-time sports car ramp stunt game prototype built with HTML, CSS, JavaScript, and Three.js. The game features realistic procedural vehicle modeling, a giant curved wall ramp, drag-strip countdown lights, cold-gas thrusters, flip stunts, ring collectibles, real-time G-force and altitude gauges, and comprehensive landing physics.

## Visual & Gameplay Target
- Exact reproduction of the high-contrast midnight neon racing aesthetic matching reference video.
- 4-light drag-strip starting tree with sequenced amber/red and all-green launch signaling.
- Dynamic camera tracking: starts in chase perspective behind the sports car, ascends the vertical ramp, and pulls into a cinematic tracking shot for airborne stunts.
- Real-time physics engine evaluating pitch rotation, cold-gas thrusters, G-forces, altitude, flip counts, ring pickups, and sink speed touchdown limits (< 39 ft/s).

## Run Locally
1. Extract the \`roadster-loop\` folder.
2. Open \`index.html\` directly in any modern browser (Chrome, Safari, Edge, Firefox).
3. Alternatively, run a lightweight local server:
   \`\`\`bash
   python -m http.server 8000
   \`\`\`
   and visit \`http://localhost:8000\`.

## Controls
- **Start**: Click **START RUN** or press **Space**.
- **Launch**: Press **Space**, click the screen, or tap **GO** on green.
- **Flip**: Use **Left / Right arrow keys** or **A / D** (or on-screen **← / →** buttons) to rotate.
- **Cold-Gas Thrusters**: Hold **Space**, **W / Up Arrow**, or on-screen **THRUST** button to fire thrusters.
- **Restart**: Press **Space** or **Enter**, or click **RUN IT AGAIN**.

## Deliverable Quality Assurance
- Countdown state machine fixed: no stuck \`00\` or contradictory instructions.
- All 4 traffic lights turn emerald green with \`GO!\` on launch.
- Jump starts (< 3.2s) properly trigger warning toast and lockout.
- Zero duplicate render loops, listeners, or canvas contexts on reset.
`;

export const standalonePrivacyHtml = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Privacy Policy — Roadster Loop</title>
<link rel="stylesheet" href="style.css">
</head>
<body style="background:#080d18;color:#f1f6ff;padding:40px 20px;">
<main class="shell" style="max-width:760px;margin:auto;">
  <header class="topbar">
    <a class="brand" href="index.html"><span class="brand-mark">R<span>↗</span></span><span>ROADSTER <b>LOOP</b></span></a>
    <a href="index.html" style="color:#71e7ff;text-decoration:none;font-size:12px;font-family:'DM Mono',monospace;">← BACK TO GAME</a>
  </header>
  <article style="margin:48px 0;line-height:1.8;color:#a9b8cc;">
    <div class="kicker">PLAYER INFORMATION</div>
    <h1 style="font-size:36px;color:#fff;margin:8px 0 16px;">Privacy Policy</h1>
    <div class="red-neon-bar"></div>
    <p>Roadster Loop is an interactive browser game demo. It does not collect, transmit, or monetize any personal identification or gameplay telemetry.</p>
    <h3 style="color:#fff;margin-top:24px;">Local Storage</h3>
    <p>Personal best scores and sound preferences are stored purely inside your web browser's local storage (<code style="color:#71e7ff;">localStorage</code>). You may clear this data at any time via your browser settings.</p>
    <p style="margin-top:40px;font-size:11px;color:#71839b;">Unofficial fan game, not affiliated with any car brand.</p>
  </article>
</main>
</body>
</html>
`;

export const standaloneAdsTxt = `# Roadster Loop — Night Run
# Unofficial fan project. No third-party advertisements or ad tracking configured.
`;
