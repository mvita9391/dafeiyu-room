import * as THREE from 'three';

export class HUD {
  constructor() {
    this.el = {
      mood: document.getElementById('mood'),
      moodBar: document.getElementById('moodBar'),
      moodVal: document.getElementById('moodVal'),
      foodBar: document.getElementById('foodBar'),
      foodVal: document.getElementById('foodVal'),
      energyBar: document.getElementById('energyBar'),
      energyVal: document.getElementById('energyVal'),
      actions: document.getElementById('actions'),
    };
    this.bubble = null;
    this.bubbleWorld = new THREE.Vector3();
    this.bubbleLife = 0;
    this._v = new THREE.Vector3();
  }

  setStats(s) {
    this.el.moodBar.style.width = s.mood + '%';
    this.el.foodBar.style.width = s.food + '%';
    this.el.energyBar.style.width = s.energy + '%';
    this.el.moodVal.textContent = Math.round(s.mood);
    this.el.foodVal.textContent = Math.round(s.food);
    this.el.energyVal.textContent = Number(s.energy).toFixed(1);
    this.el.mood.textContent = s.moodLabel;
  }

  say(text, worldPos, ttl = 3.2) {
    if (!this.bubble) {
      const b = document.createElement('div');
      b.className = 'say';
      b.style.cssText = `
        position:fixed;left:0;top:0;padding:9px 14px;border-radius:14px;
        background:rgba(255,250,242,.94);color:#3b3150;font-size:13.5px;line-height:1.5;
        font-weight:500;letter-spacing:.01em;max-width:260px;white-space:nowrap;
        box-shadow:0 12px 30px -12px rgba(30,16,60,.55), inset 0 1px 0 #fff;
        transform:translate(-50%,-100%) scale(.86);transform-origin:50% 100%;
        opacity:0;transition:opacity .22s ease, transform .3s cubic-bezier(.2,1.4,.4,1);
        pointer-events:none;z-index:20;`;
      const tail = document.createElement('i');
      tail.style.cssText = `
        position:absolute;left:50%;bottom:-5px;width:11px;height:11px;margin-left:-5.5px;
        background:rgba(255,250,242,.94);transform:rotate(45deg);border-radius:2px;`;
      b.appendChild(tail);
      document.body.appendChild(b);
      this.bubble = b;
      requestAnimationFrame(() => {
        b.style.opacity = '1';
        b.style.transform = 'translate(-50%,-100%) scale(1)';
      });
    }
    this.bubble.textContent = text;
    // 重新挂尾
    if (!this.bubble.querySelector('i')) {
      const tail = document.createElement('i');
      tail.style.cssText = `position:absolute;left:50%;bottom:-5px;width:11px;height:11px;margin-left:-5.5px;background:rgba(255,250,242,.94);transform:rotate(45deg);border-radius:2px;`;
      this.bubble.appendChild(tail);
    }
    this.bubbleWorld.copy(worldPos);
    this.bubbleLife = ttl;
    this.bubble.style.opacity = '1';
    this.bubble.style.transform = 'translate(-50%,-100%) scale(1)';
  }

  updateBubble(dt, camera) {
    if (!this.bubble) return;
    if (this.bubbleLife <= 0) {
      this.bubble.style.opacity = '0';
      this.bubble.style.transform = 'translate(-50%,-100%) scale(.9)';
      if (this.bubble.style.display !== 'none' && this.bubbleLife < -0.4) {
        this.bubble.remove(); this.bubble = null;
      }
      return;
    }
    this.bubbleLife -= dt;
    this._v.copy(this.bubbleWorld).project(camera);
    const x = (this._v.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-this._v.y * 0.5 + 0.5) * window.innerHeight;
    this.bubble.style.left = `${x}px`;
    this.bubble.style.top = `${y}px`;
  }
}
