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
 * Loads and configures the high-fidelity Roadster GLB model.
 * Paint materials are upgraded to MeshPhysicalMaterial so clearcoat and
 * environment reflections can be used when the renderer supplies an environment.
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
  sceneObj.scale.setScalar(CAR_MODEL_SCALE);

  const bodyMeshes: THREE.Mesh[] = [];
  const paintMaterials: THREE.MeshStandardMaterial[] = [];
  const wheels: RoadsterWheel[] = [];
  const nozzleAnchors: THREE.Object3D[] = [];

  // Keep track of both source and replacement resources for safe disposal.
  const geometriesToDispose = new Set<THREE.BufferGeometry>();
  const materialsToDispose = new Set<THREE.Material>();
  const processedMaterials = new Set<THREE.Material>();
  const materialReplacements = new Map<THREE.Material, THREE.MeshPhysicalMaterial>();

  const carObject = sceneObj.getObjectByName('Roadster') || sceneObj;

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

  for (let i = 1; i <= 4; i++) {
    const anchor = sceneObj.getObjectByName(`NozzleAnchor_${i}`);
    if (anchor) nozzleAnchors.push(anchor);
  }

  const configureMaterial = (
    source: THREE.Material,
    meshName: string
  ): THREE.Material => {
    materialsToDispose.add(source);

    const existingReplacement = materialReplacements.get(source);
    if (existingReplacement) return existingReplacement;
    if (processedMaterials.has(source)) return source;
    processedMaterials.add(source);

    if (!(source instanceof THREE.MeshStandardMaterial)) return source;

    const mat = source;
    const materialName = `${mat.name} ${meshName}`;

    // Silver body paint: use a physical clearcoat layer for automotive gloss.
    if (/paint|body[_ -]?shell|chassis[_ -]?paint/i.test(materialName)) {
      const physical = new THREE.MeshPhysicalMaterial();
      physical.copy(mat as THREE.MeshPhysicalMaterial);
      physical.name = mat.name || 'Roadster_Silver_Paint';
      physical.color.lerp(new THREE.Color(0xeaf0f5), 0.12);
      physical.metalness = 0.76;
      physical.roughness = 0.19;
      physical.envMapIntensity = 1.75;
      physical.clearcoat = 0.95;
      physical.clearcoatRoughness = 0.12;
      physical.reflectivity = 0.9;
      physical.ior = 1.5;
      physical.needsUpdate = true;

      materialReplacements.set(source, physical);
      materialsToDispose.add(physical);
      paintMaterials.push(physical);
      return physical;
    }

    // Keep glass dark, but make its reflections visible under scene lighting.
    if (/glass|windshield|window|canopy/i.test(materialName)) {
      mat.roughness = Math.min(mat.roughness, 0.1);
      mat.metalness = Math.min(mat.metalness, 0.28);
      mat.envMapIntensity = 1.55;
      if (mat instanceof THREE.MeshPhysicalMaterial) {
        mat.clearcoat = Math.max(mat.clearcoat, 0.55);
        mat.clearcoatRoughness = 0.08;
      }
    }

    // Tail lamps and headlamps remain visible in the night environment.
    if (mat.name === 'Lamp_TailRed' || /TailRed/i.test(meshName)) {
      mat.emissive.setHex(0xff1828);
      mat.emissiveIntensity = 2.8;
    }

    if (
      mat.name === 'Lamp_Headlamp' ||
      mat.name === 'Lamp_DRL' ||
      /Headlamp|DRL/i.test(meshName)
    ) {
      mat.emissive.setHex(0xf4faff);
      mat.emissiveIntensity = 2.0;
    }

    // Metallic hardware gets crisp highlights without making the tyres shiny.
    if (mat.name === 'Nozzle_Brass') {
      mat.metalness = 0.92;
      mat.roughness = 0.22;
      mat.envMapIntensity = 1.45;
    }

    if (mat.name === 'Brake_Rotor') {
      mat.metalness = 0.88;
      mat.roughness = 0.32;
      mat.envMapIntensity = 1.2;
    }

    if (/chrome|polished[_ -]?metal|trim/i.test(materialName)) {
      mat.metalness = 0.9;
      mat.roughness = 0.24;
      mat.envMapIntensity = 1.45;
    }

    if (/tire|tyre|rubber/i.test(materialName)) {
      mat.metalness = 0.02;
      mat.roughness = 0.88;
    }

    // Retain the existing gold-tinted glazing appearance.
    if (mat.name === 'Glass_GoldTint') {
      mat.roughness = 0.07;
      mat.metalness = 0.55;
      mat.envMapIntensity = 1.45;
      if (mat instanceof THREE.MeshPhysicalMaterial) {
        mat.clearcoat = 0.7;
        mat.clearcoatRoughness = 0.08;
      }
    }

    return mat;
  };

  sceneObj.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;

    bodyMeshes.push(obj);
    obj.castShadow = true;
    obj.receiveShadow = true;

    const sourceMaterials = Array.isArray(obj.material)
      ? obj.material
      : [obj.material];
    const configuredMaterials = sourceMaterials.map((mat) =>
      configureMaterial(mat, obj.name)
    );

    if (Array.isArray(obj.material)) {
      obj.material = configuredMaterials;
    } else {
      obj.material = configuredMaterials[0];
    }

    geometriesToDispose.add(obj.geometry);
  });

  const applyCarColor = (color: CarColor) => {
    paintMaterials.forEach((mat) => {
      if (color === 'red') {
        mat.color.setHex(0xd81f2a);
        mat.metalness = 0.72;
        mat.roughness = 0.22;
        mat.envMapIntensity = 1.5;
      } else if (color === 'black') {
        mat.color.setHex(0x202329);
        mat.metalness = 0.7;
        mat.roughness = 0.2;
        mat.envMapIntensity = 1.55;
      } else {
        // Bright metallic silver rather than flat pure white.
        mat.color.setHex(0xe3e9ef);
        mat.metalness = 0.76;
        mat.roughness = 0.19;
        mat.envMapIntensity = 1.75;
      }

      if (mat instanceof THREE.MeshPhysicalMaterial) {
        mat.clearcoat = 0.95;
        mat.clearcoatRoughness = color === 'black' ? 0.14 : 0.12;
        mat.reflectivity = 0.9;
        mat.ior = 1.5;
      }

      mat.needsUpdate = true;
    });
  };

  // Wheel animation state.
  let totalWheelSpinAngle = 0;
  const wheelRadius = 0.368 * CAR_MODEL_SCALE;
  const tempQuat = new THREE.Quaternion();

  const spinWheels = (distanceDelta: number) => {
    const deltaAngle = distanceDelta / wheelRadius;
    totalWheelSpinAngle += deltaAngle;
    tempQuat.setFromAxisAngle(WHEEL_SPIN_AXIS, totalWheelSpinAngle);

    for (let i = 0; i < wheels.length; i++) {
      wheels[i].node.quaternion
        .copy(wheels[i].restQuaternion)
        .multiply(tempQuat);
    }
  };

  const dispose = () => {
    sceneObj.traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj.geometry) {
        geometriesToDispose.add(obj.geometry);
      }
    });

    geometriesToDispose.forEach((geometry) => geometry.dispose());
    materialsToDispose.forEach((material) => material.dispose());
    root.clear();

    geometriesToDispose.clear();
    materialsToDispose.clear();
    materialReplacements.clear();
    processedMaterials.clear();
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
