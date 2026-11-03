import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { GraphicsQuality } from '../types';

/**
 * Screen pixel ratio capping for post-processing buffer:
 * On high-DPI retina screens, capping at 1.5x cuts fill-rate and memory pressure roughly in half
 * while maintaining tack-sharp visuals in a dark midnight environment.
 */
const postPixelRatio = (deviceRatio: number): number => Math.min(1.25, Math.max(1, deviceRatio));

/**
 * GLSL Procedural 2D noise functions for wet road ripples and puddle masks.
 */
const NOISE_GLSL = /* glsl */ `
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

/**
 * Custom wet-asphalt reflection shader with 8-tap soft radial blur,
 * puddle masking, soft clipping of high-intensity emitters, and Fresnel angle falloff.
 */
const WetReflectionShader = {
  name: 'WetAsphaltReflection',
  uniforms: {
    color: { value: new THREE.Color(0x8899aa) },
    tDiffuse: { value: null },
    textureMatrix: { value: new THREE.Matrix4() },
    time: { value: 0 },
  },
  vertexShader: /* glsl */ `
    uniform mat4 textureMatrix;
    varying vec4 vUv;
    varying vec3 vWorld;

    void main() {
      vUv = textureMatrix * vec4(position, 1.0);
      vec4 w = modelMatrix * vec4(position, 1.0);
      vWorld = w.xyz;
      gl_Position = projectionMatrix * viewMatrix * w;
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float time;
    varying vec4 vUv;
    varying vec3 vWorld;

    ${NOISE_GLSL}

    vec2 rot(vec2 p, float a) {
      float c = cos(a), s = sin(a);
      return vec2(c * p.x - s * p.y, s * p.x + c * p.y);
    }

    float wetMask(vec2 p) {
      float n = 0.6 * fxNoise2(p * 0.07) + 0.3 * fxNoise2(rot(p, 1.1) * 0.21 + 17.3) + 0.1 * fxNoise2(rot(p, 2.3) * 0.9 + 5.1);
      return smoothstep(0.38, 0.65, n);
    }

    void main() {
      // Exclude curved ramp section where ramp rises above road level (x from -80 to 0)
      if (vWorld.x > -80.0 && vWorld.x < -0.5) {
        discard;
      }
      // Road boundary (road width is 20, z is -10 to +10)
      if (abs(vWorld.z) > 10.4) {
        discard;
      }

      vec2 lp = vWorld.xz;
      float wet = wetMask(lp);
      vec2 uv = vUv.xy / vUv.w;

      // Subtle atmospheric ripple distortion
      vec2 ripple = (vec2(
        fxNoise2(lp * 0.5 + time * 0.35),
        fxNoise2(lp * 0.5 + 7.3 - time * 0.28)
      ) - 0.5) * mix(0.0022, 0.0006, wet);

      float blur = mix(0.015, 0.006, wet);

      // 8-tap soft radial blur kernel for realistic wet pavement dispersion
      vec3 acc = vec3(0.0);
      for (int i = 0; i < 8; i++) {
        float a = float(i) * 2.399963;
        float r = sqrt(float(i) + 0.5) / 2.9;
        acc += texture2D(tDiffuse, uv + ripple + vec2(cos(a) * 0.5, sin(a) * 1.2) * r * blur).rgb;
      }
      acc /= 8.0;

      // Soft-clip hot light sources (headlights, tail lights, searchlights) into an authentic sheen
      acc = acc / (1.0 + max(max(acc.r, acc.g), acc.b) * 0.55);

      vec3 V = normalize(cameraPosition - vWorld);
      float fresnel = 0.06 + 0.94 * pow(1.0 - clamp(V.y, 0.0, 1.0), 5.0);

      // Distance fade blending softly into dark night fog
      float dist = distance(cameraPosition, vWorld);
      float distFade = 1.0 - smoothstep(190.0, 390.0, dist);

      // Smooth falloff toward track edges
      float edgeFade = 1.0 - smoothstep(8.5, 10.2, abs(vWorld.z));

      float strength = mix(0.05, 0.24, wet) * fresnel * distFade * edgeFade;

      gl_FragColor = vec4(acc * strength * vec3(0.92, 0.95, 1.0), 1.0);
    }
  `,
};

/**
 * Shader pass to sanitize HDR buffer before bloom downsample:
 * Clamps fireflies to 48.0 and scrubs any NaN/Infinity pixels.
 */
const HdrSanitizeShader = {
  name: 'HdrSanitize',
  uniforms: {
    tDiffuse: { value: null },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      bool bad = any(isnan(c.rgb)) || any(isinf(c.rgb));
      gl_FragColor = vec4(bad ? vec3(0.0) : clamp(c.rgb, 0.0, 48.0), c.a);
    }
  `,
};

export interface CinematicPipelineOptions {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  width: number;
  height: number;
  quality: GraphicsQuality;
}

export interface CinematicPipeline {
  composer: EffectComposer;
  bloomPass: UnrealBloomPass;
  reflector: Reflector;
  render: (dt: number) => void;
  setSize: (width: number, height: number) => void;
  setQuality: (quality: GraphicsQuality) => void;
  dispose: () => void;
}

/**
 * Creates the cinematic post-processing and planar wet reflection pipeline.
 */
export function createCinematicPipeline(options: CinematicPipelineOptions): CinematicPipeline {
  const { renderer, scene, camera, width, height, quality } = options;

  let currentQuality = quality;
  let animTime = 0;

  // 1. Configure tone mapping on WebGLRenderer
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.45;

  // 2. Create Half-float HDR Render Target with 4x MSAA where supported
  let viewportWidth = width;
  let viewportHeight = height;
  const qualityPixelRatio = (q: GraphicsQuality) => q === 'high' ? postPixelRatio(window.devicePixelRatio || 1) : 1;
  const dpr = qualityPixelRatio(quality);
  let renderTarget: THREE.WebGLRenderTarget;
  try {
    renderTarget = new THREE.WebGLRenderTarget(
      Math.round(width * dpr),
      Math.round(height * dpr),
      {
        type: THREE.HalfFloatType,
        samples: quality === 'high' ? 2 : 0,
      }
    );
  } catch (err) {
    console.warn('[CinematicPipeline] HalfFloatType unsupported, falling back to UnsignedByteType:', err);
    renderTarget = new THREE.WebGLRenderTarget(
      Math.round(width * dpr),
      Math.round(height * dpr),
      {
        type: THREE.UnsignedByteType,
        samples: quality === 'high' ? 2 : 0,
      }
    );
  }

  // 3. EffectComposer setup
  const composer = new EffectComposer(renderer, renderTarget);
  composer.setPixelRatio(dpr);
  composer.setSize(width, height);

  // RenderPass draws into renderTarget2; renderTarget1 is used for post passes (non-MSAA)
  composer.renderTarget1.samples = 0;

  // Pass 1: Scene Render
  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);

  // Pass 2: HDR Sanitize (firefly clamp & NaN scrub)
  const sanitizePass = new ShaderPass(HdrSanitizeShader);
  composer.addPass(sanitizePass);

  // Pass 3: UnrealBloomPass tuned for automotive night run:
  // - threshold 0.85: keeps body paint deep metallic, catches headlights/taillights/neon rails/sparks
  // - strength 0.42: natural soft glow without washing out car details
  // - radius 0.40: tight, authentic lens diffusion
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(width, height),
    0.42,
    0.4,
    0.85
  );
  composer.addPass(bloomPass);

  // Pass 4: OutputPass for ACES Filmic tone mapping and sRGB colorspace conversion
  const outputPass = new OutputPass();
  composer.addPass(outputPass);

  // 4. Wet Asphalt Planar Reflector
  // Spans runway and landing road (x from -300 to 660, width 24)
  const reflectorLength = 960;
  const reflectorWidth = 24;
  const planeGeo = new THREE.PlaneGeometry(reflectorLength, reflectorWidth);

  const reflector = new Reflector(planeGeo, {
    clipBias: 0.002,
    textureWidth: Math.min(768, Math.max(256, Math.floor(width * 0.35))),
    textureHeight: Math.min(768, Math.max(256, Math.floor(height * 0.35))),
    shader: WetReflectionShader,
    multisample: 0,
  });

  reflector.name = 'WetAsphaltReflector';
  reflector.rotation.x = -Math.PI / 2;
  // Placed at y = 0.275, directly kissing the road plane (y = 0.25) and lane marks (y = 0.26)
  reflector.position.set(180, 0.275, 0);

  const reflectorMat = reflector.material as THREE.ShaderMaterial;
  reflectorMat.transparent = true;
  reflectorMat.depthWrite = false;
  reflectorMat.blending = THREE.AdditiveBlending;
  reflector.renderOrder = 2; // Renders after solid road and painted stripes

  // Enable mipmapping on reflection texture for smooth pre-blurred mip sampling
  const reflectionTex = reflector.getRenderTarget().texture;
  reflectionTex.generateMipmaps = true;
  reflectionTex.minFilter = THREE.LinearMipmapLinearFilter;

  // Add reflector to scene
  scene.add(reflector);
  reflector.visible = currentQuality === 'high';

  return {
    composer,
    bloomPass,
    reflector,

    render: (dt: number) => {
      animTime += dt;
      if (reflectorMat.uniforms.time) {
        reflectorMat.uniforms.time.value = animTime;
      }

      if (currentQuality === 'high') {
        reflector.visible = true;
        composer.render(dt);
      } else {
        reflector.visible = false;
        renderer.render(scene, camera);
      }
    },

    setSize: (newWidth: number, newHeight: number) => {
      viewportWidth = newWidth;
      viewportHeight = newHeight;
      const currentDpr = qualityPixelRatio(currentQuality);
      composer.setPixelRatio(currentDpr);
      composer.setSize(newWidth, newHeight);

      bloomPass.resolution.set(newWidth, newHeight);

      reflector.getRenderTarget().setSize(
        Math.min(768, Math.max(256, Math.floor(newWidth * 0.35))),
        Math.min(768, Math.max(256, Math.floor(newHeight * 0.35)))
      );
    },

    setQuality: (quality: GraphicsQuality) => {
      currentQuality = quality;
      const pixelRatio = qualityPixelRatio(quality);
      renderer.setPixelRatio(pixelRatio);
      composer.setPixelRatio(pixelRatio);
      composer.setSize(viewportWidth, viewportHeight);
      renderer.shadowMap.enabled = quality === 'high';
      bloomPass.strength = quality === 'high' ? 0.42 : 0;
      reflector.visible = quality === 'high';
      reflector.getRenderTarget().setSize(
        Math.min(768, Math.max(256, Math.floor(viewportWidth * 0.35))),
        Math.min(768, Math.max(256, Math.floor(viewportHeight * 0.35)))
      );
    },

    dispose: () => {
      scene.remove(reflector);
      planeGeo.dispose();
      reflectorMat.dispose();
      reflector.dispose();

      composer.dispose();
      renderTarget.dispose();
    },
  };
}
