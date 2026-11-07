import * as THREE from 'three';

/** 用程序化等距柱状贴图生成环境光照（暖上冷下 + 窗光方向） */
export function setupEnvironment(renderer, scene) {
  const w = 512, h = 256;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');

  const sky = g.createLinearGradient(0, 0, 0, h);
  sky.addColorStop(0.0, '#2b2b52');
  sky.addColorStop(0.28, '#6d5f97');
  sky.addColorStop(0.46, '#c98a8f');
  sky.addColorStop(0.52, '#e9b394');
  sky.addColorStop(0.58, '#7a5a62');
  sky.addColorStop(0.78, '#3a2e44');
  sky.addColorStop(1.0, '#241d30');
  g.fillStyle = sky; g.fillRect(0, 0, w, h);

  // 窗光热斑（约在 -z 方向）
  const spot = g.createRadialGradient(w * 0.5, h * 0.5, 0, w * 0.5, h * 0.5, w * 0.16);
  spot.addColorStop(0, 'rgba(255,226,180,.95)');
  spot.addColorStop(0.5, 'rgba(255,196,150,.35)');
  spot.addColorStop(1, 'rgba(255,180,140,0)');
  g.fillStyle = spot; g.fillRect(0, 0, w, h);

  const tex = new THREE.CanvasTexture(c);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;

  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const envMap = pmrem.fromEquirectangular(tex).texture;
  scene.environment = envMap;
  scene.environmentIntensity = 0.75;
  tex.dispose(); pmrem.dispose();
  return envMap;
}

/** 底色：让画布背后透出深紫渐变 */
export function setupBackdrop() {
  document.body.style.background =
    'radial-gradient(120% 95% at 54% 38%, #3b3357 0%, #262138 42%, #171426 78%, #100e1a 100%)';
}
