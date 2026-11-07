/*! From LinearAbiltyCastingThreeJS at 97f1de1. Copyright (c) 2026 mohamedachrefelouafi. MIT, see /licenses/elemental-sandbox.txt. */
import { MeshStandardMaterial, Color, DoubleSide } from 'three';
import { noiseGLSL } from './noise.js';

export function createIceMaterial() {
  const material = new MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.16,
    metalness: 0.0,
    flatShading: true,
    transparent: true,
    // Ice is translucent, so the far wall of a crystal is part of what you see
    // through the near one. Culling it left the interior empty and the spikes
    // read as hollow shells wherever the body was thin.
    side: DoubleSide,
    // Kept on: the crystals are near-opaque, and writing depth is what stops the
    // field from sorting through itself and lets the mist fade against it.
    depthWrite: true
  });

  const uniforms = {
    uTime: { value: 0 },
    uColorDeep: { value: new Color('#3e737a') },
    uColorIce: { value: new Color('#8adaff') },
    uColorRim: { value: new Color('#f2feff') },
    uColorCore: { value: new Color('#638797') },
    uDensity: { value: 1.15 },
    uFresnel: { value: 2.3 },
    uFresnelPower: { value: 2.4 },
    uTranslucency: { value: 1.5 },
    uFacetSharp: { value: 0.68 },
    uFracture: { value: 0.62 },
    uFractureScale: { value: 6.5 },
    uVeins: { value: 0.45 },
    uVeinScale: { value: 3.2 },
    uSparkle: { value: 1.6 },
    uSparkleScale: { value: 34 },
    uSparkleSpeed: { value: 0.7 },
    uFrostLine: { value: 0.5 },
    uGlow: { value: 1.08 },
    uEdgeGlow: { value: 2.0 },
    uBirthGlow: { value: 1.6 }
  };

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
         attribute float aSeed;
         attribute float aBirth;
         varying vec3  vIceLocal;
         varying vec3  vIceWorld;
         varying float vIceSeed;
         varying float vIceBirth;`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
         vIceLocal = transformed;
         vIceSeed = aSeed;
         vIceBirth = aBirth;
         #ifdef USE_INSTANCING
           vIceWorld = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
         #else
           vIceWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
         #endif`
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
         uniform float uTime;
         uniform vec3  uColorDeep;
         uniform vec3  uColorIce;
         uniform vec3  uColorRim;
         uniform vec3  uColorCore;
         uniform float uDensity;
         uniform float uFresnel;
         uniform float uFresnelPower;
         uniform float uTranslucency;
         uniform float uFacetSharp;
         uniform float uFracture;
         uniform float uFractureScale;
         uniform float uVeins;
         uniform float uVeinScale;
         uniform float uSparkle;
         uniform float uSparkleScale;
         uniform float uSparkleSpeed;
         uniform float uFrostLine;
         uniform float uGlow;
         uniform float uEdgeGlow;
         uniform float uBirthGlow;
         varying vec3  vIceLocal;
         varying vec3  vIceWorld;
         varying float vIceSeed;
         varying float vIceBirth;
         ${noiseGLSL}`
      )
      // Injected once the normal is resolved: with `flatShading` there is no
      // `vNormal` varying, so every view-dependent term here has to read the
      // face normal that <normal_fragment_begin> derives from derivatives.
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
         {
           vec3  N   = normalize(normal);
           float ndv = clamp(dot(N, normalize(vViewPosition)), 0.0, 1.0);

           // Facing a facet you look down the long axis of the crystal; at a
           // grazing angle you are only clipping its edge.
           float thickness = clamp(ndv * uDensity, 0.0, 1.0);
           float fres = pow(1.0 - ndv, uFresnelPower) * uFresnel;

           // World space: crack planes keep a fixed physical scale, so a small
           // shard and a tall spike look cut from the same glacier.
           vec3  fp     = vIceWorld * uFractureScale + vIceSeed * 37.0;
           float cracks = smoothstep(0.55, 0.98, ridged(fp, 4));

           // Local space: veining follows each crystal's own axis.
           float veins = fbm3(vIceLocal * uVeinScale * 4.0 + vIceSeed * 11.0) * 0.5 + 0.5;
           veins = smoothstep(0.45, 0.92, veins);

           vec3 body = mix(uColorIce, uColorDeep, thickness);
           body = mix(body, uColorRim, veins * uVeins * 0.55);
           body = mix(body, uColorRim, cracks * uFracture * 0.4);

           // Rime gathers where the crystal left the floor.
           float rime = (1.0 - smoothstep(0.0, 0.55, vIceLocal.y)) *
                        (0.5 + 0.5 * fbm3(vIceLocal * 9.0 + vIceSeed * 5.0));
           body = mix(body, uColorRim, clamp(rime, 0.0, 1.0) * uFrostLine);

           // Lift the facets that point at the camera so the silhouette reads as
           // a bundle of planes rather than one smooth mass.
           body *= mix(1.0, 0.55 + 0.9 * ndv, uFacetSharp);

           // Pinpoint glints, biased to the grazing angles where ice catches.
           float sp = snoise(vIceWorld * uSparkleScale +
                             vec3(0.0, uTime * uSparkleSpeed, 0.0) + vIceSeed * 23.0);
           sp = pow(clamp(sp, 0.0, 1.0), 14.0) * smoothstep(0.0, 0.7, fres + 0.3);

           diffuseColor.rgb *= body;

           // The rim *glow* rides a normalised 0..1 fresnel, not fres. fres
           // carries uFresnel (2.3 by default) because it also drives opacity,
           // and folding that gain into the emissive too was multiplying the
           // silhouette up past 4x white before any of the other terms landed.
           float rimAmount = pow(1.0 - ndv, uFresnelPower);

           vec3 glow = uColorRim * rimAmount * uEdgeGlow;
           glow += uColorCore * (cracks * uFracture * 0.8 + veins * uVeins * 0.35) * uTranslucency;
           glow += uColorRim * sp * uSparkle * 1.5;
           glow += uColorCore * vIceBirth * uBirthGlow;
           glow *= uGlow;

           // Soft ceiling. The terms above are independent and all peak at a
           // grazing angle, so they stack: without this a facet on the silhouette
           // sums to well over 10 and the crystal reads as a white blob with the
           // bloom pass smeared across it. A Reinhard rolloff leaves everything
           // under ~1 essentially untouched and asymptotes at 1/0.22 ≈ 4.5, so
           // the sliders still bite at the top of their range without blowing out.
           glow /= 1.0 + glow * 0.22;

           totalEmissiveRadiance += glow;

           // Thin at the edges, denser through the body and along the cracks.
           diffuseColor.a = clamp(diffuseColor.a * (0.62 + 0.5 * fres) + cracks * 0.12, 0.0, 1.0);
         }`
      );
  };
  material.customProgramCacheKey = () => "elemental-frost";

  material.userData.uniforms = uniforms;

  material.opacity = .92;
  material.envMapIntensity = .9;
  return material;
}
