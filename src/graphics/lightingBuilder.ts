import * as THREE from 'three';
import { GraphicsQuality } from '../types';

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
`;

export interface LightingOptions {
  scene: THREE.Scene;
  quality: GraphicsQuality;
}

export interface LightingObjects {
  group: THREE.Group;
  searchlights: THREE.Mesh[];
  update: (dt: number, time: number) => void;
  dispose: () => void;
}

interface BeamSpec {
  origin: THREE.Vector3;
  dir: THREE.Vector3;
  length: number;
  halfAngle: number;
  strength: number;
}

interface GlowSpec {
  position: THREE.Vector3;
  size: number;
  color: [number, number, number];
  blink?: number;
  streak?: number;
}

/**
 * Builds realistic volumetric light beams batched into an InstancedMesh.
 */
function createVolumetricBeams(
  name: string,
  color: [number, number, number],
  beams: BeamSpec[],
  timeUniform: { value: number },
  disposables: { dispose: () => void }[]
): THREE.InstancedMesh {
  const geometry = new THREE.CylinderGeometry(0.08, 1, 1, 32, 12, true);
  geometry.translate(0, -0.5, 0);
  geometry.rotateX(Math.PI); // Apex at (0, 0, 0), flares along +Y
  disposables.push(geometry);

  const strengths = new Float32Array(beams.map((b) => b.strength));
  geometry.setAttribute('beamStrength', new THREE.InstancedBufferAttribute(strengths, 1));

  const material = new THREE.ShaderMaterial({
    name: 'VolumetricBeamShader',
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    fog: false,
    uniforms: {
      time: timeUniform,
      color: { value: new THREE.Color().setRGB(color[0], color[1], color[2]) },
    },
    vertexShader: /* glsl */ `
      attribute float beamStrength;
      varying vec3 vWorld;
      varying vec3 vNormalW;
      varying float vAlong;
      varying float vStrength;

      void main() {
        vAlong = uv.y;
        vStrength = beamStrength;
        mat4 m = modelMatrix * instanceMatrix;
        vec3 s2 = vec3(dot(m[0].xyz, m[0].xyz), dot(m[1].xyz, m[1].xyz), dot(m[2].xyz, m[2].xyz));
        vNormalW = normalize(mat3(m) * (normal / s2));
        vec4 world = m * vec4(position, 1.0);
        vWorld = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float time;
      uniform vec3 color;
      varying vec3 vWorld;
      varying vec3 vNormalW;
      varying float vAlong;
      varying float vStrength;
      ${NOISE_GLSL}

      void main() {
        vec3 toCam = cameraPosition - vWorld;
        float camDist = length(toCam);
        float facing = abs(dot(normalize(vNormalW), toCam / camDist));
        float core = pow(facing, 2.4);
        float along = 1.0 - vAlong; // 0 at lamp, 1 at beam end
        float falloff = pow(clamp(1.0 - along, 0.0, 1.0), 1.6) * smoothstep(0.0, 0.03, along) / (0.35 + along * 3.0);
        float dust = fxNoise(vWorld * 0.18 + vec3(time * 0.1, time * 0.04, -time * 0.07));
        dust = 0.5 + 0.9 * dust * (0.6 + 0.8 * fxNoise(vWorld * 0.7 - vec3(0.0, time * 0.15, 0.0)));
        float ground = smoothstep(0.0, 1.8, vWorld.y);
        float nearFade = smoothstep(4.0, 18.0, camDist);
        float a = vStrength * core * falloff * dust * ground * nearFade;
        gl_FragColor = vec4(color * a, 1.0);
      }
    `,
  });
  disposables.push(material);

  const mesh = new THREE.InstancedMesh(geometry, material, beams.length);
  mesh.name = name;
  mesh.renderOrder = 25;
  mesh.frustumCulled = false;

  const UP = new THREE.Vector3(0, 1, 0);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const d = new THREE.Vector3();

  beams.forEach((beam, i) => {
    q.setFromUnitVectors(UP, d.copy(beam.dir).normalize());
    const radius = Math.tan(beam.halfAngle) * beam.length;
    mesh.setMatrixAt(i, m.compose(beam.origin, q, s.set(radius, beam.length, radius)));
  });
  mesh.instanceMatrix.needsUpdate = true;
  disposables.push(mesh);
  return mesh;
}

/**
 * Creates GPU-billboarded camera-facing glow halos for floodlights and safety beacons.
 */
function createGlowSprites(
  name: string,
  glows: GlowSpec[],
  timeUniform: { value: number },
  disposables: { dispose: () => void }[]
): THREE.InstancedMesh {
  const geometry = new THREE.PlaneGeometry(1, 1);
  disposables.push(geometry);

  const colors = new Float32Array(glows.length * 3);
  const params = new Float32Array(glows.length * 3);

  glows.forEach((glow, i) => {
    colors.set(glow.color, i * 3);
    params[i * 3] = glow.blink ?? 0;
    params[i * 3 + 1] = glow.streak ?? 0.05;
    params[i * 3 + 2] = (i * 0.6180339) % 1;
  });

  geometry.setAttribute('glowColor', new THREE.InstancedBufferAttribute(colors, 3));
  geometry.setAttribute('glowParams', new THREE.InstancedBufferAttribute(params, 3));

  const material = new THREE.ShaderMaterial({
    name: 'GlowSpriteShader',
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
    uniforms: {
      time: timeUniform,
    },
    vertexShader: /* glsl */ `
      attribute vec3 glowColor;
      attribute vec3 glowParams;
      uniform float time;
      varying vec3 vColor;
      varying vec2 vUv;
      varying float vStreak;

      void main() {
        vec4 center = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float size = length(instanceMatrix[0].xyz);

        // Keep distant lamps visible as pinpoints
        float pixelWorld = -center.z / projectionMatrix[1][1] * 2.0 / 900.0;
        size = max(size, 2.0 * pixelWorld);

        float blink = glowParams.x > 0.0
          ? 0.08 + 0.92 * smoothstep(0.35, 0.65, 0.5 + 0.5 * sin((time * glowParams.x + glowParams.z) * 6.2831853))
          : 1.0;
        vColor = glowColor * blink;
        vStreak = glowParams.y;
        vUv = position.xy * 2.0;

        center.xyz += normalize(-center.xyz) * min(size * 0.5, 0.8);
        center.xy += position.xy * size * vec2(1.0 + vStreak * 2.5, 1.0);
        gl_Position = projectionMatrix * center;
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vColor;
      varying vec2 vUv;
      varying float vStreak;

      void main() {
        vec2 p = vUv * vec2(1.0 + vStreak * 2.5, 1.0);
        float r = length(p);
        float core = exp(-r * r * 50.0) * 1.6;
        float halo = exp(-r * 4.2) * 0.35 * (1.0 - smoothstep(0.7, 1.0, r));
        float streak = vStreak * exp(-abs(vUv.y) * 36.0) * (1.0 - smoothstep(0.2, 1.0, abs(vUv.x))) * 0.7;
        float a = core + halo + streak;
        if (a < 0.002) discard;
        gl_FragColor = vec4(vColor * a, 1.0);
      }
    `,
  });
  disposables.push(material);

  const mesh = new THREE.InstancedMesh(geometry, material, glows.length);
  mesh.name = name;
  mesh.renderOrder = 30;
  mesh.frustumCulled = false;

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  glows.forEach((glow, i) => {
    mesh.setMatrixAt(i, m.compose(glow.position, q, s.setScalar(glow.size)));
  });
  mesh.instanceMatrix.needsUpdate = true;
  disposables.push(mesh);
  return mesh;
}

/**
 * Builds the stadium floodlight towers, volumetric light beams,
 * sky searchlight battery, and real 3D illumination rig.
 */
export function buildStadiumLighting({
  scene,
  quality,
}: LightingOptions): LightingObjects {
  const group = new THREE.Group();
  group.name = 'StadiumLightingSystem';
  scene.add(group);

  const disposables: { dispose: () => void }[] = [];
  const timeUniform = { value: 0 };

  // =========================================================================
  // 1. REAL 3D ILLUMINATION RIG (OPTIMIZED: NO EXCESSIVE LIGHTS)
  // =========================================================================

  // Ambient / Sky Fill
  const hemiLight = new THREE.HemisphereLight(0xb4d4f8, 0x141c2c, 2.0);
  group.add(hemiLight);

  // Key Stadium Directional Flood (casts crisp soft shadows in high quality)
  const keyDirectional = new THREE.DirectionalLight(0xf2f7ff, 2.8);
  keyDirectional.position.set(-50, 90, 60);
  keyDirectional.castShadow = quality === 'high';
  if (quality === 'high') {
    keyDirectional.shadow.mapSize.width = 1024;
    keyDirectional.shadow.mapSize.height = 1024;
    keyDirectional.shadow.camera.near = 1;
    keyDirectional.shadow.camera.far = 320;
    keyDirectional.shadow.camera.left = -140;
    keyDirectional.shadow.camera.right = 140;
    keyDirectional.shadow.camera.top = 140;
    keyDirectional.shadow.camera.bottom = -140;
    keyDirectional.shadow.bias = -0.0005;
  }
  group.add(keyDirectional);

  // Strong Rim / Back Light so car silhouette and edges remain tack-sharp in air
  const rimLight = new THREE.DirectionalLight(0xffffff, 3.2);
  rimLight.position.set(-30, 75, -80);
  group.add(rimLight);

  // Red accent point lights (near ramp apex and touchdown zone)
  const neonRed1 = new THREE.PointLight(0xff2a55, 3.5, 140);
  neonRed1.position.set(-40, 24, 0);
  group.add(neonRed1);

  const neonRed2 = new THREE.PointLight(0xff2a55, 3.0, 140);
  neonRed2.position.set(100, 35, 0);
  group.add(neonRed2);

  // 3 Key Real SpotLights along track for authentic pools of light on tarmac
  const trackSpots: { pos: THREE.Vector3; target: THREE.Vector3; intensity: number; angle: number }[] = [
    { pos: new THREE.Vector3(-220, 38, -28), target: new THREE.Vector3(-240, 0, 0), intensity: 4.5, angle: 0.55 },
    { pos: new THREE.Vector3(-15, 42, 26), target: new THREE.Vector3(-40, 16, 0), intensity: 5.2, angle: 0.58 },
    { pos: new THREE.Vector3(220, 40, -28), target: new THREE.Vector3(250, 0, 0), intensity: 4.8, angle: 0.55 },
  ];

  trackSpots.forEach((ts) => {
    const spot = new THREE.SpotLight(0xdbe9f8, ts.intensity, 120, ts.angle, 0.45, 1.2);
    spot.position.copy(ts.pos);
    spot.target.position.copy(ts.target);
    group.add(spot);
    group.add(spot.target);
  });

  // =========================================================================
  // 2. STADIUM FLOODLIGHT TOWERS & TRIPOD BANKS
  // =========================================================================

  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  disposables.push(boxGeo);

  const trailerMat = new THREE.MeshStandardMaterial({
    color: 0x1f242d,
    roughness: 0.65,
    metalness: 0.45,
  });
  disposables.push(trailerMat);

  const mastMat = new THREE.MeshStandardMaterial({
    color: 0x76808e,
    roughness: 0.42,
    metalness: 0.75,
  });
  disposables.push(mastMat);

  const housingMat = new THREE.MeshStandardMaterial({
    color: 0x22272e,
    roughness: 0.5,
    metalness: 0.6,
  });
  disposables.push(housingMat);

  const lensMat = new THREE.MeshBasicMaterial({
    color: 0xf5faff,
    toneMapped: false, // Triggers bloom cleanly
  });
  disposables.push(lensMat);

  const beaconRedMat = new THREE.MeshBasicMaterial({
    color: 0xff142a,
    toneMapped: false,
  });
  disposables.push(beaconRedMat);

  const beamSpecs: BeamSpec[] = [];
  const glowSpecs: GlowSpec[] = [];

  // Tower specifications along runway, ramp and landing track
  const towers = [
    { base: new THREE.Vector3(-220, 0, -28), height: 38, aim: new THREE.Vector3(-240, 0, 0), lamps: 6 },
    { base: new THREE.Vector3(-140, 0, 26), height: 36, aim: new THREE.Vector3(-150, 0, 0), lamps: 6 },
    { base: new THREE.Vector3(-18, 0, 26), height: 42, aim: new THREE.Vector3(-35, 18, 0), lamps: 8 },
    { base: new THREE.Vector3(20, 0, -28), height: 42, aim: new THREE.Vector3(30, 20, 0), lamps: 8 },
    { base: new THREE.Vector3(220, 0, -28), height: 40, aim: new THREE.Vector3(250, 0, 0), lamps: 6 },
    { base: new THREE.Vector3(380, 0, 26), height: 38, aim: new THREE.Vector3(390, 0, 0), lamps: 6 },
  ];

  towers.forEach((t) => {
    const towerGroup = new THREE.Group();
    towerGroup.position.copy(t.base);
    group.add(towerGroup);

    // Mobile Trailer Chassis
    const chassis = new THREE.Mesh(boxGeo, trailerMat);
    chassis.position.set(0, 1.2, 0);
    chassis.scale.set(7.5, 2.2, 4.2);
    chassis.receiveShadow = true;
    towerGroup.add(chassis);

    // 4 Extended Stabilizer Outriggers
    for (const sx of [-4.2, 4.2]) {
      for (const sz of [-2.4, 2.4]) {
        const outrigger = new THREE.Mesh(boxGeo, housingMat);
        outrigger.position.set(sx, 0.4, sz);
        outrigger.scale.set(1.4, 0.6, 1.4);
        towerGroup.add(outrigger);
      }
    }

    // Vertical Telescopic Lattice Mast
    const mast = new THREE.Mesh(boxGeo, mastMat);
    mast.position.set(0, t.height / 2 + 1.2, 0);
    mast.scale.set(0.9, t.height, 0.9);
    mast.castShadow = quality === 'high';
    towerGroup.add(mast);

    // Cross-arm crossbar at top
    const crossBar = new THREE.Mesh(boxGeo, mastMat);
    crossBar.position.set(0, t.height + 1.2, 0);
    crossBar.scale.set(t.lamps > 6 ? 8.5 : 6.5, 0.5, 0.5);
    towerGroup.add(crossBar);

    // Aviation safety beacon atop mast
    const beacon = new THREE.Mesh(boxGeo, beaconRedMat);
    beacon.position.set(0, t.height + 2.4, 0);
    beacon.scale.set(0.8, 1.2, 0.8);
    towerGroup.add(beacon);

    glowSpecs.push({
      position: new THREE.Vector3(t.base.x, t.base.y + t.height + 2.4, t.base.z),
      size: 1.8,
      color: [1.0, 0.05, 0.1],
      blink: 0.5,
    });

    // Aim direction of floodlight head
    const headPosWorld = new THREE.Vector3(t.base.x, t.height + 1.2, t.base.z);
    const aimDir = t.aim.clone().sub(headPosWorld).normalize();

    // Multi-lamp Floodlight Bank (Array of flood housings + lenses)
    const cols = t.lamps / 2;
    const spacingX = 1.3;
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < 2; r++) {
        const lx = (c - (cols - 1) / 2) * spacingX;
        const ly = t.height + 0.8 + r * 1.3;

        const lampHousing = new THREE.Mesh(boxGeo, housingMat);
        lampHousing.position.set(lx, ly, 0);
        lampHousing.scale.set(1.1, 1.1, 0.8);
        lampHousing.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), aimDir);
        towerGroup.add(lampHousing);

        const lens = new THREE.Mesh(boxGeo, lensMat);
        lens.position.set(0, 0, 0.42);
        lens.scale.set(0.92, 0.92, 0.05);
        lampHousing.add(lens);
      }
    }

    // Add halo glow at head center
    glowSpecs.push({
      position: headPosWorld.clone().addScaledVector(aimDir, 0.8),
      size: 6.5,
      color: [0.95, 0.98, 1.0],
      streak: 0.08,
    });

    // Add volumetric flood beam cone
    const beamDist = headPosWorld.distanceTo(t.aim);
    beamSpecs.push({
      origin: headPosWorld.clone().addScaledVector(aimDir, 0.5),
      dir: aimDir,
      length: Math.max(35, beamDist + 15),
      halfAngle: 0.38,
      strength: 0.12,
    });
  });

  // Low-level Tripod Flood Banks along lane edges
  const tripodPositions = [
    { pos: new THREE.Vector3(-95, 0, -14), aim: new THREE.Vector3(-85, 4, 0) },
    { pos: new THREE.Vector3(-45, 0, 14), aim: new THREE.Vector3(-55, 6, 0) },
    { pos: new THREE.Vector3(120, 0, -14), aim: new THREE.Vector3(140, 2, 0) },
    { pos: new THREE.Vector3(300, 0, 14), aim: new THREE.Vector3(315, 2, 0) },
  ];

  tripodPositions.forEach((tp) => {
    const tripod = new THREE.Group();
    tripod.position.copy(tp.pos);
    group.add(tripod);

    // 3 steel legs
    for (let k = 0; k < 3; k++) {
      const a = (k * Math.PI * 2) / 3;
      const leg = new THREE.Mesh(boxGeo, mastMat);
      leg.position.set(Math.cos(a) * 0.9, 1.8, Math.sin(a) * 0.9);
      leg.scale.set(0.18, 3.8, 0.18);
      tripod.add(leg);
    }

    // Flood fixture head
    const head = new THREE.Mesh(boxGeo, housingMat);
    head.position.set(0, 3.8, 0);
    head.scale.set(2.4, 1.4, 0.6);
    const dir = tp.aim.clone().sub(new THREE.Vector3(tp.pos.x, 3.8, tp.pos.z)).normalize();
    head.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
    tripod.add(head);

    const lens = new THREE.Mesh(boxGeo, lensMat);
    lens.position.set(0, 0, 0.32);
    lens.scale.set(2.2, 1.2, 0.05);
    head.add(lens);

    glowSpecs.push({
      position: new THREE.Vector3(tp.pos.x, 3.8, tp.pos.z).addScaledVector(dir, 0.4),
      size: 4.2,
      color: [0.92, 0.96, 1.0],
      streak: 0.05,
    });

    beamSpecs.push({
      origin: new THREE.Vector3(tp.pos.x, 3.8, tp.pos.z).addScaledVector(dir, 0.3),
      dir,
      length: 24,
      halfAngle: 0.35,
      strength: 0.08,
    });
  });

  // =========================================================================
  // 3. SKY SEARCHLIGHT BATTERY (SWEEPING VOLUMETRIC BEAMS)
  // =========================================================================

  const searchlightObjects: THREE.Mesh[] = [];
  const skyBeams: BeamSpec[] = [];

  const skySearchlights = [
    { pos: new THREE.Vector3(-140, 0, -65), baseDir: new THREE.Vector3(0.28, 1.0, 0.08).normalize(), length: 280 },
    { pos: new THREE.Vector3(-30, 0, -70), baseDir: new THREE.Vector3(-0.25, 1.0, 0.12).normalize(), length: 290 },
    { pos: new THREE.Vector3(80, 0, -70), baseDir: new THREE.Vector3(0.32, 1.0, -0.05).normalize(), length: 290 },
    { pos: new THREE.Vector3(220, 0, -65), baseDir: new THREE.Vector3(-0.22, 1.0, 0.1).normalize(), length: 280 },
  ];

  skySearchlights.forEach((sl) => {
    // Housing pedestal
    const pedestal = new THREE.Mesh(boxGeo, trailerMat);
    pedestal.position.set(sl.pos.x, 1.5, sl.pos.z);
    pedestal.scale.set(3.2, 3.0, 3.2);
    group.add(pedestal);

    // Barrel housing
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.4, 2.6, 16), housingMat);
    barrel.position.set(sl.pos.x, 4.0, sl.pos.z);
    barrel.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), sl.baseDir);
    group.add(barrel);
    searchlightObjects.push(barrel);
    disposables.push(barrel.geometry);

    // Giant searchlight lens
    const bigLens = new THREE.Mesh(new THREE.CircleGeometry(1.2, 16), lensMat);
    bigLens.position.set(0, 1.32, 0);
    bigLens.rotation.x = -Math.PI / 2;
    barrel.add(bigLens);
    disposables.push(bigLens.geometry);

    glowSpecs.push({
      position: new THREE.Vector3(sl.pos.x, 4.0, sl.pos.z),
      size: 9.0,
      color: [0.85, 0.92, 1.0],
      streak: 0.12,
    });

    skyBeams.push({
      origin: new THREE.Vector3(sl.pos.x, 4.5, sl.pos.z),
      dir: sl.baseDir,
      length: sl.length,
      halfAngle: 0.045, // Narrow long shaft
      strength: 0.16,
    });
  });

  // Batch all volumetric beams into 1 InstancedMesh (in high quality)
  if (quality === 'high') {
    const allBeams = [...beamSpecs, ...skyBeams];
    const beamMesh = createVolumetricBeams(
      'AllVolumetricBeams',
      [0.85, 0.92, 1.0],
      allBeams,
      timeUniform,
      disposables
    );
    group.add(beamMesh);
  }

  // Batch all glow halo sprites into 1 InstancedMesh
  const glowMesh = createGlowSprites('AllFixtureGlows', glowSpecs, timeUniform, disposables);
  group.add(glowMesh);

  // Return lifecycle object
  return {
    group,
    searchlights: searchlightObjects,

    update: (dt: number, time: number) => {
      timeUniform.value += dt;

      // Subtle searchlight barrel sweeps
      searchlightObjects.forEach((barrel, idx) => {
        const offset = idx * 1.5;
        const sweepAngle = Math.sin(time * 0.0006 + offset) * 0.14;
        const pitchAngle = Math.cos(time * 0.0004 + offset) * 0.08;
        barrel.rotation.z = sweepAngle;
        barrel.rotation.x = pitchAngle;
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
