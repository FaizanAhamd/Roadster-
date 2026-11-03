import * as THREE from 'three';
import { GameState } from '../types';

export type CameraMode = 'chase' | 'mounted' | 'roof' | 'drone';

export interface CameraDirectorOptions {
  camera: THREE.PerspectiveCamera;
  initialMode?: CameraMode;
  onModeChange?: (mode: CameraMode, modeName: string) => void;
}

export interface CameraUpdateContext {
  dt: number;
  now: number;
  state: GameState;
  carPosition: THREE.Vector3;
  carRotationZ: number;
  carGroup?: THREE.Group | null;
  speedMph: number;
  currentG: number;
  thrustActive: boolean;
  screenShake: number;
  chaseTargetPos: THREE.Vector3;
  chaseTargetLook: THREE.Vector3;
}

export interface CameraDirector {
  mode: CameraMode;
  setMode: (mode: CameraMode) => void;
  cycleMode: () => CameraMode;
  update: (ctx: CameraUpdateContext) => void;
  getModeName: () => string;
  dispose: () => void;
}

const MODE_NAMES: Record<CameraMode, string> = {
  chase: 'Chase Cam (Default)',
  mounted: 'Mounted Action Cam',
  roof: 'Roof / First-Person',
  drone: 'Cinematic Drone',
};

const MODE_ORDER: CameraMode[] = ['chase', 'mounted', 'roof', 'drone'];
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const WORLD_Z = new THREE.Vector3(0, 0, 1);

export function createCameraDirector({
  camera,
  initialMode = 'chase',
  onModeChange,
}: CameraDirectorOptions): CameraDirector {
  let currentMode: CameraMode = initialMode;

  // Reused vectors keep the frame update allocation-free.
  const targetPos = new THREE.Vector3();
  const targetLook = new THREE.Vector3();
  const targetUp = new THREE.Vector3(0, 1, 0);
  const currentLookVec = new THREE.Vector3();
  const desiredLookVec = new THREE.Vector3();
  const lookAtPoint = new THREE.Vector3();

  const carQuat = new THREE.Quaternion();
  const localVec = new THREE.Vector3();
  const dronePos = new THREE.Vector3();
  const droneLook = new THREE.Vector3();

  // Shared pose transition state is used for camera-mode changes and touchdown.
  let transitionProgress = 1.0;
  let transitionDuration = 0.42;
  const prevPos = new THREE.Vector3().copy(camera.position);
  const prevLook = new THREE.Vector3();
  const prevUp = new THREE.Vector3().copy(camera.up);
  let prevFov = camera.fov;
  let previousState: GameState | null = null;

  // Drone filtered position for smooth lagging follow.
  let droneInitialized = false;

  const beginPoseTransition = (duration: number) => {
    prevPos.copy(camera.position);
    camera.getWorldDirection(prevLook);
    prevUp.copy(camera.up);
    prevFov = camera.fov;
    transitionDuration = Math.max(0.1, duration);
    transitionProgress = 0.0;
  };

  const setMode = (newMode: CameraMode) => {
    if (newMode === currentMode) return;

    beginPoseTransition(0.42);
    currentMode = newMode;

    if (currentMode === 'drone') {
      droneInitialized = false;
    }

    if (onModeChange) {
      onModeChange(currentMode, MODE_NAMES[currentMode]);
    }
  };

  const cycleMode = (): CameraMode => {
    const currentIndex = MODE_ORDER.indexOf(currentMode);
    const nextIndex = (currentIndex + 1) % MODE_ORDER.length;
    const nextMode = MODE_ORDER[nextIndex];
    setMode(nextMode);
    return nextMode;
  };

  const getModeName = () => MODE_NAMES[currentMode];

  const update = (ctx: CameraUpdateContext) => {
    const {
      dt,
      now,
      state,
      carPosition,
      carRotationZ,
      carGroup,
      speedMph,
      currentG,
      thrustActive,
      screenShake,
      chaseTargetPos,
      chaseTargetLook,
    } = ctx;

    // Clamp frame time so a stalled tab cannot create a large camera jump.
    const frameDt = Math.max(0.0, Math.min(Number.isFinite(dt) ? dt : 0.0, 0.05));

    // Blend out of the airborne view when the vehicle first touches down.
    if (
      currentMode === 'chase' &&
      previousState === 'air' &&
      (state === 'landed' || state === 'crashed')
    ) {
      beginPoseTransition(0.58);
    }
    previousState = state;

    // Retrieve the car orientation quaternion without allocating a new vector.
    if (carGroup) {
      carQuat.copy(carGroup.quaternion);
    } else {
      carQuat.setFromAxisAngle(WORLD_Z, -carRotationZ);
    }

    // Airborne FOV adapts to altitude and portrait aspect ratios.
    const portraitBoost = camera.aspect < 0.85 ? 8.0 : camera.aspect < 1.2 ? 4.0 : 0.0;
    const airborneFov = THREE.MathUtils.clamp(
      62.0 + Math.max(0, carPosition.y - 70.0) * 0.055 + portraitBoost,
      62.0,
      74.0,
    );
    let modeTargetFov = currentMode === 'chase' && state === 'air' ? airborneFov : 48.0;

    // =======================================================================
    // 1. CALCULATE POSE PER CAMERA MODE
    // =======================================================================
    switch (currentMode) {
      case 'chase': {
        if (state === 'air') {
          // Keep the complete car visible while aiming slightly ahead and
          // below it so the upcoming landing runway remains in frame.
          targetPos.set(
            carPosition.x - 20.0,
            carPosition.y + 10.0,
            carPosition.z + 22.0,
          );
          targetLook.set(
            carPosition.x + 9.0,
            Math.max(0.25, carPosition.y - 4.0),
            carPosition.z,
          );
          modeTargetFov = airborneFov;
        } else {
          targetPos.copy(chaseTargetPos);
          targetLook.copy(chaseTargetLook);

          if (state === 'drive') {
            // Lower the chase view and look farther down the runway.
            targetPos.y = Math.max(2.8, targetPos.y - 0.6);
            targetLook.x += 6.0;
            targetLook.y = Math.max(1.4, targetLook.y - 1.0);
            modeTargetFov = 53.0;
          } else if (state === 'ramp') {
            // A slightly wider view keeps the ramp curvature visible.
            modeTargetFov = 54.0;
          } else if (state === 'landed' || state === 'results') {
            // Keep both the car and runway visible through rollout/results.
            targetLook.y = Math.max(1.8, targetLook.y - 0.8);
            modeTargetFov = 54.0;
          } else if (state === 'crashed') {
            // Widen the impact view without losing the vehicle.
            modeTargetFov = 56.0;
          } else {
            modeTargetFov = 48.0;
          }
        }

        targetUp.set(0, 1, 0);
        break;
      }

      case 'mounted': {
        // Rear-deck camera with restrained movement from thrust and G-force.
        const swayIntensity =
          0.015 +
          (thrustActive ? 0.02 : 0.0) +
          Math.min(0.04, currentG * 0.006);
        const swayY =
          (Math.sin(now * 0.018) * 0.6 + Math.sin(now * 0.028 + 1.2) * 0.4) *
          swayIntensity;
        const swayZ =
          (Math.sin(now * 0.014 + 0.5) * 0.6 + Math.sin(now * 0.024 + 2.0) * 0.4) *
          swayIntensity *
          0.7;

        const buzz =
          (thrustActive ? 0.02 : 0.005) + Math.min(0.025, (speedMph / 100) * 0.015);
        const buzzY = Math.sin(now * 0.045) * buzz;
        const buzzZ = Math.sin(now * 0.052 + 1.8) * buzz;

        localVec.set(-4.8, 1.95 + swayY + buzzY, swayZ + buzzZ);
        localVec.applyQuaternion(carQuat);
        targetPos.copy(carPosition).add(localVec);

        // Look forward over the hood along the car's forward axis.
        localVec.set(24.0, 1.35 + swayY * 2.0, swayZ * 2.0);
        localVec.applyQuaternion(carQuat);
        targetLook.copy(carPosition).add(localVec);

        targetUp.copy(WORLD_UP).applyQuaternion(carQuat);
        modeTargetFov = 74.0;
        break;
      }

      case 'roof': {
        // Cockpit view mounted just above the windshield.
        const roadJitter =
          state === 'drive' || state === 'ramp' || state === 'landed'
            ? (speedMph / 100) * Math.sin(now * 0.065) * 0.02
            : 0.0;

        localVec.set(0.4, 1.48 + roadJitter, 0.0);
        localVec.applyQuaternion(carQuat);
        targetPos.copy(carPosition).add(localVec);

        localVec.set(30.0, 1.25, 0.0);
        localVec.applyQuaternion(carQuat);
        targetLook.copy(carPosition).add(localVec);

        targetUp.copy(WORLD_UP).applyQuaternion(carQuat);
        modeTargetFov = 68.0;
        break;
      }

      case 'drone': {
        // Elevated cinematic tracking view from a high three-quarter flank.
        const idealDroneX = carPosition.x - 22.0;
        const idealDroneY = Math.max(16.0, carPosition.y + 14.0);
        const idealDroneZ = carPosition.z + 26.0;

        if (!droneInitialized) {
          dronePos.set(idealDroneX, idealDroneY, idealDroneZ);
          droneLook.copy(carPosition);
          droneInitialized = true;
        }

        const droneFollowRate = 1.0 - Math.exp(-4.2 * frameDt);
        dronePos.x = THREE.MathUtils.lerp(dronePos.x, idealDroneX, droneFollowRate);
        dronePos.y = THREE.MathUtils.lerp(dronePos.y, idealDroneY, droneFollowRate);
        dronePos.z = THREE.MathUtils.lerp(dronePos.z, idealDroneZ, droneFollowRate);

        droneLook.x = THREE.MathUtils.lerp(
          droneLook.x,
          carPosition.x + 8.0,
          droneFollowRate * 1.2,
        );
        droneLook.y = THREE.MathUtils.lerp(
          droneLook.y,
          carPosition.y + 2.0,
          droneFollowRate * 1.2,
        );
        droneLook.z = THREE.MathUtils.lerp(
          droneLook.z,
          carPosition.z,
          droneFollowRate * 1.2,
        );

        targetPos.copy(dronePos);
        targetLook.copy(droneLook);
        targetUp.set(0, 1, 0);
        modeTargetFov = 46.0;
        break;
      }
    }

    // =======================================================================
    // 2. FRAME-RATE-INDEPENDENT FOLLOW AND POSE TRANSITIONS
    // =======================================================================
    const baseSmoothRate =
      currentMode === 'chase'
        ? state === 'air'
          ? 8.5
          : state === 'landed' || state === 'crashed'
            ? 6.5
            : 5.8
        : currentMode === 'drone'
          ? 5.5
          : 8.5;
    const smoothFactor = 1.0 - Math.exp(-baseSmoothRate * frameDt);

    if (transitionProgress < 1.0) {
      transitionProgress = Math.min(1.0, transitionProgress + frameDt / transitionDuration);
      const ease = THREE.MathUtils.smoothstep(transitionProgress, 0.0, 1.0);

      camera.position.lerpVectors(prevPos, targetPos, ease);
      camera.up.lerpVectors(prevUp, targetUp, ease).normalize();

      desiredLookVec.copy(targetLook).sub(camera.position).normalize();
      currentLookVec.copy(prevLook).lerp(desiredLookVec, ease).normalize();
      lookAtPoint.copy(camera.position).addScaledVector(currentLookVec, 30.0);
      camera.lookAt(lookAtPoint);

      camera.fov = THREE.MathUtils.lerp(prevFov, modeTargetFov, ease);
      camera.updateProjectionMatrix();
    } else {
      camera.position.lerp(targetPos, smoothFactor);

      const upSmoothRate = currentMode === 'mounted' || currentMode === 'roof' ? 14.0 : 6.0;
      camera.up.lerp(targetUp, Math.min(1.0, frameDt * upSmoothRate)).normalize();

      camera.getWorldDirection(currentLookVec);
      desiredLookVec.copy(targetLook).sub(camera.position).normalize();
      currentLookVec.lerp(desiredLookVec, smoothFactor).normalize();
      lookAtPoint.copy(camera.position).addScaledVector(currentLookVec, 30.0);
      camera.lookAt(lookAtPoint);

      if (Math.abs(camera.fov - modeTargetFov) > 0.1) {
        camera.fov = THREE.MathUtils.damp(camera.fov, modeTargetFov, 3.8, frameDt);
        camera.updateProjectionMatrix();
      }
    }

    // =======================================================================
    // 3. SMOOTH IMPACT VIBRATION (NO RANDOM FRAME-TO-FRAME JUMPS)
    // =======================================================================
    if (screenShake > 0) {
      const shakeAmount = Math.max(0, screenShake) * 0.55;
      const shakeX =
        Math.sin(now * 0.045) * 0.65 + Math.sin(now * 0.081 + 1.3) * 0.35;
      const shakeY =
        Math.sin(now * 0.057 + 0.8) * 0.65 + Math.sin(now * 0.097 + 2.1) * 0.35;

      camera.position.x += shakeX * shakeAmount;
      camera.position.y += shakeY * shakeAmount;
    }
  };

  const dispose = () => {
    camera.up.set(0, 1, 0);
  };

  return {
    get mode() {
      return currentMode;
    },
    setMode,
    cycleMode,
    update,
    getModeName,
    dispose,
  };
}