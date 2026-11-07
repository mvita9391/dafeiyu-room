// 左侧「动作」折叠面板：列出角色模型自带的骨骼动画，点一下就地播放。
const LABELS = {
  HumanSpDwarfIdle: '待机',
  HumanSpWalking6: '走路',
  HumanSpJogging: '慢跑',
  HumanSpRun: '冲刺',
  HumanSpFlair: '甩手耍帅',
  HumanSpForwardJump: '前跳',
  HumanSpLegSweep: '扫堂腿',
  HumanSpSitting2: '坐下',
  HumanSpDancingTwerk: '跳舞',
  HumanSpZombieCrawl: '匍匐前进',
  HumanSpHipHopDancing: '街舞',
  HumanSpIdle: '待机（Mixamo）',
  HumanSpSitups: '仰卧起坐',
  HumanSpWalking5: '走路（5）',
  HumanSpBoxing: '拳击',
  DafeiyuLeftJab: '左刺拳',
  DafeiyuRightCross: '右直拳',
  DafeiyuLeftHook: '左勾拳',
  HumanSpBrutalAssassination: '处决',
  HumanSpFlyingKick: '飞踢',
  HumanSpKicking2: '踢腿',
  HumanSpKidneyHit: '膝撞',
  HumanSpKipUp: '鲤鱼打挺',
  HumanSpQuickRollToRun: '翻滚起步',
  HumanSpRunningJump: '助跑跳',
  HumanSpRunningSlide: '滑铲',
  HumanSpBigStomachHit: '腹部受击',
  HumanSpFrisbeeThrow: '扔飞盘',
  HumanSpHeadHit: '头部受击',
  HumanSpKicking: '踢腿（1）',
  HumanSpMartelo: '马特洛踢',
  HumanSpStandingDeathBackward: '向后倒地',
  HumanSpStandingMeleeKick: '站立近战踢',
  HumanSpWalking3: '走路（3）',
  HumanSpBigJump: '大跳跃',
  HumanSpMutantJumpAttack: '跃起重击',
};
const COLLAPSE_KEY = 'dafeiyu.actionPanel.collapsed';

const STYLE = `
#action-panel{position:static;width:100%;min-width:132px;display:flex;flex-direction:column;
  background:#faf1e5ed;border:1px solid #fff9;border-radius:16px;font:13px system-ui;color:#51454a;
  box-shadow:0 12px 30px -18px #1e103c88;overflow:hidden;backdrop-filter:blur(6px)}
#action-panel.collapsed{width:auto}
#action-panel-head{display:flex;align-items:center;gap:6px;justify-content:space-between;width:100%;
  padding:10px 13px;border:0;background:transparent;color:#51454a;font:inherit;font-weight:600;
  letter-spacing:.04em;cursor:pointer}
#action-panel-head:hover{background:#fff6e8}
#action-panel-head i{display:inline-block;transition:transform .2s ease;font-style:normal;opacity:.6}
#action-panel:not(.collapsed) #action-panel-head i{transform:rotate(180deg)}
#action-panel-body{display:grid;gap:4px;padding:0 8px 10px}
#action-panel.collapsed #action-panel-body{display:none}
#action-panel .action-item{display:flex;align-items:center;justify-content:space-between;gap:8px;
  border:1px solid #d9c9b6;background:#fff9ee;color:#51454a;border-radius:10px;padding:5px 9px;
  font:inherit;cursor:pointer;text-align:left;transition:background .15s,border-color .15s}
#action-panel .action-item:hover{background:#fff3df;border-color:#c9ac8b}
#action-panel .action-item.on{background:#e8d6bd;border-color:#b48a5f}
#action-panel .action-item em{font-style:normal;font-size:11px;opacity:.55;font-variant-numeric:tabular-nums}
#action-panel .action-pager{display:flex;align-items:center;justify-content:space-between;gap:6px;margin-top:6px}
#action-panel .action-pager button{border:1px solid #d9c9b6;background:#fff9ee;color:#51454a;border-radius:9px;padding:4px 10px;font:inherit;font-size:12px;cursor:pointer;line-height:1.2}
#action-panel .action-pager button:disabled{opacity:.35;cursor:default}
#action-panel .action-pager .pager-info{font-size:11px;color:#8a7563;font-variant-numeric:tabular-nums}
#action-panel .action-stop{margin-top:4px;border:1px dashed #d0bda7;background:transparent;color:#8a7563;
  border-radius:10px;padding:6px 10px;font:inherit;font-size:12px;cursor:pointer}
#action-panel .action-stop:hover{background:#fff6e8}
@media (max-width:760px){
  #action-panel{font-size:12px}
}`;

export function mountActionPanel({ clips = [], onPlay, onStop, container } = {}) {
  if (typeof document === 'undefined' || !clips.length) return null;
  if (!document.getElementById('action-panel-style')) {
    const style = document.createElement('style');
    style.id = 'action-panel-style';
    style.textContent = STYLE;
    document.head.append(style);
  }

  const root = document.createElement('section');
  root.id = 'action-panel';
  const head = document.createElement('button');
  head.id = 'action-panel-head';
  head.type = 'button';
  head.innerHTML = `<span>动作 · ${clips.length}</span><i>▾</i>`;
  const body = document.createElement('div');
  body.id = 'action-panel-body';

  let collapsed = false;
  try { collapsed = localStorage.getItem(COLLAPSE_KEY) === '1'; } catch { /* ignore */ }
  root.classList.toggle('collapsed', collapsed);
  head.setAttribute('aria-expanded', String(!collapsed));
  head.addEventListener('click', () => {
    collapsed = !collapsed;
    root.classList.toggle('collapsed', collapsed);
    head.setAttribute('aria-expanded', String(!collapsed));
    try { localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0'); } catch { /* ignore */ }
  });

  const PAGE_SIZE = 6;
  const label = (name) => LABELS[name] || name;
  const pageCount = Math.max(1, Math.ceil(clips.length / PAGE_SIZE));
  let page = 0;
  let selected = null;
  const buttons = new Map();
  const list = document.createElement('div');
  list.style.cssText = 'display:grid;gap:4px';
  const pager = document.createElement('div');
  pager.className = 'action-pager';
  const prev = document.createElement('button');
  prev.type = 'button'; prev.textContent = '◀'; prev.setAttribute('aria-label', '上一页');
  const info = document.createElement('span');
  info.className = 'pager-info';
  const next = document.createElement('button');
  next.type = 'button'; next.textContent = '▶'; next.setAttribute('aria-label', '下一页');

  function renderPage() {
    list.replaceChildren();
    buttons.clear();
    const start = page * PAGE_SIZE;
    for (const clip of clips.slice(start, start + PAGE_SIZE)) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'action-item' + (clip.name === selected ? ' on' : '');
      button.dataset.clip = clip.name;
      button.dataset.page = String(page);
      button.innerHTML = `<span>${label(clip.name)}</span><em>${clip.duration.toFixed(1)}s</em>`;
      button.addEventListener('click', () => {
        const ok = onPlay?.(clip.name);
        if (ok === false) return;
        selected = clip.name;
        for (const item of buttons.values()) item.classList.remove('on');
        button.classList.add('on');
      });
      buttons.set(clip.name, button);
      list.append(button);
    }
    info.textContent = `${page + 1} / ${pageCount}`;
    prev.disabled = page === 0;
    next.disabled = page >= pageCount - 1;
  }
  prev.addEventListener('click', () => { if (page > 0) { page--; renderPage(); } });
  next.addEventListener('click', () => { if (page < pageCount - 1) { page++; renderPage(); } });

  const stop = document.createElement('button');
  stop.type = 'button';
  stop.className = 'action-stop';
  stop.textContent = '停止动作 · 回待机';
  stop.addEventListener('click', () => {
    onStop?.();
    selected = null;
    for (const item of buttons.values()) item.classList.remove('on');
  });

  renderPage();
  if (pageCount > 1) pager.append(prev, info, next);
  else pager.append(info);
  body.append(list, pager, stop);

  root.append(head, body);
  (container || document.body).append(root);

  return {
    root,
    setVisible(visible) { root.hidden = !visible; },
    clearSelection() { selected = null; for (const item of buttons.values()) item.classList.remove('on'); },
    destroy() { root.remove(); },
  };
}
