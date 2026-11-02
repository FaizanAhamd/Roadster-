import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CarColor } from '../types';

export interface RoadsterWheel {
  name: string;
  node: THREE.Object3D;
  restQuaternion: THREE.Quaternion;
}

export interface LoadedRoadsterModel {
  root: THREE.Group;
  carObject: THREE.Object3D;
  bodyMeshes: THREE.Mesh[];
  paintMaterials: THREE.MeshStandardMaterial[];
  wheels: RoadsterWheel[];
  nozzleAnchors: THREE.Object3D[];
  wheelRadius: number;
  applyCarColor: (color: CarColor) => void;
  spinWheels: (distanceDelta: number) => void;
  dispose: () => void;
}

export const CAR_MODEL_SCALE = 1.35;
const WHEEL_SPIN_AXIS = new THREE.Vector3(1, 0, 0);

/**
 * Asynchronously loads and configures the high-fidelity Tesla Roadster GLB model.
 * Inspects hierarchy for chassis meshes, 4 individual animated wheels, and thruster nozzle anchors.
 */
export async function loadRoadsterModel(
  modelUrl: string = '/models/roadster.glb',
  onProgress?: (event: ProgressEvent) => void
): Promise<LoadedRoadsterModel> {
  const loader = new GLTFLoader();

  const gltf = await loader.loadAsync(modelUrl, onProgress);
  const root = new THREE.Group();
  root.name = 'RoadsterModelRoot';

  const sceneObj = gltf.scene;
  root.add(sceneObj);

  // Apply scale to match existing imperial game units (~14.5 ft long, 6.2 ft wide)
  sceneObj.scale.set(CAR_MODEL_SCALE, CAR_MODEL_SCALE, CAR_MODEL_SCALE);

  const bodyMeshes: THREE.Mesh[] = [];
  const paintMaterials: THREE.MeshStandardMaterial[] = [];
  const wheels: RoadsterWheel[] = [];
  const nozzleAnchors: THREE.Object3D[] = [];

  // Identify Roadster root child (contains the car nodes)
  const carObject = sceneObj.getObjectByName('Roadster') || sceneObj;

  // Identify 4 animated wheel nodes and store their rest quaternions
  const wheelNames = ['Wheel_FL', 'Wheel_FR', 'Wheel_RL', 'Wheel_RR'];
  wheelNames.forEach((name) => {
    const wheelNode = sceneObj.getObjectByName(name);
    if (wheelNode) {
      wheels.push({
        name,
        node: wheelNode,
        restQuaternion: wheelNode.quaternion.clone(),
      });
    }
  });

  // Identify 4 rear cold-gas thruster nozzle anchors
  for (let i = 1; i <= 4; i++) {
    const anchor = sceneObj.getObjectByName(`NozzleAnchor_${i}`);
    if (anchor) {
      nozzleAnchors.push(anchor);
    }
  }

  // Traverse meshes to configure materials, shadows, and collect paint materials
  const processedMaterials = new Set<THREE.Material>();

  sceneObj.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      bodyMeshes.push(obj);

      // Enable shadow casting and receiving for realistic stadium lighting
      obj.castShadow = true;
      obj.receiveShadow = true;

      const mats: THREE.Material[] = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach((mat) => {
        if (!mat || processedMaterials.has(mat)) return;
        processedMaterials.add(mat);

        if (mat instanceof THREE.MeshStandardMaterial) {
          // Identify pearlescent paint materials for color customization
          if (mat.name === 'Paint_PearlWhite' || obj.name.includes('Paint')) {
            paintMaterials.push(mat);
            mat.roughness = 0.12;
            mat.metalness = 0.82;
          }

          // Boost tail light emissive for night track presence
          if (mat.name === 'Lamp_TailRed' || obj.name.includes('TailRed')) {
            mat.emissive.setHex(0xff1828);
            mat.emissiveIntensity = 3.5;
          }

          // Boost headlights and DRLs
          if (mat.name === 'Lamp_Headlamp' || mat.name === 'Lamp_DRL') {
            mat.emissive.setHex(0xf4faff);
            mat.emissiveIntensity = 2.4;
          }

          // Enhance brake rotors and brass thrusters
          if (mat.name === 'Nozzle_Brass') {
            mat.metalness = 0.95;
            mat.roughness = 0.25;
          }

          if (mat.name === 'Brake_Rotor') {
            mat.metalness = 0.95;
            mat.roughness = 0.35;
          }

          if (mat.name === 'Glass_GoldTint') {
            mat.roughness = 0.04;
            mat.metalness = 0.75;
          }
        }
      });
    }
  });

  // Color applicator function
  const applyCarColor = (color: CarColor) => {
    paintMaterials.forEach((mat) => {
      if (color === 'red') {
        mat.color.setHex(0xd81f2a);
        mat.metalness = 0.88;
        mat.roughness = 0.22;
      } else if (color === 'black') {
        mat.color.setHex(0x181a20);
        mat.metalness = 0.92;
        mat.roughness = 0.16;
      } else {
        // Pearlescent silver/white
        mat.color.setHex(0xf8fafc);
        mat.metalness = 0.85;
        mat.roughness = 0.12;
      }
      mat.needsUpdate = true;
    });
  };

  // Wheel animation state
  let totalWheelSpinAngle = 0;
  const wheelRadius = 0.368 * CAR_MODEL_SCALE; // Effective scaled radius (~0.497 ft)
  const tempQuat = new THREE.Quaternion();

  const spinWheels = (distanceDelta: number) => {
    const deltaAngle = distanceDelta / wheelRadius;
    totalWheelSpinAngle += deltaAngle;
    tempQuat.setFromAxisAngle(WHEEL_SPIN_AXIS, totalWheelSpinAngle);

    for (let i = 0; i < wheels.length; i++) {
      wheels[i].node.quaternion.copy(wheels[i].restQuaternion).multiply(tempQuat);
    }
  };

  const dispose = () => {
    sceneObj.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry?.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => m.dispose());
        } else if (obj.material) {
          obj.material.dispose();
        }
      }
    });
    root.clear();
  };

  return {
    root,
    carObject,
    bodyMeshes,
    paintMaterials,
    wheels,
    nozzleAnchors,
    wheelRadius,
    applyCarColor,
    spinWheels,
    dispose,
  };
}
