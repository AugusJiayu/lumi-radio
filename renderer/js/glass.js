/**
 * Material Theme — 色彩吸收引擎
 *
 * 设计哲学：音乐决定空间，而不是空间决定颜色。
 *
 * 两套取色策略：
 *   A. 首页（Home/Chat/Genre/Mode）→ 从背景光斑取环境色
 *   B. 播放页（Now Playing）→ 从专辑封面提取主色
 *
 * 所有 Glass Panel 共享同一个 Material Theme，
 * 通过 CSS 变量驱动，CSS transition 负责平滑过渡。
 */

class ColorSampler {
  /**
   * 从图片提取主色（采样中心 5×5 像素）
   * @param {HTMLImageElement} img
   * @returns {{ r: number, g: number, b: number } | null}
   */
  static extractFromImage(img) {
    if (!img || !img.naturalWidth) return null;

    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      const size = 5;
      canvas.width = size;
      canvas.height = size;

      // 绘制缩放后的封面（自动取平均色）
      ctx.drawImage(img, 0, 0, size, size);
      const data = ctx.getImageData(0, 0, size, size).data;

      let r = 0, g = 0, b = 0, count = 0;
      for (let i = 0; i < data.length; i += 4) {
        // 跳过接近黑色的像素（可能是边框/透明区域）
        if (data[i] + data[i + 1] + data[i + 2] < 30) continue;
        r += data[i];
        g += data[i + 1];
        b += data[i + 2];
        count++;
      }

      if (count === 0) return null;
      return {
        r: Math.round(r / count),
        g: Math.round(g / count),
        b: Math.round(b / count),
      };
    } catch (e) {
      // CORS 限制或 canvas 污染
      console.warn('[Glass] 封面取色失败:', e.message);
      return null;
    }
  }

  /**
   * 从背景光斑计算环境色（加权平均）
   *
   * 不读取 getComputedStyle（避免强制布局），
   * 而是根据已知的 CSS keyframe 参数数学计算光斑中心位置。
   *
   * @returns {{ r: number, g: number, b: number }}
   */
  static extractFromBlobs() {
    const blobs = document.querySelectorAll('.gradient-blob');
    if (!blobs.length) return { r: 30, g: 30, b: 30 };

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    // 屏幕中心作为参考点
    const cx = vw / 2;
    const cy = vh / 2;

    // 光斑颜色
    const colors = [
      { r: 74, g: 144, b: 217 },  // blob-1 蓝 #4a90d9
      { r: 155, g: 126, b: 216 }, // blob-2 紫 #9b7ed8
      { r: 91, g: 196, b: 157 },  // blob-3 绿 #5bc49d
      { r: 217, g: 136, b: 155 }, // blob-4 粉 #d9889b
    ];

    // 光斑初始位置和尺寸
    const configs = [
      { x: -80 + 210, y: -100 + 210, size: 420 }, // blob-1 中心
      { x: vw - 60 - 180, y: vh * 0.25 + 180, size: 360 }, // blob-2
      { x: vw * 0.15 + 190, y: vh * 0.95 - 190, size: 380 }, // blob-3
      { x: vw * 0.55 + 150, y: vh * 0.45 + 150, size: 300 }, // blob-4
    ];

    let totalWeight = 0;
    let r = 0, g = 0, b = 0;

    for (let i = 0; i < configs.length; i++) {
      const cfg = configs[i];
      // 光斑模糊半径约 80px，有效范围约 size/2 + 80
      const radius = cfg.size / 2 + 80;
      const dx = cx - cfg.x;
      const dy = cy - cfg.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // 距离越近权重越高，超出有效范围权重为 0
      if (dist > radius * 2) continue;
      const weight = Math.max(0, 1 - dist / (radius * 2));

      r += colors[i].r * weight;
      g += colors[i].g * weight;
      b += colors[i].b * weight;
      totalWeight += weight;
    }

    if (totalWeight === 0) {
      // 没有光斑覆盖中心，取所有光斑平均
      for (const c of colors) { r += c.r; g += c.g; b += c.b; }
      const n = colors.length;
      return { r: Math.round(r / n), g: Math.round(g / n), b: Math.round(b / n) };
    }

    return {
      r: Math.round(r / totalWeight),
      g: Math.round(g / totalWeight),
      b: Math.round(b / totalWeight),
    };
  }
}


/**
 * MaterialTheme — 将取色结果注入 CSS 变量
 *
 * 所有玻璃面板通过 var(--glass-*) 变量自动响应颜色变化。
 * CSS transition 负责平滑过渡，不需要 JS 动画循环。
 */
class MaterialTheme {
  constructor() {
    this._blobSamplingActive = false;
    this._blobRaf = null;
    this._frameCount = 0;
    this._lastColor = null;
  }

  /**
   * 首页模式：从背景光斑取色
   * 低频采样（每 10 帧一次 ≈ 6Hz），光斑移动缓慢不需要高频
   */
  startBlobSampling() {
    if (this._blobSamplingActive) return;
    this._blobSamplingActive = true;
    this._frameCount = 0;
    this._tickBlobs();
  }

  /**
   * 停止光斑采样
   */
  stopBlobSampling() {
    this._blobSamplingActive = false;
    if (this._blobRaf) {
      cancelAnimationFrame(this._blobRaf);
      this._blobRaf = null;
    }
  }

  _tickBlobs() {
    if (!this._blobSamplingActive) return;

    this._frameCount++;
    // 每 10 帧采样一次
    if (this._frameCount % 10 === 0) {
      const color = ColorSampler.extractFromBlobs();
      this._applyColor(color);
    }

    this._blobRaf = requestAnimationFrame(() => this._tickBlobs());
  }

  /**
   * 播放模式：从专辑封面取色
   * @param {HTMLImageElement} img - 封面图片元素
   */
  sampleFromAlbum(img) {
    this.stopBlobSampling();
    const color = ColorSampler.extractFromImage(img);
    if (color) {
      this._applyColor(color);
    }
  }

  /**
   * 回退到默认色（无封面时）
   */
  applyDefault() {
    this._applyColor({ r: 0, g: 229, b: 160 }); // Lumi 绿
  }

  /**
   * 将颜色写入 :root CSS 变量
   * CSS transition 会自动平滑过渡
   *
   * 同时更新光斑颜色，让整个空间随主色变化
   */
  _applyColor({ r, g, b }) {
    // 去抖：颜色变化小于阈值时不更新
    if (this._lastColor) {
      const dr = Math.abs(r - this._lastColor.r);
      const dg = Math.abs(g - this._lastColor.g);
      const db = Math.abs(b - this._lastColor.b);
      if (dr + dg + db < 3) return;
    }
    this._lastColor = { r, g, b };

    const root = document.documentElement.style;

    // 主色
    root.setProperty('--env-primary', `rgb(${r}, ${g}, ${b})`);
    root.setProperty('--env-primary-rgb', `${r}, ${g}, ${b}`);

    // 玻璃背景色 — 吸收环境色（透明度提升以增强氛围感）
    root.setProperty('--glass-tint', `rgba(${r}, ${g}, ${b}, 0.14)`);

    // 玻璃边框色
    root.setProperty('--glass-tint-border', `rgba(${r}, ${g}, ${b}, 0.22)`);

    // 高光色（主色 + 亮度偏移）
    const hr = Math.min(255, r + 80);
    const hg = Math.min(255, g + 80);
    const hb = Math.min(255, b + 80);
    root.setProperty('--glass-highlight', `rgba(${hr}, ${hg}, ${hb}, 0.25)`);

    // 辉光色（更强）
    root.setProperty('--env-glow', `rgba(${r}, ${g}, ${b}, 0.35)`);

    // 环境亮度（感知亮度 → brightness 调节）
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    root.setProperty('--glass-brightness', (1.0 + luminance * 0.1).toFixed(3));

    // 环境饱和度（主色饱和度 → saturate 调节）
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const sat = max === 0 ? 0 : (max - min) / max;
    root.setProperty('--glass-saturation', Math.round(160 + sat * 50) + '%');

    // 玻璃不透明度
    root.setProperty('--glass-opacity', (0.85 + luminance * 0.15).toFixed(2));

    // 光斑颜色同步 — 让背景光斑也跟随主色
    // 4 个光斑分别偏移不同色相，保持层次感
    const offsets = [
      { dr: 30, dg: -20, db: 40 },   // blob-1: 偏冷蓝
      { dr: -20, dg: 30, db: 50 },   // blob-2: 偏紫
      { dr: 20, dg: 40, db: -10 },   // blob-3: 偏绿
      { dr: 40, dg: -10, db: -20 },  // blob-4: 偏暖
    ];
    offsets.forEach((off, i) => {
      const br = Math.max(0, Math.min(255, r + off.dr));
      const bg = Math.max(0, Math.min(255, g + off.dg));
      const bb = Math.max(0, Math.min(255, b + off.db));
      root.setProperty(`--blob-color-${i + 1}`, `rgb(${br}, ${bg}, ${bb})`);
    });
  }
}
