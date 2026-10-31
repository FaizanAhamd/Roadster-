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
      crashParticles: { mesh: THREE.Mesh; vx: number; vy: number; vz: number; life: number; maxLife: number }[];
      smokePuffs: { mesh: THREE.Mesh; vx: number; vy: number; vz: number; life: number; maxLife: number; baseScale: number }[];
      sparks: { mesh: THREE.Mesh; vx: number; vy: number; vz: number; life: number; maxLife: number }[];
      stars: THREE.Points | null;
      searchlights: THREE.Mesh[];
      animFrameId: number;
      lastTime: number;
      steerInput: number; // -1 to 1
      thrustInput: boolean;
      accumulator: number;
      // Countdown state
      countdownStartTime: number;
      countdownGreenTime: number;
      countdownLastBeepStage: number;
      // Stunt physics in real units (1 unit = 1 ft, g = 32.2 ft/s²)
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
      thrusterGas: number; // 0 to 1 (4s burn total)
      maxAlt: number;
      currentG: number;
      peakG: number;
      airStartTime: number;
      airEndTime: number;
      launchTime: number;
      rampStartTime: number;
      reactionMs: number;
      rampSpeed: number;
      touchdownSpeed: number;
      landingClean: boolean;
      runEnded: boolean;
      frozenMetrics: RunMetrics | null;
      score: number;
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
      crashParticles: [],
      smokePuffs: [],
      sparks: [],
      stars: null,
      searchlights: [],
      animFrameId: 0,
      lastTime: performance.now(),
      steerInput: 0,
      thrustInput: false,
      accumulator: 0,
      countdownStartTime: 0,
      countdownGreenTime: 0,
      countdownLastBeepStage: 0,
      x: -260,
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
      currentG: 1.0,
      peakG: 1.0,
      airStartTime: 0,
      airEndTime: 0,
      launchTime: 0,
      rampStartTime: 0,
      reactionMs: 0,
      rampSpeed: 80,
      touchdownSpeed: 0,
      landingClean: false,
      runEnded: false,
      frozenMetrics: null,
      score: 0,
      ringsCollected: 0,
      screenShake: 0,
      cameraTargetPos: new THREE.Vector3(-282, 5.5, 0),
      cameraTargetLook: new THREE.Vector3(-235, 4.5, 0),
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
        // silver frost
        mat.color.setHex(0xdce5f2);
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
            // Early tap: restart countdown, show warning toast, play buzzer
            soundManager.playEarlyBuzzer();
            current.tooEarly = true;
            current.isGreen = false;
            current.countdownLightStage = 1;
            eng.countdownStartTime = now;
            eng.countdownGreenTime = now + 3200;
            eng.countdownLastBeepStage = 1;
            updateStatus();
            setTimeout(() => {
              current.tooEarly = false;
              updateStatus();
            }, 800);
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

      // Reaction time measured strictly against greenAt timestamp
      eng.reactionMs = Math.min(2000, Math.max(0, Math.round(now - eng.countdownGreenTime)));
      const reactionSec = eng.reactionMs / 1000;

      // Reaction-based ramp speed: 0.2s = 80 mph, 2.0s = 62 mph
      const rClamped = Math.max(0.2, Math.min(2.0, reactionSec));
      eng.rampSpeed = Math.round(80 - ((rClamped - 0.2) / 1.8) * 18);
      eng.launchTime = now;

      // 1-second launch reaction banner
      eng.launchNotice = {
        visible: true,
        reactionSec: Number(reactionSec.toFixed(3)),
      };
      eng.launchNoticeTimer = 1.0;

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
      statusRef.current.tooEarly = false;
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

      eng.x = -260;
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
      eng.currentG = 1.0;
      eng.peakG = 1.0;
      eng.score = 0;
      eng.ringsCollected = 0;
      eng.thrustInput = false;
      eng.steerInput = 0;
      eng.landingClean = false;
      eng.runEnded = false;
      eng.touchdownSpeed = 0;
      eng.airStartTime = 0;
      eng.airEndTime = 0;
      eng.frozenMetrics = null;
      eng.launchNotice = null;
      eng.launchNoticeTimer = 0;
      eng.flipNotice = null;
      eng.flipNoticeTimer = 0;
      eng.screenShake = 0;

      // Snap camera directly behind car immediately (no swinging on reset)
      eng.cameraTargetPos.set(eng.x - 22, 5.5, 0);
      eng.cameraTargetLook.set(eng.x + 25, 4.5, 0);
      if (eng.camera) {
        eng.camera.position.copy(eng.cameraTargetPos);
        eng.camera.lookAt(eng.cameraTargetLook);
      }

      if (eng.carGroup) {
        eng.carGroup.position.set(eng.x, eng.y, eng.z);
        eng.carGroup.rotation.set(0, 0, 0);
        eng.carGroup.visible = true;
      }

      // Reset rings along realistic stunt arc
      const ringCoords = [
        { x: 75, y: 115, z: 0 },
        { x: 150, y: 152, z: 0 },
        { x: 235, y: 115, z: 0 },
      ];

      eng.rings.forEach((r, idx) => {
        r.data.collected = false;
        r.mesh.visible = true;
        r.mesh.position.set(ringCoords[idx].x, ringCoords[idx].y, ringCoords[idx].z);
        r.mesh.rotation.y = Math.PI / 2;
      });

      // Clear particles, smoke puffs & sparks
      if (eng.scene) {
        eng.crashParticles.forEach((p) => {
          eng.scene?.remove(p.mesh);
          p.mesh.geometry.dispose();
        });
        eng.crashParticles = [];

        eng.smokePuffs.forEach((p) => {
          eng.scene?.remove(p.mesh);
          p.mesh.geometry.dispose();
        });
        eng.smokePuffs = [];

        eng.sparks.forEach((p) => {
          eng.scene?.remove(p.mesh);
          p.mesh.geometry.dispose();
        });
        eng.sparks = [];
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
      // Stunts and bonuses score ONLY on clean landing!
      const flipsScore = clean ? flips * 1500 : 0;
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

      // If we have frozen final metrics from touchdown, lock all values
      if (eng.frozenMetrics) {
        const isNewBest = eng.frozenMetrics.score > best;
        onStatusUpdate({
          ...current,
          score: eng.frozenMetrics.score,
          bestScore: Math.max(best, eng.frozenMetrics.score),
          isNewBest,
          thrusterGas: eng.thrusterGas,
          gForce: eng.currentG,
          altitudeFt: 0,
          sinkSpeedFtS: 0,
          speedMph: eng.landingClean ? Math.max(0, Math.round(Math.abs(eng.vx) / 1.46667)) : 0,
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

      // Live provisional score in air (includes rings + provisional stunt estimate)
      const liveScore =
        current.state === 'air'
          ? eng.ringsCollected * 500 + eng.flipsCount * 1500 + Math.round(eng.maxAlt) + Math.round(airtimeSec * 100)
          : eng.ringsCollected * 500;

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
        score: liveScore,
        bestScore: Math.max(best, breakdown.total),
        isNewBest: breakdown.total > best,
        thrusterGas: eng.thrusterGas,
        gForce: Number(eng.currentG.toFixed(1)),
        altitudeFt: Math.max(0, Math.round(eng.y)),
        sinkSpeedFtS,
        speedMph: Math.round(Math.abs(eng.vx) / 1.46667), // Horizontal speed only in mph!
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
      const isUpright = deg <= 25 || deg >= 335;

      if (!isUpright) {
        return `Roof hit first. Keep rotating until the wheels point at the ground. Flips, altitude and airtime only score when you land it. Rings: ${rings}.`;
      }
      if (sinkSpeed > 39) {
        return `Wheels down at ${Math.round(sinkSpeed)} ft/s, over the 39 ft/s limit. Burn the thrusters earlier to slow the drop. Flips, altitude and airtime only score when you land it. Rings: ${rings}.`;
      }
      return `Roof hit first. Keep rotating until the wheels point at the ground. Flips, altitude and airtime only score when you land it. Rings: ${rings}.`;
    };

    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;

      const width = container.clientWidth || window.innerWidth;
      const height = container.clientHeight || window.innerHeight;

      // 1. Scene Setup
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x050811);
      scene.fog = new THREE.FogExp2(0x050811, 0.0035);

      // 2. Camera Setup
      const camera = new THREE.PerspectiveCamera(48, width / height, 0.5, 2000);
      camera.position.set(-282, 5.5, 0);
      camera.lookAt(-235, 4.5, 0);

      // 3. WebGL Renderer
      const renderer = new THREE.WebGLRenderer({
        antialias: true,
        powerPreference: 'high-performance',
      });
      renderer.setSize(width, height);
      renderer.setPixelRatio(graphicsQuality === 'high' ? Math.min(window.devicePixelRatio, 2) : 1);
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.4;
      renderer.shadowMap.enabled = graphicsQuality === 'high';
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      container.appendChild(renderer.domElement);

      engineRef.current.renderer = renderer;
      engineRef.current.scene = scene;
      engineRef.current.camera = camera;

      // 4. Lighting Rig (Much BRIGHTER midnight stadium lighting)
      const hemiLight = new THREE.HemisphereLight(0xa5c4e8, 0x101726, 1.8);
      scene.add(hemiLight);

      const mainLight = new THREE.DirectionalLight(0xf2f7ff, 2.6);
      mainLight.position.set(-50, 90, 60);
      mainLight.castShadow = graphicsQuality === 'high';
      mainLight.shadow.mapSize.width = 1024;
      mainLight.shadow.mapSize.height = 1024;
      mainLight.shadow.camera.near = 1;
      mainLight.shadow.camera.far = 300;
      mainLight.shadow.camera.left = -120;
      mainLight.shadow.camera.right = 120;
      mainLight.shadow.camera.top = 120;
      mainLight.shadow.camera.bottom = -120;
      scene.add(mainLight);

      // RED accent point lights
      const neonRed1 = new THREE.PointLight(0xff2a55, 3.5, 140);
      neonRed1.position.set(-40, 24, 0);
      scene.add(neonRed1);

      const neonRed2 = new THREE.PointLight(0xff2a55, 3.0, 140);
      neonRed2.position.set(100, 35, 0);
      scene.add(neonRed2);

      // 5. Build Environment (runway, ramp, support tower, landing road, grandstands, searchlights)
      buildEnvironment(scene, engineRef.current);

      // 6. Build High-Fidelity Sports Car
      buildSportsCar(scene, engineRef.current);
      applyCarColor(carColor);

      // 7. Build Sky Rings along the real 3D stunt parabolic arc
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

      const handleWindowBlur = () => {
        engineRef.current.steerInput = 0;
        engineRef.current.thrustInput = false;
        soundManager.stopThruster();
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
            // Early tap: restart countdown, show warning toast
            soundManager.playEarlyBuzzer();
            current.tooEarly = true;
            current.isGreen = false;
            current.countdownLightStage = 1;
            eng.countdownStartTime = now;
            eng.countdownGreenTime = now + 3200;
            eng.countdownLastBeepStage = 1;
            updateStatus();
            setTimeout(() => {
              current.tooEarly = false;
              updateStatus();
            }, 800);
            return;
          }

          executeLaunch(now);
        }
      };

      window.addEventListener('keydown', handleKeyDown);
      window.addEventListener('keyup', handleKeyUp);
      window.addEventListener('blur', handleWindowBlur);
      window.addEventListener('pointerup', handleWindowBlur);
      window.addEventListener('pointercancel', handleWindowBlur);

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

        renderFrame(dt, now);
      };

      engineRef.current.lastTime = performance.now();
      animId = requestAnimationFrame(loop);
      engineRef.current.animFrameId = animId;

      return () => {
        cancelAnimationFrame(animId);
        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('keyup', handleKeyUp);
        window.removeEventListener('blur', handleWindowBlur);
        window.removeEventListener('pointerup', handleWindowBlur);
        window.removeEventListener('pointercancel', handleWindowBlur);
        window.removeEventListener('resize', handleResize);
        soundManager.stopThruster();
        renderer.dispose();
        if (container.contains(renderer.domElement)) {
          container.removeChild(renderer.domElement);
        }
      };
    }, []);

    // Fixed Physics Simulation Step in real units (1 unit = 1 ft, g = 32.2 ft/s²)
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
          current.countdownLightStage = 4;
        } else {
          // GREEN ACTIVATION at 3.2s
          if (!current.isGreen) {
            current.isGreen = true;
            soundManager.playLightBeep(4);
          }

          // Auto-launch if no tap within 2.0s of green (5.2s elapsed)
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

        eng.currentG = 1.0;

        // Camera immediately level and directly behind car (Screenshot 2)
        eng.cameraTargetPos.set(eng.x - 22, 5.5, 0);
        eng.cameraTargetLook.set(eng.x + 25, 4.5, 0);
      }

      // 2. DRIVE STATE (Accelerating towards the ramp: ~18, 45, 72, 80 mph over 4.2s)
      else if (current.state === 'drive') {
        const driveElapsed = (now - eng.launchTime) / 1000;
        // Smooth ease-in acceleration matching prompt
        const curve = Math.min(1.0, 0.225 * driveElapsed + 0.045 * (driveElapsed * driveElapsed));
        const currentSpeedMph = Math.round(eng.rampSpeed * Math.min(1.0, curve));
        current.speedMph = currentSpeedMph;

        eng.vx = currentSpeedMph * 1.46667; // convert mph to ft/s
        eng.x += eng.vx * dt;

        // Acceleration felt G (forward acceleration + gravity normal)
        const a_fwd = (eng.rampSpeed * 1.46667) / 4.2;
        eng.currentG = Math.hypot(1.0, (currentSpeedMph / Math.max(1, eng.rampSpeed)) * (a_fwd / 32.2));
        eng.peakG = Math.max(eng.peakG, eng.currentG);

        if (eng.carGroup) {
          eng.carGroup.position.x = eng.x;
          eng.carGroup.position.y = 0.55 + Math.sin(now * 0.03) * 0.02;
          eng.carGroup.rotation.set(0, 0, 0);
        }

        // Spin wheels
        eng.wheels.forEach((w) => {
          w.rotation.z -= eng.vx * dt * 0.8;
        });

        // Chase camera tracking car smoothly
        eng.cameraTargetPos.set(eng.x - 24, 6.0, 0);
        eng.cameraTargetLook.set(eng.x + 35, 4.5, 0);

        // Transition to ramp curve at x = -80 ft
        if (eng.x >= -80) {
          current.state = 'ramp';
          eng.rampStartTime = now;
          eng.x = -80;
        }
      }

      // 3. RAMP STATE (Climbing the curved quarter-pipe wall over ~1.5s)
      else if (current.state === 'ramp') {
        const rampElapsed = (now - eng.rampStartTime) / 1000;
        const rampT = Math.min(rampElapsed / 1.5, 1.0);

        // Position along ramp curve from x = -80 to x = 0, y from 0.55 to 35 ft
        eng.x = -80 * (1 - rampT);
        // Quarter pipe curve: y = 0.55 + 34.45 * (1 - Math.cos(rampT * 0.55 * Math.PI))
        eng.y = 0.55 + 34.45 * (1 - Math.cos(rampT * 0.55 * Math.PI));

        // Tangent angle along curve (smooth orientation without teleporting)
        const dy = 34.45 * 0.55 * Math.PI * Math.sin(rampT * 0.55 * Math.PI);
        const dx = 80;
        eng.angle = Math.atan2(dy, dx);

        // Real centripetal G on ramp curve (~3.5 - 5.5 g)
        eng.currentG = 1.0 + Math.sin(rampT * Math.PI) * 4.2;
        eng.peakG = Math.max(eng.peakG, eng.currentG);

        current.speedMph = eng.rampSpeed;

        if (eng.carGroup) {
          eng.carGroup.position.set(eng.x, eng.y, eng.z);
          eng.carGroup.rotation.z = eng.angle;
        }

        eng.wheels.forEach((w) => {
          w.rotation.z -= (eng.rampSpeed * 1.46667) * dt * 0.8;
        });

        // Camera pitches up smoothly as car climbs vertical wall
        eng.cameraTargetPos.set(eng.x - 32, Math.max(8, eng.y + 8), 16);
        eng.cameraTargetLook.set(eng.x + 20, eng.y + 6, 0);

        // Launch airborne at ramp lip (rampT >= 1.0)
        if (rampT >= 1.0) {
          current.state = 'air';
          eng.x = 0;
          eng.y = 35;
          const speedScale = eng.rampSpeed / 80;
          eng.vx = 55 * speedScale; // ~55 ft/s forward
          eng.vy = 88 * speedScale; // ~88 ft/s upward (giving ~5.5s airtime & ~120ft peak altitude)
          eng.vz = 0;
          eng.angle = Math.atan2(88, 55);
          eng.omega = 0.6;
          eng.airStartTime = performance.now();
          eng.maxAlt = eng.y;
          eng.currentG = 0.0;
        }
      }

      // 4. AIRBORNE STUNT STATE (Gravity g = 32.2 ft/s², 2.0g thrusters, flips, rings)
      else if (current.state === 'air') {
        const GRAVITY = 32.2;

        // Left / Right angular acceleration with light damping
        eng.omega += eng.steerInput * 4.8 * dt;
        eng.omega *= Math.pow(0.985, dt * 60);
        eng.angle += eng.omega * dt;

        // Cold-gas thrusters: 2.0 g upward force along car's down-facing axis
        if (eng.thrustInput && eng.thrusterGas > 0) {
          const thrustAcc = 64.4; // 2.0 g in ft/s²
          const thrustX = -Math.sin(eng.angle) * thrustAcc;
          const thrustY = Math.cos(eng.angle) * thrustAcc;

          eng.vx += thrustX * dt;
          eng.vy += thrustY * dt;

          // Gas lasts 4.0s of continuous burn total
          eng.thrusterGas = Math.max(0, eng.thrusterGas - dt / 4.0);

          // White-grey smoke puffs and sparks (no orange cones!)
          spawnThrusterPlumes();

          eng.currentG = 2.0;
        } else {
          // Free fall ballistic trajectory is weightless (0.0 g)
          eng.currentG = 0.0;
        }

        eng.peakG = Math.max(eng.peakG, eng.currentG);

        // Gravity
        eng.vy -= GRAVITY * dt;

        // Position coordinates
        eng.x += eng.vx * dt;
        eng.y += eng.vy * dt;

        eng.maxAlt = Math.max(eng.maxAlt, eng.y);

        // Horizontal speed only in mph (not total speed including falling!)
        current.speedMph = Math.round(Math.abs(eng.vx) / 1.46667);

        // Flip detection: count each time car passes upside down
        const pitchCos = Math.cos(eng.angle);
        if (pitchCos < -0.75 && eng.prevPitchCos >= -0.75) {
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

        // Ring collection: 3 thin glowing pink-red rings
        eng.rings.forEach((r) => {
          if (!r.data.collected) {
            const dist = Math.hypot(eng.x - r.mesh.position.x, eng.y - r.mesh.position.y);
            if (dist < 5.5) {
              r.data.collected = true;
              r.mesh.visible = false;
              eng.ringsCollected++;
              // Each ring refills +1 s of gas (+25%)
              eng.thrusterGas = Math.min(1.0, eng.thrusterGas + 0.25);
              soundManager.playRing();
            }
          }
        });

        // AIR CAMERA: Wide elevated 3/4 side-profile shot keeping car, rings, stadium stands, lamps, and landing road clearly visible
        eng.cameraTargetPos.set(eng.x - 70, Math.max(48, eng.y * 0.65 + 26), 115);
        eng.cameraTargetLook.set(eng.x + 35, eng.y * 0.55 + 8, 0);

        // Touchdown / Ground Impact Check at road level (y <= 0.55 ft)
        if (eng.y <= 0.55 && eng.vy < 0 && !eng.runEnded) {
          eng.runEnded = true;
          soundManager.stopThruster();
          eng.y = 0.55;
          eng.airEndTime = performance.now();
          const finalAirtimeSec = Number(((eng.airEndTime - eng.airStartTime) / 1000).toFixed(1));
          eng.touchdownSpeed = Math.abs(eng.vy);

          // Wheels down within 25 degrees of upright
          const normAngle = ((eng.angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
          const tiltRad = Math.min(normAngle, Math.PI * 2 - normAngle);
          const tiltDeg = Math.round((tiltRad * 180) / Math.PI);

          if (eng.touchdownSpeed <= 39 && tiltDeg <= 25) {
            // SUCCESS: CLEAN LANDING!
            eng.landingClean = true;
            current.state = 'landed';
            soundManager.playTouchdown(true);

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
              tiltAngleDeg: tiltDeg,
              landedClean: true,
              score: breakdown.total,
              crashReason: '',
              breakdown,
            };

            // Car keeps rolling and slows smoothly to a stop on landing road
            setTimeout(() => {
              const best = safeBest();
              if (breakdown.total > best) saveBest(breakdown.total);
              current.state = 'results';
              updateStatus();
            }, 1200);
          } else {
            // FAIL: WIPEOUT / CRASH!
            eng.landingClean = false;
            current.state = 'crashed';
            eng.screenShake = 0.8;
            soundManager.playTouchdown(false);
            spawnCrashExplosion();

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
              tiltAngleDeg: tiltDeg,
              landedClean: false,
              score: breakdown.total, // Rings only on crash!
              crashReason: getCrashExplanation(eng.touchdownSpeed, eng.angle, eng.ringsCollected),
              breakdown,
            };

            setTimeout(() => {
              const best = safeBest();
              if (breakdown.total > best) saveBest(breakdown.total);
              current.state = 'results';
              updateStatus();
            }, 1000);
          }
        }
      }

      // 5. LANDED STATE (Car continues rolling forward on landing road and slows to a stop)
      else if (current.state === 'landed') {
        eng.vx *= Math.pow(0.965, dt * 60);
        eng.x += eng.vx * dt;
        eng.y = 0.55;
        eng.angle = 0;
        eng.currentG = 1.0;

        if (eng.carGroup) {
          eng.carGroup.position.set(eng.x, eng.y, eng.z);
          eng.carGroup.rotation.set(0, 0, 0);
        }

        eng.wheels.forEach((w) => {
          w.rotation.z -= eng.vx * dt * 0.8;
        });

        // Smooth landing observation camera framing the stop
        eng.cameraTargetPos.set(eng.x - 28, 8.0, 22);
        eng.cameraTargetLook.set(eng.x + 20, 3.5, 0);
      }

      // 6. CRASHED STATE (Particles and tumbling car)
      else if (current.state === 'crashed') {
        updateCrashParticles(dt);
        eng.currentG = 1.0;
        eng.cameraTargetPos.set(eng.x - 25, 7.0, 20);
        eng.cameraTargetLook.set(eng.x, 2.0, 0);
      }

      // Title ambient camera orbit
      if (current.state === 'title') {
        const time = now * 0.0003;
        eng.cameraTargetPos.set(-260 + Math.sin(time) * 6, 6.0 + Math.cos(time * 0.8) * 0.8, 18);
        eng.cameraTargetLook.set(-225, 4.5, 0);
      }

      updateStatus();
    };

    // Render frame and camera interpolation
    const renderFrame = (dt: number, now: number) => {
      const eng = engineRef.current;
      if (!eng.renderer || !eng.scene || !eng.camera) return;

      const smoothFactor = Math.min(1.0, dt * 4.6);
      eng.camera.position.lerp(eng.cameraTargetPos, smoothFactor);

      const currentLook = new THREE.Vector3();
      eng.camera.getWorldDirection(currentLook);
      const targetLook = eng.cameraTargetLook.clone().sub(eng.camera.position).normalize();
      currentLook.lerp(targetLook, smoothFactor);
      eng.camera.lookAt(eng.camera.position.clone().add(currentLook.multiplyScalar(30)));

      if (eng.screenShake > 0) {
        eng.camera.position.x += (Math.random() - 0.5) * eng.screenShake * 1.8;
        eng.camera.position.y += (Math.random() - 0.5) * eng.screenShake * 1.8;
        eng.screenShake = Math.max(0, eng.screenShake - dt * 2.4);
      }

      if (eng.stars) {
        eng.stars.rotation.y += dt * 0.003;
      }

      // Subtle searchlight sweeps
      eng.searchlights.forEach((beam, idx) => {
        const offset = idx * 1.5;
        beam.rotation.z = Math.PI / 4 + Math.sin(now * 0.0008 + offset) * 0.12;
      });

      // Update smoke puffs
      eng.smokePuffs = eng.smokePuffs.filter((p) => {
        p.life -= dt;
        p.mesh.position.x += p.vx * dt;
        p.mesh.position.y += p.vy * dt;
        p.mesh.position.z += p.vz * dt;
        const progress = 1 - p.life / p.maxLife;
        const scale = p.baseScale * (1 + progress * 2.5);
        p.mesh.scale.set(scale, scale, scale);
        (p.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.65 * (p.life / p.maxLife));
        if (p.life <= 0) {
          eng.scene?.remove(p.mesh);
          p.mesh.geometry.dispose();
          (p.mesh.material as THREE.Material).dispose();
          return false;
        }
        return true;
      });

      // Update sparks
      eng.sparks = eng.sparks.filter((s) => {
        s.life -= dt;
        s.mesh.position.x += s.vx * dt;
        s.mesh.position.y += s.vy * dt;
        s.mesh.position.z += s.vz * dt;
        (s.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, s.life / s.maxLife);
        if (s.life <= 0) {
          eng.scene?.remove(s.mesh);
          s.mesh.geometry.dispose();
          (s.mesh.material as THREE.Material).dispose();
          return false;
        }
        return true;
      });

      eng.renderer.render(eng.scene, eng.camera);
    };

    // Cold-Gas Thruster Plumes: white-grey smoke puffs and small white sparks (no orange cones!)
    const spawnThrusterPlumes = () => {
      const eng = engineRef.current;
      if (!eng.scene || !eng.carGroup) return;

      const nozzleOffset = new THREE.Vector3(
        -Math.sin(eng.angle) * 1.2,
        -Math.cos(eng.angle) * 1.2,
        0
      );
      const spawnPos = eng.carGroup.position.clone().add(nozzleOffset);

      // 1. White-grey smoke puff
      const puffGeo = new THREE.SphereGeometry(0.35, 6, 6);
      const puffMat = new THREE.MeshBasicMaterial({
        color: 0xe2ebf5,
        transparent: true,
        opacity: 0.65,
        depthWrite: false,
      });
      const puffMesh = new THREE.Mesh(puffGeo, puffMat);
      puffMesh.position.copy(spawnPos);
      eng.scene.add(puffMesh);

      const ejectSpeed = 18 + Math.random() * 12;
      const ejectDir = new THREE.Vector3(-Math.sin(eng.angle), -Math.cos(eng.angle), (Math.random() - 0.5) * 0.4);
      eng.smokePuffs.push({
        mesh: puffMesh,
        vx: ejectDir.x * ejectSpeed + (Math.random() - 0.5) * 4,
        vy: ejectDir.y * ejectSpeed,
        vz: ejectDir.z * ejectSpeed,
        life: 0.38,
        maxLife: 0.38,
        baseScale: 0.45,
      });

      // 2. White bright sparks
      for (let i = 0; i < 3; i++) {
        const sparkGeo = new THREE.BoxGeometry(0.12, 0.12, 0.12);
        const sparkMat = new THREE.MeshBasicMaterial({
          color: 0xffffff,
          transparent: true,
          opacity: 0.95,
        });
        const sparkMesh = new THREE.Mesh(sparkGeo, sparkMat);
        sparkMesh.position.copy(spawnPos);
        eng.scene.add(sparkMesh);

        eng.sparks.push({
          mesh: sparkMesh,
          vx: ejectDir.x * ejectSpeed * 1.2 + (Math.random() - 0.5) * 10,
          vy: ejectDir.y * ejectSpeed * 1.2 + (Math.random() - 0.5) * 8,
          vz: (Math.random() - 0.5) * 6,
          life: 0.22,
          maxLife: 0.22,
        });
      }
    };

    // Crash Explosion Debris
    const spawnCrashExplosion = () => {
      const eng = engineRef.current;
      if (!eng.scene || !eng.carGroup) return;

      const colors = [0xff2a2a, 0xff7b22, 0xd0dbe8, 0x222a36];
      const count = graphicsQuality === 'high' ? 45 : 24;
      for (let i = 0; i < count; i++) {
        const size = 0.25 + Math.random() * 0.45;
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
        const speed = 16 + Math.random() * 32;
        eng.crashParticles.push({
          mesh,
          vx: Math.cos(angle) * speed,
          vy: 12 + Math.random() * 28,
          vz: (Math.random() - 0.5) * speed * 0.8,
          life: 2.2,
          maxLife: 2.2,
        });
      }
    };

    const updateCrashParticles = (dt: number) => {
      const eng = engineRef.current;
      eng.crashParticles = eng.crashParticles.filter((p) => {
        p.life -= dt;
        p.vy -= 32.2 * dt;
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
        color: 0xdce5f2,
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
        emissiveIntensity: 3.2,
      });

      const headLightMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0xebf2ff,
        emissiveIntensity: 2.6,
      });

      // 1. Sleek Aerodynamic Body Hull
      const bodyShape = new THREE.Shape();
      bodyShape.moveTo(-3.2, 0.35);
      bodyShape.bezierCurveTo(-3.1, 0.65, -2.3, 0.86, -1.3, 0.92);
      bodyShape.bezierCurveTo(-0.4, 0.98, 1.0, 0.92, 2.0, 0.78);
      bodyShape.bezierCurveTo(2.7, 0.68, 3.2, 0.52, 3.4, 0.38);
      bodyShape.lineTo(3.2, 0.24);
      bodyShape.lineTo(-3.0, 0.24);
      bodyShape.closePath();

      const bodyGeo = new THREE.ExtrudeGeometry(bodyShape, {
        depth: 2.2,
        bevelEnabled: true,
        bevelSegments: 4,
        steps: 1,
        bevelSize: 0.08,
        bevelThickness: 0.06,
        curveSegments: 20,
      });
      bodyGeo.translate(0, 0, -1.1);
      const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
      bodyMesh.castShadow = true;
      bodyMesh.receiveShadow = true;
      carBody.add(bodyMesh);
      eng.carBodyMesh = bodyMesh;

      // 2. Swept Glass Canopy
      const canopyShape = new THREE.Shape();
      canopyShape.moveTo(-1.8, 0.86);
      canopyShape.bezierCurveTo(-1.4, 1.32, -0.9, 1.62, -0.25, 1.64);
      canopyShape.bezierCurveTo(0.52, 1.66, 1.25, 1.32, 1.7, 0.8);
      canopyShape.lineTo(1.35, 0.8);
      canopyShape.bezierCurveTo(0.95, 1.22, 0.45, 1.42, -0.2, 1.42);
      canopyShape.bezierCurveTo(-0.75, 1.42, -1.2, 1.18, -1.5, 0.86);
      canopyShape.closePath();

      const canopyGeo = new THREE.ExtrudeGeometry(canopyShape, {
        depth: 1.65,
        bevelEnabled: true,
        bevelSegments: 3,
        steps: 1,
        bevelSize: 0.04,
        bevelThickness: 0.04,
        curveSegments: 16,
      });
      canopyGeo.translate(0, 0, -0.825);
      const canopyMesh = new THREE.Mesh(canopyGeo, glassMat);
      canopyMesh.castShadow = true;
      carBody.add(canopyMesh);

      // 3. Carbon Roof Strip
      const roof = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.05, 1.42), carbonMat);
      roof.position.set(-0.25, 1.62, 0);
      carBody.add(roof);

      // 4. Splitters & Diffusers
      const splitter = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.07, 2.3), carbonMat);
      splitter.position.set(3.35, 0.26, 0);
      carBody.add(splitter);

      const diffuser = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 2.0), carbonMat);
      diffuser.position.set(-3.1, 0.26, 0);
      carBody.add(diffuser);

      // 5. LED Headlights & Full-Width Thin Red Tail Light
      const leftHeadlight = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.08, 0.5), headLightMat);
      leftHeadlight.position.set(3.28, 0.52, 0.72);
      const rightHeadlight = leftHeadlight.clone();
      rightHeadlight.position.z = -0.72;
      carBody.add(leftHeadlight);
      carBody.add(rightHeadlight);

      // Continuous thin red neon light bar across rear
      const tailLightBar = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.07, 2.1), tailLightMat);
      tailLightBar.position.set(-3.15, 0.54, 0);
      carBody.add(tailLightBar);

      // 6. Wheels (4 alloy wheels with rubber tires)
      const wheels: THREE.Group[] = [];
      const wheelPositions = [
        { x: -1.95, z: 1.15 },
        { x: -1.95, z: -1.15 },
        { x: 1.95, z: 1.15 },
        { x: 1.95, z: -1.15 },
      ];

      wheelPositions.forEach((pos) => {
        const wheelGroup = new THREE.Group();
        wheelGroup.position.set(pos.x, 0.44, pos.z);
        carBody.add(wheelGroup);
        wheels.push(wheelGroup);

        const tireGeo = new THREE.CylinderGeometry(0.44, 0.44, 0.32, 28);
        tireGeo.rotateX(Math.PI / 2);
        const tireMesh = new THREE.Mesh(tireGeo, tireMat);
        tireMesh.castShadow = true;
        wheelGroup.add(tireMesh);

        const rimGeo = new THREE.CylinderGeometry(0.26, 0.26, 0.34, 24);
        rimGeo.rotateX(Math.PI / 2);
        const rimMesh = new THREE.Mesh(rimGeo, rimMat);
        wheelGroup.add(rimMesh);

        for (let i = 0; i < 5; i++) {
          const spokeGeo = new THREE.BoxGeometry(0.06, 0.36, 0.04);
          const spoke = new THREE.Mesh(spokeGeo, rimMat);
          spoke.position.set(0, 0, Math.sign(pos.z) * 0.16);
          spoke.rotation.z = (i * Math.PI * 2) / 5;
          wheelGroup.add(spoke);
        }
      });

      // 7. Underside Cold-Gas Thruster Nozzles
      for (const xOff of [-1.6, -0.6, 0.6, 1.6]) {
        const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 0.14, 12), carbonMat);
        nozzle.position.set(xOff, 0.2, 0);
        carBody.add(nozzle);
      }

      // Grounding contact shadow plane
      const shadowGeo = new THREE.PlaneGeometry(7.0, 3.4);
      const shadowMat = new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.6,
      });
      const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
      shadowMesh.rotation.x = -Math.PI / 2;
      shadowMesh.position.set(0, 0.02, 0);
      carBody.add(shadowMesh);

      eng.carGroup = carGroup;
      eng.wheels = wheels;
      carGroup.position.set(eng.x, eng.y, eng.z);
    };

    // Build Road, Neon Edges, Wall Ramp, Concrete Support Tower, Landing Runway, and Track Scenery
    const buildEnvironment = (scene: THREE.Scene, eng: typeof engineRef.current) => {
      // 1. Star Field
      const starGeo = new THREE.BufferGeometry();
      const starPos = [];
      for (let i = 0; i < 1100; i++) {
        starPos.push(
          (Math.random() - 0.5) * 800,
          Math.random() * 260 + 10,
          -Math.random() * 400 - 20
        );
      }
      starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
      const starMat = new THREE.PointsMaterial({
        color: 0xd0e2f5,
        size: 0.26,
        transparent: true,
        opacity: 0.9,
      });
      const stars = new THREE.Points(starGeo, starMat);
      scene.add(stars);
      eng.stars = stars;

      // 2. Infinite Ground Floor
      const groundFloor = new THREE.Mesh(
        new THREE.PlaneGeometry(1200, 700),
        new THREE.MeshStandardMaterial({
          color: 0x070b14,
          roughness: 0.92,
          metalness: 0.1,
        })
      );
      groundFloor.rotation.x = -Math.PI / 2;
      groundFloor.position.set(100, 0, -40);
      groundFloor.receiveShadow = true;
      scene.add(groundFloor);

      // Materials
      const roadMat = new THREE.MeshStandardMaterial({
        color: 0x2e3a4e, // Light blue-grey asphalt road clearly lit
        roughness: 0.62,
        metalness: 0.18,
      });

      const neonEdgeMat = new THREE.MeshStandardMaterial({
        color: 0xff2a55, // Glowing RED-PINK neon strips
        emissive: 0xff1a40,
        emissiveIntensity: 3.2,
      });

      const whiteMarkMat = new THREE.MeshStandardMaterial({
        color: 0xf1f6ff,
        emissive: 0x28384e,
      });

      const concreteTowerMat = new THREE.MeshStandardMaterial({
        color: 0x18202d,
        roughness: 0.88,
        metalness: 0.15,
      });

      const roadWidth = 20;

      // 3. Approach Runway (from x = -300 to x = -80)
      const approachLength = 220;
      const approachRoad = new THREE.Mesh(
        new THREE.BoxGeometry(approachLength, 0.25, roadWidth),
        roadMat
      );
      approachRoad.position.set(-190, 0.12, 0);
      approachRoad.receiveShadow = true;
      scene.add(approachRoad);

      // Glowing RED-PINK neon edge rails on approach
      for (const z of [-roadWidth / 2 + 0.2, roadWidth / 2 - 0.2]) {
        const edgeLine = new THREE.Mesh(
          new THREE.BoxGeometry(approachLength, 0.1, 0.3),
          neonEdgeMat
        );
        edgeLine.position.set(-190, 0.26, z);
        scene.add(edgeLine);
      }

      // Dashed white center line on approach
      for (let x = -295; x < -82; x += 8) {
        const dash = new THREE.Mesh(new THREE.BoxGeometry(4.0, 0.02, 0.3), whiteMarkMat);
        dash.position.set(x, 0.26, 0);
        scene.add(dash);
      }

      // White painted start line right in front of car at starting line
      const startLine = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.02, roadWidth - 1), whiteMarkMat);
      startLine.position.set(-250, 0.26, 0);
      scene.add(startLine);

      // 4. Single Curved Wall Ramp (from x = -80 to x = 0, rising to y = 35 ft at launch lip)
      const rampCurvePts: THREE.Vector3[] = [];
      const steps = 70;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const rx = -80 * (1 - t);
        const ry = 0.25 + 34.75 * (1 - Math.cos(t * 0.55 * Math.PI));
        rampCurvePts.push(new THREE.Vector3(rx, ry, 0));
      }

      const rampPath = new THREE.CatmullRomCurve3(rampCurvePts);
      const rampGeo = new THREE.TubeGeometry(rampPath, 70, roadWidth / 2, 4, false);
      rampGeo.scale(1, 0.05, 1);
      const rampMesh = new THREE.Mesh(rampGeo, new THREE.MeshStandardMaterial({
        color: 0x8a9bb2, // Pale grey surface matching prompt
        roughness: 0.55,
        metalness: 0.2,
      }));
      rampMesh.receiveShadow = true;
      scene.add(rampMesh);

      // Glowing RED-PINK edge rails curving up the ramp
      const leftCurvePts = rampCurvePts.map((p) => new THREE.Vector3(p.x, p.y + 0.18, -roadWidth / 2 + 0.2));
      const rightCurvePts = rampCurvePts.map((p) => new THREE.Vector3(p.x, p.y + 0.18, roadWidth / 2 - 0.2));

      const leftEdgeTube = new THREE.Mesh(
        new THREE.TubeGeometry(new THREE.CatmullRomCurve3(leftCurvePts), 60, 0.2, 8, false),
        neonEdgeMat
      );
      const rightEdgeTube = new THREE.Mesh(
        new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rightCurvePts), 60, 0.2, 8, false),
        neonEdgeMat
      );
      scene.add(leftEdgeTube);
      scene.add(rightEdgeTube);

      // White lane marks up the ramp
      for (let i = 5; i < steps - 3; i += 7) {
        const p = rampCurvePts[i];
        const nextP = rampCurvePts[i + 1];
        const dir = nextP.clone().sub(p).normalize();
        const dash = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.05, 0.3), whiteMarkMat);
        dash.position.set(p.x, p.y + 0.15, 0);
        dash.rotation.z = Math.atan2(dir.y, dir.x);
        scene.add(dash);
      }

      // Concrete support tower structure behind ramp lip
      const tower = new THREE.Mesh(new THREE.BoxGeometry(18, 36, roadWidth + 6), concreteTowerMat);
      tower.position.set(9, 17.5, 0);
      tower.castShadow = true;
      tower.receiveShadow = true;
      scene.add(tower);

      // Steel truss bracing under ramp
      for (let i = 0; i < 3; i++) {
        const strut = new THREE.Mesh(new THREE.BoxGeometry(1.5, 30 - i * 8, 1.5), concreteTowerMat);
        strut.position.set(-20 - i * 22, 14 - i * 4, 0);
        scene.add(strut);
      }

      // 5. Large Landing Road beyond ramp (from x = 0 to x = 650 ft)
      const landingLength = 650;
      const landingRoad = new THREE.Mesh(
        new THREE.BoxGeometry(landingLength, 0.25, roadWidth),
        roadMat
      );
      landingRoad.position.set(325, 0.12, 0);
      landingRoad.receiveShadow = true;
      scene.add(landingRoad);

      // Glowing RED-PINK edge rails on landing road
      for (const z of [-roadWidth / 2 + 0.2, roadWidth / 2 - 0.2]) {
        const edgeLine = new THREE.Mesh(
          new THREE.BoxGeometry(landingLength, 0.1, 0.3),
          neonEdgeMat
        );
        edgeLine.position.set(325, 0.26, z);
        scene.add(edgeLine);
      }

      for (let x = 12; x < 640; x += 8) {
        const dash = new THREE.Mesh(new THREE.BoxGeometry(4.0, 0.02, 0.3), whiteMarkMat);
        dash.position.set(x, 0.26, 0);
        scene.add(dash);
      }

      // Visible Landing Zone Target Area (painted stripes & red horizon edge line at x = 240 - 360 ft)
      for (let lzX = 240; lzX <= 360; lzX += 16) {
        const lzStripe = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.03, roadWidth - 2), whiteMarkMat);
        lzStripe.position.set(lzX, 0.27, 0);
        scene.add(lzStripe);
      }

      // Red horizon stop line across end of landing track
      const horizonLine = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.04, roadWidth), neonEdgeMat);
      horizonLine.position.set(645, 0.28, 0);
      scene.add(horizonLine);

      // 6. Streetlight Poles with bright heads and light pools along entire runway & landing road
      for (let i = 0; i < 18; i++) {
        const xPos = -280 + i * 50;
        const poleZ = -roadWidth / 2 - 5;

        const pole = new THREE.Mesh(
          new THREE.CylinderGeometry(0.18, 0.25, 16, 8),
          new THREE.MeshStandardMaterial({ color: 0x4a5a6e, metalness: 0.8, roughness: 0.4 })
        );
        pole.position.set(xPos, 8, poleZ);
        scene.add(pole);

        const lamp = new THREE.Mesh(
          new THREE.BoxGeometry(1.6, 0.45, 0.8),
          new THREE.MeshStandardMaterial({
            color: 0xffffff,
            emissive: 0xebf5ff,
            emissiveIntensity: 2.8,
          })
        );
        lamp.position.set(xPos, 16, poleZ + 1.2);
        scene.add(lamp);

        const spot = new THREE.SpotLight(0xdbe9f8, 3.8, 65, Math.PI / 4, 0.5, 1);
        spot.position.set(xPos, 16, poleZ + 1.2);
        spot.target.position.set(xPos, 0, 0);
        scene.add(spot);
        scene.add(spot.target);
      }

      // 7. Stadium Grandstands with thousands of spectator lights on BOTH sides
      const bleacherCount = 900;
      const bleacherGeo = new THREE.BufferGeometry();
      const bleacherPos = [];
      for (let i = 0; i < bleacherCount; i++) {
        const bx = -280 + Math.random() * 850;
        const side = Math.random() > 0.5 ? 1 : -1;
        const bz = side * (roadWidth / 2 + 10 + Math.random() * 45);
        const by = 2.0 + Math.abs(Math.abs(bz) - (roadWidth / 2 + 10)) * 0.45 + (Math.random() - 0.5) * 0.8;
        bleacherPos.push(bx, by, bz);
      }
      bleacherGeo.setAttribute('position', new THREE.Float32BufferAttribute(bleacherPos, 3));
      const bleacherMat = new THREE.PointsMaterial({
        color: 0x9bc2e8,
        size: 0.22,
        transparent: true,
        opacity: 0.85,
      });
      const bleachers = new THREE.Points(bleacherGeo, bleacherMat);
      scene.add(bleachers);

      // 8. Diagonal Searchlight Beams in the Night Sky
      eng.searchlights = [];
      const beamGeo = new THREE.CylinderGeometry(0.5, 9.0, 160, 16, 1, true);
      const beamMat = new THREE.MeshBasicMaterial({
        color: 0x6ba9e6,
        transparent: true,
        opacity: 0.12,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false,
      });

      for (let i = 0; i < 4; i++) {
        const beam = new THREE.Mesh(beamGeo, beamMat);
        beam.position.set(-60 + i * 110, 80, -70);
        beam.rotation.z = Math.PI / 4;
        scene.add(beam);
        eng.searchlights.push(beam);
      }
    };

    // Exactly 3 Thin Glowing Pink-Red 3D Rings along the Stunt Parabolic Arc
    const buildSkyRings = (scene: THREE.Scene, eng: typeof engineRef.current) => {
      eng.rings = [];
      const ringMat = new THREE.MeshStandardMaterial({
        color: 0xff2a55, // Glowing pink-red
        emissive: 0xff1448,
        emissiveIntensity: 3.5,
        roughness: 0.15,
        metalness: 0.85,
      });

      const ringPositions = [
        { x: 75, y: 115, z: 0 },
        { x: 150, y: 152, z: 0 },
        { x: 235, y: 115, z: 0 },
      ];

      ringPositions.forEach((pos, idx) => {
        // Thin glowing 3D ellipse / torus
        const ringGeo = new THREE.TorusGeometry(4.2, 0.22, 12, 36);
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
            radius: 4.2,
            collected: false,
          },
        });
      });
    };

    return (
      <div
        ref={containerRef}
        className="w-full h-full relative cursor-crosshair overflow-hidden select-none touch-none"
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
        onPointerCancel={() => {
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
