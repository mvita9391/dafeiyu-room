/*! From LinearAbiltyCastingThreeJS at 97f1de1. Copyright (c) 2026 mohamedachrefelouafi. MIT, see /licenses/elemental-sandbox.txt. */
import { ShaderMaterial, AdditiveBlending, Color, DoubleSide } from 'three';
import { noiseGLSL } from '../noise.js';

export const BeamPass = Object.freeze({
  CORE: 0, // the white-hot rod
  SHELL: 1, // the sheath around it
  HALO: 2, // the wide outer bloom
  COIL: 3, // ribbons spiralling around the column
  RING: 4, // shock discs racing downrange
  ORB: 5 // the charge in the caster's hands
});

const BEAM_UNIFORMS = /* glsl */ `
  #define PI  3.141592653589793
  #define TAU 6.283185307179586

  uniform float uTime;
  uniform vec3  uOrigin;
  uniform vec3  uTarget;
  uniform vec3  uSide;
  uniform float uSeed;
  uniform float uProgress;
  uniform float uFade;
  uniform float uWidthFade;
  uniform float uCharge;

  uniform float uRadius;
  uniform float uRadiusNear;
  uniform float uRadiusCurve;
  uniform float uRadiusScale;
  uniform float uFlare;
  uniform float uFlareWidth;
  uniform float uThrob;
  uniform float uThrobScale;
  uniform float uThrobSpeed;
  uniform float uWander;
  uniform float uWanderScale;
  uniform float uWanderSpeed;

  uniform float uRipple;
  uniform float uRippleBands;
  uniform float uRippleScale;
  uniform float uRippleSpeed;

  uniform float uStreak;
  uniform float uStreakSharp;
  uniform float uStreakScale;
  uniform float uStreakBands;
  uniform float uStreakGlow;
  uniform float uFlowSpeed;

  uniform float uCoreSharp;
  uniform float uCoreFill;
  uniform float uEdgePower;
  uniform float uShellRim;
  uniform float uShellFill;
  uniform float uHaloRim;
  uniform float uPassOpacity;

  uniform float uMouthGlow;
  uniform float uMouthLength;
  uniform float uTipGlow;
  uniform float uTipLength;

  uniform float uCoils;
  uniform float uCoilTurns;
  uniform float uCoilSpeed;
  uniform float uCoilRadius;
  uniform float uCoilFlare;
  uniform float uCoilWidth;
  uniform float uCoilWidthTip;
  uniform float uCoilSharp;
  uniform float uCoilPulse;
  uniform float uCoilPulseFreq;
  uniform float uCoilPulseSpeed;

  uniform float uRingCount;
  uniform float uRingSpeed;
  uniform float uRingInner;
  uniform float uRingOuter;
  uniform float uRingSwell;
  uniform float uRingFade;
  uniform float uRingSharp;

  uniform float uOrbTurbulence;
  uniform float uOrbScale;
  uniform float uOrbFlow;
  uniform float uOrbBands;
  uniform float uOrbRim;

  uniform float uOpacity;
  uniform float uGlow;
  uniform vec3  uColorCore;
  uniform vec3  uColorInner;
  uniform vec3  uColorOuter;
  uniform vec3  uColorHalo;
  uniform vec3  uColorCoil;
  uniform vec3  uColorCoilEdge;
  uniform vec3  uColorRing;
`;

/**
 * Varyings, guarded per pass.
 *
 * Both stages share this block, so a pass only ever declares the interpolants it
 * actually uses. Five is the ceiling here, which keeps the whole family well
 * inside the varying budget on the low end.
 */
const BEAM_VARYINGS = /* glsl */ `
  varying float vT;

  #if BEAM_PASS <= 2
    varying float vA;
    varying float vFacing;
  #elif BEAM_PASS == 3
    varying float vSide;
  #elif BEAM_PASS == 4
    varying float vBand;
    varying float vPhase;
  #else
    varying vec3  vNormalW;
    varying vec3  vViewDir;
    varying float vDisp;
  #endif
`;

/**
 * The shape of the beam, shared by every pass that lives on the column.
 *
 * `beamRadius` and `beamAxis` are the whole geometry: the tube, the coils and
 * the shock discs all place themselves against these two functions, which is why
 * they stay welded to each other when `radius` or `flare` is dragged. Nothing
 * caches them — they are evaluated per vertex, per frame.
 */
const BEAM_SHAPE = /* glsl */ `
  /** Half-width of the column at t, metres. */
  float beamRadius(float t) {
    float u = clamp(t, 0.0, 1.0);
    float r = mix(uRadiusNear, uRadius, pow(u, max(uRadiusCurve, 0.01)));
    // Pressure waves travelling out along it. Small — this is the beam
    // breathing, not a sausage.
    r *= 1.0 + uThrob * sin((u * uThrobScale - uTime * uThrobSpeed) * TAU);
    // ... and the cone opening out where it lands.
    r *= 1.0 + uFlare * smoothstep(1.0 - max(uFlareWidth, 1e-3), 1.0, u);
    return max(r * uRadiusScale * uWidthFade, 1e-4);
  }

  /** The column's local frame. n1/n2 span the plane across it. */
  void beamFrame(out vec3 dir, out vec3 n1, out vec3 n2) {
    vec3 delta = uTarget - uOrigin;
    float span = max(length(delta), 0.01);
    dir = delta / span;
    // Gram-Schmidt: the axis tilts down from the hands, so uSide is only
    // approximately perpendicular to it.
    vec3 lateral = uSide - dir * dot(uSide, dir);
    n1 = length(lateral) > 1e-4 ? normalize(lateral) : normalize(cross(dir, vec3(0.0, 1.0, 0.0)));
    n2 = normalize(cross(dir, n1));
  }

  /**
   * A point on the column's axis at t.
   *
   * Smooth low-frequency drift, pinned at both ends. Deliberately *smooth*: the
   * bolt's charm is that its noise is piecewise-linear and keeps its corners,
   * and this is the opposite effect — a beam that kinks is a bolt.
   */
  vec3 beamAxis(float t, vec3 n1, vec3 n2) {
    vec3 p = mix(uOrigin, uTarget, t);
    float ends = sin(clamp(t, 0.0, 1.0) * PI);
    float dx = snoise(vec3(t * uWanderScale, uTime * uWanderSpeed, uSeed));
    float dy = snoise(vec3(t * uWanderScale + 31.7, uTime * uWanderSpeed, uSeed + 7.3));
    return p + (n1 * dx + n2 * dy) * uWander * ends;
  }
`;

const BEAM_VERTEX = /* glsl */ `
  ${BEAM_UNIFORMS}
  ${BEAM_VARYINGS}

  #if BEAM_PASS == 3
    attribute float aStrand;
  #endif
  #if BEAM_PASS == 4
    attribute float aRing;
  #endif

  ${noiseGLSL}
  ${BEAM_SHAPE}

  #if BEAM_PASS == 3
    /** A point on one spiralling ribbon. */
    vec3 coilPoint(float t, float phase, vec3 n1, vec3 n2) {
      float angle = (t * uCoilTurns + uTime * uCoilSpeed + phase) * TAU;
      float r = beamRadius(t) * uCoilRadius * (1.0 + uCoilFlare * pow(clamp(t, 0.0, 1.0), 3.0));
      return beamAxis(t, n1, n2) + (n1 * cos(angle) + n2 * sin(angle)) * r;
    }
  #endif

  void main() {
    vec3 dir, n1, n2;

    #if BEAM_PASS != 5
      beamFrame(dir, n1, n2);
    #endif

    #if BEAM_PASS <= 2                                    /* the column */
      float t = position.x;
      float a = position.y;
      float angle = a * TAU;
      vec3 nrm = n1 * cos(angle) + n2 * sin(angle);

      // Break the barrel up so it is a gas column and not a machined pipe. The
      // noise crawls downrange with the flow rather than sitting still on it.
      float rip = snoise(vec3(
        cos(angle) * uRippleBands,
        sin(angle) * uRippleBands,
        t * uRippleScale - uTime * uRippleSpeed + uSeed
      ));
      float r = beamRadius(t) * (1.0 + uRipple * rip);

      vec3 here = beamAxis(t, n1, n2) + nrm * r;
      vT = t;
      vA = a;
      // 1 looking down the barrel, 0 at the silhouette. Both tube weightings
      // are built out of this one number.
      vFacing = abs(dot(normalize(cameraPosition - here), nrm));

    #elif BEAM_PASS == 3                                  /* the coils */
      float t = position.x;
      vSide = position.y;
      vT = t;

      float phase = uCoils <= 1.0 ? 0.0 : aStrand / uCoils;
      phase += hash11(aStrand * 5.31 + uSeed) * 0.12;

      vec3 here = coilPoint(t, phase, n1, n2);

      // Tangent by finite difference, mirrored at the far end so the last node
      // still has a neighbour to look at.
      float step_ = 0.015;
      float ahead = t + step_;
      float flip = 1.0;
      if (ahead > 1.0) { ahead = t - step_; flip = -1.0; }
      vec3 tangent = (coilPoint(ahead, phase, n1, n2) - here) * flip;
      tangent = length(tangent) > 1e-5 ? normalize(tangent) : dir;

      vec3 binormal = cross(tangent, normalize(cameraPosition - here));
      float bl = length(binormal);
      binormal = bl > 1e-4 ? binormal / bl : n1;

      float halfWidth = uCoilWidth * mix(1.0, uCoilWidthTip, clamp(t, 0.0, 1.0));
      // Drawn to a point at the muzzle so the ribbons grow out of the orb.
      halfWidth *= smoothstep(0.0, 0.05, t) * uWidthFade * uFade;
      here += binormal * position.y * halfWidth;

    #elif BEAM_PASS == 4                                  /* the shock discs */
      // Evenly spaced along the column and slid downrange by the clock, so the
      // train is a pure function of time — there is no queue on the CPU.
      float phase = fract(aRing / max(uRingCount, 1.0) + uTime * uRingSpeed + uSeed * 0.37);
      float t = phase;
      float angle = position.y * TAU;
      float r = beamRadius(t) * mix(uRingInner, uRingOuter, position.x) * (1.0 + uRingSwell * phase);

      vec3 here = beamAxis(t, n1, n2) + (n1 * cos(angle) + n2 * sin(angle)) * r;
      vT = t;
      vBand = position.x;
      vPhase = phase;

    #else                                                 /* the charge orb */
      // The one pass that goes through the model matrix: the ability places and
      // scales the orb, so it needs no world-space plumbing of its own.
      vec3 np = normal * uOrbScale + vec3(uSeed * 3.1) - vec3(0.0, uTime * uOrbFlow, 0.0);
      float n = fbm4(np) * 0.6 + ridged(np * 1.4, 4) * 0.4;
      vDisp = n;

      vec4 world = modelMatrix * vec4(position + normal * n * uOrbTurbulence, 1.0);
      vec3 here = world.xyz;
      vNormalW = normalize(mat3(modelMatrix) * normal);
      vViewDir = cameraPosition - here;
      vT = 0.0;
    #endif

    vec4 mv = viewMatrix * vec4(here, 1.0);
    gl_Position = projectionMatrix * mv;
  }
`;

const BEAM_FRAGMENT = /* glsl */ `
  ${BEAM_UNIFORMS}
  ${BEAM_VARYINGS}

  uniform float uGlobalGlow;

  ${noiseGLSL}

  void main() {
    vec3 color = vec3(0.0);
    float alpha = 0.0;

    #if BEAM_PASS == 5                                    /* the charge orb */
      float facing = abs(dot(normalize(vViewDir), normalize(vNormalW)));
      float rim = pow(1.0 - facing, max(uOrbRim, 0.05));
      float heat = clamp(vDisp * 0.5 + 0.5, 0.0, 1.0);
      // Filaments crawling over the surface, thresholded hard: a wide band here
      // fills the orb in and it stops reading as contained energy.
      float fil = smoothstep(0.74, 0.98,
        ridged(vNormalW * uOrbBands + vec3(0.0, uTime * uOrbFlow * 2.0, 0.0) + uSeed, 4));

      color = mix(uColorOuter, uColorInner, heat);
      color = mix(color, uColorCore, clamp(fil + rim * 0.35, 0.0, 1.0));
      color += uColorCore * fil * 1.6;
      alpha = (0.2 + rim * 0.9 + fil * 0.75) * uCharge;

    #else
      // Ahead of the leading edge there is no beam yet. The column is built
      // whole and clipped here rather than scaled, so its *shape* never changes
      // as the front travels — only how much of it exists.
      float tip = max(uTipLength, 1e-3);
      float drawn = 1.0 - smoothstep(uProgress - tip, uProgress, vT);
      if (drawn <= 0.002) discard;

      #if BEAM_PASS <= 2                                  /* the column */
        float angle = vA * TAU;
        // Filaments streaming downrange, stretched hard along the axis: this is
        // gas being pushed through a barrel, not a bolt looking for ground.
        float flow = ridged(vec3(
          vT * uStreakScale - uTime * uFlowSpeed,
          cos(angle) * uStreakBands,
          sin(angle) * uStreakBands + uSeed
        ), 4);
        float streak = smoothstep(mix(0.42, 0.86, clamp(uStreakSharp, 0.0, 1.0)), 0.99, flow) * uStreak;

        float facing = clamp(vFacing, 0.0, 1.0);
        float axisward = pow(facing, max(uCoreSharp, 0.05));
        float rim = pow(1.0 - facing, max(uEdgePower, 0.05));

        #if BEAM_PASS == 0                                /* CORE */
          color = mix(uColorInner, uColorCore, clamp(0.35 + streak, 0.0, 1.0));
          alpha = uCoreFill * mix(0.28, 1.0, axisward) + streak * 0.35;

        #elif BEAM_PASS == 1                              /* SHELL */
          color = mix(uColorOuter, uColorInner, clamp(rim * 0.55 + streak, 0.0, 1.0));
          color += uColorCore * streak * uStreakGlow;
          alpha = rim * uShellRim + uShellFill * mix(0.12, 1.0, axisward) + streak * 0.4;

        #else                                             /* HALO */
          float wide = pow(1.0 - facing, max(uHaloRim, 0.05));
          color = mix(uColorHalo, uColorOuter, wide);
          alpha = wide;
        #endif

        // The mouth, where the column is still being fed out of the orb.
        float mouth = 1.0 - smoothstep(0.0, uMouthLength, vT);
        color += uColorCore * mouth * uMouthGlow;
        alpha += mouth * uMouthGlow * 0.2;

        // The leading edge while it travels — and, once it has landed, the
        // white-hot end where it is still burning into the floor.
        float lead = smoothstep(uProgress - tip * 2.0, uProgress, vT);
        color += uColorCore * lead * uTipGlow;
        alpha += lead * uTipGlow * 0.18;

      #elif BEAM_PASS == 3                                /* the coils */
        float v = clamp(abs(vSide), 0.0, 1.0);
        float profile = pow(1.0 - v, max(uCoilSharp, 0.05));
        // A charge running out along the ribbon, which is what stops the coils
        // reading as static piping wrapped around the beam.
        float pulse = 0.5 + 0.5 * sin((vT * uCoilPulseFreq - uTime * uCoilPulseSpeed) * TAU);
        color = mix(uColorCoilEdge, uColorCoil, profile);
        color += uColorCore * pulse * profile * uCoilPulse;
        alpha = profile * mix(1.0 - clamp(uCoilPulse, 0.0, 0.9) * 0.5, 1.0, pulse);

      #else                                               /* the shock discs */
        float band = 1.0 - abs(vBand * 2.0 - 1.0);
        float profile = pow(clamp(band, 0.0, 1.0), max(uRingSharp, 0.05));
        // Discs thin out as they run downrange and the pressure behind them
        // drops off.
        color = mix(uColorRing, uColorCore, profile);
        alpha = profile * mix(1.0, uRingFade, vPhase);
      #endif

      alpha *= drawn;
    #endif

    alpha *= uFade * uOpacity * uPassOpacity;
    if (alpha < 0.003) discard;


    color *= uGlow * uGlobalGlow;
    gl_FragColor = vec4(color, alpha);
  }
`;

// Original preset with dimensions fitted to the yard's metre scale.
const defaults = {
  uRadius: 0.77,
  uRadiusNear: 0.16,
  uRadiusCurve: 1.27,
  uFlare: 1.74,
  uFlareWidth: 0.09,
  uThrob: 0.0,
  uThrobScale: 4.8,
  uThrobSpeed: 2.6,
  uWander: 0.0,
  uWanderScale: 0.9,
  uWanderSpeed: 0.7,
  uRipple: 0.2,
  uRippleBands: 2.2,
  uRippleScale: 4.25,
  uRippleSpeed: 2.0,
  uStreak: 1.1,
  uStreakSharp: 0.45,
  uStreakScale: 4.2,
  uStreakBands: 1.8,
  uStreakGlow: 0.55,
  uFlowSpeed: 7.0,
  uCoreSharp: 1.55,
  uCoreFill: 0.6,
  uEdgePower: 2.2,
  uShellRim: 1.15,
  uShellFill: 0.18,
  uHaloRim: 4.3,
  uMouthGlow: 1.6,
  uMouthLength: 0.1,
  uTipGlow: 0.6,
  uTipLength: 0.09,
  uCoils: 4,
  uCoilTurns: 1.45,
  uCoilSpeed: -0.69,
  uCoilRadius: 1.88,
  uCoilFlare: 0.57,
  uCoilWidth: 0.1,
  uCoilWidthTip: 1.9,
  uCoilSharp: 2.2,
  uCoilPulse: 0.65,
  uCoilPulseFreq: 3.0,
  uCoilPulseSpeed: 1.6,
  uRingSpeed: 1.31,
  uRingInner: 2.42,
  uRingOuter: 2.73,
  uRingSwell: 0.55,
  uRingFade: 0.18,
  uRingSharp: 1.6,
  uOrbTurbulence: 0.24,
  uOrbScale: 2.2,
  uOrbFlow: 0.9,
  uOrbBands: 5.0,
  uOrbRim: 1.8,
  uOpacity: 0.29,
  uColorCore: new Color('#ffffff'),
  uColorInner: new Color('#d3f4ff'),
  uColorOuter: new Color('#3ec6ff'),
  uColorHalo: new Color('#0d3ce0'),
  uColorCoil: new Color('#ffdc8c'),
  uColorCoilEdge: new Color('#ff6a12'),
  uColorRing: new Color('#9ceeff'),
};

const passLook = [
  [.2, 1, .74], [1, .95, .74], [2.75, .14, .59],
  [1, 2, 8], [1, .7, 2.4], [1, 1, 2.8],
];

export function createBeamMaterial(pass, state) {
  const [radiusScale, opacity, glow] = passLook[pass];
  const values = {
    ...defaults,
    uRadiusNear: defaults.uRadiusNear * .74,
    uRadius: defaults.uRadius * .58,
    uCoilWidth: defaults.uCoilWidth * .73,
    uRadiusScale: radiusScale,
    uPassOpacity: opacity,
    uGlow: glow,
    uGlobalGlow: 1.65,
    uRingCount: 10,
  };
  return new ShaderMaterial({
    defines: { BEAM_PASS: pass },
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
    forceSinglePass: true,
    toneMapped: false,
    uniforms: {
      ...Object.fromEntries(Object.entries(values).map(([key, value]) => [key, { value }])),
      ...state,
    },
    vertexShader: BEAM_VERTEX,
    fragmentShader: BEAM_FRAGMENT,
  });
}
