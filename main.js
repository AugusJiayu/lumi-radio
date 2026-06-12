const { app, BrowserWindow, Tray, Menu, globalShortcut, nativeImage, ipcMain } = require('electron');

// GPU 硬件加速已启用 — disableHardwareAcceleration 会导致 backdrop-filter、
// CSS 动画、canvas 渲染全部由 CPU 软件合成，严重影响流畅度。
// 如果遇到 ANGLE 报错，可通过命令行 --disable-gpu 或设置 app.commandLine.appendSwitch('disable-gpu') 临时禁用。
const path = require('path');
const { spawn } = require('child_process');
const net = require('net');
const { startServer, stopServer } = require('./server/server');

let mainWindow;
let tray;
let isQuitting = false;
let neteaseProcess = null;

/**
 * 检查端口是否被占用
 */
function isPortInUse(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(true));
    server.once('listening', () => { server.close(); resolve(false); });
    server.listen(port);
  });
}

/**
 * 启动网易云音乐 API 服务（localhost:3000）
 */
async function startNeteaseApi() {
  // 先检查端口是否已被占用（可能有残留进程）
  if (await isPortInUse(3000)) {
    console.log('[Netease] 端口 3000 已被占用，跳过启动（可能已有服务在运行）');
    return;
  }

  const appJs = path.join(__dirname, 'node_modules/NeteaseCloudMusicApi/app.js');
  neteaseProcess = spawn(process.execPath, [appJs], {
    stdio: 'ignore',
    detached: false
  });

  neteaseProcess.on('error', (err) => {
    console.error('[Netease] 启动失败:', err.message);
    neteaseProcess = null;
  });

  neteaseProcess.on('close', (code) => {
    console.log('[Netease] 服务已退出, code:', code);
    neteaseProcess = null;
  });

  console.log('[Netease] 服务已启动 (PID:', neteaseProcess.pid, ')');
}

/**
 * 停止网易云音乐 API 服务
 */
function stopNeteaseApi() {
  if (neteaseProcess) {
    neteaseProcess.kill();
    neteaseProcess = null;
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 420,
    height: 720,
    minWidth: 380,
    minHeight: 600,
    frame: false,
    transparent: false,
    resizable: true,
    minimizable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile('renderer/index.html');

  // 关闭时最小化到托盘
  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
}

function createTray() {
  // 创建托盘图标（使用内置图标作为占位）
  const iconPath = path.join(__dirname, 'renderer/assets/icons/tray-icon.ico');
  let trayIcon;
  try {
    trayIcon = nativeImage.createFromPath(iconPath);
  } catch (e) {
    // 如果图标文件不存在，创建一个简单的图标
    trayIcon = nativeImage.createEmpty();
  }

  tray = new Tray(trayIcon);
  const contextMenu = Menu.buildFromTemplate([
    { label: '显示 Lumi', click: () => { mainWindow.show(); mainWindow.focus(); } },
    { type: 'separator' },
    { label: '下一首', click: () => mainWindow.webContents.send('command', 'skip') },
    { label: '暂停/继续', click: () => mainWindow.webContents.send('command', 'toggle') },
    { type: 'separator' },
    { label: '退出 Lumi', click: () => { isQuitting = true; app.quit(); } }
  ]);

  tray.setToolTip('Lumi — 你的私人电台DJ');
  tray.setContextMenu(contextMenu);
  tray.on('double-click', () => {
    mainWindow.show();
    mainWindow.focus();
  });
}

function registerGlobalShortcuts() {
  // Ctrl+Shift+L 唤醒/隐藏 Lumi
  globalShortcut.register('CommandOrControl+Shift+L', () => {
    if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  // Ctrl+Shift+N 下一首
  globalShortcut.register('CommandOrControl+Shift+N', () => {
    mainWindow.webContents.send('command', 'skip');
  });

  // Ctrl+Shift+P 暂停/继续
  globalShortcut.register('CommandOrControl+Shift+P', () => {
    mainWindow.webContents.send('command', 'toggle');
  });
}

// IPC 事件处理
function setupIPC() {
  ipcMain.on('minimize-window', () => mainWindow.minimize());
  ipcMain.on('close-window', () => mainWindow.hide());
  ipcMain.on('toggle-maximize', () => {
    mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
  });
  ipcMain.on('toggle-theme', (e, theme) => {
    mainWindow.webContents.send('theme-changed', theme);
  });
}

// 开机自启设置
function setAutoLaunch(enable) {
  app.setLoginItemSettings({
    openAtLogin: enable,
    path: app.getPath('exe'),
    args: enable ? ['--hidden'] : []
  });
}

// 单实例锁定
const gotLock = app.requestSingleInstanceLock();

if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    // 先启动网易云 API（给它几秒启动时间）
    await startNeteaseApi();

    // 等待网易云 API 就绪后再启动后端
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 启动后端服务
    try {
      await startServer();
      console.log('[Lumi] 后端服务已启动');
    } catch (err) {
      console.error('[Lumi] 后端服务启动失败:', err);
    }

    createWindow();
    createTray();
    registerGlobalShortcuts();
    setupIPC();

    // 开机自启时隐藏窗口
    if (process.argv.includes('--hidden')) {
      mainWindow.hide();
    }
  });
}

app.on('before-quit', () => {
  isQuitting = true;
  globalShortcut.unregisterAll();
  stopServer();
  stopNeteaseApi();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    // 不退出，保持托盘运行
  }
});
