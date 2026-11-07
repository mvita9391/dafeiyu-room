import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';


// 最终调色：暗角 + 轻微色偏 + 胶片颗粒
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uVignette: { value: 1.0 },
    uGrain: { value: 0.035 },
    uRes: { value: new THREE.Vector2(1, 1) },
    uWarm: { value: 0.06 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float uTime, uVignette, uGrain, uWarm; uniform vec2 uRes;
    varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    void main(){
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      // 暗角
      vec2 d = (vUv - 0.5) * vec2(1.0, uRes.y / uRes.x);
      float v = smoothstep(0.86, 0.18, length(d) * uVignette);
      c *= mix(1.0, v, 0.55);
      // 暖部/冷部轻微分离
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c.rgb += uWarm * (l - 0.35) * vec3(1.0, 0.55, -0.25);
      // 颗粒
      float g = hash(vUv * uRes + uTime) - 0.5;
      c += g * uGrain * (0.35 + 0.65 * smoothstep(0.0, 0.35, l));
      gl_FragColor = vec4(max(c, 0.0), 1.0);
    }`,
};

export function createRenderer(container) {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
    stencil: false,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.06;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0x000000, 0);
  container.appendChild(renderer.domElement);

  const rt = new THREE.WebGLRenderTarget(
    Math.floor(window.innerWidth * renderer.getPixelRatio()),
    Math.floor(window.innerHeight * renderer.getPixelRatio()),
    { samples: 2, type: THREE.HalfFloatType, colorSpace: THREE.LinearSRGBColorSpace }
  );
  const composer = new EffectComposer(renderer, rt);
  composer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const gradePass = new ShaderPass(GradeShader);
  const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.24, 0.7, 1.06);


  let renderPass = null;
  const state = { renderer, composer, bloom, gradePass, renderPass: null };

  function setScene(scene, camera) {
    renderPass = new RenderPass(scene, camera);
    state.renderPass = renderPass;
    composer.addPass(renderPass);
    composer.addPass(bloom);
    composer.addPass(gradePass);
    composer.addPass(new OutputPass());
  }

  function resize(w, h) {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h);
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(w, h);
    gradePass.uniforms.uRes.value.set(w, h);
  }

  // 返回同一份 state，setScene 后 renderPass 才可被外部替换 camera。
  return Object.assign(state, { setScene, resize });
}
