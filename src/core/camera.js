import * as THREE from 'three';
import { cameraPolicyFor } from '../../shared/world/policies.js';
import { damp, clamp } from './anim.js';


export class IsoCamera {
  constructor() {
    this.camera = new THREE.OrthographicCamera(-6.5, 6.5, 6.5, -6.5, 0.1, 80);
    this.target = new THREE.Vector3(1.9, 1.05, 0.0);
    this.homeTarget = new THREE.Vector3(1.9, 1.05, 0.0);
    this.homeZoom = 0.98;
    this.az = cameraPolicyFor('cozy_room_v1').az;
    this.el = cameraPolicyFor('cozy_room_v1').el;
    this.dist = 26;
    this.par = new THREE.Vector2();       // 视差偏移
    this.parTarget = new THREE.Vector2();
    this.drag = 0;                         // 用户拖拽角度
    this.dragTarget = 0;
    this.setProfile('cozy_room_v1');
    this.zoom = 1;
    this.zoomTarget = 1;
    this.baseHalfH = 4.78;
    this.baseHalfW = 5.9;
    this.resize();
  }
  setProfile(templateId) {
    this.policy = cameraPolicyFor(templateId);
    this.az = this.policy.az;
    this.el = this.policy.el;
    this.dist = this.policy.distance;
    this.wheelZoomActive = false;
    this.camera.far=this.policy.far||80;this.camera.updateProjectionMatrix();
    this.rotationLimit = this.policy.horizontalRotation ? Infinity : this.policy.horizontalDragLimit;
    this.drag = this.dragTarget = 0;this.groundTargetY=this.policy.targetY;
  }
  resize() {
    const aspect = window.innerWidth / window.innerHeight;
    // 窄屏时优先保证房间宽度占满，允许上下留白
    const targetHalfW = aspect >= 1.25 ? 5.9 : aspect >= 0.85 ? 5.0 : 4.35;
    const targetHalfH = 4.78;
    let halfH = Math.max(targetHalfH, targetHalfW / aspect);
    let halfW = halfH * aspect;
    // 场景基准取景（由 setView 提供），再按屏幕比例微调
    const sc = this._view || { target: new THREE.Vector3(-0.05, 1.12, -0.12), zoom: 0.98 };
    const k = aspect < 0.85 ? 0.74 : aspect < 1.25 ? 0.88 : 1.0;
    this.homeTarget.copy(sc.target);
    this.homeTarget.y = this.policy.targetY;
    this.homeZoom = sc.zoom * k;
    if (!this._inited) { this._inited = true; this.target.copy(this.homeTarget); }
    const c = this.camera;
    c.left = -halfW; c.right = halfW; c.top = halfH; c.bottom = -halfH;
    c.updateProjectionMatrix();
    this.aspect = aspect;
  }
  /** 设置场景默认取景（不同场景不同构图） */
  setView(target, zoom) {
    this._view = { target: target.clone(), zoom };
    this.resize();
  }
  /** 仅平移跟随，保持场景原有俯角、高度和观看距离。 */
  follow(position, dt, instant = false) {
    const k = instant ? 1 : 1 - Math.exp(-5 * dt);
    this.target.x += (position.x - this.target.x) * k;
    this.target.z += (position.z - this.target.z) * k;
    this.groundTargetY=this.policy.targetY+(position.y||0);this.target.y+=(this.groundTargetY-this.target.y)*k;
  }
  /** 指针位置：-1~1 */
  setPointer(nx, ny) {
    this.parTarget.set(0, 0);
  }
  addDrag(dx) {
    this.dragTarget = clamp(this.dragTarget + dx, -this.rotationLimit, this.rotationLimit);
  }
  addWheel(deltaY, deltaMode = 0) {
    if (!this.policy.horizontalRotation || !Number.isFinite(deltaY) || !deltaY) return false;
    const pixels = deltaY * (deltaMode === 1 ? 16 : deltaMode === 2 ? 400 : 1);
    this.zoomTarget = clamp(this.zoomTarget * Math.exp(-clamp(pixels, -240, 240) * 0.0015), 0.35, 1.5);
    this.wheelZoomActive = true;
    return true;
  }
  update(dt) {
    this.par.x = damp(this.par.x, this.parTarget.x, 3.2, dt);
    this.par.y = damp(this.par.y, this.parTarget.y, 3.2, dt);
    this.drag = damp(this.drag, this.dragTarget, 4.5, dt);
    this.zoom = damp(this.zoom, this.zoomTarget, 3.5, dt);

    this.az = this.policy.az;
    this.el = this.policy.el;
    const distanceScale = this.wheelZoomActive ? this.homeZoom / Math.max(0.35, this.zoom) : 1;
    this.dist = this.policy.distance * distanceScale;
    this.target.y = this.groundTargetY??this.policy.targetY;
    this.dragTarget=clamp(this.dragTarget,-this.rotationLimit,this.rotationLimit);
    this.drag=clamp(this.drag,-this.rotationLimit,this.rotationLimit);
    const az = this.az + this.drag;
    const el = this.el;
    const dir = new THREE.Vector3(
      Math.cos(el) * Math.cos(az),
      Math.sin(el),
      Math.cos(el) * Math.sin(az)
    );
    const c = this.camera;
    c.far = (this.policy.far || 80) * Math.max(1, distanceScale);
    c.position.copy(this.target).addScaledVector(dir, this.dist);
    // 视差：沿相机右/上方向微移
    // No pointer parallax: camera height and pitch stay engine-owned.
    c.lookAt(this.target);
    c.zoom = this.zoom;
    c.updateProjectionMatrix();
  }
  /** 屏幕坐标 → 地面（y=height）交点 */
  screenToGround(ndcX, ndcY, height = 0) {
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(ndcX, ndcY), this.camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -height);
    const hit = new THREE.Vector3();
    return ray.ray.intersectPlane(plane, hit) ? hit : null;
  }
}

export function bindCameraWheel(canvas, iso, getEditor) {
  const wheel = event => {
    const editor = getEditor?.();
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || (editor?.active && editor.selected)) return;
    if (iso.addWheel(event.deltaY, event.deltaMode)) event.preventDefault();
  };
  canvas.addEventListener('wheel', wheel, { passive: false });
  return () => canvas.removeEventListener('wheel', wheel);
}
