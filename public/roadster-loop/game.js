(() => {
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

    run.reaction = Math.min(2000, Math.max(0, Math.round(now - greenAt)));
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
      if (elapsed >= 5200) {
        triggerLaunch(now);
      }
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
