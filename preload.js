const { contextBridge, ipcRenderer } = require('electron');

// 暴露安全的 API 给渲染进程
contextBridge.exposeInMainWorld('lumiAPI', {
  // 窗口控制
  minimize: () => ipcRenderer.send('minimize-window'),
  close: () => ipcRenderer.send('close-window'),
  toggleMaximize: () => ipcRenderer.send('toggle-maximize'),

  // 主题
  toggleTheme: (theme) => ipcRenderer.send('toggle-theme', theme),
  onThemeChanged: (callback) => ipcRenderer.on('theme-changed', (e, theme) => callback(theme)),

  // 接收主进程命令（来自托盘/全局快捷键）
  onCommand: (callback) => ipcRenderer.on('command', (e, cmd) => callback(cmd)),

  // WebSocket 连接状态
  onServerReady: (callback) => ipcRenderer.on('server-ready', () => callback()),

  // 平台信息
  platform: process.platform,
  isElectron: true
});
