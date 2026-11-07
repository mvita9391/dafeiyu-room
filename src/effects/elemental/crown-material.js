/*! From LinearAbiltyCastingThreeJS at 97f1de1. Copyright (c) 2026 mohamedachrefelouafi. MIT, see /licenses/elemental-sandbox.txt. */
import { ShaderMaterial, Color, Vector3, DoubleSide, AdditiveBlending } from 'three';
import { noiseGLSL } from './noise.js';

const GLACIER_VERTEX = /* glsl */ `
  attribute float aSeed;
  attribute float aBirth;
  attribute float aGrow;
  attribute float aShatter;

  varying vec3  vLocal;
  varying vec3  vWorld;
  varying vec3  vNormalW;
  varying vec3  vView;
  varying vec3  vAxis;
  varying float vSeed;
  varying float vBirth;
  varying float vGrow;
  varying float vShatter;

  void main() {
    vLocal = position;
    vSeed = aSeed;
    vBirth = aBirth;
    vGrow = aGrow;
    vShatter = aShatter;

    vec3 objectNormal = normal;
    vec3 objectAxis = vec3(0.0, 1.0, 0.0);
    vec4 world;

    #ifdef USE_INSTANCING
      // A blade is scaled (radius, height, radius), which is anisotropic — the
      // instance matrix would tip every normal toward the long axis. Dividing by
      // the squared column lengths is the inverse-transpose three itself uses.
      mat3 im = mat3(instanceMatrix);
      vec3 invScale = vec3(dot(im[0], im[0]), dot(im[1], im[1]), dot(im[2], im[2]));
      objectNormal = im * (objectNormal / invScale);
      objectAxis = im * (objectAxis / invScale);
      world = modelMatrix * instanceMatrix * vec4(position, 1.0);
    #else
      world = modelMatrix * vec4(position, 1.0);
    #endif

    vWorld = world.xyz;
    vNormalW = normalize(mat3(modelMatrix) * objectNormal);
    vAxis = normalize(mat3(modelMatrix) * objectAxis);
    vView = cameraPosition - world.xyz;

    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

/**
 * Not ice you look *at* — ice you look *through*, lit from inside.
 *
 * The Frost Lance's crystals are quarried stone: a patched standard material,
 * milky with feather frost and rime, tinted deeper the thicker the body gets. If
 * this ability borrowed that treatment it would read as the same spell twice, so
 * the Glacial Crown's blades are shaded from scratch and from the opposite end.
 * Almost nothing is diffuse. What you see is:
 *
 *   - **a dispersive edge.** The fresnel term is evaluated *three times*, at
 *     three slightly different exponents, and the results drive red, green and
 *     blue independently — so every silhouette carries a genuine chromatic
 *     fringe, cyan on one lip and violet on the other, the way a real prism
 *     splits a highlight. `dispersion` is how far the three come apart.
 *   - **light piped up the blade.** Emission gathers on the faces the axis runs
 *     *along* rather than the ones facing you, and climbs toward the point
 *     (`tipBias`) with a slow band travelling up it (`bands`, `pulseSpeed`),
 *     ending in an incandescent tip. That is what makes a blade read as a fibre
 *     of frozen light rather than as a lump.
 *   - **striations, not frost.** Ridged noise stretched hard along the blade's
 *     own axis, so the interior shows flow lines running its length instead of
 *     the Lance's milky clouding.
 *   - **a real reflection.** One equirect sample of the stage's HDR probe off
 *     the facet, plus a tight sun lobe, so the facets actually catch the room
 *     they are standing in.
 *
 * On top of that sit the ability's two signatures, the reason this is a material
 * and not a colour swap:
 *
 *   - **the freeze front.** `aGrow` is a per-instance height, 0 at the floor and
 *     1 at the point, and everything above it is discarded against a noisy cut,
 *     so a blade *crystallises upward* out of the ground rather than sliding out
 *     of a hole. The travelling lip is lit (`frontGlow`).
 *   - **the shatter.** `aShatter` is a threshold against a per-fragment chunk id
 *     — half a voronoi cell in the blade's own space, half a hash of its flat
 *     face normal — so a dying blade loses whole plates and wedges one at a
 *     time, each break edge flaring as it goes.
 *
 * Per-instance inputs arrive as instanced attributes (`aSeed`, `aBirth`,
 * `aGrow`, `aShatter`), which is why this material is only ever used on an
 * InstancedMesh. The geometry is non-indexed with per-face normals, so the
 * facets come out crisp without a `flatShading` flag to ask for it.
 */
const GLACIER_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform vec3  uSunDir;

  uniform vec3  uColorGlass;
  uniform vec3  uColorEdge;
  uniform vec3  uColorPrismA;
  uniform vec3  uColorPrismB;
  uniform vec3  uColorCore;
  uniform vec3  uColorTip;

  uniform float uBody;
  uniform float uEdgePower;
  uniform float uEdgeGain;
  uniform float uDispersion;
  uniform float uPipe;
  uniform float uTipBias;
  uniform float uBands;
  uniform float uPulseSpeed;
  uniform float uTipStart;
  uniform float uTipGlow;
  uniform float uStria;
  uniform float uStriaScale;
  uniform float uEnvIntensity;
  uniform float uSpecular;
  uniform float uBirthGlow;

  uniform float uFrontRough;
  uniform float uFrontWidth;
  uniform float uFrontGlow;
  uniform float uShatterScale;
  uniform float uShatterEdge;
  uniform float uShatterGlow;

  uniform float uGlow;
  uniform float uOpacity;
  uniform float uGlobalGlow;

  varying vec3  vLocal;
  varying vec3  vWorld;
  varying vec3  vNormalW;
  varying vec3  vView;
  varying vec3  vAxis;
  varying float vSeed;
  varying float vBirth;
  varying float vGrow;
  varying float vShatter;

  ${noiseGLSL}

  #define TAU 6.28318530718

  void main() {
    vec3 N = normalize(vNormalW);
    vec3 V = normalize(vView);
    // Double-sided: the far wall of a blade is half of what you see through the
    // near one, and its normal has to be flipped or it shades inside out.
    if (dot(N, V) < 0.0) N = -N;

    float ndv = clamp(dot(N, V), 0.0, 1.0);
    float h = clamp(vLocal.y, 0.0, 1.0);

    /* ---- the freeze front: everything above it does not exist yet ---- */
    // The roughness is added back on before the noise is taken off again, so a
    // fully grown blade (aGrow = 1) can never cut into itself.
    float ragged = snoise01(vLocal * 5.0 + vSeed * 7.0) * uFrontRough;
    float front  = vGrow * (1.0 + uFrontRough) - ragged;
    if (h > front) discard;
    float freezing = smoothstep(front - uFrontWidth, front, h) *
                     (1.0 - smoothstep(0.985, 1.0, vGrow));

    /* ---- the shatter: plates and wedges leaving one at a time ---- */
    // Two structures averaged. The voronoi half breaks the body into chunks that
    // ignore the geometry; the facet half takes whole flat faces away, which is
    // what actually happens to a crystal.
    float breaking = 0.0;
    if (vShatter > 0.001) {
      vec2 cell = voronoi2(vLocal.xz * uShatterScale + vLocal.y * 4.0 + vSeed * 13.0);
      float facet = hash13(floor(N * 6.0) + vSeed * 3.0);
      float chunk = 0.55 * cell.y + 0.45 * facet;
      if (chunk < vShatter) discard;
      breaking = 1.0 - smoothstep(vShatter, vShatter + uShatterEdge, chunk);
    }

    /* ---- the dispersive edge ---- */
    vec3 fres = pow(
      vec3(1.0 - ndv),
      vec3(uEdgePower * (1.0 - uDispersion * 0.4), uEdgePower, uEdgePower * (1.0 + uDispersion * 0.55))
    );
    // Each facet takes its own place in the split, so neighbouring faces on one
    // blade do not all fringe the same colour.
    vec3 prism = mix(uColorPrismA, uColorPrismB, hash13(floor(N * 7.0) + vSeed * 5.0));

    /* ---- light piped up the blade to the point ---- */
    float along = 1.0 - abs(dot(N, vAxis)); // the long faces, not the caps
    float pipe = along * pow(h, uTipBias);
    float band = 0.5 + 0.5 * sin((h * uBands - uTime * uPulseSpeed) * TAU + vSeed * 5.0);
    pipe *= mix(0.6, 1.0, band * band);
    float tip = smoothstep(uTipStart, 1.0, h);

    /* ---- flow lines running its length ---- */
    float stria = ridged(vec3(vLocal.xz * uStriaScale, vLocal.y * uStriaScale * 0.3 + vSeed * 9.0), 4);
    stria = smoothstep(0.7, 0.97, stria) * along;

    /* ---- the room it is standing in ---- */
    vec3 refl = reflect(-V, N);
    vec3 env = mix(vec3(.05, .11, .16), vec3(.28, .48, .65), clamp(refl.y * .5 + .5, 0.0, 1.0)) * uEnvIntensity;
    float sun = pow(max(dot(refl, -uSunDir), 0.0), 90.0) * uSpecular;

    vec3 color = uColorGlass * uBody * (0.25 + 0.75 * ndv);
    color += prism * fres * uEdgeGain;
    color += uColorEdge * fres.g * fres.g * uEdgeGain * 0.5;
    color += uColorCore * pipe * uPipe;
    color += uColorEdge * stria * uStria;
    color += uColorTip * tip * uTipGlow;
    color += env * (0.35 + 0.65 * fres.g) + uColorEdge * sun;
    color += uColorEdge * freezing * uFrontGlow;
    color += uColorCore * breaking * uShatterGlow;
    color += uColorCore * vBirth * uBirthGlow;
    color *= uGlow;

    // Soft ceiling. Every term peaks at a grazing angle and they stack; a
    // Reinhard rolloff leaves anything under ~1 alone and asymptotes at 1/0.16 ≈
    // 6, so the sliders keep biting at the top of their range without flattening
    // the blade into a white cutout.
    color /= 1.0 + color * 0.16;

    // Glass: thin and clear through the body, solid at the silhouette, the tip
    // and any edge that is currently freezing or breaking.
    float alpha = uBody * 0.4 + fres.g * 1.25 + pipe * 0.45 + stria * 0.3 +
                  tip * 0.55 + freezing + breaking;
    alpha = clamp(alpha, 0.0, 1.0) * uOpacity;
    if (alpha < 0.004) discard;

    gl_FragColor = vec4(color * uGlobalGlow, alpha);
  }
`;

const FIELD_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/**
 * The circle the indicator promised, **frozen** into the floor.
 *
 * Same signed-distance construction and the same thick boundary as the aim
 * circle and the Voltaic Snare's burnt field — that correspondence is the point:
 * what you measured out before you clicked is what is standing on the ground
 * afterwards. What it does not share is the treatment. Where the snare's field
 * is charred and veined, this one is a *sheet of ice*, and it is built from the
 * three things that actually read as frozen ground:
 *
 *   - **plates.** A voronoi field whose *seams* are bright, because rime piles
 *     up thickest where two plates meet. The cell id also breaks the tone of
 *     each plate, so the sheet has facets rather than a wash.
 *   - **fingers.** Domain-warped ridged noise weighted to the radius: frost
 *     never advances as a circle, it reaches. Sampled in the *plane* and never
 *     on `atan()`, which would hand every radius along a bearing the same value
 *     and draw dead-straight spokes out of the middle.
 *   - **a front.** `uFreeze` is how far the ice has got, 0..1 of the boundary,
 *     with the same angular fingering dragging the edge out of round. It runs
 *     forward as the crown opens and *retreats* as it collapses, so the disc
 *     freezes outward and thaws inward instead of fading in place.
 *
 * It is an ability-owned mesh rather than a pooled decal for one reason: a decal
 * captures its radius when it spawns, and this circle has to re-scale under
 * `zoneRadius` while it is still standing.
 */
const FIELD_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uQuadSize;    // metres the quad covers, edge to edge
  uniform float uRadius;      // footprint radius, metres
  uniform float uBoundary;    // thickness of the band that is the edge
  uniform float uBoundaryGlow;
  uniform float uFill;
  uniform float uFalloff;
  uniform float uPlates;
  uniform float uPlateScale;
  uniform float uSeam;
  uniform float uFingers;
  uniform float uFingerScale;
  uniform float uWarp;
  uniform float uCrawl;
  uniform float uRings;
  uniform float uRingSpeed;
  uniform float uSweep;
  uniform float uSweepSpeed;
  uniform float uCore;
  uniform float uCoreSize;
  uniform float uPulse;
  uniform float uPulseSpeed;
  uniform float uFreeze;      // 0..1 — how far the sheet has spread
  uniform float uSeed;
  uniform float uFade;
  uniform float uOpacity;
  uniform vec3  uColorField;
  uniform vec3  uColorEdge;
  uniform float uGlobalGlow;

  varying vec2 vUv;

  ${noiseGLSL}

  #define TAU 6.28318530718

  void main() {
    /* ---- uv → metres, measured from the centre of the footprint ---- */
    vec2 p = vec2(vUv.x - 0.5, 0.5 - vUv.y) * uQuadSize;
    float d = length(p);

    float outer = uRadius + uBoundary * 0.4;
    float inner = max(0.01, uRadius - uBoundary * 0.6);

    float aa = fwidth(d) + 0.02;
    if (d > outer + aa * 4.0) discard;

    /* ---- how far the ice has actually got ---- */
    // The front is dragged out of round by an angular lookup — the one place an
    // angular function is the right tool, because this *is* a boundary.
    vec2  bearing = d > 1e-4 ? p / d : vec2(1.0, 0.0);
    float fingers = 0.78 + 0.3 * snoise(vec3(bearing * 3.1, uSeed * 6.0));
    float reach   = uFreeze * outer * fingers;
    float frozen  = (1.0 - smoothstep(reach - uBoundary * 1.6, reach, d));
    if (frozen < 0.004) discard;

    float band = (1.0 - smoothstep(outer - aa, outer + aa, d)) * smoothstep(inner - aa, inner + aa, d);
    float interior = (1.0 - smoothstep(inner - aa, inner + aa, d));
    float radial = clamp(d / inner, 0.0, 1.0);

    /* ---- the sheet: plates, and the rime piled in their seams ---- */
    vec2  cell  = voronoi2(p * uPlateScale + uSeed * 20.0);
    float seams = (1.0 - smoothstep(0.02, 0.28, cell.x)) * uSeam;
    float plate = mix(0.55, 1.0, cell.y) * uPlates;

    /* ---- frost fingers crawling over it ---- */
    float warp = fbm3(vec3(p * 0.5, uTime * 0.12 + uSeed)) * uWarp;
    float fil  = ridged(vec3(p * uFingerScale + warp, uSeed * 11.0 + uTime * uCrawl), 4);
    float frost = smoothstep(0.66, 0.95, fil) * uFingers * (0.35 + 0.65 * radial);

    /* ---- pressure rings, travelling inward toward the spire ---- */
    float ring = 0.5 + 0.5 * cos((radial * uRings + uTime * uRingSpeed) * TAU);
    ring = pow(ring, 8.0) * interior;

    /* ---- a slow cold sweep, so a standing field is never quite still ---- */
    float ang = atan(p.y, p.x) / TAU + 0.5;
    float sweepPhase = fract(ang - uTime * uSweepSpeed);
    float sweep = pow(1.0 - sweepPhase, 6.0) * smoothstep(0.0, 0.05, sweepPhase) * uSweep * interior;

    /* ---- the pool the spire stands in ---- */
    float core = (1.0 - smoothstep(0.0, uCoreSize * uRadius, d)) * uCore;

    float breathe = 1.0 + uPulse * sin(uTime * uPulseSpeed * TAU);
    float wash  = interior * pow(radial, uFalloff) * uFill * plate;
    float body  = (wash + frost * 0.8) * breathe;
    float lines = (band * uBoundaryGlow + seams * interior * 0.9 + ring * 0.4 + sweep + core) * breathe;

    float alpha = clamp(body + lines, 0.0, 1.0) * frozen * uFade * uOpacity;
    if (alpha < 0.004) discard;

    vec3 color = uColorField * body + uColorEdge * lines;
    // The advancing lip is still freezing, so it stays lit while it travels.
    color += uColorEdge * (1.0 - smoothstep(0.0, uBoundary * 1.2, abs(d - reach))) * 0.9 *
             step(0.02, uFreeze) * step(uFreeze, 0.985);

    gl_FragColor = vec4(color * uGlobalGlow, alpha);
  }
`;

const bladeDefaults = {
  uColorGlass: new Color('#0e4a66'),
  uColorEdge: new Color('#ffffff'),
  uColorPrismA: new Color('#57f0ff'),
  uColorPrismB: new Color('#8f9bff'),
  uColorCore: new Color('#a8f4ff'),
  uColorTip: new Color('#ffffff'),
  uBody: 1.37,
  uEdgePower: 1.14,
  uEdgeGain: 0.81,
  uDispersion: 0.73,
  uPipe: 1.09,
  uTipBias: 1.6,
  uBands: 1.4,
  uPulseSpeed: 0.6,
  uTipStart: 0.6,
  uTipGlow: 1.5,
  uStria: 0.75,
  uStriaScale: 6.0,
  uEnvIntensity: 0.6,
  uSpecular: 2.0,
  uBirthGlow: 2.2,
  uFrontRough: 0.35,
  uFrontWidth: 0.12,
  uFrontGlow: 2.4,
  uShatterScale: 7.0,
  uShatterEdge: 0.08,
  uShatterGlow: 3.0,
  uGlow: 1.0,
  uOpacity: 1.0,
};

const fieldDefaults = {
  uBoundary: 0.4,
  uBoundaryGlow: 2.4,
  uFill: 0.26,
  uFalloff: 1.4,
  uPlates: 1.0,
  uPlateScale: 2.2,
  uSeam: 0.8,
  uFingers: 0.9,
  uFingerScale: 1.6,
  uWarp: 0.5,
  uCrawl: 0.12,
  uRings: 2.6,
  uRingSpeed: -0.5,
  uSweep: 0.4,
  uSweepSpeed: 0.12,
  uCore: 1.0,
  uCoreSize: 0.2,
  uPulse: 0.18,
  uPulseSpeed: 1.6,
  uOpacity: 1.0,
  uColorField: new Color('#a7e6ff'),
  uColorEdge: new Color('#ffffff'),
};

function uniforms(values) {
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, { value }]));
}

export function createCrownBladeMaterial() {
  return new ShaderMaterial({
    transparent: true, depthWrite: true, side: DoubleSide, forceSinglePass: true, toneMapped: false,
    vertexShader: GLACIER_VERTEX, fragmentShader: GLACIER_FRAGMENT,
    uniforms: uniforms({ ...bladeDefaults, uTime: 0, uGlobalGlow: 1.10,
      uSunDir: new Vector3(-.7, -.65, .4).normalize() }),
  });
}

export function createCrownFieldMaterial(radius, size) {
  return new ShaderMaterial({
    transparent: true, depthWrite: false, blending: AdditiveBlending, toneMapped: false,
    vertexShader: FIELD_VERTEX, fragmentShader: FIELD_FRAGMENT,
    uniforms: uniforms({ ...fieldDefaults, uBoundary: .18, uPlateScale: 3.4,
      uTime: 0, uGlobalGlow: .84, uRadius: radius, uQuadSize: size, uFreeze: 0,
      uSeed: Math.random(), uFade: 1 }),
  });
}
