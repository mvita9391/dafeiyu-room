import * as THREE from 'three';

const DEFAULT_DISTANCE = 3.6;
const MIN_DISTANCE = 1.5;
const MAX_DISTANCE = 9;
const PITCH_MIN = -0.05;
const PITCH_MAX = 1.05;
const LOOK_HEIGHT = 1.15;

/**
 * Third-person camera: orbits behind the actor, follows smoothly, mouse-drag look and wheel zoom.
 * Pure three.js (no DOM) so it can be unit-tested in Node.
 */
export class ThirdPersonCamera {
  constructor({ fov = 55, distance = DEFAULT_DISTANCE } = {}) {
    const width = typeof window !== 'undefined' ? window.innerWidth : 1;
    const height = typeof window !== 'undefined' ? window.innerHeight : 1;
    this.camera = new THREE.PerspectiveCamera(fov, width / Math.max(1, height), 0.05, 300);
    this.camera.name = 'third-person-camera';
    this.fov = fov;
    this.distance = distance;
    this.targetDistance = distance;
    this.baseDistance = distance;
    this.zoomFactor = 1;
    this.yaw = Math.PI;
    this.pitch = 0.3;
    this.active = false;
    this.lookHeight = LOOK_HEIGHT;
    this.target = new THREE.Vector3();
    this._look = new THREE.Vector3();
    this._dir = new THREE.Vector3();
  }

  enter({ position = null, yaw = null } = {}) {
    this.active = true;
    if (Number.isFinite(yaw)) this.yaw = yaw;
    this.pitch = 0.3;
    if (position) {
      this.target.copy(position);
      this.apply();
    }
    return this;
  }

  exit() {
    this.active = false;
    return this;
  }

  /** 拖动环视：右移看右，下拉看低 */
  look(dx, dy, sensitivity = 0.0042) {
    this.yaw -= dx * sensitivity;
    this.pitch = THREE.MathUtils.clamp(this.pitch + dy * sensitivity, PITCH_MIN, PITCH_MAX);
    return this;
  }

  /** 滚轮拉近/拉远（乘在基础距离上，换形态时不会被重置） */
  zoom(delta) {
    this.zoomFactor = THREE.MathUtils.clamp(this.zoomFactor * Math.pow(1.14, Math.sign(delta)), 0.45, 2.6);
    this.targetDistance = THREE.MathUtils.clamp(this.baseDistance * this.zoomFactor, MIN_DISTANCE, MAX_DISTANCE);
    return this;
  }

  /** 换形态（人形/鲸鱼）时调整基准距离 */
  setBaseDistance(distance) {
    if (!Number.isFinite(distance) || Math.abs(distance - this.baseDistance) < 1e-6) return this;
    this.baseDistance = distance;
    this.targetDistance = THREE.MathUtils.clamp(distance * this.zoomFactor, MIN_DISTANCE, MAX_DISTANCE);
    return this;
  }

  /** 每帧跟随脚底坐标；平滑目标与距离，避免瞬移和抖动 */
  follow(position, dt = 1 / 60, lookHeight = LOOK_HEIGHT) {
    const k = 1 - Math.exp(-12 * Math.max(0, dt));
    const dk = 1 - Math.exp(-10 * Math.max(0, dt));
    this.target.x += (position.x - this.target.x) * k;
    this.target.y += (position.y - this.target.y) * k;
    this.target.z += (position.z - this.target.z) * k;
    this.distance += (this.targetDistance - this.distance) * dk;
    this.lookHeight = lookHeight;
    return this.apply();
  }

  /** 根据 yaw/pitch/距离摆放相机并看向角色上半身 */
  apply() {
    const horizontal = Math.cos(this.pitch) * this.distance;
    const vertical = Math.sin(this.pitch) * this.distance;
    this._dir.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const lookHeight = this.lookHeight || LOOK_HEIGHT;
    this.camera.position.set(
      this.target.x - this._dir.x * horizontal,
      Math.max(0.4, this.target.y + lookHeight + vertical),
      this.target.z - this._dir.z * horizontal,
    );
    this._look.copy(this.target);
    this._look.y += lookHeight;
    this.camera.lookAt(this._look);
    return this.camera.position;
  }

  resize(width, height) {
    if (!width || !height) return this;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    return this;
  }

  setFov(fov) {
    this.camera.fov = THREE.MathUtils.clamp(fov, 40, 80);
    this.camera.updateProjectionMatrix();
    return this;
  }
}
