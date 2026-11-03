import React, { useEffect, useRef, useImperativeHandle } from 'react';
import * as THREE from 'three';
import { CameraMode, CarColor, GameStatus, GraphicsQuality, RingData, RunMetrics, ScoreBreakdown, TrajectoryPoint } from '../types';
import { soundManager } from '../audio/soundManager';
import { loadRoadsterModel, LoadedRoadsterModel } from '../graphics/carModelLoader';
import { createCinematicPipeline, CinematicPipeline } from '../graphics/cinematicRenderer';
import { buildUpgradedStage, StageEnvironmentObjects } from '../graphics/stageEnvironment';
import { buildCinematicBackdrop, BackdropObjects } from '../graphics/backdropBuilder';
import { buildStadiumLighting, LightingObjects } from '../graphics/lightingBuilder';
import { createEffectsSystem, ThrusterEffectsSystem } from '../graphics/effectsBuilder';
import { createCameraDirector, CameraDirector } from '../graphics/cameraDirector';

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
  cycleCamera?: () => void;
  setCameraMode?: (mode: CameraMode) => void;
  getSnapshotCanvas?: () => HTMLCanvasElement | null;
}

export const GameCanvas = React.forwardRef<GameCanvasHandle, GameCanvasProps>(
  ({ onStatusUpdate, statusRef, carColor, graphicsQuality, isPaused }, ref) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const isPausedRef = useRef(isPaused);
    isPausedRef.current = isPaused;
    const previousQualityRef = useRef(graphicsQuality);

    // Engine references
    const engineRef = useRef<{
      renderer: THREE.WebGLRenderer | null;
      scene: THREE.Scene | null;
      camera: THREE.PerspectiveCamera | null;
      cameraDirector: CameraDirector | null;
      cinematicPipeline: CinematicPipeline | null;
      stageEnvironment: StageEnvironmentObjects | null;
      backdrop: BackdropObjects | null;
      lighting: LightingObjects | null;
      effectsSystem: ThrusterEffectsSystem | null;
      carGroup: THREE.Group | null;
      carBodyMesh: THREE.Mesh | null;
      proceduralCarBody: THREE.Group | null;
      loadedCarModel: LoadedRoadsterModel | null;
      wheels: THREE.Group[];
      rings: { mesh: THREE.Mesh; data: RingData }[];
      crashParticles: { mesh: THREE.Mesh; vx: number; vy: number; vz: number; life: number; maxLife: number }[];
      smokePuffs: { mesh: THREE.Mesh; vx: number; vy: number; vz: number; life: number; maxLife: number; baseScale: number }[];
      wheelSmokeParticles: { mesh: THREE.Mesh; vx: number; vy: number; vz: number; life: number; maxLife: number; baseScale: number }[];
      sparks: { mesh: THREE.Mesh; vx: number; vy: number; vz: number; life: number; maxLife: number }[];
      carChassisGroup: THREE.Group | null;
      suspensionCompression: number;
      wheelSmokeTimer: number;
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
      airtimeElapsedSec: number;
      crashFlashToken: number;
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
      cameraNoticeTimer: number;
      crashBounceCount: number;
      crashTimer: number;
      rolloutTimer: number;
      trajectoryPoints: TrajectoryPoint[];
      heroSnapshotCanvas: HTMLCanvasElement | null;
      trajectorySampleTimer: number;
      trajectoryElapsedSec: number;
    }>({
      renderer: null,
      scene: null,
      camera: null,
      cameraDirector: null,
      cinematicPipeline: null,
      stageEnvironment: null,
      backdrop: null,
      lighting: null,
      effectsSystem: null,
      carGroup: null,
      carBodyMesh: null,
      proceduralCarBody: null,
      loadedCarModel: null,
      wheels: [],
      rings: [],
      crashParticles: [],
      smokePuffs: [],
      wheelSmokeParticles: [],
      sparks: [],
      carChassisGroup: null,
      suspensionCompression: 0,
      wheelSmokeTimer: 0,
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
      airtimeElapsedSec: 0,
      crashFlashToken: 0,
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
      cameraTargetPos: new THREE.Vector3(-274, 4.2, 4.2),
      cameraTargetLook: new THREE.Vector3(-238, 3.4, -1.8),
      launchNotice: null,
      launchNoticeTimer: 0,
      flipNotice: null,
      flipNoticeTimer: 0,
      cameraNoticeTimer: 0,
      crashBounceCount: 0,
      crashTimer: 0,
      rolloutTimer: 0,
      trajectoryPoints: [],
      heroSnapshotCanvas: null,
      trajectorySampleTimer: 0,
      trajectoryElapsedSec: 0,
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
      if (mesh) {
        const mat = mesh.material as THREE.MeshStandardMaterial;
        if (mat) {
          if (color === 'red') {
            mat.color.setHex(0xd81f2a);
            mat.metalness = 0.88;
            mat.roughness = 0.22;
          } else if (color === 'black') {
            mat.color.setHex(0x181a20);
            mat.metalness = 0.92;
            mat.roughness = 0.16;
          } else {
            // bright silver/white body matching reference
            mat.color.setHex(0xf8fafc);
            mat.metalness = 0.88;
            mat.roughness = 0.12;
          }
        }
      }
      engineRef.current.loadedCarModel?.applyCarColor(color);
    };

    useEffect(() => {
      applyCarColor(carColor);
    }, [carColor]);

    // Update renderer and cinematic pipeline settings when graphicsQuality changes
    useEffect(() => {
      const eng = engineRef.current;
      if (eng.cinematicPipeline) {
        eng.cinematicPipeline.setQuality(graphicsQuality);
      } else if (eng.renderer) {
        if (graphicsQuality === 'high') {
          eng.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.25));
          eng.renderer.shadowMap.enabled = true;
        } else {
          eng.renderer.setPixelRatio(1);
          eng.renderer.shadowMap.enabled = false;
        }
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
            window.setTimeout(() => {
              statusRef.current.tooEarly = false;
              updateStatus();
            }, 800);
            return;
          }

          executeLaunch(now);
          return;
        }

        if (current.state === 'results') {
          refActiveStart();
          return;
        }

        if (current.state === 'crashed' || current.state === 'landed') {
          // Controls disabled during simulation
          return;
        }

        if (current.state === 'air') {
          eng.thrustInput = true;
          soundManager.startThruster();
        }
      },

      setSteer: (dir: number) => {
        if (statusRef.current.state === 'crashed' || statusRef.current.state === 'landed') return;
        engineRef.current.steerInput = dir;
      },

      setThrust: (active: boolean) => {
        if (statusRef.current.state === 'crashed' || statusRef.current.state === 'landed') return;
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

      cycleCamera: () => {
        engineRef.current.cameraDirector?.cycleMode();
      },

      setCameraMode: (mode: CameraMode) => {
        engineRef.current.cameraDirector?.setMode(mode);
      },

      getSnapshotCanvas: () => {
        return engineRef.current.heroSnapshotCanvas;
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
      eng.airtimeElapsedSec = 0;
      eng.crashFlashToken++;
      statusRef.current.crashFlash = false;
      eng.frozenMetrics = null;
      eng.launchNotice = null;
      eng.launchNoticeTimer = 0;
      eng.flipNotice = null;
      eng.flipNoticeTimer = 0;
      eng.screenShake = 0;
      eng.crashBounceCount = 0;
      eng.crashTimer = 0;
      eng.rolloutTimer = 0;
      eng.trajectoryPoints = [];
      eng.heroSnapshotCanvas = null;
      eng.trajectorySampleTimer = 0;
      eng.trajectoryElapsedSec = 0;

      // Snap camera behind car lower-left (car fills ~35% width, Screenshot 2 / Frame 2)
      eng.cameraTargetPos.set(eng.x - 14, 4.2, 4.2);
      eng.cameraTargetLook.set(eng.x + 22, 3.4, -1.8);
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

        eng.wheelSmokeParticles.forEach((p) => {
          eng.scene?.remove(p.mesh);
          p.mesh.geometry.dispose();
          (p.mesh.material as THREE.Material).dispose();
        });
        eng.wheelSmokeParticles = [];
        eng.suspensionCompression = 0;
        eng.wheelSmokeTimer = 0;
        if (eng.carChassisGroup) {
          eng.carChassisGroup.position.y = 0;
        }
        if (eng.loadedCarModel) {
          eng.loadedCarModel.root.position.y = 0;
        }
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

      // If we have frozen final metrics from touchdown, lock final score, while allowing speed/altitude/g-force to simulate until results
      if (eng.frozenMetrics) {
        const isNewBest = eng.frozenMetrics.score > best;
        const nextStatus: GameStatus = {
          ...current,
          score: eng.frozenMetrics.score,
          airtimeSec: eng.frozenMetrics.airtimeSec,
          bestScore: Math.max(best, eng.frozenMetrics.score),
          isNewBest,
          thrusterGas: eng.thrusterGas,
          gForce: Number(eng.currentG.toFixed(1)),
          altitudeFt: current.state === 'results' ? 0 : Math.max(0, Math.round(eng.y)),
          sinkSpeedFtS: 0,
          speedMph: Math.max(0, Math.round(Math.abs(eng.vx) / 1.46667)),
          flips: eng.frozenMetrics.flips,
          ringsCount: eng.frozenMetrics.ringsCollected,
          totalRings: 3,
          launchNotice: eng.launchNotice,
          flipNotice: eng.flipNotice,
          actionButtonText: current.state === 'results' ? 'GO' : 'THRUST',
          metrics: eng.frozenMetrics,
        };
        statusRef.current = nextStatus;
        onStatusUpdate(nextStatus);
        return;
      }

      const sinkSpeedFtS = current.state === 'air' && eng.vy < 0 ? Math.round(Math.abs(eng.vy)) : 0;
      // Measure airtime from fixed physics steps so pausing never adds wall-clock time.
      const airtimeSec = Number(eng.airtimeElapsedSec.toFixed(1));

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
        trajectory: eng.trajectoryPoints.length ? eng.trajectoryPoints.map((point) => ({ ...point })) : undefined,
      };

      const nextStatus: GameStatus = {
        ...current,
        score: liveScore,
        airtimeSec,
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
      };
      statusRef.current = nextStatus;
      onStatusUpdate(nextStatus);
    };

    const getCrashExplanation = (sinkSpeed: number, angle: number, rings: number): string => {
      const deg = ((Math.abs(angle) * 180) / Math.PI) % 360;
      const isUpright = deg <= 25 || deg >= 335;
      const ringsScoreText = (rings * 500).toLocaleString('en-US');

      if (!isUpright) {
        return `Roof hit first. Keep rotating until the wheels point at the ground. Flips, altitude and airtime only score when you land it. Rings: ${ringsScoreText}.`;
      }
      if (sinkSpeed > 39) {
        return `Wheels down at ${Math.round(sinkSpeed)} ft/s, over the 39 ft/s limit. Burn the thrusters earlier to slow the drop. Flips, altitude and airtime only score when you land it. Rings: ${ringsScoreText}.`;
      }
      return `Roof hit first. Keep rotating until the wheels point at the ground. Flips, altitude and airtime only score when you land it. Rings: ${ringsScoreText}.`;
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

      // 2. Camera Setup (Car positioned lower-left filling ~35% width at start)
      const camera = new THREE.PerspectiveCamera(48, width / height, 0.5, 2000);
      camera.position.set(-274, 4.2, 4.2);
      camera.lookAt(-238, 3.4, -1.8);

      // 3. WebGL Renderer
      const renderer = new THREE.WebGLRenderer({
        antialias: graphicsQuality === 'high',
        powerPreference: 'high-performance',
      });
      renderer.setSize(width, height);
      renderer.setPixelRatio(graphicsQuality === 'high' ? Math.min(window.devicePixelRatio || 1, 1.25) : 1);
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.45;
      renderer.shadowMap.enabled = graphicsQuality === 'high';
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      container.appendChild(renderer.domElement);

      engineRef.current.renderer = renderer;
      engineRef.current.scene = scene;
      engineRef.current.camera = camera;

      // 3.5. Build Cinematic Camera Director (Chase, Mounted, Roof, Drone)
      const cameraDirector = createCameraDirector({
        camera,
        initialMode: 'chase',
        onModeChange: (mode, modeName) => {
          statusRef.current.cameraMode = mode;
          statusRef.current.cameraNotice = { visible: true, modeName };
          engineRef.current.cameraNoticeTimer = 1.6;
          updateStatus();
        },
      });
      engineRef.current.cameraDirector = cameraDirector;
      statusRef.current.cameraMode = 'chase';

      // 4. Build Stadium Lighting System (Towers, tripods, volumetric beams, sky searchlights & real 3D lights)
      const lighting = buildStadiumLighting({
        scene,
        quality: graphicsQuality,
      });
      engineRef.current.lighting = lighting;
      engineRef.current.searchlights = lighting.searchlights;

      // 5. Build Cinematic Backdrop (Deep midnight sky dome, stars, distant hills & test-site silhouettes)
      const backdrop = buildCinematicBackdrop({
        scene,
        quality: graphicsQuality,
      });
      engineRef.current.backdrop = backdrop;

      // 6. Build Environment (runway, ramp, support tower, landing road, grandstands)
      buildEnvironment(scene, engineRef.current);

      // 7. Build Cold-Gas Thrusters & Ground Vapor Effects System
      const effectsSystem = createEffectsSystem({
        scene,
        quality: graphicsQuality,
      });
      engineRef.current.effectsSystem = effectsSystem;

      // 8. Build High-Fidelity Sports Car (procedural fallback initially)
      buildSportsCar(scene, engineRef.current);
      applyCarColor(carColor);

      // Asynchronously load the official Roadster GLB model
      loadRoadsterModel('/models/roadster.glb')
        .then((loadedModel) => {
          const eng = engineRef.current;
          if (!eng.scene || !eng.carGroup) {
            loadedModel.dispose();
            return;
          }
          // Hide procedural car body and procedural wheels
          if (eng.proceduralCarBody) {
            eng.proceduralCarBody.visible = false;
          }
          eng.wheels.forEach((w) => {
            w.visible = false;
          });

          // Add GLB model into carGroup
          eng.carGroup.add(loadedModel.root);
          loadedModel.applyCarColor(carColor);
          eng.loadedCarModel = loadedModel;
        })
        .catch((err) => {
          console.warn('[Roadster] GLB model load failed, using procedural car fallback:', err);
        });

      // 7. Build Sky Rings along the real 3D stunt parabolic arc
      buildSkyRings(scene, engineRef.current);

      // 8. Initialize Cinematic Pipeline (HDR EffectComposer, UnrealBloomPass, OutputPass, Planar Wet Reflections)
      const cinematicPipeline = createCinematicPipeline({
        renderer,
        scene,
        camera,
        width,
        height,
        quality: graphicsQuality,
      });
      engineRef.current.cinematicPipeline = cinematicPipeline;

      // 9. Event Listeners for Keyboard Controls
      const handleKeyDown = (e: KeyboardEvent) => {
        // Camera switching shortcuts (C: cycle, 1: chase, 2: mounted, 3: roof/first-person, 4: drone)
        if (e.code === 'KeyC') {
          e.preventDefault();
          engineRef.current.cameraDirector?.cycleMode();
          return;
        }
        if (e.code === 'Digit1') {
          e.preventDefault();
          engineRef.current.cameraDirector?.setMode('chase');
          return;
        }
        if (e.code === 'Digit2') {
          e.preventDefault();
          engineRef.current.cameraDirector?.setMode('mounted');
          return;
        }
        if (e.code === 'Digit3') {
          e.preventDefault();
          engineRef.current.cameraDirector?.setMode('roof');
          return;
        }
        if (e.code === 'Digit4') {
          e.preventDefault();
          engineRef.current.cameraDirector?.setMode('drone');
          return;
        }

        const state = statusRef.current.state;
        if (state === 'crashed' || state === 'landed') {
          // Controls disabled during crash and rollout simulation
          return;
        }

        if (e.code === 'Space') {
          e.preventDefault();
          if (state === 'count' || state === 'title') {
            refActiveLaunch();
          } else if (state === 'air') {
            engineRef.current.thrustInput = true;
            soundManager.startThruster();
          } else if (state === 'results') {
            refActiveStart();
          }
        }
        if (e.code === 'Enter') {
          e.preventDefault();
          if (state === 'results') {
            refActiveStart();
          }
        }
        if (e.code === 'ArrowLeft' || e.code === 'KeyA') {
          e.preventDefault();
          if (state === 'air') engineRef.current.steerInput = -1;
        }
        if (e.code === 'ArrowRight' || e.code === 'KeyD') {
          e.preventDefault();
          if (state === 'air') engineRef.current.steerInput = 1;
        }
        if (e.code === 'ArrowUp' || e.code === 'KeyW') {
          e.preventDefault();
          if (state === 'air') {
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
            window.setTimeout(() => {
              statusRef.current.tooEarly = false;
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
        if (engineRef.current.cinematicPipeline) {
          engineRef.current.cinematicPipeline.setSize(w, h);
        }
      };
      window.addEventListener('resize', handleResize);

      // 9. Main Animation Loop
      const STEP = 1 / 120;
      const TARGET_RENDER_INTERVAL_MS = 1000 / 60;
      let lastRenderTime = 0;
      let animId = 0;

      const loop = (now: number) => {
        animId = requestAnimationFrame(loop);
        if (isPausedRef.current) {
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

        // Keep physics at 120 Hz, but do not render more than 60 frames/sec.
        // This avoids wasting GPU time on 120/144/165 Hz displays.
        const renderElapsedMs = now - lastRenderTime;
        if (renderElapsedMs < TARGET_RENDER_INTERVAL_MS) return;
        const renderDt = Math.min(renderElapsedMs / 1000, 0.05);
        lastRenderTime = now;
        renderFrame(renderDt, now);
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
        const eng = engineRef.current;
        eng.wheelSmokeParticles.forEach((p) => {
          eng.scene?.remove(p.mesh);
          p.mesh.geometry.dispose();
          (p.mesh.material as THREE.Material).dispose();
        });
        eng.wheelSmokeParticles = [];
        eng.smokePuffs.forEach((p) => {
          eng.scene?.remove(p.mesh);
          p.mesh.geometry.dispose();
          (p.mesh.material as THREE.Material).dispose();
        });
        eng.smokePuffs = [];
        eng.sparks.forEach((p) => {
          eng.scene?.remove(p.mesh);
          p.mesh.geometry.dispose();
          (p.mesh.material as THREE.Material).dispose();
        });
        eng.sparks = [];
        eng.crashParticles.forEach((p) => {
          eng.scene?.remove(p.mesh);
          p.mesh.geometry.dispose();
          (p.mesh.material as THREE.Material).dispose();
        });
        eng.crashParticles = [];
        if (eng.loadedCarModel) {
          eng.loadedCarModel.dispose();
          eng.loadedCarModel = null;
        }
        if (eng.cinematicPipeline) {
          eng.cinematicPipeline.dispose();
          eng.cinematicPipeline = null;
        }
        if (eng.stageEnvironment) {
          eng.stageEnvironment.dispose();
          eng.stageEnvironment = null;
        }
        if (eng.backdrop) {
          eng.backdrop.dispose();
          eng.backdrop = null;
        }
        if (eng.lighting) {
          eng.lighting.dispose();
          eng.lighting = null;
        }
        if (eng.effectsSystem) {
          eng.effectsSystem.dispose();
          eng.effectsSystem = null;
        }
        if (eng.cameraDirector) {
          eng.cameraDirector.dispose();
          eng.cameraDirector = null;
        }
        renderer.dispose();
        if (container.contains(renderer.domElement)) {
          container.removeChild(renderer.domElement);
        }
      };
    }, []);

    useEffect(() => {
      const previousQuality = previousQualityRef.current;
      if (previousQuality === graphicsQuality) return;
      previousQualityRef.current = graphicsQuality;

      const eng = engineRef.current;
      eng.effectsSystem?.setQuality(graphicsQuality);
      if (!eng.scene) return;

      // Rebuild quality-sensitive environment systems instead of leaving
      // high-quality-only beams/shaders permanently stuck in their first mode.
      if (eng.stageEnvironment) {
        eng.stageEnvironment.dispose();
        eng.stageEnvironment = null;
      }
      eng.stageEnvironment = buildUpgradedStage({
        scene: eng.scene,
        quality: graphicsQuality,
        roadWidth: 20,
      });

      if (eng.backdrop) {
        eng.backdrop.dispose();
        eng.backdrop = null;
      }
      eng.backdrop = buildCinematicBackdrop({ scene: eng.scene, quality: graphicsQuality });

      if (eng.lighting) {
        eng.lighting.dispose();
        eng.lighting = null;
      }
      eng.lighting = buildStadiumLighting({ scene: eng.scene, quality: graphicsQuality });
      eng.searchlights = eng.lighting.searchlights;
    }, [graphicsQuality]);

    // Helper to get 4 wheel contact coordinates in world space
    const getWheelContactPositions = (eng: typeof engineRef.current) => {
      const rotZ = eng.carGroup ? eng.carGroup.rotation.z : 0;
      const cosZ = Math.cos(rotZ);
      const sinZ = Math.sin(rotZ);
      const localWheels = [
        { lx: 1.95, lz: -1.15 }, // Front Right
        { lx: 1.95, lz: 1.15 },  // Front Left
        { lx: -1.95, lz: -1.15 },// Rear Right
        { lx: -1.95, lz: 1.15 }, // Rear Left
      ];

      return localWheels.map((w) => ({
        x: eng.x + w.lx * cosZ,
        y: Math.max(0.26, eng.y + w.lx * sinZ),
        z: eng.z + w.lz,
      }));
    };

    // Lightweight Wheel Smoke Emitter (max 60 active pooled particles)
    const spawnWheelSmokeBurst = (intensity: number = 1.0) => {
      const eng = engineRef.current;
      const scene = eng.scene;
      if (!scene) return;

      const contacts = getWheelContactPositions(eng);
      const smokeColors = [0xe8edf2, 0xd4dce4, 0xb8c4ce];

      contacts.forEach((pos) => {
        const count = Math.max(1, Math.round(3 * intensity));
        for (let i = 0; i < count; i++) {
          if (eng.wheelSmokeParticles.length >= 60) {
            const oldest = eng.wheelSmokeParticles.shift();
            if (oldest) {
              scene.remove(oldest.mesh);
              oldest.mesh.geometry.dispose();
              (oldest.mesh.material as THREE.Material).dispose();
            }
          }

          const radius = 0.28 + Math.random() * 0.22;
          const geo = new THREE.SphereGeometry(radius, 5, 5);
          const mat = new THREE.MeshBasicMaterial({
            color: smokeColors[Math.floor(Math.random() * smokeColors.length)],
            transparent: true,
            opacity: 0.55 * Math.min(1.0, intensity),
            depthWrite: false,
          });
          const mesh = new THREE.Mesh(geo, mat);
          mesh.position.set(
            pos.x + (Math.random() - 0.5) * 0.4,
            pos.y + 0.08 + Math.random() * 0.12,
            pos.z + (Math.random() - 0.5) * 0.4
          );
          scene.add(mesh);

          eng.wheelSmokeParticles.push({
            mesh,
            vx: -eng.vx * 0.08 + (Math.random() - 0.5) * 4.0,
            vy: 1.5 + Math.random() * 3.0,
            vz: (Math.random() - 0.5) * 3.5,
            life: 0.5 + Math.random() * 0.35,
            maxLife: 0.85,
            baseScale: 0.5,
          });
        }
      });
    };

    // Subtle Continuous Rubber Smoke Trail during high G-turns or tyre scraping/rollout
    const emitContinuousWheelSmoke = (dt: number) => {
      const eng = engineRef.current;
      const scene = eng.scene;
      if (!scene) return;

      eng.wheelSmokeTimer += dt;
      if (eng.wheelSmokeTimer < 0.04) return;
      eng.wheelSmokeTimer = 0;

      const contacts = getWheelContactPositions(eng);
      const wheelsToEmit = contacts.slice(2); // Rear 2 wheels

      wheelsToEmit.forEach((pos) => {
        if (eng.wheelSmokeParticles.length >= 60) {
          const oldest = eng.wheelSmokeParticles.shift();
          if (oldest) {
            scene.remove(oldest.mesh);
            oldest.mesh.geometry.dispose();
            (oldest.mesh.material as THREE.Material).dispose();
          }
        }

        const geo = new THREE.SphereGeometry(0.24 + Math.random() * 0.15, 5, 5);
        const mat = new THREE.MeshBasicMaterial({
          color: 0xd9e2ec,
          transparent: true,
          opacity: 0.35,
          depthWrite: false,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(
          pos.x + (Math.random() - 0.5) * 0.3,
          pos.y + 0.08,
          pos.z + (Math.random() - 0.5) * 0.3
        );
        scene.add(mesh);

        eng.wheelSmokeParticles.push({
          mesh,
          vx: -eng.vx * 0.05 + (Math.random() - 0.5) * 1.5,
          vy: 0.8 + Math.random() * 1.5,
          vz: (Math.random() - 0.5) * 1.5,
          life: 0.35 + Math.random() * 0.2,
          maxLife: 0.55,
          baseScale: 0.4,
        });
      });
    };

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

        // Camera positioned behind car lower-left (car fills ~35% width, Screenshot 2 / Frame 2)
        eng.cameraTargetPos.set(eng.x - 14, 4.2, 4.2);
        eng.cameraTargetLook.set(eng.x + 22, 3.4, -1.8);
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

        if (eng.currentG >= 2.8) {
          emitContinuousWheelSmoke(dt);
        }

        if (eng.carGroup) {
          eng.carGroup.position.x = eng.x;
          eng.carGroup.position.y = 0.55 + Math.sin(now * 0.03) * 0.02;
          eng.carGroup.rotation.set(0, 0, 0);
        }

        // Spin wheels
        eng.wheels.forEach((w) => {
          w.rotation.z -= eng.vx * dt * 0.8;
        });
        eng.loadedCarModel?.spinWheels(eng.vx * dt);

        // Chase camera tracking car smoothly towards ramp
        eng.cameraTargetPos.set(eng.x - 16, 4.6, 3.5);
        eng.cameraTargetLook.set(eng.x + 28, 3.8, -1.2);

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

        if (eng.currentG >= 2.8) {
          emitContinuousWheelSmoke(dt);
        }

        current.speedMph = eng.rampSpeed;

        if (eng.carGroup) {
          eng.carGroup.position.set(eng.x, eng.y, eng.z);
          eng.carGroup.rotation.z = eng.angle;
        }

        const rampStepDist = (eng.rampSpeed * 1.46667) * dt;
        eng.wheels.forEach((w) => {
          w.rotation.z -= rampStepDist * 0.8;
        });
        eng.loadedCarModel?.spinWheels(rampStepDist);

        // Camera locked directly behind car along ramp tangent (no sideways view)
        const camDist = 20;
        const camHeight = 4.2;
        const camX = eng.x - camDist * Math.cos(eng.angle) - camHeight * Math.sin(eng.angle);
        const camY = eng.y - camDist * Math.sin(eng.angle) + camHeight * Math.cos(eng.angle);
        eng.cameraTargetPos.set(camX, camY, 0);
        eng.cameraTargetLook.set(
          eng.x + 22 * Math.cos(eng.angle),
          eng.y + 22 * Math.sin(eng.angle),
          0
        );

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
          eng.airtimeElapsedSec = 0;
          eng.maxAlt = eng.y;
          eng.currentG = 0.0;
        }
      }

      // 4. AIRBORNE STUNT STATE (Gravity g = 32.2 ft/s², 2.0g thrusters, flips, rings)
      else if (current.state === 'air') {
        // This is simulation time, not wall-clock time; pause freezes it.
        eng.airtimeElapsedSec += dt;
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

        // Record actual airborne position and pitch for the exported flight report.
        eng.trajectoryElapsedSec += dt;
        eng.trajectorySampleTimer += dt;
        if (eng.trajectorySampleTimer >= 0.08) {
          eng.trajectorySampleTimer %= 0.08;
          if (eng.trajectoryPoints.length < 240) {
            eng.trajectoryPoints.push({
              x: Number(eng.x.toFixed(3)),
              y: Number(eng.y.toFixed(3)),
              z: Number(eng.z.toFixed(3)),
              angle: Number(eng.angle.toFixed(4)),
              t: Number(eng.trajectoryElapsedSec.toFixed(3)),
            });
          }
        }

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
          eng.flipNoticeTimer = 1.2;
        }
        eng.prevPitchCos = pitchCos;

        if (eng.carGroup) {
          eng.carGroup.position.set(eng.x, eng.y, eng.z);
          eng.carGroup.rotation.z = -eng.angle;
        }

        // Ring collection: 3 large thin glowing pink-red rings
        eng.rings.forEach((r) => {
          if (!r.data.collected) {
            const dist = Math.hypot(eng.x - r.mesh.position.x, eng.y - r.mesh.position.y);
            if (dist < 15.5) {
              r.data.collected = true;
              r.mesh.visible = false;
              eng.ringsCollected++;
              // Each ring refills +1 s of gas (+25%)
              eng.thrusterGas = Math.min(1.0, eng.thrusterGas + 0.25);
              soundManager.playRing();
            }
          }
        });

        // AIR CAMERA: Track the actual vehicle centre. Keep the camera offset
        // relative to the car so altitude cannot carry the car above the frustum.
        // The slightly wider airborne lens is blended by CameraDirector.
        const altitudeLift = THREE.MathUtils.clamp(eng.y * 0.025, 0, 4.5);
        const rearOffset = eng.vy < 0 ? 25 : 23;
        const sideOffset = eng.vy < 0 ? 38 : 36;
        const cameraHeight = 10.5 + altitudeLift;
        eng.cameraTargetPos.set(
          eng.x - rearOffset,
          eng.y + cameraHeight,
          eng.z + sideOffset
        );
        eng.cameraTargetLook.set(eng.x + 3.0, eng.y + 0.55, eng.z);

        // Real Lowest Geometry Ground Contact Check
        // Evaluates all extreme bounding vertices of the car 3D mesh rotated by car pitch
        const cosP = Math.cos(eng.angle);
        const sinP = Math.sin(eng.angle);
        const contactOffsets = [
          // Wheels bottom (radius 0.44 at pos.y = 0.44 -> local y = 0.00)
          { dx: 1.95, dy: 0.0 },
          { dx: -1.95, dy: 0.0 },
          // Front nose and splitter
          { dx: 3.4, dy: 0.22 },
          { dx: 3.2, dy: 0.35 },
          // Rear diffuser and bumper
          { dx: -3.2, dy: 0.22 },
          { dx: -3.0, dy: 0.35 },
          // Roof and canopy
          { dx: -0.25, dy: 1.65 },
          { dx: 0.5, dy: 1.55 },
          { dx: -0.9, dy: 1.55 },
        ];
        let lowestPointY = Infinity;
        for (const pt of contactOffsets) {
          const ptY = eng.y - pt.dx * sinP + pt.dy * cosP;
          if (ptY < lowestPointY) lowestPointY = ptY;
        }

        // Physical touchdown on road tarmac surface (y <= 0.25 ft) while sinking downward (vy < 0)
        if (lowestPointY <= 0.25 && eng.vy < 0 && !eng.runEnded) {
          eng.runEnded = true;
          soundManager.stopThruster();
          eng.airEndTime = performance.now();
          const finalAirtimeSec = Number(eng.airtimeElapsedSec.toFixed(1));
          eng.touchdownSpeed = Math.abs(eng.vy);

          // Wheels down within 25 degrees of upright
          const normAngle = ((eng.angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
          const tiltRad = Math.min(normAngle, Math.PI * 2 - normAngle);
          const tiltDeg = Math.round((tiltRad * 180) / Math.PI);

          if (eng.touchdownSpeed <= 39 && tiltDeg <= 25) {
            // SUCCESS: CLEAN LANDING!
            eng.landingClean = true;
            eng.rolloutTimer = 0;
            eng.suspensionCompression = Math.min(0.24, eng.touchdownSpeed * 0.007);
            eng.currentG = 1.0 + Math.min(2.5, eng.touchdownSpeed * 0.06);
            eng.peakG = Math.max(eng.peakG, eng.currentG);
            current.state = 'landed';
            soundManager.playTouchdown(true);

            // Wheel contact smoke burst and dust
            spawnWheelSmokeBurst(1.4);

            // Ground vapor cloud billowing across tarmac
            eng.effectsSystem?.triggerLanding(new THREE.Vector3(eng.x, 0.25, 0), Math.max(0.6, eng.touchdownSpeed / 39));

            const breakdown = calculateBreakdown(
              true,
              eng.ringsCollected,
              eng.flipsCount,
              eng.maxAlt,
              finalAirtimeSec,
              eng.touchdownSpeed
            );

            // Record and freeze run metrics on touchdown frame
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
              trajectory: eng.trajectoryPoints.map((point) => ({ ...point })),
            };
          } else {
            // HARD CRASH / WIPEOUT!
            eng.landingClean = false;
            current.state = 'crashed';
            eng.crashBounceCount = 0;
            eng.crashTimer = 0;

            // G-FORCE gauge spikes to 50.7 g in red
            // 50.7 g is an impact animation indicator, not measured flight peak G.
            eng.currentG = 50.7;

            // Camera shake for 0.4 s
            eng.screenShake = 1.0;

            // Red impact flash is transient and must never carry into the next run.
            current.crashFlash = true;
            const flashToken = ++eng.crashFlashToken;
            window.setTimeout(() => {
              if (engineRef.current.crashFlashToken !== flashToken) return;
              statusRef.current.crashFlash = false;
              updateStatus();
            }, 180);

            // Loud thud + metal scrape sound, vibration [80, 40, 120]
            soundManager.playTouchdown(false);

            // Wheel contact smoke and dust
            spawnWheelSmokeBurst(1.0);

            // Burst of 80-120 orange-white sparks at impact, fragments, dust & smoke puffs
            spawnCrashExplosion();

            // Ground vapor cloud billowing across tarmac
            eng.effectsSystem?.triggerLanding(new THREE.Vector3(eng.x, 0.25, 0), 1.5);

            // Main bounce 1: 6–10 ft rise (restitution ~0.25). (19.5^2)/64.4 = 5.9 ft, (24.5^2)/64.4 = 9.3 ft
            eng.vy = Math.min(24.5, Math.max(19.5, eng.touchdownSpeed * 0.25));
            eng.omega = Math.random() > 0.5 ? 4.8 : -4.8;

            const breakdown = calculateBreakdown(
              false,
              eng.ringsCollected,
              eng.flipsCount,
              eng.maxAlt,
              finalAirtimeSec,
              eng.touchdownSpeed
            );

            // Live score drops to final score (rings only on crash)
            current.score = breakdown.total;

            // Record and freeze run metrics on touchdown frame
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
              trajectory: eng.trajectoryPoints.map((point) => ({ ...point })),
            };
          }
        }
      }

      // 5. LANDED STATE (Soft thud, dust, car rolls and stops over ~2s, suspension spring-back, panel opens after 2.0s)
      else if (current.state === 'landed') {
        eng.rolloutTimer += dt;
        eng.vx *= Math.pow(0.965, dt * 60);
        eng.x += eng.vx * dt;
        eng.y = 0.55;
        eng.angle = 0;
        eng.currentG = 1.0;
        current.speedMph = Math.max(0, Math.round(Math.abs(eng.vx) / 1.46667));

        // Smooth suspension compression spring-back
        eng.suspensionCompression = THREE.MathUtils.damp(eng.suspensionCompression, 0, 8.5, dt);
        if (eng.carChassisGroup) {
          eng.carChassisGroup.position.y = -eng.suspensionCompression;
        }
        if (eng.loadedCarModel) {
          eng.loadedCarModel.root.position.y = -eng.suspensionCompression;
        }

        if (eng.carGroup) {
          eng.carGroup.position.set(eng.x, eng.y, eng.z);
          eng.carGroup.rotation.set(0, 0, 0);
        }

        eng.wheels.forEach((w) => {
          w.rotation.z -= eng.vx * dt * 0.8;
        });
        eng.loadedCarModel?.spinWheels(eng.vx * dt);

        // Subtle wheel smoke trail during high speed rollout
        if (current.speedMph > 20) {
          emitContinuousWheelSmoke(dt);
        }

        // Smooth landing observation camera framing the stop (panoramic 3/4 angle)
        eng.cameraTargetPos.set(eng.x - 24, 8.5, 38);
        eng.cameraTargetLook.set(eng.x + 16, 3.2, 0);

        // Open result panel after 2.0 s of visible rollout and suspension settling
        if (eng.rolloutTimer >= 2.0) {
          current.state = 'results';
          const best = safeBest();
          if (eng.frozenMetrics && eng.frozenMetrics.score > best) saveBest(eng.frozenMetrics.score);
          updateStatus();
        }
      }

      // 6. CRASHED STATE (about 2.5 s, never shorter than 1.5 s: two-stage bounce, continuous scrape sparks, speed bleed over ~2s)
      else if (current.state === 'crashed') {
        eng.crashTimer += dt;
        eng.vy -= 32.2 * dt;
        eng.y += eng.vy * dt;
        eng.angle += eng.omega * dt;
        eng.omega *= Math.pow(0.88, dt * 60);

        // Horizontal speed bleeds off over ~2 s
        eng.vx *= Math.pow(0.90, dt * 60);
        eng.x += eng.vx * dt;
        current.speedMph = Math.max(0, Math.round(Math.abs(eng.vx) / 1.46667));

        // Re-check contact of lowest mesh bounds with road tarmac
        const cSinP = Math.sin(eng.angle);
        const cCosP = Math.cos(eng.angle);
        const contactOffsets = [
          { dx: 1.95, dy: 0.0 },
          { dx: -1.95, dy: 0.0 },
          { dx: 3.4, dy: 0.22 },
          { dx: 3.2, dy: 0.35 },
          { dx: -3.2, dy: 0.22 },
          { dx: -3.0, dy: 0.35 },
          { dx: -0.25, dy: 1.65 },
          { dx: 0.5, dy: 1.55 },
          { dx: -0.9, dy: 1.55 },
        ];
        let tumbleLowestY = Infinity;
        for (const pt of contactOffsets) {
          const ptY = eng.y - pt.dx * cSinP + pt.dy * cCosP;
          if (ptY < tumbleLowestY) tumbleLowestY = ptY;
        }

        if (tumbleLowestY <= 0.25 && eng.vy < 0) {
          eng.y += (0.25 - tumbleLowestY);
          if (eng.crashBounceCount === 0) {
            // Tiny second bounce: 1–3 ft rise (v_y = 9 to 13.5 ft/s gives 1.2 to 2.8 ft)
            eng.crashBounceCount = 1;
            eng.vy = Math.min(13.5, Math.max(9.0, Math.abs(eng.vy) * 0.45));
            eng.omega *= 0.55;
            spawnScrapeSparks();
          } else {
            // No more bouncing; tumble and slide along road
            eng.crashBounceCount = 2;
            eng.vy = 0;
            if (Math.abs(eng.vx) > 2) {
              spawnScrapeSparks();
            }
          }
        }

        if (eng.carGroup) {
          eng.carGroup.position.set(eng.x, eng.y, eng.z);
          eng.carGroup.rotation.z = -eng.angle;
        }

        updateCrashParticles(dt);
        // Maintain G-force spike at 50.7 g in red
        eng.currentG = 50.7;
        eng.cameraTargetPos.set(eng.x - 30, Math.max(7.0, eng.y + 4.5), 24);
        eng.cameraTargetLook.set(eng.x + 8, Math.max(2.5, eng.y + 1.0), 0);

        // Open result panel only after 2.5 s (or when almost stopped after >= 1.5 s)
        if (eng.crashTimer >= 2.5 || (eng.crashTimer >= 1.5 && Math.abs(eng.vx) < 1.0 && Math.abs(eng.vy) < 1.0)) {
          current.state = 'results';
          const best = safeBest();
          if (eng.frozenMetrics && eng.frozenMetrics.score > best) saveBest(eng.frozenMetrics.score);
          updateStatus();
        }
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

      // Update transient camera mode notice banner timer
      if (eng.cameraNoticeTimer > 0) {
        eng.cameraNoticeTimer -= dt;
        if (eng.cameraNoticeTimer <= 0 && statusRef.current.cameraNotice) {
          statusRef.current.cameraNotice = null;
          updateStatus();
        }
      }

      // Drive camera pose via cameraDirector (Chase, Mounted, Roof, Drone)
      if (eng.cameraDirector) {
        eng.cameraDirector.update({
          dt,
          now,
          state: statusRef.current.state,
          carPosition: eng.carGroup ? eng.carGroup.position : new THREE.Vector3(eng.x, eng.y, eng.z),
          carRotationZ: eng.angle,
          carGroup: eng.carGroup,
          speedMph: statusRef.current.speedMph,
          currentG: eng.currentG,
          thrustActive: eng.thrustInput && eng.thrusterGas > 0,
          screenShake: eng.screenShake,
          chaseTargetPos: eng.cameraTargetPos,
          chaseTargetLook: eng.cameraTargetLook,
        });
      } else {
        const smoothFactor = Math.min(1.0, dt * 4.6);
        eng.camera.position.lerp(eng.cameraTargetPos, smoothFactor);

        const currentLook = new THREE.Vector3();
        eng.camera.getWorldDirection(currentLook);
        const targetLook = eng.cameraTargetLook.clone().sub(eng.camera.position).normalize();
        currentLook.lerp(targetLook, smoothFactor);
        eng.camera.lookAt(eng.camera.position.clone().add(currentLook.multiplyScalar(30)));
      }

      if (eng.screenShake > 0) {
        eng.screenShake = Math.max(0, eng.screenShake - dt * 2.4);
      }

      if (eng.stars) {
        eng.stars.rotation.y += dt * 0.003;
      }

      // Update upgraded stage environment, cinematic backdrop, and stadium lighting
      eng.stageEnvironment?.update(dt, now);
      eng.backdrop?.update(dt, now);
      eng.lighting?.update(dt, now);

      // Update cold-gas thrusters, supersonic jet cores, and ground vapor cloud
      eng.effectsSystem?.update(dt, {
        thrustActive: eng.thrustInput,
        thrusterGas: eng.thrusterGas,
        carPosition: eng.carGroup ? eng.carGroup.position : new THREE.Vector3(eng.x, eng.y, eng.z),
        carRotationZ: eng.angle,
        altitudeFt: eng.y,
        anchors: eng.loadedCarModel?.nozzleAnchors,
        carGroup: eng.carGroup,
        camera: eng.camera,
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

      // Update wheel smoke particles (lightweight rubber smoke & road dust)
      eng.wheelSmokeParticles = eng.wheelSmokeParticles.filter((p) => {
        p.life -= dt;
        p.mesh.position.x += p.vx * dt;
        p.mesh.position.y += p.vy * dt;
        p.mesh.position.z += p.vz * dt;
        p.vy *= 0.96;
        p.vx *= 0.94;
        p.vz *= 0.94;
        const progress = 1 - p.life / p.maxLife;
        const scale = p.baseScale * (1 + progress * 2.2);
        p.mesh.scale.set(scale, scale, scale);
        (p.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.5 * (p.life / p.maxLife));
        if (p.life <= 0) {
          eng.scene?.remove(p.mesh);
          p.mesh.geometry.dispose();
          (p.mesh.material as THREE.Material).dispose();
          return false;
        }
        return true;
      });

      if (eng.cinematicPipeline) {
        eng.cinematicPipeline.render(dt);
      } else if (eng.renderer && eng.scene && eng.camera) {
        eng.renderer.render(eng.scene, eng.camera);
      }

      // Capture the just-rendered WebGL frame once when the run ends. Drawing
      // immediately after render avoids requiring preserveDrawingBuffer=true.
      const finalState = statusRef.current.state;
      if (!eng.heroSnapshotCanvas && (finalState === 'landed' || finalState === 'crashed' || finalState === 'results')) {
        try {
          const source = eng.renderer.domElement;
          const snapshot = document.createElement('canvas');
          snapshot.width = source.width;
          snapshot.height = source.height;
          const context = snapshot.getContext('2d');
          if (context && snapshot.width > 0 && snapshot.height > 0) {
            context.drawImage(source, 0, 0, snapshot.width, snapshot.height);
            eng.heroSnapshotCanvas = snapshot;
          }
        } catch (error) {
          console.warn('[Roadster] Gameplay snapshot capture unavailable:', error);
        }
      }
    };

    // Upgraded cold-gas thruster plumes are rendered through effectsSystem (supersonic jet core + billowing vapor)
    const spawnThrusterPlumes = () => {
      // Handled directly by effectsSystem in renderFrame (supersonic jet core, shock diamonds & vapor plumes)
    };

    // Continuous scrape sparks when car skids on tarmac
    const spawnScrapeSparks = () => {
      const eng = engineRef.current;
      if (!eng.scene || !eng.carGroup) return;

      const sparkColors = [0xffffff, 0xffd166, 0xff9f1c, 0xff5400];
      for (let i = 0; i < 4; i++) {
        const sparkGeo = new THREE.BoxGeometry(0.14, 0.14, 0.14);
        const sparkMat = new THREE.MeshBasicMaterial({
          color: sparkColors[Math.floor(Math.random() * sparkColors.length)],
          transparent: true,
          opacity: 0.95,
        });
        const sparkMesh = new THREE.Mesh(sparkGeo, sparkMat);
        sparkMesh.position.set(
          eng.x + (Math.random() - 0.5) * 3.5,
          0.3 + Math.random() * 0.4,
          (Math.random() - 0.5) * 2.2
        );
        eng.scene.add(sparkMesh);

        eng.sparks.push({
          mesh: sparkMesh,
          vx: -Math.abs(eng.vx) * (0.3 + Math.random() * 0.5) + (Math.random() - 0.5) * 6,
          vy: 4 + Math.random() * 9,
          vz: (Math.random() - 0.5) * 8,
          life: 0.28,
          maxLife: 0.28,
        });
      }
    };

    // Crash Explosion: 80–120 orange-white spark burst and body debris (matching Frame 8)
    const spawnCrashExplosion = () => {
      const eng = engineRef.current;
      if (!eng.scene || !eng.carGroup) return;

      const sparkCount = 95; // 80-120 spark burst
      const sparkColors = [0xffffff, 0xfff3b0, 0xffaa00, 0xff5400, 0xff2a2a];
      for (let i = 0; i < sparkCount; i++) {
        const size = 0.12 + Math.random() * 0.16;
        const geo = new THREE.BoxGeometry(size, size, size);
        const mat = new THREE.MeshBasicMaterial({
          color: sparkColors[Math.floor(Math.random() * sparkColors.length)],
          transparent: true,
          opacity: 0.95,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.copy(eng.carGroup.position);
        eng.scene.add(mesh);

        const angle = Math.random() * Math.PI * 2;
        const speed = 12 + Math.random() * 38;
        eng.sparks.push({
          mesh,
          vx: Math.cos(angle) * speed + (Math.random() - 0.5) * 10,
          vy: 6 + Math.random() * 26,
          vz: (Math.random() - 0.5) * speed * 0.8,
          life: 0.45 + Math.random() * 0.35,
          maxLife: 0.8,
        });
      }

      // 24 body fragments
      const debrisColors = [0xdce5f2, 0x181a20, 0xff2a2a, 0x445566];
      for (let i = 0; i < 24; i++) {
        const size = 0.2 + Math.random() * 0.4;
        const geo = new THREE.BoxGeometry(size, size, size);
        const mat = new THREE.MeshStandardMaterial({
          color: debrisColors[i % debrisColors.length],
          metalness: 0.8,
          roughness: 0.3,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.copy(eng.carGroup.position);
        eng.scene.add(mesh);

        const angle = Math.random() * Math.PI * 2;
        const speed = 10 + Math.random() * 25;
        eng.crashParticles.push({
          mesh,
          vx: Math.cos(angle) * speed,
          vy: 10 + Math.random() * 22,
          vz: (Math.random() - 0.5) * speed * 0.7,
          life: 2.2,
          maxLife: 2.2,
        });
      }

      // Dust and smoke puffs expanding on impact
      for (let i = 0; i < 8; i++) {
        const puffGeo = new THREE.SphereGeometry(0.45 + Math.random() * 0.35, 6, 6);
        const puffMat = new THREE.MeshBasicMaterial({
          color: 0x9cb0c8,
          transparent: true,
          opacity: 0.55,
          depthWrite: false,
        });
        const puffMesh = new THREE.Mesh(puffGeo, puffMat);
        puffMesh.position.set(
          eng.x + (Math.random() - 0.5) * 3.5,
          0.35 + Math.random() * 0.4,
          (Math.random() - 0.5) * 2.5
        );
        eng.scene.add(puffMesh);
        eng.smokePuffs.push({
          mesh: puffMesh,
          vx: (Math.random() - 0.5) * 8,
          vy: 2.0 + Math.random() * 3.5,
          vz: (Math.random() - 0.5) * 8,
          life: 0.75,
          maxLife: 0.75,
          baseScale: 0.5,
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
        color: 0xf8fafc,
        metalness: 0.88,
        roughness: 0.12,
      });

      const glassMat = new THREE.MeshStandardMaterial({
        color: 0x050810,
        metalness: 0.95,
        roughness: 0.04,
        transparent: true,
        opacity: 0.95,
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
        carGroup.add(wheelGroup);
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

      // Soft round contact shadow beneath the car (replaces black square shadow)
      const shadowCanvas = document.createElement('canvas');
      shadowCanvas.width = 128;
      shadowCanvas.height = 128;
      const sctx = shadowCanvas.getContext('2d');
      if (sctx) {
        const sgrad = sctx.createRadialGradient(64, 64, 2, 64, 64, 64);
        sgrad.addColorStop(0, 'rgba(0, 0, 0, 0.75)');
        sgrad.addColorStop(0.45, 'rgba(0, 0, 0, 0.35)');
        sgrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        sctx.fillStyle = sgrad;
        sctx.fillRect(0, 0, 128, 128);
      }
      const shadowTex = new THREE.CanvasTexture(shadowCanvas);
      const shadowGeo = new THREE.PlaneGeometry(6.6, 4.4);
      const shadowMat = new THREE.MeshBasicMaterial({
        map: shadowTex,
        transparent: true,
        opacity: 0.65,
        depthWrite: false,
      });
      const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
      shadowMesh.rotation.x = -Math.PI / 2;
      shadowMesh.position.set(0, 0.02, 0);
      carGroup.add(shadowMesh);

      eng.carGroup = carGroup;
      eng.carChassisGroup = carBody;
      eng.proceduralCarBody = carBody;
      eng.wheels = wheels;
      carGroup.position.set(eng.x, eng.y, eng.z);
    };

    // Build Ground Floor, Upgraded Stage, and Stadium Stands
    const buildEnvironment = (scene: THREE.Scene, eng: typeof engineRef.current) => {
      // 1. Infinite Ground Floor
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

      const roadWidth = 20;

      // 2. Upgraded Architectural Stage Environment (Curved Concrete Ramp, Batched Steel Trusses & Tower, Asphalt Runway & Landing Area)
      eng.stageEnvironment = buildUpgradedStage({
        scene,
        quality: graphicsQuality,
        roadWidth,
      });

      // 3. Tiered Stadium Stands (#2b303b) with thousands of tiny white spectator lights on BOTH sides
      const standMat = new THREE.MeshStandardMaterial({
        color: 0x2b303b, // Tiered stadium stands #2b303b
        roughness: 0.82,
        metalness: 0.18,
      });

      const tierLevels = 5;
      const tierRun = 5.5;
      const tierRise = 2.2;
      const standLength = 960;

      for (let t = 0; t < tierLevels; t++) {
        const tHeight = 1.0 + t * tierRise;
        // Left stands (negative Z)
        const leftZ = -roadWidth / 2 - 7 - t * tierRun;
        const leftTier = new THREE.Mesh(
          new THREE.BoxGeometry(standLength, tHeight, tierRun),
          standMat
        );
        leftTier.position.set(180, tHeight / 2, leftZ);
        leftTier.receiveShadow = true;
        scene.add(leftTier);

        // Right stands (positive Z)
        const rightZ = roadWidth / 2 + 7 + t * tierRun;
        const rightTier = new THREE.Mesh(
          new THREE.BoxGeometry(standLength, tHeight, tierRun),
          standMat
        );
        rightTier.position.set(180, tHeight / 2, rightZ);
        rightTier.receiveShadow = true;
        scene.add(rightTier);
      }

      // Thousands of tiny white spectator lights on the stadium stands
      const spectatorCount = 3200;
      const spectatorGeo = new THREE.BufferGeometry();
      const spectatorPos: number[] = [];
      for (let i = 0; i < spectatorCount; i++) {
        const sx = -290 + Math.random() * 950;
        const side = Math.random() > 0.5 ? 1 : -1;
        const tierIdx = Math.floor(Math.random() * tierLevels);
        const sz = side * (roadWidth / 2 + 7 + tierIdx * tierRun + (Math.random() - 0.5) * 3.5);
        const sy = 1.2 + tierIdx * tierRise + Math.random() * 0.6;
        spectatorPos.push(sx, sy, sz);
      }
      spectatorGeo.setAttribute('position', new THREE.Float32BufferAttribute(spectatorPos, 3));
      const spectatorMat = new THREE.PointsMaterial({
        color: 0xffffff,
        size: 0.26,
        transparent: true,
        opacity: 0.88,
      });
      const spectators = new THREE.Points(spectatorGeo, spectatorMat);
      scene.add(spectators);
    };

    // Exactly 3 Large Thin Glowing Pink-Red Rings (~15 ft radius) with Soft Halo along Stunt Arc
    const buildSkyRings = (scene: THREE.Scene, eng: typeof engineRef.current) => {
      eng.rings = [];
      const ringMat = new THREE.MeshStandardMaterial({
        color: 0xff2a55, // Glowing pink-red
        emissive: 0xff1448,
        emissiveIntensity: 4.0,
        roughness: 0.15,
        metalness: 0.85,
      });

      const ringHaloCanvas = document.createElement('canvas');
      ringHaloCanvas.width = 128;
      ringHaloCanvas.height = 128;
      const rhctx = ringHaloCanvas.getContext('2d');
      if (rhctx) {
        const rhgrad = rhctx.createRadialGradient(64, 64, 25, 64, 64, 64);
        rhgrad.addColorStop(0, 'rgba(255, 42, 85, 0.55)');
        rhgrad.addColorStop(0.55, 'rgba(255, 42, 85, 0.22)');
        rhgrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        rhctx.fillStyle = rhgrad;
        rhctx.fillRect(0, 0, 128, 128);
      }
      const ringHaloTex = new THREE.CanvasTexture(ringHaloCanvas);
      const ringHaloSpriteMat = new THREE.SpriteMaterial({
        map: ringHaloTex,
        blending: THREE.AdditiveBlending,
        transparent: true,
        opacity: 0.8,
        depthWrite: false,
      });

      const ringPositions = [
        { x: 75, y: 115, z: 0 },
        { x: 150, y: 152, z: 0 },
        { x: 235, y: 115, z: 0 },
      ];

      ringPositions.forEach((pos, idx) => {
        // Thin glowing 3D ellipse / torus (~2.5x larger, radius 15.0 ft)
        const ringGeo = new THREE.TorusGeometry(15.0, 0.32, 16, 48);
        const ringMesh = new THREE.Mesh(ringGeo, ringMat);
        ringMesh.position.set(pos.x, pos.y, pos.z);
        ringMesh.rotation.y = Math.PI / 2;
        scene.add(ringMesh);

        // Soft outer glowing halo billboard
        const haloSprite = new THREE.Sprite(ringHaloSpriteMat);
        haloSprite.position.set(pos.x, pos.y, pos.z);
        haloSprite.scale.set(34, 34, 1);
        scene.add(haloSprite);

        eng.rings.push({
          mesh: ringMesh,
          data: {
            id: idx,
            x: pos.x,
            y: pos.y,
            z: pos.z,
            radius: 15.0,
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
