import * as THREE from 'three';
import { GraphicsQuality } from '../types';

/**
 * GLSL Procedural Noise functions for sky starfield, Milky Way haze, and horizon sodium bloom.
 */
const NOISE_GLSL = /* glsl */ `
float fxHash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float fxNoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(
      mix(fxHash(i), fxHash(i + vec3(1.0, 0.0, 0.0)), f.x),
      mix(fxHash(i + vec3(0.0, 1.0, 0.0)), fxHash(i + vec3(1.0, 1.0, 0.0)), f.x),
      f.y
    ),
    mix(
      mix(fxHash(i + vec3(0.0, 0.0, 1.0)), fxHash(i + vec3(1.0, 0.0, 1.0)), f.x),
      mix(fxHash(i + vec3(0.0, 1.0, 1.0)), fxHash(i + vec3(1.0, 1.0, 1.0)), f.x),
      f.y
    ),
    f.z
  );
}

float fxHash2(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float fxNoise2(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(fxHash2(i), fxHash2(i + vec2(1.0, 0.0)), f.x),
    mix(fxHash2(i + vec2(0.0, 1.0)), fxHash2(i + vec2(1.0, 1.0)), f.x),
    f.y
  );
}
`;

export interface BackdropOptions {
  scene: THREE.Scene;
  quality: GraphicsQuality;
}

export interface BackdropObjects {
  group: THREE.Group;
  update: (dt: number, time: number) => void;
  dispose: () => void;
}

/**
 * Creates the cinematic night sky dome, distant mountain silhouettes,
 * industrial rocket test stand silhouettes, and distant blinking beacons.
 */
export function buildCinematicBackdrop({
  scene,
  quality,
}: BackdropOptions): BackdropObjects {
  const group = new THREE.Group();
  group.name = 'CinematicBackdrop';
  scene.add(group);

  const disposables: { dispose: () => void }[] = [];
  const timeUniform = { value: 0 };

  // =========================================================================
  // 1. DEEP MIDNIGHT SKY DOME WITH PROCEDURAL STARS & ATMOSPHERIC GLOW
  // =========================================================================

  let skyMesh: THREE.Mesh;
  if (quality === 'high') {
    const skyGeo = new THREE.SphereGeometry(1400, 48, 24);
    disposables.push(skyGeo);

    const skyMat = new THREE.ShaderMaterial({
      name: 'NightSkyDome',
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        time: timeUniform,
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          // Force sky depth to far plane (z = w)
          gl_Position = p.xyww;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float time;
        varying vec3 vDir;
        ${NOISE_GLSL}

        vec3 starLayer(vec3 d, float scale, float threshold) {
          vec3 p = d * scale;
          vec3 cell = floor(p);
          vec3 f = fract(p) - 0.5;
          float h = fxHash(cell);
          if (h < threshold) return vec3(0.0);
          vec3 offset = vec3(fxHash(cell + 1.7), fxHash(cell + 3.1), fxHash(cell + 5.3)) - 0.5;
          float r = length(f - offset * 0.7);
          float twinkle = 0.65 + 0.35 * sin(time * (1.5 + h * 5.0) + h * 40.0);
          float b = smoothstep(0.09, 0.0, r) * (h - threshold) / (1.0 - threshold);
          vec3 tint = mix(vec3(0.75, 0.85, 1.0), vec3(1.0, 0.9, 0.75), fxHash(cell + 9.0));
          return tint * b * twinkle;
        }

        void main() {
          vec3 d = normalize(vDir);
          float h = d.y;

          // Midnight gradient
          vec3 zenith = vec3(0.0004, 0.0007, 0.0018);
          vec3 horizon = vec3(0.0055, 0.0062, 0.011);
          vec3 col = mix(horizon, zenith, smoothstep(0.0, 0.45, h));

          // Subtle sodium glow on the horizon from distant launch site & town
          float az = atan(d.z, d.x);
          float town = pow(max(0.0, cos(az - 2.4)), 6.0) * 0.055 + pow(max(0.0, cos(az + 0.9)), 10.0) * 0.035;
          col += vec3(1.0, 0.55, 0.25) * town * 0.5 * exp(-max(h, 0.0) * 16.0);
          col += vec3(0.025, 0.005, 0.008) * exp(-max(h, 0.0) * 22.0) * (0.6 + 0.4 * cos(az * 2.0));

          // High thin haze and hint of the Milky Way band
          float bd = dot(d, normalize(vec3(0.35, 0.55, -0.76))) * 3.2;
          float band = exp(-bd * bd);
          float milky = band * (0.4 + 0.6 * fxNoise(d * 9.0)) * (0.5 + 0.5 * fxNoise(d * 28.0));
          col += vec3(0.016, 0.018, 0.025) * milky * smoothstep(0.05, 0.35, h);

          // Star layers (twinkling procedural pinpoints)
          if (h > -0.02) {
            float fade = smoothstep(-0.02, 0.12, h);
            vec3 stars = starLayer(d, 180.0, 0.965) +
                         starLayer(d, 420.0, 0.985) * 0.8 +
                         milky * starLayer(d, 700.0, 0.97) * 0.6;
            col += stars * fade * 2.4;
          }

          // Faint haze band right at the horizon so distant hills read as true silhouettes
          col += vec3(0.012, 0.011, 0.015) * exp(-abs(h) * 28.0);
          col = mix(col, vec3(0.004, 0.0045, 0.006), smoothstep(0.0, -0.05, h));

          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    disposables.push(skyMat);

    skyMesh = new THREE.Mesh(skyGeo, skyMat);
    skyMesh.name = 'NightSkyDome';
    skyMesh.renderOrder = 1000;
    skyMesh.frustumCulled = false;
    group.add(skyMesh);
  } else {
    // Low quality fallback: smooth vertex-colored sky dome
    const skyGeo = new THREE.SphereGeometry(1400, 32, 16);
    disposables.push(skyGeo);
    const skyMat = new THREE.MeshBasicMaterial({
      color: 0x050811,
      side: THREE.BackSide,
      depthWrite: false,
    });
    disposables.push(skyMat);
    skyMesh = new THREE.Mesh(skyGeo, skyMat);
    group.add(skyMesh);
  }

  // =========================================================================
  // 2. DISTANT ROLLING HILLS (HORIZON SILHOUETTE)
  // =========================================================================

  const hillSegments = 160;
  const hillRadius = 1250;
  const hillPositions: number[] = [];
  const hillIndices: number[] = [];

  for (let i = 0; i <= hillSegments; i++) {
    const a = (i / hillSegments) * Math.PI * 2;
    // Layered sine waves for organic ridge lines
    const h =
      8 +
      24 * (0.5 + 0.5 * Math.sin(a * 4 + 1.2)) * (0.6 + 0.4 * Math.cos(a * 7 - 0.5)) +
      14 * Math.sin(a * 2 + 0.4) +
      6 * Math.sin(a * 11 + 2.1);

    const cosA = Math.cos(a) * hillRadius;
    const sinA = Math.sin(a) * hillRadius;

    // Bottom vertex
    hillPositions.push(cosA, -10, sinA);
    // Top ridge vertex
    hillPositions.push(cosA, h, sinA);
  }

  for (let i = 0; i < hillSegments; i++) {
    const k = i * 2;
    hillIndices.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
  }

  const hillGeo = new THREE.BufferGeometry();
  hillGeo.setAttribute('position', new THREE.Float32BufferAttribute(hillPositions, 3));
  hillGeo.setIndex(hillIndices);
  disposables.push(hillGeo);

  const hillMat = new THREE.MeshBasicMaterial({
    color: 0x020305,
    fog: false,
    side: THREE.DoubleSide,
  });
  disposables.push(hillMat);

  const hillMesh = new THREE.Mesh(hillGeo, hillMat);
  hillMesh.name = 'DistantHills';
  hillMesh.renderOrder = -5;
  hillMesh.frustumCulled = false;
  group.add(hillMesh);

  // =========================================================================
  // 3. DISTANT EVENT & TEST-SITE STRUCTURE SILHOUETTES (STANDS, TANKS, TOWERS)
  // =========================================================================

  const silhouetteMat = new THREE.MeshBasicMaterial({
    color: 0x010203,
    fog: false,
  });
  disposables.push(silhouetteMat);

  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  disposables.push(boxGeo);

  const cylinderGeo = new THREE.CylinderGeometry(1, 1, 1, 16);
  disposables.push(cylinderGeo);

  const sphereGeo = new THREE.SphereGeometry(1, 16, 12);
  disposables.push(sphereGeo);

  const structureMatrices: THREE.Matrix4[] = [];
  const beaconMeshes: { mesh: THREE.Mesh; rate: number; phase: number }[] = [];

  const addBox = (
    pos: THREE.Vector3,
    size: THREE.Vector3,
    yaw = 0
  ) => {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    m.compose(pos, q, size);
    structureMatrices.push(m);
  };

  const addBeacon = (pos: THREE.Vector3, rate = 0.5) => {
    const beaconMat = new THREE.MeshBasicMaterial({
      color: 0xff142a,
      toneMapped: false,
    });
    disposables.push(beaconMat);
    const bMesh = new THREE.Mesh(sphereGeo, beaconMat);
    bMesh.position.copy(pos);
    bMesh.scale.set(1.4, 1.4, 1.4);
    group.add(bMesh);
    beaconMeshes.push({ mesh: bMesh, rate, phase: Math.random() * Math.PI * 2 });
  };

  // Helper to place test stand structures
  const buildTestStand = (
    centerX: number,
    centerZ: number,
    height: number,
    width: number
  ) => {
    // Main tower column
    addBox(new THREE.Vector3(centerX, height / 2, centerZ), new THREE.Vector3(width, height, width));
    // Engine firing platform deck
    addBox(
      new THREE.Vector3(centerX, height * 0.55, centerZ + width * 0.6),
      new THREE.Vector3(width * 1.8, 2.5, width * 1.8)
    );
    // Overhead crane boom
    addBox(
      new THREE.Vector3(centerX - width * 0.8, height * 0.88, centerZ),
      new THREE.Vector3(width * 2.5, 2.0, 2.0),
      0.3
    );
    // Lightning mast at top
    addBox(
      new THREE.Vector3(centerX + width * 0.3, height + 10, centerZ),
      new THREE.Vector3(1.2, 20, 1.2)
    );
    // Aviation beacon atop lightning mast
    addBeacon(new THREE.Vector3(centerX + width * 0.3, height + 20, centerZ), 0.5);
  };

  // Stand 1: Far behind runway (north-west)
  buildTestStand(-380, -420, 85, 16);

  // Stand 2: Distant behind landing area (north-east)
  buildTestStand(420, -460, 95, 18);

  // Stand 3: South horizon
  buildTestStand(120, 520, 75, 14);

  // Distant Water Tower
  const wtX = -120;
  const wtZ = -540;
  const wtHeight = 65;
  // 4 Legs
  for (const dx of [-6, 6]) {
    for (const dz of [-6, 6]) {
      addBox(
        new THREE.Vector3(wtX + dx, wtHeight / 2, wtZ + dz),
        new THREE.Vector3(1.5, wtHeight, 1.5)
      );
    }
  }
  // Elevated spherical tank
  const tankMesh = new THREE.Mesh(sphereGeo, silhouetteMat);
  tankMesh.position.set(wtX, wtHeight + 10, wtZ);
  tankMesh.scale.set(16, 16, 16);
  group.add(tankMesh);
  addBeacon(new THREE.Vector3(wtX, wtHeight + 27, wtZ), 0.7);

  // Cryogenic Propellant Tank Farm (Sphere & Cylinders)
  const tfX = -260;
  const tfZ = -380;
  for (let i = 0; i < 3; i++) {
    const sphereTank = new THREE.Mesh(sphereGeo, silhouetteMat);
    sphereTank.position.set(tfX + i * 28, 12, tfZ);
    sphereTank.scale.set(12, 12, 12);
    group.add(sphereTank);
  }
  for (let j = 0; j < 2; j++) {
    const bulletTank = new THREE.Mesh(cylinderGeo, silhouetteMat);
    bulletTank.position.set(tfX + 90, 8, tfZ + j * 20);
    bulletTank.scale.set(7, 36, 7);
    bulletTank.rotation.z = Math.PI / 2;
    group.add(bulletTank);
  }

  // Batch structure box members into 1 InstancedMesh
  if (structureMatrices.length > 0) {
    const structInstanced = new THREE.InstancedMesh(boxGeo, silhouetteMat, structureMatrices.length);
    structInstanced.name = 'DistantSiteStructures';
    structureMatrices.forEach((mat, i) => structInstanced.setMatrixAt(i, mat));
    structInstanced.instanceMatrix.needsUpdate = true;
    group.add(structInstanced);
    disposables.push(structInstanced);
  }

  // Lifecycle return
  return {
    group,

    update: (dt: number, time: number) => {
      timeUniform.value += dt;

      // Pulse red aviation beacons
      const nowSec = time * 0.001;
      beaconMeshes.forEach((b) => {
        const pulse = Math.sin(nowSec * b.rate * Math.PI * 2 + b.phase);
        const isOn = pulse > 0.15;
        const mat = b.mesh.material as THREE.MeshBasicMaterial;
        if (isOn) {
          mat.color.setRGB(1.0, 0.08, 0.16);
        } else {
          mat.color.setRGB(0.12, 0.01, 0.02);
        }
      });
    },

    dispose: () => {
      scene.remove(group);
      group.clear();
      disposables.forEach((d) => {
        try {
          d.dispose();
        } catch {
          // ignore
        }
      });
      disposables.length = 0;
    },
  };
}
