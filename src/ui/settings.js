const GEAR = '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><polygon points="9.24,5.35 10.50,4.96 10.54,2.77 13.46,2.77 13.50,4.96 14.76,5.35 15.92,5.96 17.50,4.44 19.56,6.50 18.04,8.08 18.65,9.24 19.04,10.50 21.23,10.54 21.23,13.46 19.04,13.50 18.65,14.76 18.04,15.92 19.56,17.50 17.50,19.56 15.92,18.04 14.76,18.65 13.50,19.04 13.46,21.23 10.54,21.23 10.50,19.04 9.24,18.65 8.08,18.04 6.50,19.56 4.44,17.50 5.96,15.92 5.35,14.76 4.96,13.50 2.77,13.46 2.77,10.54 4.96,10.50 5.35,9.24 5.96,8.08 4.44,6.50 6.50,4.44 8.08,5.96"/><circle cx="12" cy="12" r="3.25"/></svg>';

export function mountSettings({ toolbar = document.body, onOpen, onConnect, canReset, onReset }) {
  const entry = document.createElement('button');
  entry.type = 'button';
  entry.id = 'settings-entry';
  entry.className = 'btn settings-entry';
  entry.title = '设置';
  entry.setAttribute('aria-label', '设置');
  entry.setAttribute('aria-haspopup', 'dialog');
  entry.setAttribute('aria-controls', 'game-settings');
  entry.setAttribute('aria-expanded', 'false');
  entry.innerHTML = GEAR;

  const dialog = document.createElement('dialog');
  dialog.id = 'game-settings';
  dialog.className = 'settings-dialog';
  dialog.setAttribute('aria-labelledby', 'game-settings-title');
  dialog.innerHTML = `<div class="settings-card"><header class="settings-header">
    <h2 id="game-settings-title">设置</h2>
    <button class="settings-close" type="button" aria-label="关闭设置" autofocus>×</button>
  </header>
  <div class="settings-row">
    <div><h3>声音</h3><p>背景音乐与游戏语音</p></div>
    <button class="btn settings-action" id="settings-mute" type="button" disabled>静音</button>
  </div>
  <div class="settings-row">
    <div><h3>智能体</h3><p>查看连接地址和授权</p></div>
    <button class="btn settings-action" id="settings-connect" type="button">连接智能体</button>
  </div>
  <div class="settings-row">
    <div><h3>场景布局</h3><p>恢复全部内置场景，包括森林</p></div>
    <button class="btn settings-action settings-reset" type="button" aria-haspopup="dialog">恢复默认</button>
  </div></div>`;
  toolbar.append(entry);
  document.body.append(dialog);

  const muteButton = dialog.querySelector('#settings-mute');
  const connectButton = dialog.querySelector('#settings-connect');
  const resetButton = dialog.querySelector('.settings-reset');
  const open = focus => {
    if (dialog.open) return;
    resetButton.disabled = !canReset?.();
    dialog.showModal();
    entry.setAttribute('aria-expanded', 'true');
    onOpen?.();
    focus?.focus();
  };
  const close = () => {
    dialog.close();
    entry.focus();
  };
  entry.onclick = () => open();
  dialog.querySelector('.settings-close').onclick = close;
  dialog.addEventListener('click', event => {
    if (event.target === dialog) close();
  });
  dialog.addEventListener('cancel', event => {
    event.preventDefault();
    close();
  });
  dialog.addEventListener('keydown', event => event.stopPropagation());
  dialog.addEventListener('close', () => entry.setAttribute('aria-expanded', 'false'));
  connectButton.onclick = () => {
    dialog.close();
    onConnect(() => open(connectButton));
  };
  resetButton.onclick = async () => {
    if (await onReset?.()) close();
    else resetButton.focus();
  };
  return { muteButton, get isOpen() { return dialog.open; } };
}
