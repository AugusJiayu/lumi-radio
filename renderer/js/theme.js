/**
 * 主题切换 — DARK / LIGHT（药丸切换器）
 */
let currentTheme = localStorage.getItem('lumi-theme') || 'dark';

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  currentTheme = theme;
  localStorage.setItem('lumi-theme', theme);

  // 更新药丸切换器
  const indicator = document.getElementById('theme-pill-indicator');
  if (indicator) {
    indicator.setAttribute('data-position', theme);
  }

  // 更新按钮 active 状态
  document.querySelectorAll('.theme-pill-btn').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-theme') === theme);
  });

  // 通知主进程
  window.lumiAPI?.toggleTheme?.(theme);
}

function toggleTheme() {
  applyTheme(currentTheme === 'dark' ? 'light' : 'dark');
}

// 初始化
applyTheme(currentTheme);

// 绑定药丸按钮点击
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.theme-pill-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const theme = btn.getAttribute('data-theme');
      if (theme && theme !== currentTheme) {
        applyTheme(theme);
      }
    });
  });
});
