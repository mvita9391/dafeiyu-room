import * as THREE from 'three';

const VERT = /* glsl */`
  varying vec3 vPos;
  void main(){ vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
`;
const FRAG = /* glsl */`
  uniform vec3 uTop; uniform vec3 uBottom; uniform vec3 uHorizon;
  varying vec3 vPos;
  void main(){
    float h = clamp(vPos.y / 140.0 * 0.5 + 0.5, 0.0, 1.0);
    vec3 col = h < 0.52
      ? mix(uBottom, uHorizon, smoothstep(0.35, 0.52, h))
      : mix(uHorizon, uTop, smoothstep(0.52, 0.92, h));
    gl_FragColor = vec4(col, 1.0);
  }
`;

/** 第一视角专用的渐变天空穹顶（等距模式下隐藏） */
export function createSkyDome() {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTop: { value: new THREE.Color('#7f9bc4') },
      uHorizon: { value: new THREE.Color('#e7c9b0') },
      uBottom: { value: new THREE.Color('#c9a894') },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(140, 32, 20), material);
  mesh.name = 'fp-sky';
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;
  mesh.visible = false;
  return mesh;
}

export function setSkyMood(dome, { top, horizon, bottom }) {
  if (!dome) return;
  if (top) dome.material.uniforms.uTop.value.set(top);
  if (horizon) dome.material.uniforms.uHorizon.value.set(horizon);
  if (bottom) dome.material.uniforms.uBottom.value.set(bottom);
}
