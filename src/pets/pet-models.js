import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone } from 'three/addons/utils/SkeletonUtils.js';
import baizeConfig from './definitions/baize.json';
import fishBowlConfig from './definitions/fish-bowl.json';

// 每个宠物模型一个配置文件：动作槽 + 模型地址/缩放 + 默认模式。
export const PET_MODELS = [baizeConfig, fishBowlConfig];
export const PET_MODEL_BY_ID = Object.fromEntries(PET_MODELS.map(config => [config.modelId, config]));

const assetCache = new Map();

function inPlaceClip(clip, hips) {
  if (!hips) return clip;
  const copy = clip.clone();
  const track = copy.tracks.find(track => track.name === 'Hips.position');
  if (track) {
    for (let i = 0; i < track.values.length; i += 3) {
      track.values[i] = hips.position.x;
      track.values[i + 2] = hips.position.z;
    }
  }
  return copy;
}

/** 载入模型（可附带只提供动画的 GLB，例如把 base.glb 的动作合到 PBR 模型上）。 */
export async function loadPetModelAsset(config) {
  if (assetCache.has(config.modelId)) return assetCache.get(config.modelId);
  const promise = (async () => {
    const loader = new GLTFLoader();
    const primary = await loader.loadAsync(config.url);
    const extras = config.animationUrls?.length
      ? await Promise.all(config.animationUrls.map(url => loader.loadAsync(url).catch(() => null)))
      : [];
    const clips = new Map();
    for (const clip of [...primary.animations, ...extras.flatMap(gltf => gltf?.animations ?? [])]) {
      if (clip?.name && !clips.has(clip.name)) clips.set(clip.name, clip);
    }
    return { scene: primary.scene, animations: [...clips.values()] };
  })();
  assetCache.set(config.modelId, promise);
  try {
    const asset = await promise;
    assetCache.set(config.modelId, asset);
    return asset;
  } catch (error) {
    assetCache.delete(config.modelId);
    throw error;
  }
}

/**
 * 通用宠物模型适配器：动作来自配置文件的槽位。
 * loop(slot) 循环；once(slot) 播放一次；chain(slot) 播放动作链（yardIdle 等）。
 */
export function createPetModel(asset, config) {
  const scene = clone(asset.scene);
  scene.scale.setScalar(config.scale ?? 1);
  if (config.rotationY) scene.rotation.y = config.rotationY;
  if (config.yOffset) scene.position.y = config.yOffset;
  const root = new THREE.Group();
  root.name = `pet-model-${config.modelId}`;
  root.add(scene);
  scene.traverse(node => { if (node.isMesh) { node.castShadow = true; node.receiveShadow = true; node.frustumCulled = false; } });
  const hips = scene.getObjectByName('Hips') ?? null;
  const clips = new Map(asset.animations.map(clip => [
    clip.name,
    config.inPlace === false ? clip : inPlaceClip(clip, hips),
  ]));
  const mixer = new THREE.AnimationMixer(scene);
  let current = null;
  let currentName = null;
  let currentLoop = false;
  let chain = null;
  let actionTimer = 0;

  function resolve(slotOrName) {
    const entry = config.animations?.[slotOrName];
    if (typeof entry === 'string') return { clip: entry };
    if (entry && !Array.isArray(entry) && typeof entry.clip === 'string') return entry;
    return { clip: slotOrName };
  }

  function start(name, { duration = null, rate = 1, loop = false } = {}) {
    const clip = clips.get(name);
    if (!clip) return false;
    const action = mixer.clipAction(clip);
    action.reset();
    action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
    action.clampWhenFinished = !loop;
    if (!loop && duration !== null) action.setDuration(duration);
    action.setEffectiveTimeScale(rate);
    action.play();
    if (current && current !== action) action.crossFadeFrom(current, 0.1, false);
    current = action;
    currentName = name;
    currentLoop = loop;
    return true;
  }

  function loop(slotOrName, rate = 1) {
    const resolved = resolve(slotOrName);
    if (currentName === resolved.clip && currentLoop) {
      current?.setEffectiveTimeScale(rate);
      return;
    }
    chain = null;
    actionTimer = 0;
    start(resolved.clip, { loop: true, rate });
  }

  function once(slotOrName, duration = null, rate = 1) {
    const resolved = resolve(slotOrName);
    const clip = clips.get(resolved.clip);
    if (!clip) return false;
    chain = null;
    start(resolved.clip, { loop: false, duration: duration ?? resolved.duration ?? clip.duration, rate });
    actionTimer = duration ?? resolved.duration ?? clip.duration;
    return true;
  }

  function playChainStep() {
    if (!chain) return;
    const step = chain.steps[chain.index];
    const resolved = typeof step === 'string' ? { clip: step } : step;
    const clip = clips.get(resolved.clip);
    if (!clip) { chain = null; loop('idle'); return; }
    const duration = resolved.duration ?? clip.duration;
    start(resolved.clip, { loop: false, duration, rate: resolved.rate ?? 1 });
    chain.timer = duration;
  }

  function chainPlay(slotOrName) {
    const entry = config.animations?.[slotOrName];
    if (!Array.isArray(entry) || !entry.length) return once(slotOrName);
    chain = { steps: entry.map(step => (typeof step === 'string' ? { clip: step } : { ...step })), index: 0, timer: 0 };
    actionTimer = 0;
    playChainStep();
    return true;
  }

  function update(dt) {
    if (chain) {
      chain.timer -= dt;
      if (chain.timer <= 0) {
        chain.index += 1;
        if (chain.index < chain.steps.length) playChainStep();
        else { chain = null; loop('idle'); }
      }
    } else if (actionTimer > 0) {
      actionTimer -= dt;
      if (actionTimer <= 0) { actionTimer = 0; loop('idle'); }
    }
    mixer.update(dt);
  }

  loop('idle');
  return {
    root,
    scene,
    mixer,
    loop,
    once,
    chain: chainPlay,
    update,
    get busy() { return Boolean(chain) || actionTimer > 0; },
    get currentClip() { return currentName; },
  };
}
