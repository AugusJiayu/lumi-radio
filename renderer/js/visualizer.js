/**
 * Aurora Ribbon — 液态极光氛围层
 *
 * 不是频谱分析器，而是 Ambient Music Atmosphere Layer。
 * 一条漂浮在页面顶部的极光带，用 blur/glow/gradient 建立厚度，
 * 音乐以 30% 权重影响其呼吸幅度，70% 由环境噪声驱动。
 */
class AudioVisualizer {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');
    this.audioContext = null;
    this.analyser = null;
    this.source = null;
    this.animationId = null;
    this.isRunning = false;
    this.connected = false;

    // 极光参数
    this._ctrlPts = 20;         // 控制点数量
    this._energy = 0;           // 平滑后的音乐能量 [0, 1]
    this._energyTarget = 0;     // 目标能量
    this._phaseOffsets = [];    // 每个控制点的相位偏移（初始化时生成）
    this._driftSpeed = [];      // 每个控制点的漂移速度
    this._colors = { r: 0, g: 229, b: 160 };      // 主色
    this._colors2 = { r: 74, g: 144, b: 217 };    // 辅色

    // 生成随机相位偏移
    for (let i = 0; i < this._ctrlPts; i++) {
      this._phaseOffsets.push(Math.random() * 100);
      this._driftSpeed.push(0.15 + Math.random() * 0.25);
    }

    this.resize();
    window.addEventListener('resize', () => this.resize());
    this._readThemeColors();

    // 页面可见性变化 — 最小化/隐藏到托盘时暂停渲染
    this._onVisibilityChange = () => {
      if (document.hidden) {
        this.stop();
      } else {
        this.resume();
      }
    };
    document.addEventListener('visibilitychange', this._onVisibilityChange);

    // 启动
    this._run();
  }

  resize() {
    if (!this.canvas) return;
    const rect = this.canvas.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.canvas.style.width = rect.width + 'px';
    this.canvas.style.height = rect.height + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.width = rect.width;
    this.height = rect.height;
  }

  /**
   * 从 CSS 变量读取 Material Theme 颜色
   */
  _readThemeColors() {
    try {
      const style = getComputedStyle(document.documentElement);
      const primary = style.getPropertyValue('--env-primary').trim();
      const rgbStr = style.getPropertyValue('--env-primary-rgb').trim();

      if (rgbStr) {
        const parts = rgbStr.split(',').map(s => parseInt(s.trim()));
        if (parts.length === 3) {
          this._colors = { r: parts[0], g: parts[1], b: parts[2] };
        }
      } else if (primary && primary.startsWith('#')) {
        this._colors = this._hexToRgb(primary);
      }

      // 生成辅色：色相偏移 60°（暖色方向）
      this._colors2 = this._shiftHue(this._colors, 60);
    } catch (e) {
      // 使用默认绿 + 蓝
    }
  }

  connectAudio(audioElement) {
    if (this.connected) return;
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.9;
    }

    this.source = this.audioContext.createMediaElementSource(audioElement);
    this.source.connect(this.analyser);
    this.analyser.connect(this.audioContext.destination);
    this.connected = true;
  }

  // ===== 主循环 =====

  _run() {
    this.isRunning = true;
    const loop = () => {
      this.animationId = requestAnimationFrame(loop);
      this._tick();
    };
    this.animationId = requestAnimationFrame(loop);
  }

  _tick() {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;

    if (!w || !h) return;

    ctx.clearRect(0, 0, w, h);

    const t = performance.now() / 1000;

    // 采样音乐能量（低频段 RMS）
    this._sampleEnergy(t);

    // 读取最新主题颜色（切歌时会变）
    this._readThemeColors();

    // 绘制多层极光
    this._drawAurora(ctx, w, h, t);
  }

  /**
   * 采样音频能量，平滑后存入 this._energy
   */
  _sampleEnergy(t) {
    if (this.connected && this.analyser) {
      const bufLen = this.analyser.frequencyBinCount;
      const data = new Uint8Array(bufLen);
      this.analyser.getByteFrequencyData(data);

      // 取低频段（前 16 bins）做 RMS
      let sum = 0;
      const count = Math.min(16, bufLen);
      for (let i = 0; i < count; i++) {
        const v = data[i] / 255;
        sum += v * v;
      }
      this._energyTarget = Math.sqrt(sum / count);
    } else {
      // 无音频连接时，用极低振幅的环境漂移
      this._energyTarget = 0.05 + Math.sin(t * 0.3) * 0.02;
    }

    // 平滑：attack 快（80ms），release 慢（400ms）
    const attack = 0.12;
    const release = 0.04;
    const rate = this._energyTarget > this._energy ? attack : release;
    this._energy += (this._energyTarget - this._energy) * rate;
  }

  /**
   * 绘制多层极光带
   */
  _drawAurora(ctx, w, h, t) {
    const centerY = h * 0.5;
    const pts = this._ctrlPts;

    // 极光层配置：lineWidth, shadowBlur, alpha, 振幅系数
    const layers = [
      { lw: 8,  blur: 20, alpha: 0.06, amp: 1.4 },   // 最外层扩散
      { lw: 5,  blur: 14, alpha: 0.10, amp: 1.1 },   // 外层氛围
      { lw: 3,  blur: 8,  alpha: 0.20, amp: 0.85 },  // 内层光晕
      { lw: 1.5, blur: 4,  alpha: 0.45, amp: 0.6 },  // 核心光线
    ];

    // 振幅：idle 2-4px，loud 6-12px（极其克制）
    const baseAmp = 2;
    const musicAmp = this._energy * 10;
    const totalAmp = baseAmp + musicAmp;

    for (const layer of layers) {
      this._drawLayer(ctx, w, h, t, centerY, pts, totalAmp * layer.amp, layer);
    }
  }

  /**
   * 绘制单层极光：贝塞尔曲线 + 渐变色 + 边缘消隐
   */
  _drawLayer(ctx, w, h, t, centerY, pts, amp, layer) {
    // 计算控制点位置
    const points = [];
    const margin = w * 0.08; // 两端留白

    for (let i = 0; i < pts; i++) {
      const frac = i / (pts - 1);
      const x = margin + frac * (w - margin * 2);

      // 噪声驱动：多层叠加模拟有机运动
      const off = this._phaseOffsets[i];
      const speed = this._driftSpeed[i];

      // 70% 环境漂移 + 30% 音乐能量调制
      const noise1 = Math.sin(off + t * speed * 0.6) * 0.5
                   + Math.sin(off * 1.7 + t * speed * 0.35) * 0.3
                   + Math.sin(off * 0.5 + t * speed * 0.15) * 0.2;

      // 音乐能量微调噪声振幅（不直接驱动）
      const energyMod = 1 + this._energy * 0.6;
      const y = centerY + noise1 * amp * energyMod;

      points.push({ x, y });
    }

    // 用贝塞尔曲线连接控制点（平滑曲线）
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);

    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[i];
      const p1 = points[i + 1];
      const cpx = (p0.x + p1.x) / 2;
      const cpy0 = p0.y;
      const cpy1 = p1.y;
      ctx.quadraticCurveTo(p0.x + (p1.x - p0.x) * 0.5, cpy0, cpx, (cpy0 + cpy1) / 2);
    }

    // 最后一段
    const last = points[points.length - 1];
    ctx.lineTo(last.x, last.y);

    // 渐变色：主色 → 辅色 → 主色
    const grad = ctx.createLinearGradient(0, 0, w, 0);
    const c1 = this._colors;
    const c2 = this._colors2;
    const a = layer.alpha;

    grad.addColorStop(0,    `rgba(${c1.r},${c1.g},${c1.b}, 0)`);
    grad.addColorStop(0.15, `rgba(${c1.r},${c1.g},${c1.b}, ${a * 0.6})`);
    grad.addColorStop(0.35, `rgba(${c2.r},${c2.g},${c2.b}, ${a})`);
    grad.addColorStop(0.5,  `rgba(${c1.r},${c1.g},${c1.b}, ${a})`);
    grad.addColorStop(0.65, `rgba(${c2.r},${c2.g},${c2.b}, ${a})`);
    grad.addColorStop(0.85, `rgba(${c1.r},${c1.g},${c1.b}, ${a * 0.6})`);
    grad.addColorStop(1,    `rgba(${c1.r},${c1.g},${c1.b}, 0)`);

    ctx.strokeStyle = grad;
    ctx.lineWidth = layer.lw;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // 外发光
    if (layer.blur > 0) {
      ctx.shadowColor = `rgba(${c1.r},${c1.g},${c1.b}, ${a * 0.5})`;
      ctx.shadowBlur = layer.blur;
    }

    ctx.stroke();

    // 重置阴影
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
  }

  // ===== 颜色工具 =====

  _hexToRgb(hex) {
    hex = hex.replace('#', '');
    if (hex.length === 3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
    return {
      r: parseInt(hex.substring(0, 2), 16),
      g: parseInt(hex.substring(2, 4), 16),
      b: parseInt(hex.substring(4, 6), 16),
    };
  }

  _rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;
    if (max === min) {
      h = s = 0;
    } else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
        case g: h = ((b - r) / d + 2) / 6; break;
        case b: h = ((r - g) / d + 4) / 6; break;
      }
    }
    return { h, s, l };
  }

  _hslToRgb(h, s, l) {
    let r, g, b;
    if (s === 0) {
      r = g = b = l;
    } else {
      const hue2rgb = (p, q, t) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1/6) return p + (q - p) * 6 * t;
        if (t < 1/2) return q;
        if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
        return p;
      };
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hue2rgb(p, q, h + 1/3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1/3);
    }
    return {
      r: Math.round(r * 255),
      g: Math.round(g * 255),
      b: Math.round(b * 255),
    };
  }

  _shiftHue(color, deg) {
    const hsl = this._rgbToHsl(color.r, color.g, color.b);
    hsl.h = (hsl.h + deg / 360) % 1;
    return this._hslToRgb(hsl.h, hsl.s, hsl.l);
  }

  // ===== 公共 API =====

  stop() {
    if (!this.isRunning) return;
    this.isRunning = false;
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  resume() {
    if (this.isRunning) return;
    this._run();
  }

  destroy() {
    this.stop();
    document.removeEventListener('visibilitychange', this._onVisibilityChange);
  }
}

// 全局可视化实例
const visualizer = new AudioVisualizer('visualizer-canvas');
