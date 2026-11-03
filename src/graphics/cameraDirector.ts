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

export function createCameraDirector({
  camera,
  initialMode = 'chase',
  onModeChange,
}: CameraDirectorOptions): CameraDirector {
  let currentMode: CameraMode = initialMode;

  // Cached math primitives to prevent heap allocation during frame loops
  const targetPos = new THREE.Vector3();
  const targetLook = new THREE.Vector3();
  const targetUp = new THREE.Vector3(0, 1, 0);

  const currentLookVec = new THREE.Vector3();
  const desiredLookVec = new THREE.Vector3();

  const carQuat = new THREE.Quaternion();
  const localVec = new THREE.Vector3();
  const dronePos = new THREE.Vector3();
  const droneLook = new THREE.Vector3();

  // Mode transition state
  let transitionProgress = 1.0;
  const prevPos = new THREE.Vector3().copy(camera.position);
  const prevLook = new THREE.Vector3();
  const prevUp = new THREE.Vector3().copy(camera.up);
  let prevFov = camera.fov;

  // Drone filtered position for smooth lagging follow
  let droneInitialized = false;

  const setMode = (newMode: CameraMode) => {
    if (newMode === currentMode) return;

    // Snapshot current pose for smooth blend
    prevPos.copy(camera.position);
    camera.getWorldDirection(prevLook);
    prevUp.copy(camera.up);
    prevFov = camera.fov;
    transitionProgress = 0.0;

    currentMode = newMode;
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

    // Retrieve car orientation quaternion
    if (carGroup) {
      carQuat.copy(carGroup.quaternion);
    } else {
      carQuat.setFromAxisAngle(new THREE.Vector3(0, 0, 1), -carRotationZ);
    }

    // The airborne chase lens adapts to altitude and portrait aspect ratios.
    // Vertical FOV matters most on tall/narrow viewports, where the car was
    // previously leaving the top edge during the jump.
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
        // Ground and ramp framing stay driven by the existing composition.
        // In flight, frame the actual car centre instead of looking ahead at
        // a fixed world-space point. This keeps the complete GLB in view.
        if (state === 'air') {
          targetPos.set(
            carPosition.x - 18.0,
            carPosition.y + 8.5,
            carPosition.z + 24.0,
          );
          targetLook.set(carPosition.x + 0.8, carPosition.y + 0.55, carPosition.z);
          modeTargetFov = airborneFov;
        } else {
          targetPos.copy(chaseTargetPos);
          targetLook.copy(chaseTargetLook);
          modeTargetFov = 48.0;
        }
        targetUp.set(0, 1, 0);
        break;
      }

      case 'mounted': {
        // Mode 2: Mounted Camera — fixed to rear deck carbon rig, rolls with car
        // Local offset: behind rear deck, elevated looking over roof
        const swayIntensity = 0.015 + (thrustActive ? 0.02 : 0.0) + Math.min(0.04, currentG * 0.006);
        const swayY = (Math.sin(now * 0.018) * 0.6 + Math.sin(now * 0.028 + 1.2) * 0.4) * swayIntensity;
        const swayZ = (Math.sin(now * 0.014 + 0.5) * 0.6 + Math.sin(now * 0.024 + 2.0) * 0.4) * swayIntensity * 0.7;

        // High frequency cold-gas thruster and tarmac buzz
        const buzz = (thrustActive ? 0.02 : 0.005) + Math.min(0.025, (speedMph / 100) * 0.015);
        const buzzY = Math.sin(now * 0.045) * buzz;
        const buzzZ = Math.sin(now * 0.052 + 1.8) * buzz;

        localVec.set(-4.8, 1.95 + swayY + buzzY, swayZ + buzzZ);
        localVec.applyQuaternion(carQuat);
        targetPos.copy(carPosition).add(localVec);

        // Look target forward over hood along car's forward axis
        localVec.set(24.0, 1.35 + swayY * 2.0, swayZ * 2.0);
        localVec.applyQuaternion(carQuat);
        targetLook.copy(carPosition).add(localVec);

        // Follow car roll/orientation
        targetUp.set(0, 1, 0).applyQuaternion(carQuat);
        modeTargetFov = 74.0;
        break;
      }

      case 'roof': {
        // Mode 3: Roof / Cockpit View — high immersion, right above windshield
        const roadJitter = (state === 'drive' || state === 'ramp' || state === 'landed')
          ? (speedMph / 100) * Math.sin(now * 0.065) * 0.02
          : 0.0;

        localVec.set(0.4, 1.48 + roadJitter, 0.0);
        localVec.applyQuaternion(carQuat);
        targetPos.copy(carPosition).add(localVec);

        // Look ahead toward runway and sky ahead
        localVec.set(30.0, 1.25, 0.0);
        localVec.applyQuaternion(carQuat);
        targetLook.copy(carPosition).add(localVec);

        targetUp.set(0, 1, 0).applyQuaternion(carQuat);
        modeTargetFov = 68.0;
        break;
      }

      case 'drone': {
        // Mode 4: Drone Camera — elevated cinematic tracking view from high 3/4 flank
        const idealDroneX = carPosition.x - 22.0;
        const idealDroneY = Math.max(16.0, carPosition.y + 14.0);
        const idealDroneZ = carPosition.z + 26.0;

        if (!droneInitialized) {
          dronePos.set(idealDroneX, idealDroneY, idealDroneZ);
          droneLook.copy(carPosition);
          droneInitialized = true;
        }

        // Damped drone follow lag
        const droneFollowRate = 1.0 - Math.exp(-4.2 * Math.min(dt, 0.05));
        dronePos.x = THREE.MathUtils.lerp(dronePos.x, idealDroneX, droneFollowRate);
        dronePos.y = THREE.MathUtils.lerp(dronePos.y, idealDroneY, droneFollowRate);
        dronePos.z = THREE.MathUtils.lerp(dronePos.z, idealDroneZ, droneFollowRate);

        droneLook.x = THREE.MathUtils.lerp(droneLook.x, carPosition.x + 8.0, droneFollowRate * 1.2);
        droneLook.y = THREE.MathUtils.lerp(droneLook.y, carPosition.y + 2.0, droneFollowRate * 1.2);
        droneLook.z = THREE.MathUtils.lerp(droneLook.z, carPosition.z, droneFollowRate * 1.2);

        targetPos.copy(dronePos);
        targetLook.copy(droneLook);
        targetUp.set(0, 1, 0);
        modeTargetFov = 46.0;
        break;
      }
    }

    // =======================================================================
    // 2. SMOOTH INTERPOLATION & MODE TRANSITIONS
    // =======================================================================
    // Chase uses the original smoothing on the ground, but tracks more tightly
    // in flight to avoid lagging behind the fast-moving vehicle.
    const baseSmoothRate = currentMode === 'chase'
      ? (state === 'air' ? 10.0 : 5.5)
      : 8.5;
    const smoothFactor = 1.0 - Math.exp(-baseSmoothRate * Math.min(dt, 0.05));

    // Apply smooth transition when switching modes
    if (transitionProgress < 1.0) {
      transitionProgress = Math.min(1.0, transitionProgress + dt * 2.4);
      const ease = THREE.MathUtils.smoothstep(transitionProgress, 0.0, 1.0);

      // Blend position
      camera.position.lerpVectors(prevPos, targetPos, ease);

      // Blend up vector
      camera.up.lerpVectors(prevUp, targetUp, ease).normalize();

      // Blend forward direction
      camera.getWorldDirection(currentLookVec);
      desiredLookVec.copy(targetLook).sub(camera.position).normalize();
      currentLookVec.lerp(desiredLookVec, smoothFactor);
      camera.lookAt(camera.position.clone().add(currentLookVec.multiplyScalar(30)));

      // Blend FOV
      camera.fov = THREE.MathUtils.lerp(prevFov, modeTargetFov, ease);
      camera.updateProjectionMatrix();
    } else {
      // Direct smooth tracking in current mode
      camera.position.lerp(targetPos, smoothFactor);

      // Interpolate up vector for mounted/roof rotations
      if (currentMode === 'mounted' || currentMode === 'roof') {
        camera.up.lerp(targetUp, Math.min(1.0, dt * 14.0)).normalize();
      } else {
        camera.up.lerp(targetUp, Math.min(1.0, dt * 6.0)).normalize();
      }

      // Smooth look-at direction
      camera.getWorldDirection(currentLookVec);
      desiredLookVec.copy(targetLook).sub(camera.position).normalize();
      currentLookVec.lerp(desiredLookVec, smoothFactor);
      camera.lookAt(camera.position.clone().add(currentLookVec.multiplyScalar(30)));

      // Maintain target FOV
      if (Math.abs(camera.fov - modeTargetFov) > 0.1) {
        camera.fov = THREE.MathUtils.damp(camera.fov, modeTargetFov, 3.8, dt);
        camera.updateProjectionMatrix();
      }
    }

    // =======================================================================
    // 3. SCREEN SHAKE & CRASH VIBRATION
    // =======================================================================
    if (screenShake > 0) {
      const shakeAmt = screenShake * 1.8;
      camera.position.x += (Math.random() - 0.5) * shakeAmt;
      camera.position.y += (Math.random() - 0.5) * shakeAmt;
    }
  };

  const dispose = () => {
    // Reset camera up vector to default
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
