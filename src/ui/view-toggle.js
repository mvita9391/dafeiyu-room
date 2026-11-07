const HINT_FALLBACK = '按住左键拖动画面环视 · V 切换视角 · Esc 返回等距';

function isEditable(target) {
  return Boolean(target?.isContentEditable) || /^(INPUT|TEXTAREA|SELECT)$/.test(target?.tagName);
}

/**
 * V/Esc 键、第一人称指针锁定、准星和回退提示。
 * 不持有视角状态，状态由 main 的 setFirstPerson 驱动。
 */
export function mountViewToggle({ canvas, onToggle, onExit, isActive, isBlocked = () => false }) {
  const reticle = document.createElement('div');
  reticle.id = 'fp-reticle';
  document.body.append(reticle);

  const hint = document.createElement('div');
  hint.id = 'fp-hint';
  document.body.append(hint);

  let hintTimer = 0;
  let lockTimer = 0;
  let locked = false;
  let pendingLock = false;

  function showHint(text, ttl = 3400) {
    hint.textContent = text;
    hint.classList.add('on');
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => hint.classList.remove('on'), ttl);
  }

  function setActive(active) {
    reticle.classList.toggle('on', Boolean(active));
    if (!active) hint.classList.remove('on');
  }

  function requestLock() {
    if (pendingLock || document.pointerLockElement === canvas) return;
    if (!canvas?.requestPointerLock) { showHint(HINT_FALLBACK); return; }
    pendingLock = true;
    const onFailure = () => {
      clearTimeout(lockTimer);
      pendingLock = false;
      if (isActive()) showHint(HINT_FALLBACK);
    };
    lockTimer = setTimeout(() => {
      if (pendingLock && document.pointerLockElement !== canvas) onFailure();
    }, 500);
    try {
      const result = canvas.requestPointerLock();
      if (result && typeof result.catch === 'function') result.catch(onFailure);
    } catch {
      onFailure();
    }
  }

  function exitLock() {
    if (document.pointerLockElement === canvas) document.exitPointerLock?.();
  }

  window.addEventListener('keydown', (event) => {
    if (event.repeat || event.isComposing || event.metaKey || event.ctrlKey || event.altKey || isEditable(event.target)) return;
    if (event.code === 'KeyV') {
      event.preventDefault();
      if (isBlocked()) { showHint('先完成当前操作'); return; }
      onToggle();
    } else if (event.code === 'Escape' && onExit()) {
      event.preventDefault();
    }
  });

  document.addEventListener('pointerlockchange', () => {
    const nowLocked = document.pointerLockElement === canvas;
    if (nowLocked && pendingLock) {
      clearTimeout(lockTimer);
      pendingLock = false;
      if (!isActive()) {
        exitLock();
        return;
      }
    }
    if (locked && !nowLocked && isActive()) {
      locked = false;
      onExit();
      return;
    }
    locked = nowLocked && isActive();
  });

  return {
    setActive,
    requestLock,
    exitLock,
    showHint,
    get locked() { return locked; },
  };
}
