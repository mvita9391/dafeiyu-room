import * as THREE from 'three';
import { getTemplate } from '../../shared/world/templates.js';
import { surfaceAt } from '../../shared/world/coastal.js';
import { SPELLS } from '../../shared/world/spells.js';
import { spellTarget } from '../../shared/world/spell-target.js';
import { createCastAim, spawnElementalCast } from '../effects/elemental/casts.js';

const WORLD_CAST_MAX_AGE_MS = 1250;

export function mountSpellBar({ canvas, scene, getContext, startCast, playSound }) {
  const bar = document.getElementById('spell-bar');
  const slots = bar.querySelector('.spell-slots');
  const hint = bar.querySelector('.spell-hint');
  const aim = createCastAim();
  scene.add(aim.root);

  let selected = -1;
  let sceneId;
  let activeTraining;
  let consumedPointer = null;
  let lastWorldCastId;
  const effects = [];
  const expires = SPELLS.map(() => 0);
  const ray = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const crosshair = new THREE.Vector2();
  const floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const point = new THREE.Vector3();
  const direction = new THREE.Vector3();

  const buttons = SPELLS.map((spell, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'spell-slot';
    button.dataset.spell = spell.id;
    button.style.setProperty('--spell-color', spell.color);
    button.setAttribute('aria-label', `${index + 1} ${spell.label}`);
    button.setAttribute('aria-keyshortcuts', String(index + 1));
    button.setAttribute('aria-pressed', 'false');
    button.title = `${index + 1} · ${spell.label}`;
    button.innerHTML = `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.45" stroke-linecap="round" stroke-linejoin="round"><path d="${spell.icon}"/></svg>
      <span class="spell-shade"></span><kbd>${index + 1}</kbd><span class="spell-timer" aria-hidden="true"></span>`;
    button.addEventListener('click', () => select(index));
    slots.append(button);
    return { button, timer: button.querySelector('.spell-timer') };
  });

  function describe(text) {
    if (hint.textContent !== text) hint.textContent = text;
    hint.hidden = !text;
  }

  function setSelected(index) {
    if (selected >= 0) buttons[selected].button.setAttribute('aria-pressed', 'false');
    selected = index;
    if (index >= 0) buttons[index].button.setAttribute('aria-pressed', 'true');
    else {
      aim.root.visible = false;
      describe('');
    }
  }

  function select(index) {
    const context = getContext();
    if (!context?.ready) return;
    if (selected === index) { setSelected(-1); return; }
    if (remainingCooldown(index, performance.now(), context) > 0) return;
    setSelected(index);
  }

  function targetFor(context) {
    const spell = SPELLS[selected];
    const { actor, camera, snapshot, centered } = context;
    const line = spell.kind === 'line';
    const template = getTemplate(snapshot.scenes.find(s => s.sceneId === actor.sceneId).templateId);
    const [x, y, z] = line ? context.feet.toArray() : actor.position;
    const start = new THREE.Vector3(x, surfaceAt(template, x, z)?.height ?? y, z);
    floor.constant = -start.y;
    camera.updateMatrixWorld();
    ray.setFromCamera(centered ? crosshair : pointer, camera);
    const dummy = context.training?.aimAt(ray.ray);
    if (dummy) direction.copy(dummy).sub(start);
    else if (ray.ray.intersectPlane(floor, point)) direction.copy(point).sub(start);
    else if (centered) direction.copy(ray.ray.direction).setY(0).multiplyScalar(spell.range);
    else return null;
    const target = spellTarget(snapshot, actor.sceneId, start.toArray(), spell,
      [direction.x, direction.z], actor.rotation);
    return target && {
      start: new THREE.Vector3(...target.start),
      end: target.end && new THREE.Vector3(...target.end),
      aimEnd: target.aimEnd && new THREE.Vector3(...target.aimEnd),
      obstructed: target.obstructed,
    };
  }

  function releaseCast(index, start, end, training, hand) {
    const spell = SPELLS[index];
    const hits = training?.planHits(spell, start, end);
    const cast = spawnElementalCast(spell, start, end, hits, hand, playSound);
    scene.add(cast.root);
    effects.push(cast);
  }

  function remainingCooldown(index, now, context) {
    const worldRemaining = (context?.actor.spellCooldowns?.[index + 1] ?? 0) - Date.now();
    return Math.max(0, expires[index] - now, worldRemaining);
  }

  function pointAtEvent(event) {
    const bounds = canvas.getBoundingClientRect();
    pointer.set((event.clientX - bounds.left) / bounds.width * 2 - 1,
      1 - (event.clientY - bounds.top) / bounds.height * 2);
  }

  window.addEventListener('pointermove', pointAtEvent, { passive: true });
  window.addEventListener('keydown', event => {
    if (event.repeat || event.isComposing || event.metaKey || event.ctrlKey || event.altKey ||
      event.target?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(event.target?.tagName)) return;
    if (event.code === 'Escape' && selected >= 0) {
      setSelected(-1);
    } else if (/^(Digit|Numpad)[1-8]$/.test(event.code) && getContext()?.ready) {
      select(Number(event.code.at(-1)) - 1);
    } else return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);

  canvas.addEventListener('pointerdown', event => {
    if (selected < 0) return;
    if (event.button === 2) { setSelected(-1); return; }
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    consumedPointer = event.pointerId;
    const context = getContext();
    if (!context?.ready) { setSelected(-1); return; }
    pointAtEvent(event);
    const target = targetFor(context);
    if (!target?.end) return;
    const index = selected;
    if (remainingCooldown(index, performance.now(), context) > 0) { setSelected(-1); return; }
    const started = startCast(target, hand => {
      const current = getContext();
      if (!current?.ready || current.actor.sceneId !== context.actor.sceneId) return;
      releaseCast(index, target.start, target.end, current.training, hand);
      expires[index] = performance.now() + SPELLS[index].cooldown * 1000;
    });
    if (!started) return;
    setSelected(-1);
  }, true);
  canvas.addEventListener('pointerup', event => {
    if (event.pointerId !== consumedPointer || event.button !== 0) return;
    consumedPointer = null;
    event.stopImmediatePropagation();
  }, true);
  window.addEventListener('pointercancel', event => {
    if (consumedPointer === event.pointerId) consumedPointer = null;
  });
  window.addEventListener('blur', () => { consumedPointer = null; setSelected(-1); });

  return {
    update(dt, now, worldCast, getHand) {
      const context = getContext();
      if (context?.actor.sceneId !== sceneId) {
        activeTraining?.clear();
        activeTraining = context?.training;
        sceneId = context?.actor.sceneId;
        setSelected(-1);
        effects.splice(0).forEach(effect => effect.dispose());
      }
      if (worldCast && worldCast.actionId !== lastWorldCastId && worldCast.sceneId === sceneId) {
        lastWorldCastId = worldCast.actionId;
        if (Date.now() - worldCast.releasedAt < WORLD_CAST_MAX_AGE_MS) {
          setSelected(-1);
          releaseCast(worldCast.slot - 1, new THREE.Vector3(...worldCast.start),
            new THREE.Vector3(...worldCast.end), activeTraining, getHand?.());
        }
      }
      if (!context?.ready && selected >= 0) setSelected(-1);
      if (selected >= 0) {
        const spell = SPELLS[selected];
        const target = targetFor(context);
        aim.root.visible = Boolean(target);
        if (target) aim.show(spell, target.start, target.aimEnd ?? target.end, target.obstructed);
        const prompt = target?.end
          ? (target.obstructed ? '前方有阻挡 · 左键施放' : '左键施放 · Esc 取消')
          : '移到可施放位置';
        describe(`${spell.label} · ${prompt}`);
      }
      for (let i = effects.length - 1; i >= 0; i--) {
        if (effects[i].update(dt)) continue;
        effects[i].dispose();
        effects.splice(i, 1);
      }
      activeTraining?.update(dt, context.camera);
      buttons.forEach(({ button, timer }, index) => {
        const remaining = remainingCooldown(index, now, context) / 1000;
        button.disabled = !context?.ready || remaining > 0;
        if (remaining > 0) button.style.setProperty('--cooldown', remaining / SPELLS[index].cooldown);
        else if (timer.textContent) button.style.removeProperty('--cooldown');
        const text = remaining > 0 ? remaining.toFixed(1) : '';
        if (text !== timer.textContent) timer.textContent = text;
      });
    },
  };
}
