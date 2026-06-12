// Lumi 启动器 - 确保 ELECTRON_RUN_AS_NODE 不被传递
const { spawn } = require('child_process');
const path = require('path');

const electronPath = path.join(__dirname, 'node_modules/electron/dist/electron.exe');
const appPath = __dirname;

// 创建干净的环境变量，移除 ELECTRON_RUN_AS_NODE
const cleanEnv = { ...process.env };
delete cleanEnv.ELECTRON_RUN_AS_NODE;

const child = spawn(electronPath, [appPath], {
  stdio: 'inherit',
  env: cleanEnv,
  detached: false
});

child.on('close', (code) => process.exit(code));
child.on('error', (err) => {
  console.error('Failed to start Electron:', err);
  process.exit(1);
});
