import * as THREE from 'three';
import { clamp } from './anim.js';

const DEFAULT_EYE_HEIGHT = 1.32;
const PITCH_LIMIT = 1.31; // ~75°
const LOWERED_POSES = new Set(['sleeping', 'seated']);

/**
 * First-person camera: perspective, mouse-look, standing at the actor's eyes.
 * Pure three.js (no DOM) so it can be unit-tested in Node.
 */
export class FirstPersonCamera {
  constructor({ fov = 62, eyeHeight = DEFAULT_EYE_HEIGHT, near = 0.05, far = 300 } = {}) {
    const width = typeof window !== 'undefined' ? window.innerWidth : 1;
    const height = typeof window !== 'undefined' ? window.innerHeight : 1;
    this.camera = new THREE.PerspectiveCamera(fov, width / height, near, far);
    this.camera.rotation.order = 'YXZ';
    this.camera.name = 'first-person-camera';
    this.fov = fov;
    this.eyeHeight = eyeHeight;
    this.yaw = Math.PI;
    this.pitch = 0;
    this.active = false;
    this._eye = new THREE.Vector3();
    this._forward = new THREE.Vector3();
    this._right = new THREE.Vector3();
  }

  enter({ position = null, yaw = null } = {}) {
    this.active = true;
    if (Number.isFinite(yaw)) this.yaw = yaw;
    this.pitch = 0;
    if (position) this.setEye(position);
    this._applyRotation();
    return this;
  }

  exit() {
    this.active = false;
    return this;
  }

  /** 像素位移 → 视角（右移看右、下移看下） */
  look(dx, dy, sensitivity = 0.0026) {
    this.yaw -= dx * sensitivity;
    this.pitch = clamp(this.pitch - dy * sensitivity, -PITCH_LIMIT, PITCH_LIMIT);
    this._applyRotation();
    return this;
  }

  eyeHeightFor(pose) {
    return LOWERED_POSES.has(pose) ? this.eyeHeight * 0.6 : this.eyeHeight;
  }

  /** 每帧把相机放到脚底坐标之上 */
  setEye(position, pose = 'idle') {
    this.camera.position.set(position.x, position.y + this.eyeHeightFor(pose), position.z);
    return this.camera.position;
  }

  forward(out = this._forward) {
    return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }

  right(out = this._right) {
    return out.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
  }

  setFov(fov) {
    this.fov = clamp(fov, 50, 80);
    this.camera.fov = this.fov;
    this.camera.updateProjectionMatrix();
    return this;
  }

  resize(width, height) {
    if (!width || !height) return this;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    return this;
  }

  _applyRotation() {
    this.camera.rotation.set(this.pitch, this.yaw, 0);
  }
}
