import * as THREE from 'three';
import { GraphicsQuality } from '../types';

/**
 * GLSL Procedural 2D/3D Noise functions adapted from the reference project.
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

export interface EffectsOptions {
  scene: THREE.Scene;
  quality: GraphicsQuality;
}

export interface EffectsUpdateState {
  thrustActive: boolean;
  thrusterGas: number; // 0 to 1
  carPosition: THREE.Vector3;
  carRotationZ: number;
  altitudeFt: number;
  anchors?: THREE.Object3D[] | null;
  carGroup?: THREE.Group | null;
  camera?: THREE.Camera | null;
}

export interface ThrusterEffectsSystem {
  group: THREE.Group;
  update: (dt: number, state: EffectsUpdateState) => void;
  setQuality: (quality: GraphicsQuality) => void;
  triggerLanding: (position: THREE.Vector3, intensity: number) => void;
  dispose: () => void;
}

interface VaporParticle {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  size: number;
  maxSize: number;
  life: number;
  maxLife: number;
  seed: number;
  opacity: number;
  lightJet: number;
  lightRed: number;
  lightFlood: number;
  lightInner: number;
}

const MAX_VAPOR_COUNT = 180;

/**
 * Creates an open cylinder for nozzle jets:
 * Nozzle exit at origin (0, 0, 0), plume exhaust extends along -Y.
 */
function createJetCylinder(r0: number, r1: number, segments = 24): THREE.CylinderGeometry {
  const geo = new THREE.CylinderGeometry(r0, r1, 1.0, segments, 10, true);
  geo.translate(0, -0.5, 0); // Origin at top (nozzle exit), exhaust downward
  return geo;
}

export function createEffectsSystem({
  scene,
  quality: initialQuality,
}: EffectsOptions): ThrusterEffectsSystem {
  const rootGroup = new THREE.Group();
  rootGroup.name = 'ThrusterEffectsSystem';
  scene.add(rootGroup);

  const disposables: { dispose: () => void }[] = [];
  let currentQuality = initialQuality;

  const timeUniform = { value: 0 };
  const intensityUniform = { value: 0 };
  const lengthUniform = { value: 3.2 };
  const flareUniform = { value: 0 };
  const freeUniform = { value: 1.0 };
  const liteUniform = { value: currentQuality === 'high' ? 0.0 : 1.0 };

  // =========================================================================
  // 1. SUPERSONIC JET CORE MATERIAL (Electric blue-white with shock diamonds)
  // =========================================================================

  const coreGeo = createJetCylinder(0.12, 0.22, 20);
  disposables.push(coreGeo);

  const coreMat = new THREE.ShaderMaterial({
    name: 'JetCoreShader',
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    fog: false,
    uniforms: {
      time: timeUniform,
      intensity: intensityUniform,
      length: lengthUniform,
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vWorld;
      varying vec3 vNormalW;

      void main() {
        vUv = uv;
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        vec3 s = vec3(
          dot(modelMatrix[0].xyz, modelMatrix[0].xyz),
          dot(modelMatrix[1].xyz, modelMatrix[1].xyz),
          dot(modelMatrix[2].xyz, modelMatrix[2].xyz)
        );
        vNormalW = normalize(mat3(modelMatrix) * (normal / max(s, vec3(1e-6))));
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float time;
      uniform float intensity;
      uniform float length;
      varying vec2 vUv;
      varying vec3 vWorld;
      varying vec3 vNormalW;

      void main() {
        if (intensity < 0.005) discard;
        vec3 V = normalize(cameraPosition - vWorld);
        float facing = abs(dot(normalize(vNormalW), V));
        float r = 1.0 - facing;
        float along = 1.0 - vUv.y;
        float d = along * length;

        // Shock diamond standing wave pattern
        float ph = fract(d / 0.42 - time * 0.5);
        float pinch = abs(ph - 0.5) * 2.0;
        float width = 0.2 + 0.55 * pinch;
        float inner = smoothstep(width, width - 0.28, r);
        float knot = pow(1.0 - pinch, 5.0);

        // High frequency cold-gas thruster flicker
        float flick = 0.94 + 0.06 * sin(d * 16.0 - time * 8.0);
        float bright = (inner * (0.6 + 1.8 * knot) + 0.25 * facing) * exp(-along * 2.5) * smoothstep(0.0, 0.04, along) * flick;

        // Electric cyan-blue core transitioning to pure white
        vec3 col = mix(vec3(0.32, 0.65, 1.0), vec3(1.0, 0.98, 1.0), inner * (0.35 + 0.65 * knot));
        gl_FragColor = vec4(col * bright * intensity * 4.2, 1.0);
      }
    `,
  });
  disposables.push(coreMat);

  // =========================================================================
  // 2. BILLOWING VAPOR PLUME MATERIAL (Turbulent steam with ground flaring)
  // =========================================================================

  const plumeGeo = createJetCylinder(0.16, 0.55, 24);
  disposables.push(plumeGeo);

  const plumeMat = new THREE.ShaderMaterial({
    name: 'JetPlumeShader',
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.NormalBlending,
    premultipliedAlpha: true,
    fog: false,
    uniforms: {
      time: timeUniform,
      intensity: intensityUniform,
      length: lengthUniform,
      flare: flareUniform,
      free: freeUniform,
      lite: liteUniform,
    },
    vertexShader: /* glsl */ `
      uniform float length;
      uniform float time;
      uniform float flare;
      uniform float free;
      varying vec2 vUv;
      varying vec3 vWorld;
      varying vec3 vNormalW;

      void main() {
        vUv = uv;
        float along = 1.0 - uv.y;
        float d = along * length;

        // Flare outward near ground, billow along column
        float spread = (1.0 - free * 0.6) * (1.0 + flare * 2.8 * smoothstep(length - 1.2, length, d) + free * d * 0.45);
        float billow = 1.0 + 0.12 * sin(d * 4.0 - time * 7.0) * sin(uv.x * 6.2831853 * 3.0 + d * 2.0);
        vec3 p = vec3(position.x * spread * billow, position.y, position.z * spread * billow);

        vec4 world = modelMatrix * vec4(p, 1.0);
        vWorld = world.xyz;
        vec3 s = vec3(
          dot(modelMatrix[0].xyz, modelMatrix[0].xyz),
          dot(modelMatrix[1].xyz, modelMatrix[1].xyz),
          dot(modelMatrix[2].xyz, modelMatrix[2].xyz)
        );
        vNormalW = normalize(mat3(modelMatrix) * (normal / max(s, vec3(1e-6))));
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float time;
      uniform float intensity;
      uniform float length;
      uniform float free;
      uniform float lite;
      varying vec2 vUv;
      varying vec3 vWorld;
      varying vec3 vNormalW;
      ${NOISE_GLSL}

      void main() {
        if (intensity < 0.005) discard;
        vec3 V = normalize(cameraPosition - vWorld);
        float facing = abs(dot(normalize(vNormalW), V));
        float along = 1.0 - vUv.y;
        float d = along * length;
        float a = vUv.x * 6.2831853;

        // Billowing turbulent noise
        vec3 q = vec3(cos(a) * 1.8, sin(a) * 1.8, d * 2.2 - time * 7.5);
        float n = fxNoise(q) * 0.55 + fxNoise(q * 2.2 + 5.0) * 0.3 + fxNoise(q * 4.8 - 2.0) * 0.15;

        float density = smoothstep(0.18, 0.72, facing + (n - 0.5) * 0.9);
        float alpha = density * (0.55 + 0.45 * n) * smoothstep(0.0, 0.04, along) * (1.0 - 0.4 * smoothstep(0.75, 1.0, along));
        alpha *= smoothstep(-0.05, 0.3, vWorld.y) * clamp(intensity * 1.35, 0.0, 1.0) * 0.65 * exp(-max(0.0, d - 0.8) * (0.25 + free * 0.2));

        // Shading: lit white vapor, subtle cyan at nozzle
        vec3 c = mix(vec3(0.85, 0.92, 1.0), vec3(0.93, 0.95, 0.98), smoothstep(0.0, 0.35, along)) * (0.65 + 0.4 * n);
        c = mix(c, vec3(0.58, 0.82, 1.0) * (0.95 + 0.55 * n), free * 0.85);

        // Core bright glow
        c += vec3(0.6, 0.82, 1.0) * pow(facing, 3.8) * exp(-along * 5.0) * 1.3;
        if (alpha < 0.003) discard;
        gl_FragColor = vec4(c * alpha, alpha);
      }
    `,
  });
  disposables.push(plumeMat);

  // =========================================================================
  // 3. FOUR NOZZLE JET RIG (Core + Plume meshes for each nozzle)
  // =========================================================================

  const nozzleJets: THREE.Group[] = [];
  // Keep the thruster exhaust clustered under the car body so the plume sits
  // centered on the underside instead of spraying from the outer corners.
  const defaultNozzleOffsets = [
    new THREE.Vector3(-0.5, 0.12, -0.32),
    new THREE.Vector3(-0.5, 0.12, 0.32),
    new THREE.Vector3(0.5, 0.12, -0.32),
    new THREE.Vector3(0.5, 0.12, 0.32),
  ];

  for (let i = 0; i < 4; i++) {
    const jetGroup = new THREE.Group();
    jetGroup.name = `ColdGasJet_${i + 1}`;

    const coreMesh = new THREE.Mesh(coreGeo, coreMat);
    coreMesh.name = 'CoreMesh';
    coreMesh.renderOrder = 22;
    jetGroup.add(coreMesh);

    const plumeMesh = new THREE.Mesh(plumeGeo, plumeMat);
    plumeMesh.name = 'PlumeMesh';
    plumeMesh.renderOrder = 21;
    jetGroup.add(plumeMesh);

    jetGroup.visible = false;
    rootGroup.add(jetGroup);
    nozzleJets.push(jetGroup);
  }

  // =========================================================================
  // 4. GROUND VAPOR CLOUD SYSTEM (Vapor-Lit Atlas Particles)
  // =========================================================================

  // Load the reference vapor atlas texture
  const textureLoader = new THREE.TextureLoader();
  const vaporTexture = textureLoader.load('/textures/vapor-lit.png');
  vaporTexture.wrapS = THREE.ClampToEdgeWrapping;
  vaporTexture.wrapT = THREE.ClampToEdgeWrapping;
  vaporTexture.colorSpace = THREE.NoColorSpace;
  disposables.push(vaporTexture);

  const vaporMat = new THREE.ShaderMaterial({
    name: 'VaporBillboardShader',
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.NormalBlending,
    premultipliedAlpha: true,
    fog: false,
    uniforms: {
      time: timeUniform,
      lite: liteUniform,
      atlas: { value: vaporTexture },
      useAtlas: { value: 1.0 },
      flood: { value: new THREE.Vector3(0.85, 0.9, 0.98) },
      jetColor: { value: new THREE.Vector3(0.55, 0.8, 1.0) },
      redColor: { value: new THREE.Vector3(1.0, 0.08, 0.14) },
    },
    vertexShader: /* glsl */ `
      attribute float cloudSeed;
      attribute float cloudOpacity;
      attribute vec4 cloudLight;
      varying vec2 vUv;
      varying float vSeed;
      varying float vOpacity;
      varying vec4 vLight;
      varying vec3 vWorld;
      varying float vCamDist;

      void main() {
        vUv = uv;
        vSeed = cloudSeed;
        vOpacity = cloudOpacity;
        vLight = cloudLight;
        vec4 world = modelMatrix * instanceMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        vec4 view = viewMatrix * world;
        vCamDist = -view.z;
        gl_Position = projectionMatrix * view;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float time;
      uniform float lite;
      uniform sampler2D atlas;
      uniform float useAtlas;
      uniform vec3 flood;
      uniform vec3 jetColor;
      uniform vec3 redColor;
      varying vec2 vUv;
      varying float vSeed;
      varying float vOpacity;
      varying vec4 vLight;
      varying vec3 vWorld;
      varying float vCamDist;
      ${NOISE_GLSL}

      void main() {
        if (vOpacity < 0.003) discard;

        // Small angular rotation & swirling distortion
        float ang = (vSeed - 0.5) * 0.6 + sin(time * 0.35 + vSeed * 20.0) * 0.08;
        vec2 p = vUv - 0.5;
        float ca = cos(ang), sa = sin(ang);
        p = mat2(ca, -sa, sa, ca) * p;

        float flow = time * 0.3 + vSeed * 14.0;
        vec2 swirl = lite > 0.5 ? vec2(0.0) : vec2(
          fxNoise2(p * 3.2 + vec2(flow, vSeed * 7.0)),
          fxNoise2(p * 3.2 + vec2(vSeed * 5.0, -flow))
        ) - 0.5;
        float env = 1.0 - smoothstep(0.22, 0.5, length(p));
        p += swirl * 0.12 * env;

        if (fract(vSeed * 13.7) > 0.5) p.x = -p.x;
        vec2 uv = clamp(p + 0.5, 0.004, 0.996);

        // Sample 8-cell sprite atlas (4 columns x 2 rows)
        vec4 t;
        float cell = floor(fract(vSeed * 7.31) * 8.0);
        vec2 tile = vec2(mod(cell, 4.0), floor(cell / 4.0));
        t = texture2D(atlas, (uv + tile) / vec2(4.0, 2.0));

        // Drifting noise erosion on edges
        float erosion = fxNoise2(uv * 5.5 + vec2(vSeed * 11.0, time * 0.14)) * 0.5;
        float rim = clamp(length(p) * 2.0, 0.0, 1.0);
        t.a = smoothstep(0.12 + 0.6 * pow(rim, 1.5), 1.0, t.a * (0.35 + 1.05 * erosion)) * (0.75 + 0.25 * erosion);

        float top = t.r, bottom = t.g, thin = t.b;
        float jet = vLight.x, red = vLight.y, lit = vLight.z, inner = vLight.w;

        vec3 c = vec3(0.016, 0.018, 0.024) * (0.5 + bottom);
        float tone = 0.75 + 0.35 * fract(vSeed * 3.71);
        c += flood * top * lit * 0.7 * tone;
        c += flood * 0.08 * lit;
        c += jetColor * (bottom * 1.5 + thin * 1.1 + 0.2) * jet;

        // Runway red LED bounce at bottom of puff
        float baseFade = 1.0 - smoothstep(0.0, 0.5, uv.y);
        c += redColor * (bottom * 1.8 + thin * 1.0) * red * baseFade * baseFade * 1.6;
        c += vec3(1.0, 0.98, 0.95) * inner * thin * 1.8;
        c += vec3(0.75, 0.85, 0.98) * thin * 0.07 * lit;

        float a = t.a * vOpacity * (1.0 - smoothstep(0.48, 1.0, rim));
        a *= smoothstep(-0.25, 0.9, vWorld.y);
        a *= smoothstep(1.5, 7.0, vCamDist);

        if (a < 0.003) discard;
        gl_FragColor = vec4(c * a, a);
      }
    `,
  });
  disposables.push(vaporMat);

  const planeGeo = new THREE.PlaneGeometry(2, 2);
  disposables.push(planeGeo);

  const seedArray = new Float32Array(MAX_VAPOR_COUNT);
  const opacityArray = new Float32Array(MAX_VAPOR_COUNT);
  const lightArray = new Float32Array(MAX_VAPOR_COUNT * 4);

  planeGeo.setAttribute('cloudSeed', new THREE.InstancedBufferAttribute(seedArray, 1));
  planeGeo.setAttribute('cloudOpacity', new THREE.InstancedBufferAttribute(opacityArray, 1));
  planeGeo.setAttribute('cloudLight', new THREE.InstancedBufferAttribute(lightArray, 4));

  const vaporMesh = new THREE.InstancedMesh(planeGeo, vaporMat, MAX_VAPOR_COUNT);
  vaporMesh.name = 'GroundVaporCloud';
  vaporMesh.frustumCulled = false;
  vaporMesh.renderOrder = 20;
  rootGroup.add(vaporMesh);
  disposables.push(vaporMesh);

  // Pre-allocated particle pool
  const vaporParticles: VaporParticle[] = [];
  for (let i = 0; i < MAX_VAPOR_COUNT; i++) {
    vaporParticles.push({
      active: false,
      x: 0,
      y: 0,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      size: 1,
      maxSize: 6,
      life: 0,
      maxLife: 2.0,
      seed: Math.random(),
      opacity: 0,
      lightJet: 0,
      lightRed: 0,
      lightFlood: 1,
      lightInner: 0,
    });
    seedArray[i] = vaporParticles[i].seed;
  }

  const dummyMatrix = new THREE.Matrix4();
  const dummyScale = new THREE.Vector3();
  const dummyPos = new THREE.Vector3();
  const dummyQuat = new THREE.Quaternion();

  // Low thruster continuous ground puff timer
  let groundPuffTimer = 0;

  // =========================================================================
  // 5. LIFECYCLE METHODS
  // =========================================================================

  const spawnVaporPuff = (
    pos: THREE.Vector3,
    velocity: THREE.Vector3,
    startSize: number,
    finalSize: number,
    duration: number,
    initialOpacity: number,
    jetLight: number,
    redLight: number
  ) => {
    // Find inactive particle or oldest particle
    let p = vaporParticles.find((part) => !part.active);
    if (!p) {
      // Find particle with lowest remaining life
      p = vaporParticles.reduce((prev, curr) => (curr.life < prev.life ? curr : prev));
    }

    p.active = true;
    p.x = pos.x;
    p.y = Math.max(0.28, pos.y);
    p.z = pos.z;
    p.vx = velocity.x;
    p.vy = velocity.y;
    p.vz = velocity.z;
    p.size = startSize;
    p.maxSize = finalSize;
    p.life = duration;
    p.maxLife = duration;
    p.opacity = initialOpacity;
    p.seed = Math.random();
    p.lightJet = jetLight;
    p.lightRed = redLight;
    p.lightFlood = 0.9;
    p.lightInner = 0.2;
  };

  const triggerLanding = (position: THREE.Vector3, intensity: number) => {
    const clampedIntensity = Math.min(2.0, Math.max(0.4, intensity));
    const puffCount = currentQuality === 'high'
      ? Math.round(55 * clampedIntensity)
      : Math.round(25 * clampedIntensity);

    for (let i = 0; i < puffCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 10 + Math.random() * 26 * clampedIntensity;
      const startSize = 2.4 + Math.random() * 1.8;
      const finalSize = 8.5 + Math.random() * 6.5;
      const duration = 1.6 + Math.random() * 0.9;

      const offsetRadius = 0.5 + Math.random() * 2.8;
      const spawnPos = new THREE.Vector3(
        position.x + Math.cos(angle) * offsetRadius,
        0.35 + Math.random() * 0.4,
        position.z + Math.sin(angle) * offsetRadius
      );

      const vel = new THREE.Vector3(
        Math.cos(angle) * speed,
        0.8 + Math.random() * 2.5,
        Math.sin(angle) * speed * 0.8
      );

      spawnVaporPuff(
        spawnPos,
        vel,
        startSize,
        finalSize,
        duration,
        0.75,
        0.1, // jet light
        0.55 // red edge bounce
      );
    }
  };

  const setQuality = (quality: GraphicsQuality) => {
    currentQuality = quality;
    liteUniform.value = quality === 'high' ? 0.0 : 1.0;
  };

  const update = (dt: number, state: EffectsUpdateState) => {
    timeUniform.value += dt;

    // 1. Thruster Activation & Intensity Interpolation
    const targetIntensity = (state.thrustActive && state.thrusterGas > 0) ? 1.0 : 0.0;
    const lerpRate = state.thrustActive ? 18.0 : 12.0;
    intensityUniform.value = THREE.MathUtils.damp(intensityUniform.value, targetIntensity, lerpRate, dt);

    const isThrusterVisible = intensityUniform.value > 0.01;

    // 2. Altitude-based plume parameters (ground flare & free dispersion)
    const distToGround = Math.max(0, state.altitudeFt - 0.55);
    const flareVal = THREE.MathUtils.clamp(1.0 - distToGround / 10.0, 0.0, 1.0);
    const freeVal = THREE.MathUtils.clamp((distToGround - 4.0) / 12.0, 0.0, 1.0);
    flareUniform.value = flareVal;
    freeUniform.value = freeVal;
    lengthUniform.value = THREE.MathUtils.lerp(2.2, 4.2, freeVal);

    // 3. Update & Orient the 4 Nozzle Jets
    for (let i = 0; i < 4; i++) {
      const jet = nozzleJets[i];
      if (!isThrusterVisible) {
        jet.visible = false;
        continue;
      }
      jet.visible = true;

      // Position along car anchors
      if (state.anchors && state.anchors[i]) {
        const anchor = state.anchors[i];
        anchor.getWorldPosition(jet.position);
        anchor.getWorldQuaternion(jet.quaternion);
      } else if (state.carGroup) {
        // Fallback procedural car underside offsets
        const lPos = defaultNozzleOffsets[i].clone();
        lPos.applyAxisAngle(new THREE.Vector3(0, 0, 1), -state.carRotationZ);
        jet.position.copy(state.carPosition).add(lPos);
        jet.rotation.set(0, 0, -state.carRotationZ);
      }

      // High frequency thrust vibration scale
      const pulse = 1.0 + Math.sin(timeUniform.value * 28.0 + i * 1.5) * 0.06;
      jet.scale.set(pulse, pulse * (0.95 + 0.1 * Math.random()), pulse);
    }

    // 4. Continuous Ground Vapor when firing near the surface (< 12 ft)
    if (isThrusterVisible && distToGround < 12.0) {
      groundPuffTimer += dt;
      const interval = currentQuality === 'high' ? 0.03 : 0.06;
      if (groundPuffTimer >= interval) {
        groundPuffTimer = 0;
        for (let i = 0; i < 2; i++) {
          const jetIdx = Math.floor(Math.random() * 4);
          const jet = nozzleJets[jetIdx];
          const spawnPos = jet.position.clone();
          spawnPos.y = 0.35;
          const a = Math.random() * Math.PI * 2;
          const spd = 6 + Math.random() * 14;
          spawnVaporPuff(
            spawnPos,
            new THREE.Vector3(Math.cos(a) * spd, 0.4 + Math.random() * 1.2, Math.sin(a) * spd),
            1.6,
            7.5,
            1.2 + Math.random() * 0.5,
            0.6,
            0.7, // strong jet blue light
            0.4
          );
        }
      }
    }

    // 5. Update Active Ground Vapor Particles
    const camPos = scene.parent ? new THREE.Vector3() : rootGroup.position;
    let needsUpdate = false;

    const seedAttr = planeGeo.getAttribute('cloudSeed') as THREE.InstancedBufferAttribute;
    const opacityAttr = planeGeo.getAttribute('cloudOpacity') as THREE.InstancedBufferAttribute;
    const lightAttr = planeGeo.getAttribute('cloudLight') as THREE.InstancedBufferAttribute;

    vaporParticles.forEach((p, idx) => {
      if (!p.active) {
        opacityArray[idx] = 0;
        dummyMatrix.makeScale(0, 0, 0);
        vaporMesh.setMatrixAt(idx, dummyMatrix);
        return;
      }

      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        opacityArray[idx] = 0;
        dummyMatrix.makeScale(0, 0, 0);
        vaporMesh.setMatrixAt(idx, dummyMatrix);
        needsUpdate = true;
        return;
      }

      // Physics integration (expanding, rising, air friction damping)
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.vx *= Math.pow(0.88, dt * 60);
      p.vz *= Math.pow(0.88, dt * 60);
      p.vy *= Math.pow(0.92, dt * 60);

      const progress = 1.0 - p.life / p.maxLife;
      const currentScale = THREE.MathUtils.lerp(p.size, p.maxSize, Math.pow(progress, 0.65));
      const currentAlpha = p.opacity * (1.0 - progress);

      opacityArray[idx] = currentAlpha;
      lightArray[idx * 4 + 0] = p.lightJet;
      lightArray[idx * 4 + 1] = p.lightRed;
      lightArray[idx * 4 + 2] = p.lightFlood;
      lightArray[idx * 4 + 3] = p.lightInner;

      // Face camera billboard and spread low skirt along asphalt
      if (state.camera) {
        state.camera.getWorldQuaternion(dummyQuat);
      } else {
        dummyQuat.identity();
      }

      const skirt = Math.max(0, 1.0 - p.y / 2.2);
      dummyPos.set(p.x, p.y, p.z);
      dummyScale.set(currentScale * (1.35 + skirt * 0.75), currentScale * (0.85 - skirt * 0.25), 1.0);

      dummyMatrix.compose(dummyPos, dummyQuat, dummyScale);
      vaporMesh.setMatrixAt(idx, dummyMatrix);
      needsUpdate = true;
    });

    if (needsUpdate) {
      vaporMesh.instanceMatrix.needsUpdate = true;
      opacityAttr.needsUpdate = true;
      lightAttr.needsUpdate = true;
    }
  };

  const dispose = () => {
    scene.remove(rootGroup);
    rootGroup.clear();

    disposables.forEach((d) => {
      try {
        d.dispose();
      } catch {
        // ignore
      }
    });
    disposables.length = 0;
  };

  return {
    group: rootGroup,
    update,
    setQuality,
    triggerLanding,
    dispose,
  };
}
