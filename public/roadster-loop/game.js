(() => {
'use strict';
const $ = id => document.getElementById(id);
const canvas = $('gameCanvas');

let scene, camera, renderer, carGroup, carBody, wheels = [], rings = [], particles = [], smokePuffs = [], sparks = [];
let state = 'title', simTime = 0, lastFrame = 0, accumulator = 0;
const STEP = 1 / 120, GRAVITY = 32.2; // Real units: 1 unit = 1 ft, g = 32.2 ft/s²

let run = {
  reaction: 0,
  rampSpeed: 80,
  currentG: 1.0,
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
  x: -260,
  y: 0.55,
  z: 0,
  vx: 0,
  vy: 0,
  vz: 0,
  thrusting: false,
  steer: 0,
  touchdownSpeed: 0,
  landed: false,
  runEnded: false,
  launchTime: 0,
  rampStart: 0,
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

function initEngine() {
  if (typeof THREE === 'undefined') {
    document.body.innerHTML = '<div style="color:#ff2a2a;padding:40px;font-family:sans-serif;text-align:center;"><h2>Three.js failed to load</h2><p>Please check your network connection and reload.</p></div>';
    return;
  }
  const w = canvas.clientWidth || window.innerWidth;
  const h = canvas.clientHeight || window.innerHeight;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x050811);
  scene.fog = new THREE.FogExp2(0x050811, 0.0035);

  camera = new THREE.PerspectiveCamera(48, w / h, 0.5, 2000);
  camera.position.set(-282, 5.5, 0);
  camera.lookAt(-235, 4.5, 0);

  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(w, h, false);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.4;

  const hemi = new THREE.HemisphereLight(0xa5c4e8, 0x101726, 1.8);
  scene.add(hemi);

  const dir = new THREE.DirectionalLight(0xf2f7ff, 2.6);
  dir.position.set(-50, 90, 60);
  scene.add(dir);

  const neonRed1 = new THREE.PointLight(0xff2a55, 3.5, 140);
  neonRed1.position.set(-40, 24, 0);
  scene.add(neonRed1);

  const neonRed2 = new THREE.PointLight(0xff2a55, 3.0, 140);
  neonRed2.position.set(100, 35, 0);
  scene.add(neonRed2);

  buildEnvironment();
  buildSportsCar();
  buildSkyRings();

  window.addEventListener('resize', onResize);
  setupEvents();
  onResize();

  requestAnimationFrame(frame);
}

function buildEnvironment() {
  const starGeo = new THREE.BufferGeometry();
  const starPos = [];
  for (let i = 0; i < 1100; i++) {
    starPos.push((Math.random() - 0.5) * 800, Math.random() * 260 + 10, -Math.random() * 400 - 20);
  }
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xd0e2f5, size: 0.26, transparent: true, opacity: 0.9 }));
  scene.add(stars);

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(1200, 700), new THREE.MeshStandardMaterial({ color: 0x070b14, roughness: 0.92 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(100, 0, -40);
  scene.add(floor);

  const roadMat = new THREE.MeshStandardMaterial({ color: 0x2e3a4e, roughness: 0.62, metalness: 0.18 });
  const neonMat = new THREE.MeshStandardMaterial({ color: 0xff2a55, emissive: 0xff1a40, emissiveIntensity: 3.2 });
  const whiteMat = new THREE.MeshStandardMaterial({ color: 0xf1f6ff, emissive: 0x28384e });
  const concreteMat = new THREE.MeshStandardMaterial({ color: 0x18202d, roughness: 0.88 });

  const roadWidth = 20;

  // Approach road (-300 to -80)
  const approach = new THREE.Mesh(new THREE.BoxGeometry(220, 0.25, roadWidth), roadMat);
  approach.position.set(-190, 0.12, 0);
  scene.add(approach);

  for (const z of [-roadWidth / 2 + 0.2, roadWidth / 2 - 0.2]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(220, 0.1, 0.3), neonMat);
    rail.position.set(-190, 0.26, z);
    scene.add(rail);
  }

  for (let x = -295; x < -82; x += 8) {
    const dash = new THREE.Mesh(new THREE.BoxGeometry(4.0, 0.02, 0.3), whiteMat);
    dash.position.set(x, 0.26, 0);
    scene.add(dash);
  }

  const startLine = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.02, roadWidth - 1), whiteMat);
  startLine.position.set(-250, 0.26, 0);
  scene.add(startLine);

  // Ramp (-80 to 0)
  const curvePts = [];
  for (let i = 0; i <= 70; i++) {
    const t = i / 70;
    curvePts.push(new THREE.Vector3(-80 * (1 - t), 0.25 + 34.75 * (1 - Math.cos(t * 0.55 * Math.PI)), 0));
  }
  const rampGeo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(curvePts), 70, roadWidth / 2, 4, false);
  rampGeo.scale(1, 0.05, 1);
  scene.add(new THREE.Mesh(rampGeo, new THREE.MeshStandardMaterial({ color: 0x8a9bb2, roughness: 0.55 })));

  const leftPts = curvePts.map(p => new THREE.Vector3(p.x, p.y + 0.18, -roadWidth / 2 + 0.2));
  const rightPts = curvePts.map(p => new THREE.Vector3(p.x, p.y + 0.18, roadWidth / 2 - 0.2));
  scene.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(leftPts), 60, 0.2, 8, false), neonMat));
  scene.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rightPts), 60, 0.2, 8, false), neonMat));

  // Concrete support tower behind ramp lip
  const tower = new THREE.Mesh(new THREE.BoxGeometry(18, 36, roadWidth + 6), concreteMat);
  tower.position.set(9, 17.5, 0);
  scene.add(tower);

  // Landing Runway (0 to 650)
  const landingRoad = new THREE.Mesh(new THREE.BoxGeometry(650, 0.25, roadWidth), roadMat);
  landingRoad.position.set(325, 0.12, 0);
  scene.add(landingRoad);

  for (const z of [-roadWidth / 2 + 0.2, roadWidth / 2 - 0.2]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(650, 0.1, 0.3), neonMat);
    rail.position.set(325, 0.26, z);
    scene.add(rail);
  }

  for (let x = 12; x < 640; x += 8) {
    const dash = new THREE.Mesh(new THREE.BoxGeometry(4.0, 0.02, 0.3), whiteMat);
    dash.position.set(x, 0.26, 0);
    scene.add(dash);
  }

  // Landing zone target stripes (240 to 360)
  for (let lzX = 240; lzX <= 360; lzX += 16) {
    const lz = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.03, roadWidth - 2), whiteMat);
    lz.position.set(lzX, 0.27, 0);
    scene.add(lz);
  }

  // Grandstand spectator lights
  const bleacherPos = [];
  for (let i = 0; i < 800; i++) {
    const bx = -280 + Math.random() * 850;
    const side = Math.random() > 0.5 ? 1 : -1;
    const bz = side * (roadWidth / 2 + 10 + Math.random() * 45);
    const by = 2.0 + Math.abs(Math.abs(bz) - (roadWidth / 2 + 10)) * 0.45;
    bleacherPos.push(bx, by, bz);
  }
  const bleacherGeo = new THREE.BufferGeometry();
  bleacherGeo.setAttribute('position', new THREE.Float32BufferAttribute(bleacherPos, 3));
  scene.add(new THREE.Points(bleacherGeo, new THREE.PointsMaterial({ color: 0x9bc2e8, size: 0.22, transparent: true, opacity: 0.85 })));
}

function buildSportsCar() {
  carGroup = new THREE.Group();
  carBody = new THREE.Group();
  carGroup.add(carBody);
  scene.add(carGroup);

  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xdce5f2, metalness: 0.94, roughness: 0.18 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x050b12, metalness: 0.9, roughness: 0.05, transparent: true, opacity: 0.9 });
  const carbonMat = new THREE.MeshStandardMaterial({ color: 0x11161f, metalness: 0.6, roughness: 0.4 });
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x07090d, roughness: 0.9 });
  const rimMat = new THREE.MeshStandardMaterial({ color: 0xa9b7c6, metalness: 0.95, roughness: 0.15 });
  const tailMat = new THREE.MeshStandardMaterial({ color: 0xff2a2a, emissive: 0xff1e1e, emissiveIntensity: 3.2 });

  const bodyShape = new THREE.Shape();
  bodyShape.moveTo(-3.2, 0.35);
  bodyShape.bezierCurveTo(-3.1, 0.65, -2.3, 0.86, -1.3, 0.92);
  bodyShape.bezierCurveTo(-0.4, 0.98, 1.0, 0.92, 2.0, 0.78);
  bodyShape.bezierCurveTo(2.7, 0.68, 3.2, 0.52, 3.4, 0.38);
  bodyShape.lineTo(3.2, 0.24);
  bodyShape.lineTo(-3.0, 0.24);
  bodyShape.closePath();

  const bodyGeo = new THREE.ExtrudeGeometry(bodyShape, { depth: 2.2, bevelEnabled: true, bevelSegments: 3, steps: 1, bevelSize: 0.08, bevelThickness: 0.06 });
  bodyGeo.translate(0, 0, -1.1);
  carBody.add(new THREE.Mesh(bodyGeo, bodyMat));

  const canopyShape = new THREE.Shape();
  canopyShape.moveTo(-1.8, 0.86);
  canopyShape.bezierCurveTo(-1.4, 1.32, -0.9, 1.62, -0.25, 1.64);
  canopyShape.bezierCurveTo(0.52, 1.66, 1.25, 1.32, 1.7, 0.8);
  canopyShape.lineTo(1.35, 0.8);
  canopyShape.bezierCurveTo(0.95, 1.22, 0.45, 1.42, -0.2, 1.42);
  canopyShape.bezierCurveTo(-0.75, 1.42, -1.2, 1.18, -1.5, 0.86);
  canopyShape.closePath();

  const canopyGeo = new THREE.ExtrudeGeometry(canopyShape, { depth: 1.65, bevelEnabled: true, bevelSegments: 2, steps: 1, bevelSize: 0.04, bevelThickness: 0.04 });
  canopyGeo.translate(0, 0, -0.825);
  carBody.add(new THREE.Mesh(canopyGeo, glassMat));

  const tailBar = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.07, 2.1), tailMat);
  tailBar.position.set(-3.15, 0.54, 0);
  carBody.add(tailBar);

  wheels = [];
  for (const pos of [{x:-1.95,z:1.15},{x:-1.95,z:-1.15},{x:1.95,z:1.15},{x:1.95,z:-1.15}]) {
    const wg = new THREE.Group();
    wg.position.set(pos.x, 0.44, pos.z);
    carBody.add(wg);
    wheels.push(wg);

    const tireGeo = new THREE.CylinderGeometry(0.44, 0.44, 0.32, 24);
    tireGeo.rotateX(Math.PI / 2);
    wg.add(new THREE.Mesh(tireGeo, tireMat));

    const rimGeo = new THREE.CylinderGeometry(0.26, 0.26, 0.34, 20);
    rimGeo.rotateX(Math.PI / 2);
    wg.add(new THREE.Mesh(rimGeo, rimMat));
  }

  carGroup.position.set(run.x, run.y, run.z);
}

function buildSkyRings() {
  rings = [];
  const mat = new THREE.MeshStandardMaterial({ color: 0xff2a55, emissive: 0xff1448, emissiveIntensity: 3.5, roughness: 0.15 });
  const coords = [{ x: 75, y: 115, z: 0 }, { x: 150, y: 152, z: 0 }, { x: 235, y: 115, z: 0 }];
  coords.forEach((c, idx) => {
    const mesh = new THREE.Mesh(new THREE.TorusGeometry(4.2, 0.22, 10, 32), mat);
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
    rampSpeed: 80,
    currentG: 1.0,
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
    x: -260,
    y: 0.55,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    thrusting: false,
    steer: 0,
    touchdownSpeed: 0,
    landed: false,
    runEnded: false,
    launchTime: 0,
    rampStart: 0,
    airStart: 0
  };

  carGroup.position.set(run.x, run.y, run.z);
  carGroup.rotation.set(0, 0, 0);
  carGroup.visible = true;

  rings.forEach(r => {
    r.got = false;
    r.mesh.visible = true;
  });

  camera.position.set(-282, 5.5, 0);
  camera.lookAt(-235, 4.5, 0);

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
  $('countdownLabel').textContent = 'WAIT FOR GREEN';
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
      countStart = now;
      greenAt = now + 3200;
      return;
    }

    run.reaction = Math.min(2000, Math.max(0, Math.round(now - greenAt)));
    const reactionSec = run.reaction / 1000;
    const rClamped = Math.max(0.2, Math.min(2.0, reactionSec));
    run.rampSpeed = Math.round(80 - ((rClamped - 0.2) / 1.8) * 18);
    run.launchTime = now;

    state = 'drive';
    $('countdown').classList.add('hidden');
    $('actionBtn').textContent = 'THRUST';

    $('launchReactionText').textContent = 'Reaction ' + reactionSec.toFixed(3) + ' s';
    $('launchNotice').classList.remove('hidden');
    launchNoticeTimer = 1.0;

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
  window.addEventListener('pointercancel', () => {
    run.thrusting = false;
  });
  window.addEventListener('blur', () => {
    run.thrusting = false;
    run.steer = 0;
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
      if (elapsed >= 5200) {
        triggerLaunch(now);
      }
    } else {
      dots.forEach((d, idx) => {
        d.className = elapsed >= idx * 800 ? 'light-dot red' : 'light-dot';
      });
      $('countdownLabel').textContent = 'WAIT FOR GREEN';
    }
  }

  // DRIVE (smooth acceleration to ramp speed over 4.2s)
  if (state === 'drive') {
    const driveElapsed = (now - run.launchTime) / 1000;
    const curve = Math.min(1.0, 0.225 * driveElapsed + 0.045 * (driveElapsed * driveElapsed));
    const currentSpeedMph = Math.round(run.rampSpeed * Math.min(1.0, curve));
    run.vx = currentSpeedMph * 1.46667;
    run.x += run.vx * dt;

    const a_fwd = (run.rampSpeed * 1.46667) / 4.2;
    run.currentG = Math.hypot(1.0, (currentSpeedMph / Math.max(1, run.rampSpeed)) * (a_fwd / 32.2));
    run.peakG = Math.max(run.peakG, run.currentG);

    $('speedHud').textContent = String(currentSpeedMph);
    $('gForceVal').textContent = run.currentG.toFixed(1);

    carGroup.position.x = run.x;
    wheels.forEach(w => w.rotation.z -= run.vx * dt * 0.8);

    if (run.x >= -80) {
      state = 'ramp';
      run.rampStart = now;
      run.x = -80;
    }
  }

  // RAMP (~1.5s climb, tangent angle, G-force 3.5-5.5g)
  if (state === 'ramp') {
    const rampElapsed = (now - run.rampStart) / 1000;
    const rampT = Math.min(rampElapsed / 1.5, 1.0);

    run.x = -80 * (1 - rampT);
    run.y = 0.55 + 34.45 * (1 - Math.cos(rampT * 0.55 * Math.PI));

    const dy = 34.45 * 0.55 * Math.PI * Math.sin(rampT * 0.55 * Math.PI);
    const dx = 80;
    run.angle = Math.atan2(dy, dx);

    run.currentG = 1.0 + Math.sin(rampT * Math.PI) * 4.2;
    run.peakG = Math.max(run.peakG, run.currentG);

    $('speedHud').textContent = String(run.rampSpeed);
    $('gForceVal').textContent = run.currentG.toFixed(1);

    carGroup.position.set(run.x, run.y, 0);
    carGroup.rotation.z = run.angle;
    wheels.forEach(w => w.rotation.z -= (run.rampSpeed * 1.46667) * dt * 0.8);

    if (rampT >= 1.0) {
      state = 'air';
      run.x = 0;
      run.y = 35;
      const speedScale = run.rampSpeed / 80;
      run.vx = 55 * speedScale;
      run.vy = 88 * speedScale;
      run.angle = Math.atan2(88, 55);
      run.omega = 0.6;
      run.airStart = now;
      run.maxAlt = run.y;
      run.currentG = 0.0;

      $('airStats').classList.remove('hidden');
      $('actionBtn').textContent = 'THRUST';
    }
  }

  // AIR (Gravity 32.2, 2.0g thrusters, flips, rings)
  if (state === 'air') {
    run.omega += run.steer * 4.8 * dt;
    run.omega *= Math.pow(0.985, dt * 60);
    run.angle += run.omega * dt;

    if (run.thrusting && run.gas > 0) {
      const thrustAcc = 64.4; // 2.0 g in ft/s²
      const thrustX = -Math.sin(run.angle) * thrustAcc;
      const thrustY = Math.cos(run.angle) * thrustAcc;
      run.vx += thrustX * dt;
      run.vy += thrustY * dt;
      run.gas = Math.max(0, run.gas - dt / 4.0); // 4s total burn
      run.currentG = 2.0;
    } else {
      run.currentG = 0.0; // Free-fall weightless
    }
    run.peakG = Math.max(run.peakG, run.currentG);

    run.vy -= GRAVITY * dt;
    run.x += run.vx * dt;
    run.y += run.vy * dt;
    run.maxAlt = Math.max(run.maxAlt, run.y);

    const pitchCos = Math.cos(run.angle);
    if (pitchCos < -0.75 && run.prevPitchCos >= -0.75) {
      run.flips++;
      beep(520, 0.09, 'sine', 0.04);
      $('flipNotice').classList.remove('hidden');
      flipNoticeTimer = 1.5;
    }
    run.prevPitchCos = pitchCos;

    carGroup.position.set(run.x, run.y, 0);
    carGroup.rotation.z = -run.angle;

    // Rings (+500 pts each, +1s refill)
    rings.forEach(r => {
      if (!r.got && Math.hypot(run.x - r.x, run.y - r.y) < 5.5) {
        r.got = true;
        r.mesh.visible = false;
        run.rings++;
        run.gas = Math.min(1.0, run.gas + 0.25);
        beep(1046, 0.25, 'triangle', 0.08);
      }
    });

    // Horizontal speed only in mph!
    $('speedHud').textContent = String(Math.round(Math.abs(run.vx) / 1.46667));
    $('gasBar').style.width = (run.gas * 100) + '%';
    $('flipsHud').textContent = String(run.flips);
    $('ringHud').textContent = run.rings + '/3';
    $('gForceVal').textContent = run.currentG.toFixed(1);
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
    const gRatio = Math.min(Math.max(run.currentG / 6.0, 0), 1);
    const altRatio = Math.min(Math.max(run.y / 180, 0), 1);
    $('gForceSvgRing').style.strokeDashoffset = String(circ - gRatio * circ);
    $('altSvgRing').style.strokeDashoffset = String(circ - altRatio * circ);

    // Live provisional score
    const airtimeSec = ((now - run.airStart) / 1000);
    run.score = run.rings * 500 + run.flips * 1500 + Math.round(run.maxAlt) + Math.round(airtimeSec * 100);
    $('scoreHud').textContent = run.score.toLocaleString('en-US');

    // Touchdown at road level
    if (run.y <= 0.55 && run.vy < 0 && !run.runEnded) {
      run.runEnded = true;
      run.y = 0.55;
      run.touchdownSpeed = Math.abs(run.vy);
      const normAngle = ((run.angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      const tiltRad = Math.min(normAngle, Math.PI * 2 - normAngle);
      const tiltDeg = Math.round(tiltRad * 180 / Math.PI);

      if (run.touchdownSpeed <= 39 && tiltDeg <= 25) {
        state = 'landed';
        run.landed = true;
        const landingBonus = run.touchdownSpeed < 20 ? 1000 : 500;
        run.score = run.rings * 500 + run.flips * 1500 + Math.round(run.maxAlt) + Math.round(airtimeSec * 100) + landingBonus;
        beep(880, 0.35, 'triangle', 0.1);
      } else {
        state = 'crashed';
        run.landed = false;
        run.score = run.rings * 500; // Rings only on crash!
        beep(90, 0.45, 'sawtooth', 0.15);
      }

      showResults(now);
    }
  }

  // LANDED (roll smoothly to a stop on landing road)
  if (state === 'landed') {
    run.vx *= Math.pow(0.965, dt * 60);
    run.x += run.vx * dt;
    run.y = 0.55;
    run.angle = 0;
    carGroup.position.set(run.x, run.y, 0);
    carGroup.rotation.set(0, 0, 0);
    wheels.forEach(w => w.rotation.z -= run.vx * dt * 0.8);
    $('speedHud').textContent = String(Math.max(0, Math.round(Math.abs(run.vx) / 1.46667)));
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

  // Camera positioning
  if (camera && carGroup) {
    if (state === 'air') {
      camera.position.set(run.x - 70, Math.max(48, run.y * 0.65 + 26), 115);
      camera.lookAt(run.x + 35, run.y * 0.55 + 8, 0);
    } else if (state === 'ramp') {
      camera.position.set(run.x - 32, Math.max(8, run.y + 8), 16);
      camera.lookAt(run.x + 20, run.y + 6, 0);
    } else if (state === 'drive') {
      camera.position.set(run.x - 24, 6.0, 0);
      camera.lookAt(run.x + 35, 4.5, 0);
    } else if (state === 'landed') {
      camera.position.set(run.x - 28, 8.0, 22);
      camera.lookAt(run.x + 20, 3.5, 0);
    } else if (state === 'crashed') {
      camera.position.set(run.x - 25, 7.0, 20);
      camera.lookAt(run.x, 2.0, 0);
    }
  }

  renderer.render(scene, camera);
}

window.addEventListener('DOMContentLoaded', initEngine);
})();
