// Only expose the desktop marker and render visibility, not raw IPC.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('dafeiyuDesktop', {
  desktop: true,
  platform: process.platform,
  onRenderSuspended(callback) {
    const channel = 'dafeiyu:render-suspended';
    const listener = (_event, suspended) => callback(suspended === true);
    ipcRenderer.on(channel, listener);
    ipcRenderer.send('dafeiyu:request-render-state');
    return () => ipcRenderer.removeListener(channel, listener);
  },
});
