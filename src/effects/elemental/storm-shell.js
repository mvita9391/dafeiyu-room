/*! Storm impact shader from LinearAbiltyCastingThreeJS at 97f1de1, MIT. See /licenses/elemental-sandbox.txt. */
import { ShaderMaterial, AdditiveBlending, Color, DoubleSide } from 'three';
import { noiseGLSL } from './noise.js';

const BURST_VERTEX = /* glsl */ `
  uniform float uTime;
  uniform float uAge;
  uniform float uDisplace;
  uniform float uSeed;
  uniform float uTurbulence;

  varying vec3  vNormalW;
  varying vec3  vViewDir;
  varying float vDisp;

  ${noiseGLSL}

  void main() {

    // Billowing surface: several octaves of noise pushed along the normal,
    // scrolling outward as the burst expands.
    vec3 np = normal * (1.6 + uAge * 1.4) + vec3(uSeed * 13.0) - vec3(0.0, uTime * 0.6, 0.0);
    float n = fbm4(np) * 0.6 + ridged(np * 1.3, 4) * 0.4;
    vDisp = n;

    float amount = uDisplace * (0.35 + uAge * 0.9) * uTurbulence;
    vec3 pos = position + normal * n * amount;

    vec4 world = modelMatrix * vec4(pos, 1.0);
    vNormalW = normalize(mat3(modelMatrix) * normal);
    vViewDir = cameraPosition - world.xyz;

    vec4 mv = viewMatrix * world;
    gl_Position = projectionMatrix * mv;
  }
`;

const BURST_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uAge;
  uniform float uSeed;
  uniform float uIntensity;
  uniform float uFresnel;
  uniform float uOpacity;
  uniform vec3  uColorA;
  uniform vec3  uColorB;
  uniform vec3  uColorC;
  uniform float uGlobalGlow;

  varying vec3  vNormalW;
  varying vec3  vViewDir;
  varying float vDisp;

  ${noiseGLSL}

float fresnelTerm(vec3 viewDir, vec3 normal, float power, float scale) {
  return clamp(scale * pow(1.0 - abs(dot(normalize(viewDir), normalize(normal))), power), 0.0, 4.0);
}

/** Threshold dissolve with an emissive burn edge. Returns vec2(alphaMask, edge). */
vec2 dissolveMask(float noiseValue, float threshold, float edgeWidth) {
  float mask = step(threshold, noiseValue);
  float edge = smoothstep(threshold, threshold + edgeWidth, noiseValue) - mask;
  return vec2(mask, clamp(edge, 0.0, 1.0));
}

  void main() {
    float fres = fresnelTerm(vViewDir, vNormalW, 2.2, 1.0) * uFresnel;
    float heat = clamp(vDisp * 0.5 + 0.5, 0.0, 1.0);

    // Dissolve the shell away over the burst's life.
    vec2 dis = dissolveMask(heat, uAge * 1.15 - 0.15, 0.3);

    float alpha = uOpacity;
    vec3 color;

      // Ionised air, not a fireball. The shell has to stay *empty*: the body of
      // it contributes almost nothing, and what you see is thin filaments
      // racing over the surface plus the fresnel rim. Ridged noise scrolling in
      // the normal direction gives branching arcs that skate across it as it
      // expands. Thresholded hard on purpose — a wide band here fills the shell
      // in and it immediately reads as a rock.
      float fil = ridged(vNormalW * (5.0 + uAge * 7.0) + vec3(uSeed * 9.0) +
                         vec3(0.0, uTime * 3.4, 0.0), 4);
      float arcs = smoothstep(0.80, 0.97, fil) * (1.0 - uAge * 0.6);
      float rim = pow(fres, 1.6);
      color = mix(uColorA, uColorB, heat * 0.5);
      color = mix(color, uColorC, arcs);
      color += uColorC * rim * 1.2 + uColorC * arcs * 2.4;
      alpha *= (1.0 - uAge) * (rim * 0.55 + arcs * 0.9) * dis.x;


    alpha = clamp(alpha, 0.0, 1.0);
    if (alpha < 0.004) discard;

    color *= uIntensity * uGlobalGlow;
    gl_FragColor = vec4(color, alpha);
  }
`;

export function createStormShellMaterial() {
  const values = {
    uTime: 0, uAge: 0, uSeed: Math.random(), uDisplace: .42, uTurbulence: 1,
    uIntensity: 1.65, uFresnel: 1.85, uOpacity: .84, uGlobalGlow: 1.3,
    uColorA: new Color('#124daa'), uColorB: new Color('#69caff'), uColorC: new Color('#edfaff'),
  };
  return new ShaderMaterial({
    transparent: true, depthWrite: false, side: DoubleSide, forceSinglePass: true,
    blending: AdditiveBlending, toneMapped: false,
    uniforms: Object.fromEntries(Object.entries(values).map(([key, value]) => [key, { value }])),
    vertexShader: BURST_VERTEX, fragmentShader: BURST_FRAGMENT,
  });
}
