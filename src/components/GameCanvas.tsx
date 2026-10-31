import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { CarColor, GameStatus, GraphicsQuality, RingData, RunMetrics, ScoreBreakdown } from '../types';
import { soundManager } from '../audio/soundManager';

interface GameCanvasProps {
  onStatusUpdate: (status: GameStatus) => void;
  statusRef: React.MutableRefObject<GameStatus>;
  carColor: CarColor;
  graphicsQuality: GraphicsQuality;
  isPaused: boolean;
}

export interface GameCanvasHandle {
  startCountdown: () => void;
  triggerLaunch: () => void;
  setSteer: (dir: number) => void;
  setThrust: (active: boolean) => void;
  restart: () => void;
}

export const GameCanvas = React.forwardRef<GameCanvasHandle, GameCanvasProps>(
  ({ onStatusUpdate, statusRef, carColor, graphicsQuality, isPaused }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);

    // Engine references
    const engineRef = useRef<{
      renderer: THREE.WebGLRenderer | null;
      scene: THREE.Scene | null;
      camera: THREE.PerspectiveCamera | null;
      carGroup: THREE.Group | null;
      carBodyMesh: THREE.Mesh | null;
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
      countdownGreenTime: number;
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
      airEndTime: number;
      launchTime: number;
      reactionMs: number;
      rampSpeed: number;
      touchdownSpeed: number;
      landingClean: boolean;
      score: number;
      frozenMetrics: RunMetrics | null;
      ringsCollected: number;
      screenShake: number;
      cameraTargetPos: THREE.Vector3;
      cameraTargetLook: THREE.Vector3;
      // Dynamic notices
      launchNotice: { visible: boolean; reactionSec: number } | null;
      launchNoticeTimer: number;
      flipNotice: { visible: boolean; count: number } | null;
      flipNoticeTimer: number;
    }>({
      renderer: null,
      scene: null,
      camera: null,
      carGroup: null,
      carBodyMesh: null,
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
      countdownGreenTime: 0,
      countdownLastBeepStage: 0,
      x: -32,
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
      airEndTime: 0,
      launchTime: 0,
      reactionMs: 0,
      rampSpeed: 80,
      touchdownSpeed: 0,
      landingClean: false,
      score: 0,
      frozenMetrics: null,
      ringsCollected: 0,
      screenShake: 0,
      cameraTargetPos: new THREE.Vector3(-40, 3.4, 0),
      cameraTargetLook: new THREE.Vector3(-15, 3.0, 0),
      launchNotice: null,
      launchNoticeTimer: 0,
      flipNotice: null,
      flipNoticeTimer: 0,
    });

    const safeBest = (): number => {
      try {
        return Number(localStorage.getItem('roadsterLoopBest') || 1000);
      } catch {
        return 1000;
      }
    };

    const saveBest = (score: number) => {
      try {
        localStorage.setItem('roadsterLoopBest', String(score));
      } catch {}
    };

    // Update car body paint material when carColor changes
    const applyCarColor = (color: CarColor) => {
      const mesh = engineRef.current.carBodyMesh;
      if (!mesh) return;
      const mat = mesh.material as THREE.MeshStandardMaterial;
      if (!mat) return;

      if (color === 'red') {
        mat.color.setHex(0xd81f2a);
        mat.metalness = 0.88;
        mat.roughness = 0.22;
      } else if (color === 'black') {
        mat.color.setHex(0x181a20);
        mat.metalness = 0.92;
        mat.roughness = 0.16;
      } else {
        // silver
        mat.color.setHex(0xdfe6f0);
        mat.metalness = 0.94;
        mat.roughness = 0.18;
      }
    };

    useEffect(() => {
      applyCarColor(carColor);
    }, [carColor]);

    // Update renderer settings when graphicsQuality changes
    useEffect(() => {
      const eng = engineRef.current;
      if (!eng.renderer) return;
      if (graphicsQuality === 'high') {
        eng.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        eng.renderer.shadowMap.enabled = true;
      } else {
        eng.renderer.setPixelRatio(1);
        eng.renderer.shadowMap.enabled = false;
      }
    }, [graphicsQuality]);

    // Public methods exposed to React parent
    React.useImperativeHandle(ref, () => ({
      startCountdown: () => {
        refActiveStart();
      },

      triggerLaunch: () => {
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

          executeLaunch(now);
          return;
        }

        if (current.state === 'results' || current.state === 'landed' || current.state === 'crashed') {
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

    const executeLaunch = (now: number) => {
      const eng = engineRef.current;
      const current = statusRef.current;

      eng.reactionMs = Math.min(2000, Math.max(0, Math.round(now - eng.countdownGreenTime)));
      const reactionSec = eng.reactionMs / 1000;

      // Reaction bonus speed
      let baseSpeed = 80;
      if (reactionSec < 0.20) {
        baseSpeed = 95;
      } else if (reactionSec < 0.30) {
        baseSpeed = 90;
      } else if (reactionSec < 0.45) {
        baseSpeed = 85;
      } else if (reactionSec <= 2.0) {
        baseSpeed = 80;
      }

      eng.rampSpeed = baseSpeed;
      eng.vx = (eng.rampSpeed * 1.46667) * 0.42;
      eng.launchTime = now;

      eng.launchNotice = {
        visible: true,
        reactionSec: Number(reactionSec.toFixed(3)),
      };
      eng.launchNoticeTimer = 2.0;

      soundManager.playLaunch();
      current.state = 'drive';
      current.isGreen = true;
      current.speedMph = 0;
      current.actionButtonText = 'THRUST';
      updateStatus();
    };

    const refActiveStart = () => {
      const eng = engineRef.current;
      resetRunToStart();
      statusRef.current.state = 'count';
      statusRef.current.countdownElapsed = 0;
      statusRef.current.countdownLightStage = 1;
      statusRef.current.isGreen = false;
      statusRef.current.actionButtonText = 'GO';
      statusRef.current.isNewBest = false;
      eng.countdownStartTime = performance.now();
      eng.countdownGreenTime = eng.countdownStartTime + 3200;
      eng.countdownLastBeepStage = 1;
      soundManager.playLightBeep(1);
      updateStatus();
    };

    const resetRunToStart = () => {
      const eng = engineRef.current;
      soundManager.stopThruster();

      eng.x = -32;
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
      eng.airStartTime = 0;
      eng.airEndTime = 0;
      eng.frozenMetrics = null;
      eng.launchNotice = null;
      eng.launchNoticeTimer = 0;
      eng.flipNotice = null;
      eng.flipNoticeTimer = 0;

      if (eng.carGroup) {
        eng.carGroup.position.set(eng.x, eng.y, eng.z);
        eng.carGroup.rotation.set(0, 0, 0);
        eng.carGroup.visible = true;
      }

      // Reset rings along realistic stunt arc
      const ringCoords = [
        { x: 28, y: 42, z: 0 },
        { x: 52, y: 52, z: 0 },
        { x: 76, y: 38, z: 0 },
      ];

      eng.rings.forEach((r, idx) => {
        r.data.collected = false;
        r.mesh.visible = true;
        r.mesh.position.set(ringCoords[idx].x, ringCoords[idx].y, ringCoords[idx].z);
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

    const calculateBreakdown = (
      clean: boolean,
      rings: number,
      flips: number,
      maxAlt: number,
      airtimeSec: number,
      touchdownSpeed: number
    ): ScoreBreakdown => {
      const ringsScore = rings * 500;
      const flipsScore = clean ? flips * 1000 : 0;
      const airtimeScore = clean ? Math.round(airtimeSec * 100) : 0;
      const altScore = clean ? Math.round(maxAlt) : 0;
      const landingBonus = clean ? (touchdownSpeed < 20 ? 1000 : 500) : 0;
      const total = ringsScore + flipsScore + airtimeScore + altScore + landingBonus;

      return {
        ringsScore,
        flipsScore,
        airtimeScore,
        altScore,
        landingBonus,
        total,
      };
    };

    const updateStatus = () => {
      const eng = engineRef.current;
      const current = statusRef.current;
      const best = safeBest();

      // If we have frozen final metrics from touchdown, present them exactly
      if (eng.frozenMetrics) {
        const isNewBest = eng.frozenMetrics.score > best;
        onStatusUpdate({
          ...current,
          score: eng.frozenMetrics.score,
          bestScore: Math.max(best, eng.frozenMetrics.score),
          isNewBest,
          thrusterGas: eng.thrusterGas,
          gForce: eng.frozenMetrics.peakG,
          altitudeFt: 0,
          sinkSpeedFtS: 0,
          flips: eng.frozenMetrics.flips,
          ringsCount: eng.frozenMetrics.ringsCollected,
          totalRings: 3,
          launchNotice: eng.launchNotice,
          flipNotice: eng.flipNotice,
          actionButtonText: 'GO',
          metrics: eng.frozenMetrics,
        });
        return;
      }

      const sinkSpeedFtS = current.state === 'air' && eng.vy < 0 ? Math.round(Math.abs(eng.vy)) : 0;
      const airtimeSec = eng.airStartTime > 0 ? Number(((performance.now() - eng.airStartTime) / 1000).toFixed(1)) : 0;

      const breakdown = calculateBreakdown(
        eng.landingClean,
        eng.ringsCollected,
        eng.flipsCount,
        eng.maxAlt,
        airtimeSec,
        eng.touchdownSpeed
      );

      const metrics: RunMetrics = {
        reactionMs: eng.reactionMs,
        rampSpeedMph: eng.rampSpeed,
        peakG: Number(eng.peakG.toFixed(1)),
        maxAltitudeFt: Math.round(eng.maxAlt),
        airtimeSec,
        flips: eng.flipsCount,
        ringsCollected: eng.ringsCollected,
        totalRings: 3,
        touchdownSpeedFtS: Math.round(eng.touchdownSpeed),
        tiltAngleDeg: Math.round((Math.abs(eng.angle) * 180) / Math.PI) % 360,
        landedClean: eng.landingClean,
        score: breakdown.total,
        crashReason: getCrashExplanation(eng.touchdownSpeed, eng.angle, eng.ringsCollected),
        breakdown,
      };

      onStatusUpdate({
        ...current,
        score: breakdown.total,
        bestScore: Math.max(best, breakdown.total),
        isNewBest: breakdown.total > best,
        thrusterGas: eng.thrusterGas,
        gForce: Number(eng.peakG.toFixed(1)),
        altitudeFt: Math.max(0, Math.round(eng.y)),
        sinkSpeedFtS,
        flips: eng.flipsCount,
        ringsCount: eng.ringsCollected,
        totalRings: 3,
        launchNotice: eng.launchNotice,
        flipNotice: eng.flipNotice,
        actionButtonText: current.state === 'count' || current.state === 'title' ? 'GO' : 'THRUST',
        metrics,
      });
    };

    const getCrashExplanation = (sinkSpeed: number, angle: number, rings: number): string => {
      const deg = ((Math.abs(angle) * 180) / Math.PI) % 360;
      const isUpright = deg <= 28 || deg >= 332;

      if (!isUpright) {
        return `Roof hit first. Keep rotating until the wheels point at the ground. Flips, altitude and airtime only score when you land it. Rings: ${(rings * 500).toLocaleString()}.`;
      }
      if (sinkSpeed > 39) {
        return `Wheels down at ${Math.round(sinkSpeed)} ft/s, over the 39 ft/s limit. Burn the thrusters earlier to slow the drop. Flips, altitude and airtime only score when you land it. Rings: ${(rings * 500).toLocaleString()}.`;
      }
      return 'Hard impact caused a rollover. Align wheels straight and reduce downward sink rate.';
    };

    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;

      const width = container.clientWidth || window.innerWidth;
      const height = container.clientHeight || window.innerHeight;

      // 1. Scene Setup
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x050811);
      scene.fog = new THREE.FogExp2(0x050811, 0.0055);

      // 2. Camera Setup (Low chase camera behind vehicle)
      const camera = new THREE.PerspectiveCamera(46, width / height, 0.1, 1000);
      camera.position.set(-40, 3.4, 0);
      camera.lookAt(-15, 3.0, 0);

      // 3. WebGL Renderer
      const renderer = new THREE.WebGLRenderer({
        antialias: true,
        powerPreference: 'high-performance',
      });
      renderer.setSize(width, height);
      renderer.setPixelRatio(graphicsQuality === 'high' ? Math.min(window.devicePixelRatio, 2) : 1);
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.35;
      renderer.shadowMap.enabled = graphicsQuality === 'high';
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      container.appendChild(renderer.domElement);

      engineRef.current.renderer = renderer;
      engineRef.current.scene = scene;
      engineRef.current.camera = camera;

      // 4. Lighting Rig (Brighter stadium lighting, pure red/pink accents, NO cyan)
      const hemiLight = new THREE.HemisphereLight(0x9cbcdb, 0x070b14, 1.4);
      scene.add(hemiLight);

      const dirLight = new THREE.DirectionalLight(0xf0f5ff, 2.2);
      dirLight.position.set(-15, 40, 25);
      dirLight.castShadow = graphicsQuality === 'high';
      dirLight.shadow.mapSize.width = 1024;
      dirLight.shadow.mapSize.height = 1024;
      dirLight.shadow.camera.near = 0.5;
      dirLight.shadow.camera.far = 150;
      dirLight.shadow.camera.left = -35;
      dirLight.shadow.camera.right = 35;
      dirLight.shadow.camera.top = 35;
      dirLight.shadow.camera.bottom = -35;
      scene.add(dirLight);

      // RED accent point lights
      const neonRed1 = new THREE.PointLight(0xff2a2a, 3.0, 95);
      neonRed1.position.set(0, 16, 5);
      scene.add(neonRed1);

      const neonRed2 = new THREE.PointLight(0xff2a2a, 2.5, 75);
      neonRed2.position.set(16, 12, -4);
      scene.add(neonRed2);

      // 5. Build Environment
      buildEnvironment(scene, engineRef.current);

      // 6. Build High-Fidelity Sports Car
      buildSportsCar(scene, engineRef.current);
      applyCarColor(carColor);

      // 7. Build Sky Rings (Pink-red glowing toruses)
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
          } else if (
            statusRef.current.state === 'results' ||
            statusRef.current.state === 'landed' ||
            statusRef.current.state === 'crashed'
          ) {
            refActiveStart();
          }
        }
        if (e.code === 'Enter') {
          e.preventDefault();
          if (
            statusRef.current.state === 'results' ||
            statusRef.current.state === 'landed' ||
            statusRef.current.state === 'crashed'
          ) {
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

          executeLaunch(now);
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
        if (isPaused) {
          engineRef.current.lastTime = now;
          return;
        }

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

      // Handle Launch & Flip notice timers
      if (eng.launchNoticeTimer > 0) {
        eng.launchNoticeTimer -= dt;
        if (eng.launchNoticeTimer <= 0) eng.launchNotice = null;
      }
      if (eng.flipNoticeTimer > 0) {
        eng.flipNoticeTimer -= dt;
        if (eng.flipNoticeTimer <= 0) eng.flipNotice = null;
      }

      // 1. COUNTDOWN STATE
      if (current.state === 'count') {
        const elapsed = now - eng.countdownStartTime;
        current.countdownElapsed = elapsed;

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

          // Auto-launch if no user tap after 2.0s of green
          if (elapsed >= 5200) {
            executeLaunch(now);
            return;
          }
        }

        // Idle car resting at starting line
        if (eng.carGroup) {
          eng.carGroup.position.set(eng.x, eng.y, eng.z);
          eng.carGroup.rotation.set(0, 0, 0);
        }

        // Camera in behind chase view (Screenshot 2)
        eng.cameraTargetPos.set(eng.x - 8.5, 3.2, 0);
        eng.cameraTargetLook.set(eng.x + 14, 3.2, 0);
      }

      // 2. DRIVE STATE (Accelerating towards the ramp)
      else if (current.state === 'drive') {
        const driveElapsed = (now - eng.launchTime) / 1000;
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
          w.rotation.z -= eng.vx * dt * 2.5;
        });

        // Chase camera keeps ramp and car aligned
        eng.cameraTargetPos.set(eng.x - 9.0, 3.2, 0);
        eng.cameraTargetLook.set(eng.x + 14, 3.4, 0);

        // Transition to ramp when reaching ramp base (x = -4)
        if (eng.x >= -4) {
          current.state = 'ramp';
          eng.x = -4;
        }
      }

      // 3. RAMP STATE (Climbing the curved quarter-pipe wall)
      else if (current.state === 'ramp') {
        current.speedMph = eng.rampSpeed;
        eng.x += eng.vx * dt * 0.82;
        const rampT = Math.min(Math.max((eng.x + 4) / 22, 0), 1.0);

        // Curved quarter-pipe wall
        const rampAngle = rampT * (Math.PI * 0.52);
        eng.y = 0.55 + 31.5 * (1 - Math.cos(rampT * Math.PI * 0.5));
        eng.angle = rampAngle;

        // Spike G-Force on ramp transition up to 35-50G
        eng.peakG = Math.max(eng.peakG, 1.0 + rampT * 48.0);

        if (eng.carGroup) {
          eng.carGroup.position.set(eng.x, eng.y, eng.z);
          eng.carGroup.rotation.z = eng.angle;
        }

        // Spin wheels
        eng.wheels.forEach((w) => {
          w.rotation.z -= eng.vx * dt * 2.5;
        });

        // Camera tracks ramp ascent smoothly
        eng.cameraTargetPos.set(eng.x - 12, Math.max(5, eng.y + 4), 14);
        eng.cameraTargetLook.set(eng.x + 6, eng.y + 4, 0);

        // Launch airborne at ramp lip!
        if (rampT >= 0.98) {
          current.state = 'air';
          eng.x = 18.2;
          eng.y = 32.2;
          eng.vx = Math.max(18, (eng.rampSpeed / 2.237) * 0.85);
          eng.vy = eng.vx * 0.98;
          eng.vz = 0;
          eng.angle = 1.35;
          eng.omega = 0.8;
          eng.airStartTime = performance.now();
          eng.maxAlt = eng.y;
        }
      }

      // 4. AIRBORNE STUNT STATE (Full 3D flight & thruster physics)
      else if (current.state === 'air') {
        const GRAVITY = 28.0;

        // Steering torque
        eng.omega += eng.steerInput * 4.2 * dt;
        eng.omega *= Math.pow(0.982, dt * 60);
        eng.angle += eng.omega * dt;

        // Thruster physics
        let currentG = 1.0;
        if (eng.thrustInput && eng.thrusterGas > 0) {
          const thrustForce = 34.0;
          const thrustX = Math.sin(eng.angle) * thrustForce;
          const thrustY = Math.cos(eng.angle) * thrustForce;

          eng.vx += thrustX * dt;
          eng.vy += thrustY * dt;

          eng.thrusterGas = Math.max(0, eng.thrusterGas - 0.22 * dt);
          spawnThrusterPlumes();

          currentG = Math.hypot(thrustX, thrustY) / 9.8 + 1.0;
        } else {
          currentG = Math.hypot(eng.vx * 0.08, eng.vy * 0.08) + 1.0;
        }

        eng.peakG = Math.max(eng.peakG, currentG);

        // Gravity
        eng.vy -= GRAVITY * dt;

        // Coordinates
        eng.x += eng.vx * dt;
        eng.y += eng.vy * dt;

        eng.maxAlt = Math.max(eng.maxAlt, eng.y);

        const totalVel = Math.hypot(eng.vx, eng.vy);
        current.speedMph = Math.round(totalVel * 2.237);

        // Detect full 360 flips
        const pitchCos = Math.cos(eng.angle);
        if (pitchCos < -0.65 && eng.prevPitchCos >= -0.65) {
          eng.flipsCount++;
          soundManager.playFlip();

          eng.flipNotice = {
            visible: true,
            count: eng.flipsCount,
          };
          eng.flipNoticeTimer = 1.5;
        }
        eng.prevPitchCos = pitchCos;

        if (eng.carGroup) {
          eng.carGroup.position.set(eng.x, eng.y, eng.z);
          eng.carGroup.rotation.z = -eng.angle;
        }

        // Ring collection detection
        eng.rings.forEach((r) => {
          if (!r.data.collected) {
            const dist = Math.hypot(eng.x - r.mesh.position.x, eng.y - r.mesh.position.y);
            if (dist < 3.4) {
              r.data.collected = true;
              r.mesh.visible = false;
              eng.ringsCollected++;
              eng.thrusterGas = Math.min(1.0, eng.thrusterGas + 0.35);
              soundManager.playRing();
            }
          }
        });

        // Cinematic side tracking camera (matching video at 00:13-00:16)
        eng.cameraTargetPos.set(eng.x - 16, Math.max(8, eng.y + 4), 30);
        eng.cameraTargetLook.set(eng.x + 3, eng.y + 2, 0);

        // Touchdown / Ground Impact Check (ground level y <= 0.65)
        if (eng.y <= 0.65 && eng.vy < 0) {
          soundManager.stopThruster();
          eng.y = 0.65;
          eng.airEndTime = performance.now();
          const finalAirtimeSec = Number(((eng.airEndTime - eng.airStartTime) / 1000).toFixed(1));
          eng.touchdownSpeed = Math.abs(eng.vy);

          const normalizedAngle = ((eng.angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
          const tiltFromUpright = Math.min(normalizedAngle, Math.PI * 2 - normalizedAngle);
          const maxAllowedTilt = 28 * (Math.PI / 180);

          if (eng.touchdownSpeed <= 39 && tiltFromUpright <= maxAllowedTilt) {
            // SUCCESSFUL TOUCHDOWN!
            eng.landingClean = true;
            current.state = 'landed';
            soundManager.playTouchdown(true);

            if (eng.carGroup) {
              eng.carGroup.position.y = 0.65;
              eng.carGroup.rotation.z = 0;
            }

            const breakdown = calculateBreakdown(
              true,
              eng.ringsCollected,
              eng.flipsCount,
              eng.maxAlt,
              finalAirtimeSec,
              eng.touchdownSpeed
            );

            eng.frozenMetrics = {
              reactionMs: eng.reactionMs,
              rampSpeedMph: eng.rampSpeed,
              peakG: Number(eng.peakG.toFixed(1)),
              maxAltitudeFt: Math.round(eng.maxAlt),
              airtimeSec: finalAirtimeSec,
              flips: eng.flipsCount,
              ringsCollected: eng.ringsCollected,
              totalRings: 3,
              touchdownSpeedFtS: Math.round(eng.touchdownSpeed),
              tiltAngleDeg: Math.round((tiltFromUpright * 180) / Math.PI),
              landedClean: true,
              score: breakdown.total,
              crashReason: '',
              breakdown,
            };

            setTimeout(() => {
              const best = safeBest();
              if (breakdown.total > best) saveBest(breakdown.total);
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

            const breakdown = calculateBreakdown(
              false,
              eng.ringsCollected,
              eng.flipsCount,
              eng.maxAlt,
              finalAirtimeSec,
              eng.touchdownSpeed
            );

            eng.frozenMetrics = {
              reactionMs: eng.reactionMs,
              rampSpeedMph: eng.rampSpeed,
              peakG: Number(eng.peakG.toFixed(1)),
              maxAltitudeFt: Math.round(eng.maxAlt),
              airtimeSec: finalAirtimeSec,
              flips: eng.flipsCount,
              ringsCollected: eng.ringsCollected,
              totalRings: 3,
              touchdownSpeedFtS: Math.round(eng.touchdownSpeed),
              tiltAngleDeg: Math.round((tiltFromUpright * 180) / Math.PI),
              landedClean: false,
              score: breakdown.total,
              crashReason: getCrashExplanation(eng.touchdownSpeed, eng.angle, eng.ringsCollected),
              breakdown,
            };

            setTimeout(() => {
              const best = safeBest();
              if (breakdown.total > best) saveBest(breakdown.total);
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
        eng.cameraTargetPos.set(-32 + Math.sin(time) * 3, 3.8 + Math.cos(time * 0.8) * 0.5, 12);
        eng.cameraTargetLook.set(-18, 3.2, 0);
      }

      updateStatus();
    };

    // Render frame and camera interpolation
    const renderFrame = (dt: number) => {
      const eng = engineRef.current;
      if (!eng.renderer || !eng.scene || !eng.camera) return;

      const smoothFactor = Math.min(1.0, dt * 4.8);
      eng.camera.position.lerp(eng.cameraTargetPos, smoothFactor);

      const currentLook = new THREE.Vector3();
      eng.camera.getWorldDirection(currentLook);
      const targetLook = eng.cameraTargetLook.clone().sub(eng.camera.position).normalize();
      currentLook.lerp(targetLook, smoothFactor);
      eng.camera.lookAt(eng.camera.position.clone().add(currentLook.multiplyScalar(20)));

      if (eng.screenShake > 0) {
        eng.camera.position.x += (Math.random() - 0.5) * eng.screenShake * 1.5;
        eng.camera.position.y += (Math.random() - 0.5) * eng.screenShake * 1.5;
        eng.screenShake = Math.max(0, eng.screenShake - dt * 2.2);
      }

      if (eng.stars) {
        eng.stars.rotation.y += dt * 0.004;
      }

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
        color: 0xff4438,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
      });

      const plume = new THREE.Mesh(plumeGeo, plumeMat);
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

      const colors = [0xff2a2a, 0xff7b22, 0xd0dbe8, 0x222a36];
      const count = graphicsQuality === 'high' ? 45 : 24;
      for (let i = 0; i < count; i++) {
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

    // Build Procedural Sports Car (Generic sleek Roadster)
    const buildSportsCar = (scene: THREE.Scene, eng: typeof engineRef.current) => {
      const carGroup = new THREE.Group();
      const carBody = new THREE.Group();
      carGroup.add(carBody);
      scene.add(carGroup);

      const bodyMat = new THREE.MeshStandardMaterial({
        color: 0xdce5ef,
        metalness: 0.94,
        roughness: 0.18,
      });

      const glassMat = new THREE.MeshStandardMaterial({
        color: 0x050b12,
        metalness: 0.9,
        roughness: 0.05,
        transparent: true,
        opacity: 0.9,
      });

      const carbonMat = new THREE.MeshStandardMaterial({
        color: 0x11161f,
        metalness: 0.6,
        roughness: 0.4,
      });

      const tireMat = new THREE.MeshStandardMaterial({
        color: 0x07090d,
        roughness: 0.9,
      });

      const rimMat = new THREE.MeshStandardMaterial({
        color: 0xa9b7c6,
        metalness: 0.95,
        roughness: 0.15,
      });

      const tailLightMat = new THREE.MeshStandardMaterial({
        color: 0xff2a2a,
        emissive: 0xff1e1e,
        emissiveIntensity: 3.0,
      });

      const headLightMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0xebf2ff,
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
      eng.carBodyMesh = bodyMesh;

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

      // Continuous thin red neon light bar across rear
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

        const tireGeo = new THREE.CylinderGeometry(0.44, 0.44, 0.28, 28);
        tireGeo.rotateX(Math.PI / 2);
        const tireMesh = new THREE.Mesh(tireGeo, tireMat);
        tireMesh.castShadow = true;
        wheelGroup.add(tireMesh);

        const rimGeo = new THREE.CylinderGeometry(0.26, 0.26, 0.3, 24);
        rimGeo.rotateX(Math.PI / 2);
        const rimMesh = new THREE.Mesh(rimGeo, rimMat);
        wheelGroup.add(rimMesh);

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
      eng.wheels = wheels;
      carGroup.position.set(eng.x, eng.y, eng.z);
    };

    // Build Road, Neon Edges, Wall Ramp, Landing Runway, and Track Scenery
    const buildEnvironment = (scene: THREE.Scene, eng: typeof engineRef.current) => {
      // 1. Star Field
      const starGeo = new THREE.BufferGeometry();
      const starPos = [];
      for (let i = 0; i < 900; i++) {
        starPos.push(
          (Math.random() - 0.5) * 400,
          Math.random() * 160 + 5,
          -Math.random() * 280 - 10
        );
      }
      starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
      const starMat = new THREE.PointsMaterial({
        color: 0xc4d8ee,
        size: 0.24,
        transparent: true,
        opacity: 0.85,
      });
      const stars = new THREE.Points(starGeo, starMat);
      scene.add(stars);
      eng.stars = stars;

      // 2. Infinite Ground Floor
      const groundFloor = new THREE.Mesh(
        new THREE.PlaneGeometry(700, 450),
        new THREE.MeshStandardMaterial({
          color: 0x060910,
          roughness: 0.95,
          metalness: 0.1,
        })
      );
      groundFloor.rotation.x = -Math.PI / 2;
      groundFloor.position.set(20, 0, -40);
      groundFloor.receiveShadow = true;
      scene.add(groundFloor);

      // Materials
      const roadMat = new THREE.MeshStandardMaterial({
        color: 0x222a36, // visible light grey-blue asphalt
        roughness: 0.68,
        metalness: 0.15,
      });

      const neonEdgeMat = new THREE.MeshStandardMaterial({
        color: 0xff2a2a,
        emissive: 0xff1e1e,
        emissiveIntensity: 2.8,
      });

      const whiteMarkMat = new THREE.MeshStandardMaterial({
        color: 0xecf3ff,
        emissive: 0x243042,
      });

      const roadWidth = 14;

      // 3. Approach Straight Road (from x = -80 to x = -4)
      const approachLength = 76;
      const approachRoad = new THREE.Mesh(
        new THREE.BoxGeometry(approachLength, 0.25, roadWidth),
        roadMat
      );
      approachRoad.position.set(-42, 0.12, 0);
      approachRoad.receiveShadow = true;
      scene.add(approachRoad);

      // Left & Right Neon Red Rails on Approach Track
      for (const z of [-roadWidth / 2 + 0.15, roadWidth / 2 - 0.15]) {
        const edgeLine = new THREE.Mesh(
          new THREE.BoxGeometry(approachLength, 0.08, 0.25),
          neonEdgeMat
        );
        edgeLine.position.set(-42, 0.26, z);
        scene.add(edgeLine);
      }

      // Center dashed road markings on approach
      for (let x = -78; x < -4; x += 6) {
        const dash = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.02, 0.22), whiteMarkMat);
        dash.position.set(x, 0.26, 0);
        scene.add(dash);
      }

      // Start line stripe right in front of the car
      const startLine = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.02, roadWidth - 1), whiteMarkMat);
      startLine.position.set(-27, 0.26, 0);
      scene.add(startLine);

      // 4. Giant Curved Wall Ramp (from x = -4 to x = 18, reaching y = 32)
      const rampCurvePts: THREE.Vector3[] = [];
      const steps = 70;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const rx = -4 + 22 * t;
        const ry = 0.25 + 31.5 * (1 - Math.cos((t * Math.PI) / 2));
        rampCurvePts.push(new THREE.Vector3(rx, ry, 0));
      }

      const rampPath = new THREE.CatmullRomCurve3(rampCurvePts);
      const rampGeo = new THREE.TubeGeometry(rampPath, 70, roadWidth / 2, 4, false);
      rampGeo.scale(1, 0.05, 1);
      const rampMesh = new THREE.Mesh(rampGeo, roadMat);
      rampMesh.receiveShadow = true;
      scene.add(rampMesh);

      // Neon Red Glowing Edges along entire ramp curve
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

      // 5. Landing Runway Track (from x = 20 to x = 180 on the ground floor)
      const landingLength = 160;
      const landingRoad = new THREE.Mesh(
        new THREE.BoxGeometry(landingLength, 0.25, roadWidth),
        roadMat
      );
      landingRoad.position.set(100, 0.12, 0);
      landingRoad.receiveShadow = true;
      scene.add(landingRoad);

      for (const z of [-roadWidth / 2 + 0.15, roadWidth / 2 - 0.15]) {
        const edgeLine = new THREE.Mesh(
          new THREE.BoxGeometry(landingLength, 0.08, 0.25),
          neonEdgeMat
        );
        edgeLine.position.set(100, 0.26, z);
        scene.add(edgeLine);
      }

      for (let x = 24; x < 178; x += 6) {
        const dash = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.02, 0.22), whiteMarkMat);
        dash.position.set(x, 0.26, 0);
        scene.add(dash);
      }

      // 6. Left Stadium / Streetlight Poles with Light Cones
      for (let i = 0; i < 11; i++) {
        const xPos = -55 + i * 18;
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
            emissiveIntensity: 2.2,
          })
        );
        lamp.position.set(xPos, 12, poleZ + 0.8);
        scene.add(lamp);

        // Soft spotlight
        const spot = new THREE.SpotLight(0xdbe9f8, 3.2, 42, Math.PI / 4, 0.5, 1);
        spot.position.set(xPos, 12, poleZ + 0.8);
        spot.target.position.set(xPos, 0, 0);
        scene.add(spot);
        scene.add(spot.target);
      }

      // 7. Stadium Grandstands with Spectator Camera Lights
      const bleacherCount = 550;
      const bleacherGeo = new THREE.BufferGeometry();
      const bleacherPos = [];
      for (let i = 0; i < bleacherCount; i++) {
        const bx = -60 + Math.random() * 180;
        const bz = -roadWidth / 2 - 8 - Math.random() * 38;
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

      // 8. Architectural Cross Trusses in the Upper Sky
      const trussMat = new THREE.MeshStandardMaterial({
        color: 0x162232,
        roughness: 0.7,
      });
      for (let i = 0; i < 4; i++) {
        const arch = new THREE.Mesh(new THREE.BoxGeometry(0.4, 48, 0.4), trussMat);
        arch.position.set(24 + i * 24, 28, -20);
        arch.rotation.z = Math.PI / 4;
        scene.add(arch);

        const arch2 = arch.clone();
        arch2.rotation.z = -Math.PI / 4;
        scene.add(arch2);
      }
    };

    // Build Glowing Sky Rings (Luminous Pink-Red Toruses)
    const buildSkyRings = (scene: THREE.Scene, eng: typeof engineRef.current) => {
      eng.rings = [];
      const ringMat = new THREE.MeshStandardMaterial({
        color: 0xff3880, // Luminous pink/red
        emissive: 0xee2068,
        emissiveIntensity: 2.8,
        roughness: 0.2,
        metalness: 0.8,
      });

      const ringPositions = [
        { x: 28, y: 42, z: 0 },
        { x: 52, y: 52, z: 0 },
        { x: 76, y: 38, z: 0 },
      ];

      ringPositions.forEach((pos, idx) => {
        const ringGeo = new THREE.TorusGeometry(2.4, 0.18, 12, 36);
        const ringMesh = new THREE.Mesh(ringGeo, ringMat);
        ringMesh.position.set(pos.x, pos.y, pos.z);
        ringMesh.rotation.y = Math.PI / 2;
        scene.add(ringMesh);

        eng.rings.push({
          mesh: ringMesh,
          data: {
            id: idx,
            x: pos.x,
            y: pos.y,
            z: pos.z,
            radius: 2.4,
            collected: false,
          },
        });
      });
    };

    return (
      <div
        ref={containerRef}
        className="w-full h-full relative cursor-crosshair overflow-hidden select-none"
        onPointerDown={() => {
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
