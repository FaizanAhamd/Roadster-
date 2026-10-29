import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { GameStatus, RingData, RunMetrics } from '../types';
import { soundManager } from '../audio/soundManager';

interface GameCanvasProps {
  onStatusUpdate: (status: GameStatus) => void;
  statusRef: React.MutableRefObject<GameStatus>;
}

export interface GameCanvasHandle {
  startCountdown: () => void;
  triggerLaunch: () => void;
  setSteer: (dir: number) => void;
  setThrust: (active: boolean) => void;
  restart: () => void;
}

export const GameCanvas = React.forwardRef<GameCanvasHandle, GameCanvasProps>(
  ({ onStatusUpdate, statusRef }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);

    // Engine references
    const engineRef = useRef<{
      renderer: THREE.WebGLRenderer | null;
      scene: THREE.Scene | null;
      camera: THREE.PerspectiveCamera | null;
      carGroup: THREE.Group | null;
      carBody: THREE.Group | null;
      wheels: THREE.Group[];
      rings: { mesh: THREE.Mesh; data: RingData }[];
      particles: { mesh: THREE.Mesh; vx: number; vy: number; vz: number; life: number; maxLife: number }[];
      thrusterPlumes: { mesh: THREE.Mesh; life: number }[];
      stars: THREE.Points | null;
      animFrameId: number;
      lastTime: number;
      steerInput: number; // -1 to 1
      thrustInput: boolean;
      accumulator: number;
      // Countdown state
      countdownStartTime: number;
      countdownLastBeepStage: number;
      // Stunt physics
      x: number;
      y: number;
      z: number;
      vx: number;
      vy: number;
      vz: number;
      angle: number; // pitch angle in rad
      omega: number; // angular velocity
      flipsCount: number;
      prevPitchCos: number;
      thrusterGas: number; // 0 to 1
      maxAlt: number;
      peakG: number;
      airStartTime: number;
      launchTime: number;
      reactionMs: number;
      rampSpeed: number;
      touchdownSpeed: number;
      landingClean: boolean;
      score: number;
      ringsCollected: number;
      screenShake: number;
      cameraTargetPos: THREE.Vector3;
      cameraTargetLook: THREE.Vector3;
    }>({
      renderer: null,
      scene: null,
      camera: null,
      carGroup: null,
      carBody: null,
      wheels: [],
      rings: [],
      particles: [],
      thrusterPlumes: [],
      stars: null,
      animFrameId: 0,
      lastTime: performance.now(),
      steerInput: 0,
      thrustInput: false,
      accumulator: 0,
      countdownStartTime: 0,
      countdownLastBeepStage: 0,
      x: -28,
      y: 0.55,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      angle: 0,
      omega: 0,
      flipsCount: 0,
      prevPitchCos: 1,
      thrusterGas: 1.0,
      maxAlt: 0,
      peakG: 1.0,
      airStartTime: 0,
      launchTime: 0,
      reactionMs: 0,
      rampSpeed: 90,
      touchdownSpeed: 0,
      landingClean: false,
      score: 0,
      ringsCollected: 0,
      screenShake: 0,
      cameraTargetPos: new THREE.Vector3(0, 5, 20),
      cameraTargetLook: new THREE.Vector3(0, 3, 0),
    });

    const safeBest = (): number => {
      try {
        return Number(localStorage.getItem('roadsterLoopBest') || 500);
      } catch {
        return 500;
      }
    };

    const saveBest = (score: number) => {
      try {
        localStorage.setItem('roadsterLoopBest', String(score));
      } catch {}
    };

    // Public methods exposed to React parent
    React.useImperativeHandle(ref, () => ({
      startCountdown: () => {
        const eng = engineRef.current;
        resetRunToStart();
        statusRef.current.state = 'count';
        statusRef.current.countdownElapsed = 0;
        statusRef.current.countdownLightStage = 0;
        statusRef.current.isGreen = false;
        eng.countdownStartTime = performance.now();
        eng.countdownLastBeepStage = 0;
        soundManager.playLightBeep(1);
        updateStatus();
      },

      triggerLaunch: () => {
        const eng = engineRef.current;
        const now = performance.now();
        const current = statusRef.current;

        if (current.state === 'title') {
          // Start countdown
          refActiveStart();
          return;
        }

        if (current.state === 'count') {
          const elapsed = now - eng.countdownStartTime;
          if (elapsed < 3200) {
            // Jump start / too early!
            soundManager.playEarlyBuzzer();
            current.tooEarly = true;
            updateStatus();
            setTimeout(() => {
              current.tooEarly = false;
              updateStatus();
            }, 700);
            return;
          }

          // Successful Green Launch!
          eng.reactionMs = Math.max(0, Math.round(elapsed - 3200));
          eng.rampSpeed = Math.max(76, Math.min(94, Math.round(92 - (eng.reactionMs / 1000) * 8)));
          eng.vx = (eng.rampSpeed * 1.46667) * 0.42; // convert mph to simulation units
          eng.launchTime = now;

          soundManager.playLaunch();
          current.state = 'drive';
          current.isGreen = true;
          current.speedMph = 0;
          updateStatus();
          return;
        }

        if (current.state === 'results' || current.state === 'landed' || current.state === 'crashed') {
          // Restart
          refActiveStart();
          return;
        }

        if (current.state === 'air') {
          eng.thrustInput = true;
          soundManager.startThruster();
        }
      },

      setSteer: (dir: number) => {
        engineRef.current.steerInput = dir;
      },

      setThrust: (active: boolean) => {
        const eng = engineRef.current;
        eng.thrustInput = active;
        if (statusRef.current.state === 'air') {
          if (active && eng.thrusterGas > 0) {
            soundManager.startThruster();
          } else {
            soundManager.stopThruster();
          }
        }
      },

      restart: () => {
        refActiveStart();
      },
    }));

    const refActiveStart = () => {
      const eng = engineRef.current;
      resetRunToStart();
      statusRef.current.state = 'count';
      statusRef.current.countdownElapsed = 0;
      statusRef.current.countdownLightStage = 0;
      statusRef.current.isGreen = false;
      eng.countdownStartTime = performance.now();
      eng.countdownLastBeepStage = 0;
      soundManager.playLightBeep(1);
      updateStatus();
    };

    const resetRunToStart = () => {
      const eng = engineRef.current;
      soundManager.stopThruster();

      eng.x = -28;
      eng.y = 0.55;
      eng.z = 0;
      eng.vx = 0;
      eng.vy = 0;
      eng.vz = 0;
      eng.angle = 0;
      eng.omega = 0;
      eng.flipsCount = 0;
      eng.prevPitchCos = 1;
      eng.thrusterGas = 1.0;
      eng.maxAlt = 0;
      eng.peakG = 1.0;
      eng.score = 0;
      eng.ringsCollected = 0;
      eng.thrustInput = false;
      eng.steerInput = 0;
      eng.landingClean = false;
      eng.touchdownSpeed = 0;

      if (eng.carGroup) {
        eng.carGroup.position.set(eng.x, eng.y, eng.z);
        eng.carGroup.rotation.set(0, 0, 0);
        eng.carGroup.visible = true;
      }
      if (eng.carBody) {
        eng.carBody.rotation.set(0, 0, 0);
      }

      // Reset rings
      eng.rings.forEach((r, idx) => {
        r.data.collected = false;
        r.mesh.visible = true;
        // High curved arch in the sky above the ramp
        r.mesh.position.set(22 + idx * 16, 36 + Math.sin((idx / 2) * Math.PI) * 14, 0);
        r.mesh.rotation.y = Math.PI / 2;
      });

      // Clear particles & plumes
      if (eng.scene) {
        eng.particles.forEach((p) => {
          eng.scene?.remove(p.mesh);
          p.mesh.geometry.dispose();
        });
        eng.particles = [];
        eng.thrusterPlumes.forEach((p) => {
          eng.scene?.remove(p.mesh);
          p.mesh.geometry.dispose();
        });
        eng.thrusterPlumes = [];
      }
    };

    const updateStatus = () => {
      const eng = engineRef.current;
      const current = statusRef.current;
      const best = safeBest();
      const isNewBest = eng.score > best;

      const metrics: RunMetrics = {
        reactionMs: eng.reactionMs,
        rampSpeedMph: eng.rampSpeed,
        peakG: Number(eng.peakG.toFixed(1)),
        maxAltitudeFt: Math.round(eng.maxAlt),
        airtimeSec: Number(
          eng.airStartTime > 0
            ? ((performance.now() - eng.airStartTime) / 1000).toFixed(1)
            : '0.0'
        ),
        flips: eng.flipsCount,
        ringsCollected: eng.ringsCollected,
        totalRings: 3,
        touchdownSpeedFtS: Math.round(eng.touchdownSpeed),
        tiltAngleDeg: Math.round((Math.abs(eng.angle) * 180) / Math.PI) % 360,
        landedClean: eng.landingClean,
        score: eng.score,
        crashReason: getCrashExplanation(eng.touchdownSpeed, eng.angle),
      };

      onStatusUpdate({
        ...current,
        score: eng.score,
        bestScore: Math.max(best, eng.score),
        isNewBest,
        thrusterGas: eng.thrusterGas,
        gForce: Number(eng.peakG.toFixed(1)),
        altitudeFt: Math.max(0, Math.round(eng.y)),
        flips: eng.flipsCount,
        ringsCount: eng.ringsCollected,
        totalRings: 3,
        metrics,
      });
    };

    const getCrashExplanation = (sinkSpeed: number, angle: number): string => {
      const deg = (Math.abs(angle) * 180 / Math.PI) % 360;
      const isUpside = deg > 70 && deg < 290;
      if (isUpside) {
        return 'Roof hit first. Keep rotating until the wheels point at the ground. Flips, altitude and airtime only score when you land it.';
      }
      if (sinkSpeed > 39) {
        return `Touchdown velocity exceeded safe limits (${Math.round(sinkSpeed)} ft/s). Fire cold-gas thrusters before contact to slow the drop below 39 ft/s.`;
      }
      return 'Hard impact caused a rollover. Align wheels straight and reduce downward sink rate.';
    };

    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;

      const width = container.clientWidth || 800;
      const height = container.clientHeight || 500;

      // 1. Scene Setup
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x060912);
      scene.fog = new THREE.FogExp2(0x060912, 0.007);

      // 2. Camera Setup (Perspective behind vehicle looking towards ramp)
      const camera = new THREE.PerspectiveCamera(46, width / height, 0.1, 1000);
      camera.position.set(-28, 4.2, 11);
      camera.lookAt(-10, 3, 0);

      // 3. WebGL Renderer
      const renderer = new THREE.WebGLRenderer({
        antialias: true,
        powerPreference: 'high-performance',
      });
      renderer.setSize(width, height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.25;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      container.appendChild(renderer.domElement);

      engineRef.current.renderer = renderer;
      engineRef.current.scene = scene;
      engineRef.current.camera = camera;

      // 4. Lighting Rig
      const hemiLight = new THREE.HemisphereLight(0x8dafd2, 0x090e18, 1.2);
      scene.add(hemiLight);

      const dirLight = new THREE.DirectionalLight(0xddeeff, 2.0);
      dirLight.position.set(-15, 35, 25);
      dirLight.castShadow = true;
      dirLight.shadow.mapSize.width = 1024;
      dirLight.shadow.mapSize.height = 1024;
      dirLight.shadow.camera.near = 0.5;
      dirLight.shadow.camera.far = 120;
      dirLight.shadow.camera.left = -30;
      dirLight.shadow.camera.right = 30;
      dirLight.shadow.camera.top = 30;
      dirLight.shadow.camera.bottom = -30;
      scene.add(dirLight);

      // Cyan / neon ambient accents
      const neonCyan = new THREE.PointLight(0x38cfff, 2.2, 85);
      neonCyan.position.set(0, 16, 5);
      scene.add(neonCyan);

      const neonRed = new THREE.PointLight(0xff3b30, 2.5, 75);
      neonRed.position.set(12, 8, -4);
      scene.add(neonRed);

      // 5. Build Environment: Starfield, Ground, Road, Ramp, Bleachers, Streetlights
      buildEnvironment(scene, engineRef.current);

      // 6. Build High-Fidelity Sports Car
      buildSportsCar(scene, engineRef.current);

      // 7. Build Sky Rings
      buildSkyRings(scene, engineRef.current);

      // 8. Event Listeners for Keyboard Controls
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.code === 'Space') {
          e.preventDefault();
          if (statusRef.current.state === 'count' || statusRef.current.state === 'title') {
            refActiveLaunch();
          } else if (statusRef.current.state === 'air') {
            engineRef.current.thrustInput = true;
            soundManager.startThruster();
          } else if (statusRef.current.state === 'results' || statusRef.current.state === 'landed' || statusRef.current.state === 'crashed') {
            refActiveStart();
          }
        }
        if (e.code === 'Enter') {
          e.preventDefault();
          if (statusRef.current.state === 'results' || statusRef.current.state === 'landed' || statusRef.current.state === 'crashed') {
            refActiveStart();
          }
        }
        if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
          e.preventDefault();
          engineRef.current.steerInput = -1;
        }
        if (e.code === 'ArrowRight' || e.code === 'KeyD') {
          e.preventDefault();
          engineRef.current.steerInput = 1;
        }
        if (e.code === 'ArrowUp' || e.code === 'KeyW') {
          e.preventDefault();
          if (statusRef.current.state === 'air') {
            engineRef.current.thrustInput = true;
            soundManager.startThruster();
          }
        }
      };

      const handleKeyUp = (e: KeyboardEvent) => {
        if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
          engineRef.current.thrustInput = false;
          soundManager.stopThruster();
        }
        if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
          if (engineRef.current.steerInput < 0) engineRef.current.steerInput = 0;
        }
        if (e.code === 'ArrowRight' || e.code === 'KeyD') {
          if (engineRef.current.steerInput > 0) engineRef.current.steerInput = 0;
        }
      };

      const refActiveLaunch = () => {
        const eng = engineRef.current;
        const now = performance.now();
        const current = statusRef.current;

        if (current.state === 'title') {
          refActiveStart();
          return;
        }

        if (current.state === 'count') {
          const elapsed = now - eng.countdownStartTime;
          if (elapsed < 3200) {
            soundManager.playEarlyBuzzer();
            current.tooEarly = true;
            updateStatus();
            setTimeout(() => {
              current.tooEarly = false;
              updateStatus();
            }, 700);
            return;
          }

          eng.reactionMs = Math.max(0, Math.round(elapsed - 3200));
          eng.rampSpeed = Math.max(76, Math.min(94, Math.round(92 - (eng.reactionMs / 1000) * 8)));
          eng.vx = (eng.rampSpeed * 1.46667) * 0.42;
          eng.launchTime = now;

          soundManager.playLaunch();
          current.state = 'drive';
          current.isGreen = true;
          current.speedMph = 0;
          updateStatus();
        }
      };

      window.addEventListener('keydown', handleKeyDown);
      window.addEventListener('keyup', handleKeyUp);

      // Handle Resize
      const handleResize = () => {
        if (!containerRef.current || !renderer || !camera) return;
        const w = containerRef.current.clientWidth;
        const h = containerRef.current.clientHeight;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      };
      window.addEventListener('resize', handleResize);

      // 9. Main Animation Loop
      const STEP = 1 / 120;
      let animId = 0;

      const loop = (now: number) => {
        animId = requestAnimationFrame(loop);
        const dt = Math.min((now - engineRef.current.lastTime) / 1000, 0.05);
        engineRef.current.lastTime = now;
        engineRef.current.accumulator += dt;

        while (engineRef.current.accumulator >= STEP) {
          fixedPhysicsUpdate(STEP, now);
          engineRef.current.accumulator -= STEP;
        }

        renderFrame(dt);
      };

      engineRef.current.lastTime = performance.now();
      animId = requestAnimationFrame(loop);
      engineRef.current.animFrameId = animId;

      return () => {
        cancelAnimationFrame(animId);
        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('keyup', handleKeyUp);
        window.removeEventListener('resize', handleResize);
        soundManager.stopThruster();
        renderer.dispose();
        if (container.contains(renderer.domElement)) {
          container.removeChild(renderer.domElement);
        }
      };
    }, []);

    // Fixed Physics Simulation Step
    const fixedPhysicsUpdate = (dt: number, now: number) => {
      const eng = engineRef.current;
      const current = statusRef.current;

      // 1. COUNTDOWN STATE
      if (current.state === 'count') {
        const elapsed = now - eng.countdownStartTime;
        current.countdownElapsed = elapsed;

        // Stage 0: 0 - 800ms (Light 1)
        // Stage 1: 800 - 1600ms (Light 2)
        // Stage 2: 1600 - 2400ms (Light 3)
        // Stage 3: 2400 - 3200ms (Light 4 ready)
        // Stage 4: >= 3200ms (ALL GREEN + GO!)
        if (elapsed < 800) {
          current.countdownLightStage = 1;
        } else if (elapsed < 1600) {
          if (eng.countdownLastBeepStage < 2) {
            eng.countdownLastBeepStage = 2;
            soundManager.playLightBeep(2);
          }
          current.countdownLightStage = 2;
        } else if (elapsed < 2400) {
          if (eng.countdownLastBeepStage < 3) {
            eng.countdownLastBeepStage = 3;
            soundManager.playLightBeep(3);
          }
          current.countdownLightStage = 3;
        } else if (elapsed < 3200) {
          current.countdownLightStage = 3;
        } else {
          // GREEN ACTIVATION!
          if (!current.isGreen) {
            current.isGreen = true;
            current.countdownLightStage = 4;
            soundManager.playLightBeep(4);
          }
        }

        // Idle car resting at line
        if (eng.carGroup) {
          eng.carGroup.position.set(eng.x, eng.y, eng.z);
          eng.carGroup.rotation.set(0, 0, 0);
        }

        // Camera in behind chase view
        eng.cameraTargetPos.set(eng.x - 7.5, 2.6, 0);
        eng.cameraTargetLook.set(eng.x + 12, 3.2, 0);
      }

      // 2. DRIVE STATE (Accelerating towards the ramp)
      else if (current.state === 'drive') {
        const driveElapsed = (now - eng.launchTime) / 1000;
        // Accelerate smoothly to ramp speed
        const speedRatio = Math.min(driveElapsed / 0.85, 1.0);
        const currentSpeedMph = Math.round(eng.rampSpeed * speedRatio);
        current.speedMph = currentSpeedMph;

        eng.x += eng.vx * dt * 1.55;
        if (eng.carGroup) {
          eng.carGroup.position.x = eng.x;
          eng.carGroup.position.y = 0.55 + Math.sin(now * 0.03) * 0.015;
          eng.carGroup.rotation.set(0, 0, 0);
        }

        // Spin wheels
        eng.wheels.forEach((w) => {
          w.rotation.z -= (eng.vx * dt * 2.5);
        });

        // Camera chases car
        eng.cameraTargetPos.set(eng.x - 8.2, 3.0, 0);
        eng.cameraTargetLook.set(eng.x + 10, 3.4, 0);

        // Transition to ramp when reaching ramp base (x = -4)
        if (eng.x >= -4) {
          current.state = 'ramp';
          eng.x = -4;
        }
      }

      // 3. RAMP STATE (Climbing the curved quarter-pipe wall)
      else if (current.state === 'ramp') {
        current.speedMph = eng.rampSpeed;
        // Travel along curve: ramp spans from x = -4 to x = 11, y = 0.55 to y = 28
        eng.x += eng.vx * dt * 0.82;
        const rampT = Math.min(Math.max((eng.x + 4) / 15, 0), 1.0);

        // Quarter pipe curve: y = 28 * (1 - cos(t * PI/2))
        const rampAngle = rampT * (Math.PI * 0.52); // steep upward curve
        eng.y = 0.55 + 28 * (1 - Math.cos(rampT * Math.PI * 0.5));
        eng.angle = rampAngle;

        if (eng.carGroup) {
          eng.carGroup.position.set(eng.x, eng.y, eng.z);
          eng.carGroup.rotation.z = eng.angle;
        }

        // Spin wheels
        eng.wheels.forEach((w) => {
          w.rotation.z -= (eng.vx * dt * 2.5);
        });

        // Dynamic camera tracking ramp ascent
        eng.cameraTargetPos.set(eng.x - 10, Math.max(5, eng.y + 4), 16);
        eng.cameraTargetLook.set(eng.x + 4, eng.y + 3, 0);

        // When reaching top of ramp curve (rampT >= 1.0), launch airborne!
        if (rampT >= 0.98) {
          current.state = 'air';
          eng.x = 11.2;
          eng.y = 28.5;
          // Launch velocity vector off lip (strong upward and forward velocity)
          eng.vx = Math.max(16, (eng.rampSpeed / 2.237) * 0.82);
          eng.vy = eng.vx * 0.95;
          eng.vz = 0;
          eng.angle = 1.35; // initial upward pitch
          eng.omega = 0.8;
          eng.airStartTime = performance.now();
          eng.maxAlt = eng.y;
          eng.peakG = 1.0;
        }
      }

      // 4. AIRBORNE STUNT STATE (Full 3D aerodynamic & thruster physics)
      else if (current.state === 'air') {
        const GRAVITY = 28.0;

        // Steering input applies rotational torque
        eng.omega += eng.steerInput * 4.2 * dt;
        // Rotational damping
        eng.omega *= Math.pow(0.982, dt * 60);
        eng.angle += eng.omega * dt;

        // Thruster physics
        let currentG = 1.0;
        if (eng.thrustInput && eng.thrusterGas > 0) {
          // Thrust is directed upwards from the car underbody (perpendicular to chassis)
          const thrustForce = 34.0;
          const thrustX = Math.sin(eng.angle) * thrustForce;
          const thrustY = Math.cos(eng.angle) * thrustForce;

          eng.vx += thrustX * dt;
          eng.vy += thrustY * dt;

          eng.thrusterGas = Math.max(0, eng.thrusterGas - 0.22 * dt);
          spawnThrusterPlumes();

          currentG = Math.hypot(thrustX, thrustY) / 9.8 + 1.0;
        } else {
          currentG = Math.hypot(eng.vx * 0.1, eng.vy * 0.1) + 1.0;
        }

        eng.peakG = Math.max(eng.peakG, currentG);

        // Apply Gravity
        eng.vy -= GRAVITY * dt;

        // Update Position
        eng.x += eng.vx * dt;
        eng.y += eng.vy * dt;

        // Track max altitude
        eng.maxAlt = Math.max(eng.maxAlt, eng.y);

        // Speed in MPH
        const totalVel = Math.hypot(eng.vx, eng.vy);
        current.speedMph = Math.round(totalVel * 2.237);

        // Detect full 360 flips
        const pitchCos = Math.cos(eng.angle);
        if (pitchCos < -0.65 && eng.prevPitchCos >= -0.65) {
          eng.flipsCount++;
          soundManager.playFlip();
        }
        eng.prevPitchCos = pitchCos;

        // Update Car Transform
        if (eng.carGroup) {
          eng.carGroup.position.set(eng.x, eng.y, eng.z);
          eng.carGroup.rotation.z = -eng.angle;
        }

        // Ring collection detection
        eng.rings.forEach((r) => {
          if (!r.data.collected) {
            const dist = Math.hypot(eng.x - r.mesh.position.x, eng.y - r.mesh.position.y);
            if (dist < 3.2) {
              r.data.collected = true;
              r.mesh.visible = false;
              eng.ringsCollected++;
              eng.thrusterGas = Math.min(1.0, eng.thrusterGas + 0.35);
              soundManager.playRing();
            }
          }
        });

        // Real-time score calculation
        eng.score =
          eng.ringsCollected * 500 +
          eng.flipsCount * 1500 +
          Math.round(eng.maxAlt * 2.5) +
          Math.round(((now - eng.airStartTime) / 1000) * 120);

        // Cinematic side tracking camera (matching Image 3)
        eng.cameraTargetPos.set(eng.x - 14, Math.max(8, eng.y + 4), 30);
        eng.cameraTargetLook.set(eng.x + 3, eng.y + 2, 0);

        // Touchdown / Ground Impact Check (ground level y <= 0.65)
        if (eng.y <= 0.65 && eng.vy < 0) {
          soundManager.stopThruster();
          eng.y = 0.65;
          eng.touchdownSpeed = Math.abs(eng.vy);

          // Evaluate landing tilt angle: car is upright when angle is near 0 or 2*PI
          const normalizedAngle = ((eng.angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
          const tiltFromUpright = Math.min(normalizedAngle, Math.PI * 2 - normalizedAngle);
          const maxAllowedTilt = 28 * (Math.PI / 180); // 28 degrees tolerance

          if (eng.touchdownSpeed <= 39 && tiltFromUpright <= maxAllowedTilt) {
            // SUCCESSFUL TOUCHDOWN!
            eng.landingClean = true;
            eng.score += 1000; // Soft landing bonus
            current.state = 'landed';
            soundManager.playTouchdown(true);

            if (eng.carGroup) {
              eng.carGroup.position.y = 0.65;
              eng.carGroup.rotation.z = 0;
            }

            setTimeout(() => {
              const best = safeBest();
              if (eng.score > best) saveBest(eng.score);
              current.state = 'results';
              updateStatus();
            }, 850);
          } else {
            // WIPEOUT / CRASH!
            eng.landingClean = false;
            current.state = 'crashed';
            eng.screenShake = 0.7;
            soundManager.playTouchdown(false);
            spawnCrashExplosion();

            if (eng.carGroup) {
              eng.carGroup.visible = false;
            }

            setTimeout(() => {
              const best = safeBest();
              if (eng.score > best) saveBest(eng.score);
              current.state = 'results';
              updateStatus();
            }, 950);
          }
        }
      }

      // 5. LANDED OR CRASHED STATES
      else if (current.state === 'landed') {
        eng.cameraTargetPos.set(eng.x - 8, 4.0, 14);
        eng.cameraTargetLook.set(eng.x + 2, 1.5, 0);
      } else if (current.state === 'crashed') {
        updateCrashParticles(dt);
      }

      // Title ambient camera orbit
      if (current.state === 'title') {
        const time = now * 0.0004;
        eng.cameraTargetPos.set(-28 + Math.sin(time) * 3, 3.8 + Math.cos(time * 0.8) * 0.5, 12);
        eng.cameraTargetLook.set(-18, 3.2, 0);
      }

      updateStatus();
    };

    // Render frame and camera interpolation
    const renderFrame = (dt: number) => {
      const eng = engineRef.current;
      if (!eng.renderer || !eng.scene || !eng.camera) return;

      // Smooth camera interpolation with exponential damping
      const smoothFactor = Math.min(1.0, dt * 4.8);
      eng.camera.position.lerp(eng.cameraTargetPos, smoothFactor);

      // Camera look-at target
      const currentLook = new THREE.Vector3();
      eng.camera.getWorldDirection(currentLook);
      const targetLook = eng.cameraTargetLook.clone().sub(eng.camera.position).normalize();
      currentLook.lerp(targetLook, smoothFactor);
      eng.camera.lookAt(eng.camera.position.clone().add(currentLook.multiplyScalar(20)));

      // Screen shake decay
      if (eng.screenShake > 0) {
        eng.camera.position.x += (Math.random() - 0.5) * eng.screenShake * 1.5;
        eng.camera.position.y += (Math.random() - 0.5) * eng.screenShake * 1.5;
        eng.screenShake = Math.max(0, eng.screenShake - dt * 2.2);
      }

      // Rotate stars subtly
      if (eng.stars) {
        eng.stars.rotation.y += dt * 0.004;
      }

      // Update thruster plumes
      eng.thrusterPlumes = eng.thrusterPlumes.filter((p) => {
        p.life -= dt;
        p.mesh.scale.multiplyScalar(0.92);
        (p.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, p.life / 0.16);
        if (p.life <= 0) {
          eng.scene?.remove(p.mesh);
          p.mesh.geometry.dispose();
          (p.mesh.material as THREE.Material).dispose();
          return false;
        }
        return true;
      });

      eng.renderer.render(eng.scene, eng.camera);
    };

    // VFX: Thruster Plumes
    const spawnThrusterPlumes = () => {
      const eng = engineRef.current;
      if (!eng.scene || !eng.carGroup) return;

      const plumeGeo = new THREE.ConeGeometry(0.35, 1.4, 8);
      const plumeMat = new THREE.MeshBasicMaterial({
        color: 0x6be7ff,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
      });

      const plume = new THREE.Mesh(plumeGeo, plumeMat);
      // Spawn at underbody nozzle position
      const nozzleOffset = new THREE.Vector3(
        -Math.sin(eng.angle) * 1.1,
        -Math.cos(eng.angle) * 1.1,
        0
      );
      plume.position.copy(eng.carGroup.position).add(nozzleOffset);
      plume.rotation.z = -eng.angle + Math.PI;

      eng.scene.add(plume);
      eng.thrusterPlumes.push({ mesh: plume, life: 0.16 });
    };

    // VFX: Crash Explosion Debris
    const spawnCrashExplosion = () => {
      const eng = engineRef.current;
      if (!eng.scene || !eng.carGroup) return;

      const colors = [0xff3b30, 0xff9500, 0xd0dbe8, 0x334455];
      for (let i = 0; i < 45; i++) {
        const size = 0.15 + Math.random() * 0.35;
        const geo = new THREE.BoxGeometry(size, size, size);
        const mat = new THREE.MeshStandardMaterial({
          color: colors[i % colors.length],
          metalness: 0.8,
          roughness: 0.3,
          emissive: i % 2 === 0 ? 0xff2200 : 0x000000,
          emissiveIntensity: 0.8,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.copy(eng.carGroup.position);
        eng.scene.add(mesh);

        const angle = Math.random() * Math.PI * 2;
        const speed = 12 + Math.random() * 24;
        eng.particles.push({
          mesh,
          vx: Math.cos(angle) * speed,
          vy: 8 + Math.random() * 22,
          vz: (Math.random() - 0.5) * speed * 0.6,
          life: 2.2,
          maxLife: 2.2,
        });
      }
    };

    const updateCrashParticles = (dt: number) => {
      const eng = engineRef.current;
      eng.particles = eng.particles.filter((p) => {
        p.life -= dt;
        p.vy -= 30.0 * dt;
        p.mesh.position.x += p.vx * dt;
        p.mesh.position.y += p.vy * dt;
        p.mesh.position.z += p.vz * dt;
        p.mesh.rotation.x += dt * 6;
        p.mesh.rotation.y += dt * 4;

        if (p.mesh.position.y < 0.2) {
          p.mesh.position.y = 0.2;
          p.vy = -p.vy * 0.4;
          p.vx *= 0.8;
          p.vz *= 0.8;
        }

        (p.mesh.material as THREE.MeshStandardMaterial).opacity = Math.max(0, p.life / p.maxLife);
        if (p.life <= 0) {
          eng.scene?.remove(p.mesh);
          p.mesh.geometry.dispose();
          (p.mesh.material as THREE.Material).dispose();
          return false;
        }
        return true;
      });
    };

    // Build Procedural Sports Car (Tesla Roadster 2.0 Style)
    const buildSportsCar = (scene: THREE.Scene, eng: typeof engineRef.current) => {
      const carGroup = new THREE.Group();
      const carBody = new THREE.Group();
      carGroup.add(carBody);
      scene.add(carGroup);

      // Materials
      const bodyMat = new THREE.MeshStandardMaterial({
        color: 0xdce5ef, // Sleek metallic silver/white
        metalness: 0.92,
        roughness: 0.2,
      });

      const glassMat = new THREE.MeshStandardMaterial({
        color: 0x07111b,
        metalness: 0.88,
        roughness: 0.08,
        transparent: true,
        opacity: 0.88,
      });

      const carbonMat = new THREE.MeshStandardMaterial({
        color: 0x161e29,
        metalness: 0.6,
        roughness: 0.4,
      });

      const tireMat = new THREE.MeshStandardMaterial({
        color: 0x090c10,
        roughness: 0.9,
      });

      const rimMat = new THREE.MeshStandardMaterial({
        color: 0xa9b7c6,
        metalness: 0.95,
        roughness: 0.15,
      });

      const tailLightMat = new THREE.MeshStandardMaterial({
        color: 0xff2a39,
        emissive: 0xff1e2f,
        emissiveIntensity: 2.8,
      });

      const headLightMat = new THREE.MeshStandardMaterial({
        color: 0xe0f7ff,
        emissive: 0x82eaff,
        emissiveIntensity: 2.5,
      });

      // 1. Sleek Aerodynamic Body Hull
      const bodyShape = new THREE.Shape();
      bodyShape.moveTo(-2.9, 0.35);
      bodyShape.bezierCurveTo(-2.8, 0.62, -2.1, 0.82, -1.2, 0.88);
      bodyShape.bezierCurveTo(-0.4, 0.94, 0.9, 0.88, 1.8, 0.74);
      bodyShape.bezierCurveTo(2.4, 0.64, 2.85, 0.5, 3.0, 0.38);
      bodyShape.lineTo(2.85, 0.24);
      bodyShape.lineTo(-2.75, 0.24);
      bodyShape.closePath();

      const bodyGeo = new THREE.ExtrudeGeometry(bodyShape, {
        depth: 2.05,
        bevelEnabled: true,
        bevelSegments: 4,
        steps: 1,
        bevelSize: 0.08,
        bevelThickness: 0.06,
        curveSegments: 20,
      });
      bodyGeo.translate(0, 0, -1.025);
      const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
      bodyMesh.castShadow = true;
      bodyMesh.receiveShadow = true;
      carBody.add(bodyMesh);

      // 2. Swept Glass Canopy
      const canopyShape = new THREE.Shape();
      canopyShape.moveTo(-1.6, 0.82);
      canopyShape.bezierCurveTo(-1.25, 1.25, -0.85, 1.54, -0.25, 1.56);
      canopyShape.bezierCurveTo(0.48, 1.58, 1.12, 1.25, 1.55, 0.76);
      canopyShape.lineTo(1.22, 0.76);
      canopyShape.bezierCurveTo(0.85, 1.15, 0.38, 1.35, -0.2, 1.35);
      canopyShape.bezierCurveTo(-0.7, 1.35, -1.1, 1.12, -1.35, 0.82);
      canopyShape.closePath();

      const canopyGeo = new THREE.ExtrudeGeometry(canopyShape, {
        depth: 1.52,
        bevelEnabled: true,
        bevelSegments: 3,
        steps: 1,
        bevelSize: 0.04,
        bevelThickness: 0.04,
        curveSegments: 16,
      });
      canopyGeo.translate(0, 0, -0.76);
      const canopyMesh = new THREE.Mesh(canopyGeo, glassMat);
      canopyMesh.castShadow = true;
      carBody.add(canopyMesh);

      // 3. Carbon Roof Strip
      const roof = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.05, 1.32), carbonMat);
      roof.position.set(-0.25, 1.54, 0);
      carBody.add(roof);

      // 4. Front Splitter & Rear Carbon Diffuser
      const splitter = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.07, 2.15), carbonMat);
      splitter.position.set(2.95, 0.26, 0);
      carBody.add(splitter);

      const diffuser = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.12, 1.85), carbonMat);
      diffuser.position.set(-2.82, 0.26, 0);
      carBody.add(diffuser);

      // 5. LED Headlights & Full-Width Thin Red Tail Light
      const leftHeadlight = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.45), headLightMat);
      leftHeadlight.position.set(2.88, 0.52, 0.65);
      const rightHeadlight = leftHeadlight.clone();
      rightHeadlight.position.z = -0.65;
      carBody.add(leftHeadlight);
      carBody.add(rightHeadlight);

      // Continuous thin red neon light bar across rear (seen clearly in chase camera!)
      const tailLightBar = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.07, 1.95), tailLightMat);
      tailLightBar.position.set(-2.86, 0.54, 0);
      carBody.add(tailLightBar);

      // 6. Wheels (4 alloy wheels with rubber tires & spokes)
      const wheels: THREE.Group[] = [];
      const wheelPositions = [
        { x: -1.75, z: 1.05 },
        { x: -1.75, z: -1.05 },
        { x: 1.72, z: 1.05 },
        { x: 1.72, z: -1.05 },
      ];

      wheelPositions.forEach((pos) => {
        const wheelGroup = new THREE.Group();
        wheelGroup.position.set(pos.x, 0.44, pos.z);
        carBody.add(wheelGroup);
        wheels.push(wheelGroup);

        // Tire
        const tireGeo = new THREE.CylinderGeometry(0.44, 0.44, 0.28, 28);
        tireGeo.rotateX(Math.PI / 2);
        const tireMesh = new THREE.Mesh(tireGeo, tireMat);
        tireMesh.castShadow = true;
        wheelGroup.add(tireMesh);

        // Rim
        const rimGeo = new THREE.CylinderGeometry(0.26, 0.26, 0.3, 24);
        rimGeo.rotateX(Math.PI / 2);
        const rimMesh = new THREE.Mesh(rimGeo, rimMat);
        wheelGroup.add(rimMesh);

        // Spokes
        for (let i = 0; i < 5; i++) {
          const spokeGeo = new THREE.BoxGeometry(0.06, 0.36, 0.04);
          const spoke = new THREE.Mesh(spokeGeo, rimMat);
          spoke.position.set(0, 0, Math.sign(pos.z) * 0.14);
          spoke.rotation.z = (i * Math.PI * 2) / 5;
          wheelGroup.add(spoke);
        }
      });

      // 7. Underside Cold-Gas Thruster Nozzles
      for (const xOff of [-1.5, -0.5, 0.5, 1.5]) {
        const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.12, 12), carbonMat);
        nozzle.position.set(xOff, 0.2, 0);
        carBody.add(nozzle);
      }

      // Grounding contact shadow plane
      const shadowGeo = new THREE.PlaneGeometry(6.2, 3.0);
      const shadowMat = new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.65,
      });
      const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
      shadowMesh.rotation.x = -Math.PI / 2;
      shadowMesh.position.set(0, 0.02, 0);
      carBody.add(shadowMesh);

      eng.carGroup = carGroup;
      eng.carBody = carBody;
      eng.wheels = wheels;
      carGroup.position.set(eng.x, eng.y, eng.z);
    };

    // Build Road, Neon Edges, Wall Ramp, and Track Scenery
    const buildEnvironment = (scene: THREE.Scene, eng: typeof engineRef.current) => {
      // 1. Star Field
      const starGeo = new THREE.BufferGeometry();
      const starPos = [];
      for (let i = 0; i < 900; i++) {
        starPos.push(
          (Math.random() - 0.5) * 350,
          Math.random() * 140 + 5,
          -Math.random() * 260 - 10
        );
      }
      starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
      const starMat = new THREE.PointsMaterial({
        color: 0xbee3ff,
        size: 0.24,
        transparent: true,
        opacity: 0.85,
      });
      const stars = new THREE.Points(starGeo, starMat);
      scene.add(stars);
      eng.stars = stars;

      // 2. Infinite Ground Floor
      const groundFloor = new THREE.Mesh(
        new THREE.PlaneGeometry(600, 400),
        new THREE.MeshStandardMaterial({
          color: 0x070b14,
          roughness: 0.95,
          metalness: 0.1,
        })
      );
      groundFloor.rotation.x = -Math.PI / 2;
      groundFloor.position.set(0, 0, -40);
      groundFloor.receiveShadow = true;
      scene.add(groundFloor);

      // 3. Main Straight Road Track
      const roadMat = new THREE.MeshStandardMaterial({
        color: 0x111925,
        roughness: 0.72,
        metalness: 0.18,
      });

      // Neon Red/Coral Edge Light Material matching screenshot!
      const neonEdgeMat = new THREE.MeshStandardMaterial({
        color: 0xff3b30,
        emissive: 0xff261b,
        emissiveIntensity: 2.2,
      });

      const whiteMarkMat = new THREE.MeshStandardMaterial({
        color: 0x8ea2bd,
        emissive: 0x1d2736,
      });

      // Straight road mesh: from x = -70 to x = -4
      const roadLength = 70;
      const roadWidth = 14;
      const roadMesh = new THREE.Mesh(
        new THREE.BoxGeometry(roadLength, 0.25, roadWidth),
        roadMat
      );
      roadMesh.position.set(-39, 0.12, 0);
      roadMesh.receiveShadow = true;
      scene.add(roadMesh);

      // Left & Right Glowing Neon Red Edge Rails on Straight Track
      for (const z of [-roadWidth / 2 + 0.15, roadWidth / 2 - 0.15]) {
        const edgeLine = new THREE.Mesh(
          new THREE.BoxGeometry(roadLength, 0.08, 0.25),
          neonEdgeMat
        );
        edgeLine.position.set(-39, 0.26, z);
        scene.add(edgeLine);
      }

      // Center dashed road markings
      for (let x = -68; x < -4; x += 6) {
        const dash = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.02, 0.22), whiteMarkMat);
        dash.position.set(x, 0.26, 0);
        scene.add(dash);
      }

      // Start line stripe right in front of the car
      const startLine = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.02, roadWidth - 1), whiteMarkMat);
      startLine.position.set(-24, 0.26, 0);
      scene.add(startLine);

      // 4. Giant Curved Wall Ramp
      // Smooth quarter-pipe curve that curls up to 90 degrees vertical!
      const rampCurvePts: THREE.Vector3[] = [];
      const steps = 70;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        // Curve from x = -4 to x = 11, y = 0.25 to y = 28
        const rx = -4 + 15 * t;
        const ry = 0.25 + 28 * (1 - Math.cos((t * Math.PI) / 2));
        rampCurvePts.push(new THREE.Vector3(rx, ry, 0));
      }

      // Build Ramp Road Mesh
      const rampPath = new THREE.CatmullRomCurve3(rampCurvePts);
      const rampGeo = new THREE.TubeGeometry(rampPath, 70, roadWidth / 2, 4, false);
      rampGeo.scale(1, 0.05, 1);
      const rampMesh = new THREE.Mesh(rampGeo, roadMat);
      rampMesh.receiveShadow = true;
      scene.add(rampMesh);

      // Neon Red Glowing Edges along the entire curve of the ramp!
      const leftCurvePts = rampCurvePts.map((p) => new THREE.Vector3(p.x, p.y + 0.15, -roadWidth / 2 + 0.15));
      const rightCurvePts = rampCurvePts.map((p) => new THREE.Vector3(p.x, p.y + 0.15, roadWidth / 2 - 0.15));

      const leftEdgeTube = new THREE.Mesh(
        new THREE.TubeGeometry(new THREE.CatmullRomCurve3(leftCurvePts), 60, 0.16, 8, false),
        neonEdgeMat
      );
      const rightEdgeTube = new THREE.Mesh(
        new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rightCurvePts), 60, 0.16, 8, false),
        neonEdgeMat
      );
      scene.add(leftEdgeTube);
      scene.add(rightEdgeTube);

      // Dashed lane lines up the ramp
      for (let i = 4; i < steps - 4; i += 7) {
        const p = rampCurvePts[i];
        const nextP = rampCurvePts[i + 1];
        const dir = nextP.clone().sub(p).normalize();
        const dash = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.04, 0.22), whiteMarkMat);
        dash.position.set(p.x, p.y + 0.1, 0);
        dash.rotation.z = Math.atan2(dir.y, dir.x);
        scene.add(dash);
      }

      // 5. Left Stadium / Streetlight Poles with Light Cones
      for (let i = 0; i < 7; i++) {
        const xPos = -45 + i * 14;
        const poleZ = -roadWidth / 2 - 3.5;

        // Pole
        const pole = new THREE.Mesh(
          new THREE.CylinderGeometry(0.12, 0.16, 12, 8),
          new THREE.MeshStandardMaterial({ color: 0x4a5a6e, metalness: 0.8, roughness: 0.4 })
        );
        pole.position.set(xPos, 6, poleZ);
        scene.add(pole);

        // Lamp head
        const lamp = new THREE.Mesh(
          new THREE.BoxGeometry(1.2, 0.35, 0.6),
          new THREE.MeshStandardMaterial({
            color: 0xffffff,
            emissive: 0xebf5ff,
            emissiveIntensity: 2.0,
          })
        );
        lamp.position.set(xPos, 12, poleZ + 0.8);
        scene.add(lamp);

        // Downward soft spotlight
        const spot = new THREE.SpotLight(0xdbe9f8, 3.5, 40, Math.PI / 4, 0.5, 1);
        spot.position.set(xPos, 12, poleZ + 0.8);
        spot.target.position.set(xPos, 0, 0);
        scene.add(spot);
        scene.add(spot.target);
      }

      // 6. Distant Bleachers / Stadium Spectator Lights
      const bleacherCount = 450;
      const bleacherGeo = new THREE.BufferGeometry();
      const bleacherPos = [];
      for (let i = 0; i < bleacherCount; i++) {
        const bx = -50 + Math.random() * 85;
        const bz = -roadWidth / 2 - 8 - Math.random() * 35;
        const by = 1.0 + Math.abs(bz + roadWidth / 2 + 8) * 0.38 + (Math.random() - 0.5) * 0.5;
        bleacherPos.push(bx, by, bz);
      }
      bleacherGeo.setAttribute('position', new THREE.Float32BufferAttribute(bleacherPos, 3));
      const bleacherMat = new THREE.PointsMaterial({
        color: 0x7fa2c4,
        size: 0.18,
        transparent: true,
        opacity: 0.75,
      });
      const bleachers = new THREE.Points(bleacherGeo, bleacherMat);
      scene.add(bleachers);

      // 7. Sky Architectural Crossing Trusses
      const trussMat = new THREE.MeshStandardMaterial({
        color: 0x162232,
        roughness: 0.7,
      });
      for (let i = 0; i < 3; i++) {
        const arch = new THREE.Mesh(new THREE.BoxGeometry(0.4, 45, 0.4), trussMat);
        arch.position.set(20 + i * 20, 26, -18);
        arch.rotation.z = Math.PI / 4;
        scene.add(arch);

        const arch2 = arch.clone();
        arch2.rotation.z = -Math.PI / 4;
        scene.add(arch2);
      }
    };

    // Build Glowing Sky Rings (Collectibles)
    const buildSkyRings = (scene: THREE.Scene, eng: typeof engineRef.current) => {
      eng.rings = [];
      const ringMat = new THREE.MeshStandardMaterial({
        color: 0x38cfff,
        emissive: 0x1dbbee,
        emissiveIntensity: 2.2,
        roughness: 0.2,
        metalness: 0.8,
      });

      for (let i = 0; i < 3; i++) {
        const ringGeo = new THREE.TorusGeometry(2.4, 0.18, 12, 36);
        const ringMesh = new THREE.Mesh(ringGeo, ringMat);
        // Positioned along the high flight trajectory
        ringMesh.position.set(22 + i * 16, 36 + Math.sin((i / 2) * Math.PI) * 14, 0);
        ringMesh.rotation.y = Math.PI / 2;
        scene.add(ringMesh);

        eng.rings.push({
          mesh: ringMesh,
          data: {
            id: i,
            x: ringMesh.position.x,
            y: ringMesh.position.y,
            z: 0,
            radius: 2.4,
            collected: false,
          },
        });
      }
    };

    return (
      <div
        ref={containerRef}
        className="w-full h-full relative cursor-crosshair overflow-hidden select-none"
        onPointerDown={(e) => {
          // If in air, holding down fires thrusters
          if (statusRef.current.state === 'air') {
            engineRef.current.thrustInput = true;
            soundManager.startThruster();
          }
        }}
        onPointerUp={() => {
          if (statusRef.current.state === 'air') {
            engineRef.current.thrustInput = false;
            soundManager.stopThruster();
          }
        }}
      />
    );
  }
);
GameCanvas.displayName = 'GameCanvas';
