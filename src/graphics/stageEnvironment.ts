import * as THREE from 'three';
import { GraphicsQuality } from '../types';

/**
 * GLSL Procedural 2D/3D Noise functions adapted from the reference project.
 * Used in custom onBeforeCompile shaders for concrete panel seams, construction joints,
 * tire rubber marks, water stains, and asphalt aggregate textures.
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

export interface StageOptions {
  scene: THREE.Scene;
  quality: GraphicsQuality;
  roadWidth?: number;
}

export interface StageEnvironmentObjects {
  group: THREE.Group;
  dispose: () => void;
  update: (dt: number, time: number) => void;
}

interface SpanItem {
  a: THREE.Vector3;
  b: THREE.Vector3;
  width: number;
  depth: number;
  material: THREE.Material;
}

/**
 * Sweeps an arbitrary cross-section profile along a 3D centerline path.
 * Generates clean vertex normals, indices, and UV coordinates:
 * - uv.x = lateral position across track (ft)
 * - uv.y = accumulated arc length along path (ft)
 */
function sweepProfile(
  center: THREE.Vector3[],
  profile: [number, number][], // [depth along surface normal, lateral z]
  closed = false
): THREE.BufferGeometry {
  const vertices: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const tangent = new THREE.Vector3();
  const normal = new THREE.Vector3();
  let arc = 0;
  const ring = profile.length;

  for (let i = 0; i < center.length; i++) {
    if (i > 0) {
      arc += center[i].distanceTo(center[i - 1]);
    }
    const nextIdx = Math.min(i + 1, center.length - 1);
    const prevIdx = Math.max(i - 1, 0);
    tangent.subVectors(center[nextIdx], center[prevIdx]).normalize();
    // In XY plane with Z lateral: normal is (-tangent.y, tangent.x, 0)
    normal.set(-tangent.y, tangent.x, 0);

    for (const [depth, lateral] of profile) {
      vertices.push(
        center[i].x + normal.x * depth,
        center[i].y + normal.y * depth,
        lateral
      );
      uvs.push(lateral, arc);
    }

    if (i > 0) {
      const segCount = closed ? ring : ring - 1;
      for (let s = 0; s < segCount; s++) {
        const a = (i - 1) * ring + s;
        const b = (i - 1) * ring + ((s + 1) % ring);
        const c = i * ring + ((s + 1) % ring);
        const d = i * ring + s;
        indices.push(a, b, c, a, c, d);
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Aligns a 1x1x1 unit box between two 3D points [a, b] with specified width and depth.
 */
function computeSpanMatrix(
  a: THREE.Vector3,
  b: THREE.Vector3,
  width: number,
  depth: number,
  upHint = new THREE.Vector3(0, 0, 1)
): THREE.Matrix4 {
  const dir = b.clone().sub(a);
  const length = dir.length();
  if (length < 1e-5) {
    return new THREE.Matrix4();
  }

  const y = dir.clone().normalize();
  const hint = Math.abs(upHint.dot(y)) > 0.98 ? new THREE.Vector3(1, 0, 0) : upHint.clone();
  const x = hint.clone().cross(y).normalize();
  const z = x.clone().cross(y).normalize();

  const basis = new THREE.Matrix4().makeBasis(x, y, z);
  const center = a.clone().addScaledVector(dir, 0.5);

  const mat = new THREE.Matrix4();
  mat.multiply(new THREE.Matrix4().makeTranslation(center.x, center.y, center.z));
  mat.multiply(basis);
  mat.multiply(new THREE.Matrix4().makeScale(width, length, depth));
  return mat;
}

/**
 * Builds the upgraded stage environment matching the reference Roadster project:
 * 1. Realistic curved concrete ramp with formwork panel seams, tire rubber tracks, and water stains.
 * 2. Triangulated steel box trusses under the ramp curve.
 * 3. 4-column architectural support tower with cross-bracing and blinking red obstruction beacons.
 * 4. High-detail asphalt runway and landing road with crisp painted markings and touchdown target zone.
 * 5. Red LED curb edge rails.
 */
export function buildUpgradedStage({
  scene,
  quality,
  roadWidth = 20,
}: StageOptions): StageEnvironmentObjects {
  const stageGroup = new THREE.Group();
  stageGroup.name = 'UpgradedStageEnvironment';
  scene.add(stageGroup);

  const disposables: { dispose: () => void }[] = [];
  const sharedBoxGeo = new THREE.BoxGeometry(1, 1, 1);
  disposables.push(sharedBoxGeo);

  // Keep the ramp and both runway sections on one consistent, wider footprint.
  // A 24 ft minimum gives the car more visible shoulder room without changing physics.
  const stageRoadWidth = Math.max(roadWidth, 24);
  const halfWidth = stageRoadWidth / 2; // 12 ft minimum

  // =========================================================================
  // 1. MATERIALS SETUP
  // =========================================================================

  // Red LED Neon Emitters
  const redLedMat = new THREE.MeshBasicMaterial({
    color: 0xff2a55,
    toneMapped: false,
  });
  disposables.push(redLedMat);

  const redBeaconMat = new THREE.MeshBasicMaterial({
    color: 0xff1438,
    toneMapped: false,
  });
  disposables.push(redBeaconMat);

  // Painted Road Markings Material (polygonOffset prevents z-fighting with asphalt)
  const paintedStripeMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0x596575,
    roughness: 0.58,
    metalness: 0.03,
    polygonOffset: true,
    polygonOffsetFactor: -1.2,
    polygonOffsetUnits: -1.2,
  });
  disposables.push(paintedStripeMat);

  // Amber guidance lines make the touchdown corridor easier to read at night.
  const touchdownGuideMat = new THREE.MeshStandardMaterial({
    color: 0xffd36a,
    emissive: 0x51370d,
    roughness: 0.55,
    metalness: 0.02,
    polygonOffset: true,
    polygonOffsetFactor: -1.5,
    polygonOffsetUnits: -1.5,
  });
  disposables.push(touchdownGuideMat);

  // Structural Steel for Trusses and Tower
  const steelMat = new THREE.MeshStandardMaterial({
    color: 0x59606a,
    emissive: 0x0c0e12,
    roughness: 0.38,
    metalness: 0.78,
  });
  disposables.push(steelMat);

  const darkSteelMat = new THREE.MeshStandardMaterial({
    color: 0x1d2126,
    roughness: 0.52,
    metalness: 0.65,
  });
  disposables.push(darkSteelMat);

  // Concrete Underside / Shell Material
  const deckShellMat = new THREE.MeshStandardMaterial({
    color: 0x474b52,
    roughness: 0.88,
    metalness: 0.08,
  });
  disposables.push(deckShellMat);

  // Concrete Ramp Driving Surface Material
  const rampDeckMat = new THREE.MeshStandardMaterial({
    color: 0x9c9ba5, // Reference pale architectural concrete
    roughness: 0.52,
    metalness: 0.12,
  });
  disposables.push(rampDeckMat);

  // Asphalt Runway & Landing Road Material
  const asphaltMat = new THREE.MeshStandardMaterial({
    color: 0x555e6a, // Darker asphalt gives the runway markings stronger contrast
    roughness: 0.74,
    metalness: 0.04,
  });
  disposables.push(asphaltMat);

  // Enhanced Shaders for High Quality Mode
  if (quality === 'high') {
    // -----------------------------------------------------------------------
    // Ramp Concrete Shader (Panel joints, tire tracks along z=±3.2, water stains)
    // -----------------------------------------------------------------------
    rampDeckMat.onBeforeCompile = (shader) => {
      shader.vertexShader =
        'varying vec2 vDeckUv;\n' +
        shader.vertexShader.replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\n  vDeckUv = uv;'
        );

      shader.fragmentShader =
        `varying vec2 vDeckUv;\n${NOISE_GLSL}\n` + shader.fragmentShader;

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float lat = vDeckUv.x;   // lateral z from -10 to +10 ft
        float arc = vDeckUv.y;   // arc distance along curve in ft

        // Fine aggregate mottling
        vec2 p = vec2(lat * 0.4, arc * 0.15);
        float mottling = 0.55 * fxNoise2(p * 1.3) + 0.3 * fxNoise2(p * 6.0) + 0.15 * fxNoise2(p * 31.0);
        diffuseColor.rgb *= 0.65 + mottling * 0.55;

        // Formwork panel seams: subtle seams every 8 ft (2.4m) along the arc
        float panelSeam = 1.0 - smoothstep(0.04, 0.12, abs(fract(arc / 8.0 + 0.5) - 0.5) * 8.0);
        diffuseColor.rgb *= 0.94 + 0.12 * fxHash2(vec2(floor(arc / 8.0), step(0.0, lat)));

        // Longitudinal construction joint down center and near curbs
        float centerJoint = 1.0 - smoothstep(0.0, 0.08, abs(lat));
        float curbJoint = 1.0 - smoothstep(0.0, 0.08, abs(abs(lat) - 9.8));
        diffuseColor.rgb *= 1.0 - 0.45 * max(panelSeam, max(centerJoint, curbJoint) * 0.7);

        // Realistic tire rubber laid down by tires along both wheel tracks (z = ±3.2 ft)
        float tk = (abs(lat) - 3.2) / 0.85;
        float track = exp(-tk * tk);
        float rubberNoise = 0.4 + 0.6 * fxNoise2(vec2(lat * 4.0, arc * 0.25));
        float rubber = track * rubberNoise * smoothstep(2.0, 15.0, arc);
        diffuseColor.rgb *= 1.0 - 0.48 * rubber;

        // Subtle water stains and wet streak accents running down the curve
        float streaks = smoothstep(0.62, 0.92, fxNoise2(vec2(lat * 1.5, arc * 0.06)));
        diffuseColor.rgb *= 1.0 - 0.22 * streaks;
        `
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
        float tkR = (abs(vDeckUv.x) - 3.2) / 0.85;
        float trackR = exp(-tkR * tkR);
        // Rubber and wet streaks reduce roughness slightly
        roughnessFactor = mix(roughnessFactor, 0.36, trackR * 0.45);
        `
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        // Soft bounce from the lane LEDs and stadium floods so the curve never collapses to pitch black
        totalEmissiveRadiance += diffuseColor.rgb * vec3(0.09, 0.095, 0.105);
        // Red neon glow bleed near the outer borders
        float edgeBleed = exp(-(10.0 - abs(vDeckUv.x)) * 1.8);
        totalEmissiveRadiance += vec3(1.0, 0.03, 0.08) * edgeBleed * 0.45;
        `
      );
    };
    rampDeckMat.customProgramCacheKey = () => 'roadster-ramp-deck-v3';

    // -----------------------------------------------------------------------
    // Asphalt Shader (Aggregate noise, surface patches, wet/dry variation)
    // -----------------------------------------------------------------------
    asphaltMat.onBeforeCompile = (shader) => {
      shader.vertexShader =
        'varying vec3 vWorldPos;\n' +
        shader.vertexShader.replace(
          '#include <begin_vertex>',
          '#include <begin_vertex>\n  vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;'
        );

      shader.fragmentShader =
        `varying vec3 vWorldPos;\n${NOISE_GLSL}\n` + shader.fragmentShader;

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        vec2 rp = vWorldPos.xz;
        float grain = fxHash2(floor(rp * 8.0) + floor(rp.yx * 0.2));
        float aggregate = 0.6 * fxNoise2(rp * 0.7) + 0.4 * fxNoise2(rp * 1.8 + 5.0);
        float patches = 0.6 * fxNoise2(rp * 0.035 + 2.0) + 0.4 * fxNoise2(rp.yx * 0.018 + 7.0);

        diffuseColor.rgb *= (0.78 + grain * 0.35) * (0.84 + aggregate * 0.25) * (0.75 + patches * 0.45);

        // Subtle dark tire rubber deposits in the landing touchdown zone (x: 210 to 360 ft)
        if (rp.x > 210.0 && rp.x < 360.0) {
          float touchZone = smoothstep(210.0, 240.0, rp.x) * (1.0 - smoothstep(330.0, 360.0, rp.x));
          float tkL = (abs(rp.y) - 3.2) / 1.1;
          float skid = exp(-tkL * tkL) * touchZone * (0.5 + 0.5 * fxNoise2(rp * 0.4));
          diffuseColor.rgb *= 1.0 - 0.42 * skid;
        }
        `
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        // Subtle ambient fill and red neon bleed near borders
        float edgeBleedA = exp(-(10.0 - abs(vWorldPos.z)) * 1.6);
        totalEmissiveRadiance += vec3(1.0, 0.03, 0.08) * edgeBleedA * 0.4;
        `
      );
    };
    asphaltMat.customProgramCacheKey = () => 'roadster-asphalt-v3';
  }

  // =========================================================================
  // 2. CURVED RAMP GEOMETRY & ARCHITECTURAL STRUCTURE
  // =========================================================================

  // Ramp centerline points matching existing physics curve exactly:
  // x: -80 to 0 ft, y: 0.25 to 35.0 ft
  // y(t) = 0.25 + 34.75 * (1 - Math.cos(t * 0.55 * Math.PI))
  const rampSteps = 80;
  const rampCenterline: THREE.Vector3[] = [];
  for (let i = 0; i <= rampSteps; i++) {
    const t = i / rampSteps;
    const rx = -80 * (1 - t);
    const ry = 0.25 + 34.75 * (1 - Math.cos(t * 0.55 * Math.PI));
    rampCenterline.push(new THREE.Vector3(rx, ry, 0));
  }

  // 1. Driving Deck Mesh
  const deckGeo = sweepProfile(
    rampCenterline,
    [
      [0, halfWidth],
      [0, halfWidth * 0.5],
      [0, 0],
      [0, -halfWidth * 0.5],
      [0, -halfWidth],
    ],
    false
  );
  disposables.push(deckGeo);
  const rampDeckMesh = new THREE.Mesh(deckGeo, rampDeckMat);
  rampDeckMesh.name = 'RampDrivingDeck';
  rampDeckMesh.receiveShadow = true;
  stageGroup.add(rampDeckMesh);

  // 2. Concrete Underside Deck Shell (1.2 ft thick slab with side chamfer)
  const shellGeo = sweepProfile(
    rampCenterline,
    [
      [-0.01, -halfWidth],
      [-1.2, -halfWidth - 0.3],
      [-1.2, halfWidth + 0.3],
      [-0.01, halfWidth],
    ],
    false
  );
  disposables.push(shellGeo);
  const rampShellMesh = new THREE.Mesh(shellGeo, deckShellMat);
  rampShellMesh.name = 'RampDeckShell';
  rampShellMesh.receiveShadow = true;
  stageGroup.add(rampShellMesh);

  // 3. Lane Stripe up the ramp (0.5 ft width, slightly raised above deck)
  const rampStripeGeo = sweepProfile(
    rampCenterline,
    [
      [0.015, 0.25],
      [0.015, -0.25],
    ],
    false
  );
  disposables.push(rampStripeGeo);
  const rampStripeMesh = new THREE.Mesh(rampStripeGeo, paintedStripeMat);
  rampStripeMesh.name = 'RampLaneStripe';
  stageGroup.add(rampStripeMesh);

  // 4. Concrete Apron Pad at Ramp Foot (x = -84 to -76 ft)
  const padGeo = new THREE.BoxGeometry(14, 0.12, stageRoadWidth + 3.0);
  disposables.push(padGeo);
  const rampPad = new THREE.Mesh(padGeo, deckShellMat);
  rampPad.name = 'RampApronPad';
  rampPad.position.set(-80, 0.18, 0);
  rampPad.receiveShadow = true;
  stageGroup.add(rampPad);

  // =========================================================================
  // 3. STEEL TRUSSES & 4-COLUMN SUPPORT TOWER (BATCHED INSTANCING)
  // =========================================================================

  const steelSpans: SpanItem[] = [];
  const darkSteelSpans: SpanItem[] = [];

  // Compute normals and tangents along the ramp centerline for truss positioning
  const tangent = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const ribsLeft: THREE.Vector3[] = [];
  const ribsRight: THREE.Vector3[] = [];
  const deckPointsLeft: THREE.Vector3[] = [];
  const deckPointsRight: THREE.Vector3[] = [];

  // Generate Triangulated Box Truss under the curved ramp
  let accumulatedDist = 0;
  for (let i = 0; i < rampCenterline.length; i++) {
    if (i > 0) {
      accumulatedDist += rampCenterline[i].distanceTo(rampCenterline[i - 1]);
    }

    // Space truss stations every ~5 ft along the arc
    if (accumulatedDist < 4.8 && i < rampCenterline.length - 1 && i > 0) {
      continue;
    }
    accumulatedDist = 0;

    const nextIdx = Math.min(i + 1, rampCenterline.length - 1);
    const prevIdx = Math.max(i - 1, 0);
    tangent.subVectors(rampCenterline[nextIdx], rampCenterline[prevIdx]).normalize();
    normal.set(tangent.y, -tangent.x, 0); // pointing downward/under the deck

    const pt = rampCenterline[i];
    // Truss depth grows as ramp rises, reaching ~8.5 ft under the high section
    const trussDepth = 1.0 + 8.5 * Math.min(1.0, Math.max(0, pt.y - 0.5) / 28.0);

    const pL = new THREE.Vector3(pt.x, pt.y - 0.05, -halfWidth - 0.25);
    const pR = new THREE.Vector3(pt.x, pt.y - 0.05, halfWidth + 0.25);
    deckPointsLeft.push(pL);
    deckPointsRight.push(pR);

    const outerL = pL.clone().addScaledVector(normal, trussDepth);
    outerL.y = Math.max(0.15, outerL.y);
    const outerR = pR.clone().addScaledVector(normal, trussDepth);
    outerR.y = Math.max(0.15, outerR.y);

    ribsLeft.push(outerL);
    ribsRight.push(outerR);

    // Vertical/Normal Truss Ribs on left and right
    steelSpans.push({ a: pL, b: outerL, width: 0.35, depth: 0.35, material: steelMat });
    steelSpans.push({ a: pR, b: outerR, width: 0.35, depth: 0.35, material: steelMat });

    // Transverse Cross-Beam between left and right truss ribs
    steelSpans.push({ a: outerL, b: outerR, width: 0.32, depth: 0.32, material: steelMat });

    const n = ribsLeft.length;
    if (n > 1) {
      const prevOuterL = ribsLeft[n - 2];
      const prevOuterR = ribsRight[n - 2];
      const prevDeckL = deckPointsLeft[n - 2];
      const prevDeckR = deckPointsRight[n - 2];

      // Longitudinal Spine Beams along bottom chord of truss
      steelSpans.push({ a: prevOuterL, b: outerL, width: 0.42, depth: 0.42, material: steelMat });
      steelSpans.push({ a: prevOuterR, b: outerR, width: 0.42, depth: 0.42, material: steelMat });

      // Diagonal Warren Truss Braces
      steelSpans.push({ a: prevOuterL, b: pL, width: 0.28, depth: 0.28, material: steelMat });
      steelSpans.push({ a: prevOuterR, b: pR, width: 0.28, depth: 0.28, material: steelMat });

      // Diagonal X-bracing on bottom face every other bay
      if (n % 2 === 0) {
        steelSpans.push({ a: prevOuterL, b: outerR, width: 0.25, depth: 0.25, material: steelMat });
        steelSpans.push({ a: prevOuterR, b: outerL, width: 0.25, depth: 0.25, material: steelMat });
      }
    }
  }

  // 4-Column Architectural Support Tower under the apex overhang
  // Positioned directly under the highest section of the ramp (x: -16 to 2 ft)
  const towerHeight = 34.5;
  const towerLegs: [number, number][] = [
    [-15.0, -halfWidth + 1.2],
    [-15.0, halfWidth - 1.2],
    [2.0, -halfWidth + 1.2],
    [2.0, halfWidth - 1.2],
  ];

  // 4 Vertical Heavy Box Columns
  for (const [lx, lz] of towerLegs) {
    steelSpans.push({
      a: new THREE.Vector3(lx, 0.1, lz),
      b: new THREE.Vector3(lx, towerHeight, lz),
      width: 0.85,
      depth: 0.85,
      material: steelMat,
    });
  }

  // Tower Horizontal Perimeter Rings and X-Braces every 5.5 ft
  const ringOrder = [0, 1, 3, 2];
  for (let y = 3.5; y < towerHeight; y += 5.5) {
    for (let j = 0; j < 4; j++) {
      const idx0 = ringOrder[j];
      const idx1 = ringOrder[(j + 1) % 4];
      const p0 = new THREE.Vector3(towerLegs[idx0][0], y, towerLegs[idx0][1]);
      const p1 = new THREE.Vector3(towerLegs[idx1][0], y, towerLegs[idx1][1]);
      const p1Next = new THREE.Vector3(
        towerLegs[idx1][0],
        Math.min(towerHeight, y + 5.5),
        towerLegs[idx1][1]
      );

      // Horizontal Ring Beam
      steelSpans.push({ a: p0, b: p1, width: 0.42, depth: 0.42, material: steelMat });

      // Diagonal Face Brace
      steelSpans.push({ a: p0, b: p1Next, width: 0.3, depth: 0.3, material: steelMat });
    }
  }

  // Cross Support Beams directly kissing the ramp underside at apex
  steelSpans.push({
    a: new THREE.Vector3(-15.0, towerHeight - 0.5, -halfWidth - 0.2),
    b: new THREE.Vector3(2.0, towerHeight - 0.5, -halfWidth - 0.2),
    width: 0.65,
    depth: 0.65,
    material: steelMat,
  });
  steelSpans.push({
    a: new THREE.Vector3(-15.0, towerHeight - 0.5, halfWidth + 0.2),
    b: new THREE.Vector3(2.0, towerHeight - 0.5, halfWidth + 0.2),
    width: 0.65,
    depth: 0.65,
    material: steelMat,
  });

  // Batch all Steel Truss & Tower members into a single InstancedMesh (1 Draw Call)
  if (steelSpans.length > 0) {
    const steelBatch = new THREE.InstancedMesh(sharedBoxGeo, steelMat, steelSpans.length);
    steelBatch.name = 'BatchedSteelTrussesAndTower';
    steelBatch.castShadow = quality === 'high';
    steelBatch.receiveShadow = true;

    steelSpans.forEach((span, idx) => {
      const mat = computeSpanMatrix(span.a, span.b, span.width, span.depth);
      steelBatch.setMatrixAt(idx, mat);
    });
    steelBatch.instanceMatrix.needsUpdate = true;
    steelBatch.computeBoundingSphere();
    stageGroup.add(steelBatch);
    disposables.push(steelBatch);
  }

  // Red Obstruction Beacon Lights on top corners of the support tower
  const beaconMeshes: THREE.Mesh[] = [];
  const beaconPositions = [
    new THREE.Vector3(-15.0, towerHeight + 0.6, -halfWidth + 1.2),
    new THREE.Vector3(-15.0, towerHeight + 0.6, halfWidth - 1.2),
    new THREE.Vector3(2.0, towerHeight + 0.6, -halfWidth + 1.2),
    new THREE.Vector3(2.0, towerHeight + 0.6, halfWidth - 1.2),
  ];

  const beaconGeo = new THREE.CylinderGeometry(0.3, 0.35, 0.6, 12);
  disposables.push(beaconGeo);

  beaconPositions.forEach((pos) => {
    // Housing base
    const base = new THREE.Mesh(sharedBoxGeo, darkSteelMat);
    base.position.set(pos.x, pos.y - 0.35, pos.z);
    base.scale.set(0.65, 0.3, 0.65);
    stageGroup.add(base);

    // Glowing Red Beacon Lens
    const beacon = new THREE.Mesh(beaconGeo, redBeaconMat);
    beacon.position.copy(pos);
    stageGroup.add(beacon);
    beaconMeshes.push(beacon);
  });

  // =========================================================================
  // 4. RUNWAY & LANDING TRACK VISUAL OVERHAUL
  // =========================================================================

  // 1. Approach Runway (x = -300 to -80 ft, flush with the ramp foot at x = -80)
  const approachLength = 220;
  const approachGeo = new THREE.BoxGeometry(approachLength, 0.25, stageRoadWidth);
  disposables.push(approachGeo);
  const approachRoad = new THREE.Mesh(approachGeo, asphaltMat);
  approachRoad.name = 'ApproachRunwayRoad';
  approachRoad.position.set(-190, 0.12, 0);
  approachRoad.receiveShadow = true;
  stageGroup.add(approachRoad);

  // 2. Landing Track (x = 0 to 650 ft, directly below the ramp exit).
  // Keep the runway inside the existing stadium ground footprint.
  const landingLength = 650;
  const landingGeo = new THREE.BoxGeometry(landingLength, 0.25, stageRoadWidth);
  disposables.push(landingGeo);
  const landingRoad = new THREE.Mesh(landingGeo, asphaltMat);
  landingRoad.name = 'LandingTrackRoad';
  landingRoad.position.set(landingLength / 2, 0.12, 0);
  landingRoad.receiveShadow = true;
  stageGroup.add(landingRoad);

  // 3. Concrete Curbs / Gutters along runway and landing road
  const curbMat = deckShellMat;
  const curbLength = approachLength + landingLength + 80;
  const curbGeo = new THREE.BoxGeometry(curbLength, 0.32, 0.5);
  disposables.push(curbGeo);

  const leftCurb = new THREE.Mesh(curbGeo, curbMat);
  leftCurb.position.set((landingLength - 300) / 2, 0.16, -halfWidth - 0.25);
  leftCurb.receiveShadow = true;
  stageGroup.add(leftCurb);

  const rightCurb = new THREE.Mesh(curbGeo, curbMat);
  rightCurb.position.set((landingLength - 300) / 2, 0.16, halfWidth + 0.25);
  rightCurb.receiveShadow = true;
  stageGroup.add(rightCurb);

  // =========================================================================
  // 5. ROAD MARKINGS & RED LED EDGE RAILS
  // =========================================================================

  // Dashed White Centerline Stripes (longer, brighter and visible down the full runway)
  const dashGeo = new THREE.BoxGeometry(5.0, 0.02, 0.65);
  disposables.push(dashGeo);

  // Runway Dashes
  for (let x = -296; x < -82; x += 8) {
    const dash = new THREE.Mesh(dashGeo, paintedStripeMat);
    dash.position.set(x, 0.26, 0);
    dash.receiveShadow = true;
    stageGroup.add(dash);
  }

  // Landing Track Dashes — continue to the extended runway end.
  for (let x = 8; x < landingLength - 4; x += 10) {
    const dash = new THREE.Mesh(dashGeo, paintedStripeMat);
    dash.position.set(x, 0.26, 0);
    dash.receiveShadow = true;
    stageGroup.add(dash);
  }

  // Solid White Outer Boundary Lines, inset 1.4 ft from each runway edge.
  const edgeStripeGeoApproach = new THREE.BoxGeometry(approachLength, 0.02, 0.35);
  disposables.push(edgeStripeGeoApproach);
  for (const z of [-halfWidth + 1.4, halfWidth - 1.4]) {
    const stripe = new THREE.Mesh(edgeStripeGeoApproach, paintedStripeMat);
    stripe.position.set(-190, 0.26, z);
    stageGroup.add(stripe);
  }

  const edgeStripeGeoLanding = new THREE.BoxGeometry(landingLength, 0.025, 0.45);
  disposables.push(edgeStripeGeoLanding);
  for (const z of [-halfWidth + 1.4, halfWidth - 1.4]) {
    const stripe = new THREE.Mesh(edgeStripeGeoLanding, paintedStripeMat);
    stripe.position.set(landingLength / 2, 0.26, z);
    stageGroup.add(stripe);
  }

  // Painted Start Line (x = -250 ft)
  const startLineGeo = new THREE.BoxGeometry(1.2, 0.02, stageRoadWidth - 1.8);
  disposables.push(startLineGeo);
  const startLine = new THREE.Mesh(startLineGeo, paintedStripeMat);
  startLine.position.set(-250, 0.26, 0);
  stageGroup.add(startLine);

  // Landing Zone Target Area Markings (x = 200 to 340 ft)
  // Transverse touchdown distance bars
  const touchBarGeo = new THREE.BoxGeometry(1.6, 0.03, stageRoadWidth - 2.8);
  disposables.push(touchBarGeo);
  for (let lzX = 200; lzX <= 340; lzX += 20) {
    const bar = new THREE.Mesh(touchBarGeo, paintedStripeMat);
    bar.position.set(lzX, 0.265, 0);
    bar.receiveShadow = true;
    stageGroup.add(bar);
  }

  // Amber longitudinal guides outline the central touchdown corridor (x = 200 to 340 ft).
  const touchdownGuideGeo = new THREE.BoxGeometry(140, 0.025, 0.18);
  disposables.push(touchdownGuideGeo);
  for (const z of [-5.5, 5.5]) {
    const guide = new THREE.Mesh(touchdownGuideGeo, touchdownGuideMat);
    guide.position.set(270, 0.262, z);
    guide.receiveShadow = true;
    stageGroup.add(guide);
  }

  // Distance Threshold Chevrons / Boxes at x = 240 and x = 280 ft
  const boxThresholdGeo = new THREE.BoxGeometry(16.0, 0.02, 1.8);
  disposables.push(boxThresholdGeo);
  for (const bx of [240, 280]) {
    for (const bz of [-4.5, 4.5]) {
      const mark = new THREE.Mesh(boxThresholdGeo, paintedStripeMat);
      mark.position.set(bx, 0.264, bz);
      stageGroup.add(mark);
    }
  }

  // Red Horizon Stop Line across the end of landing track (x = 895 ft)
  const stopLineGeo = new THREE.BoxGeometry(1.5, 0.04, stageRoadWidth);
  disposables.push(stopLineGeo);
  const stopLine = new THREE.Mesh(stopLineGeo, redLedMat);
  stopLine.position.set(landingLength - 5, 0.27, 0);
  stageGroup.add(stopLine);

  // Continuous Glowing Red LED Edge Strips along both outer runway edges.
  const approachLedGeo = new THREE.BoxGeometry(approachLength, 0.12, 0.25);
  disposables.push(approachLedGeo);
  for (const z of [-halfWidth + 0.15, halfWidth - 0.15]) {
    const led = new THREE.Mesh(approachLedGeo, redLedMat);
    led.position.set(-190, 0.27, z);
    stageGroup.add(led);
  }

  const landingLedGeo = new THREE.BoxGeometry(landingLength, 0.12, 0.25);
  disposables.push(landingLedGeo);
  for (const z of [-halfWidth + 0.15, halfWidth - 0.15]) {
    const led = new THREE.Mesh(landingLedGeo, redLedMat);
    led.position.set(landingLength / 2, 0.27, z);
    stageGroup.add(led);
  }

  // Red LED Rails Curving up the Ramp Edges
  const leftCurvePts = rampCenterline.map(
    (p) => new THREE.Vector3(p.x, p.y + 0.16, -halfWidth + 0.15)
  );
  const rightCurvePts = rampCenterline.map(
    (p) => new THREE.Vector3(p.x, p.y + 0.16, halfWidth - 0.15)
  );

  const leftEdgeTubeGeo = new THREE.TubeGeometry(
    new THREE.CatmullRomCurve3(leftCurvePts),
    70,
    0.16,
    8,
    false
  );
  disposables.push(leftEdgeTubeGeo);
  const leftEdgeTube = new THREE.Mesh(leftEdgeTubeGeo, redLedMat);
  stageGroup.add(leftEdgeTube);

  const rightEdgeTubeGeo = new THREE.TubeGeometry(
    new THREE.CatmullRomCurve3(rightCurvePts),
    70,
    0.16,
    8,
    false
  );
  disposables.push(rightEdgeTubeGeo);
  const rightEdgeTube = new THREE.Mesh(rightEdgeTubeGeo, redLedMat);
  stageGroup.add(rightEdgeTube);

  // Return lifecycle object
  return {
    group: stageGroup,

    update: (_dt: number, time: number) => {
      // Subtle pulse on the red obstruction beacons atop the support tower
      if (beaconMeshes.length > 0) {
        // Blink beacon every ~1.2 s (80% on, 20% off)
        const cycle = (time * 0.001) % 1.2;
        const isOn = cycle < 0.95;
        const intensity = isOn ? 1.0 : 0.15;
        beaconMeshes.forEach((m) => {
          (m.material as THREE.MeshBasicMaterial).color.setRGB(
            intensity * 1.0,
            intensity * 0.08,
            intensity * 0.14
          );
        });
      }
    },

    dispose: () => {
      scene.remove(stageGroup);
      stageGroup.clear();

      disposables.forEach((d) => {
        try {
          d.dispose();
        } catch {
          // ignore already disposed
        }
      });
      disposables.length = 0;
    },
  };
}
