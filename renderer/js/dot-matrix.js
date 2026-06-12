/**
 * Dot Matrix Rendering Engine
 *
 * Data-driven bitmap renderer — no font-family dependency.
 * 5×7 grid per character, canvas-based, with CRT glow + scanline effects.
 * Inspired by: Teenage Engineering OP-1, Nothing Dot Matrix, Braun Radio.
 */

// ===== 5×7 Bitmap Data =====
// Each character = 7 rows × 5 columns (1 = active dot, 0 = inactive)
const DOT_MATRIX_DATA = {
  'A': [[0,1,1,1,0],[1,0,0,0,1],[1,0,0,0,1],[1,1,1,1,1],[1,0,0,0,1],[1,0,0,0,1],[1,0,0,0,1]],
  'B': [[1,1,1,1,0],[1,0,0,0,1],[1,0,0,0,1],[1,1,1,1,0],[1,0,0,0,1],[1,0,0,0,1],[1,1,1,1,0]],
  'C': [[0,1,1,1,0],[1,0,0,0,1],[1,0,0,0,0],[1,0,0,0,0],[1,0,0,0,0],[1,0,0,0,1],[0,1,1,1,0]],
  'D': [[1,1,1,0,0],[1,0,0,1,0],[1,0,0,0,1],[1,0,0,0,1],[1,0,0,0,1],[1,0,0,1,0],[1,1,1,0,0]],
  'E': [[1,1,1,1,1],[1,0,0,0,0],[1,0,0,0,0],[1,1,1,1,0],[1,0,0,0,0],[1,0,0,0,0],[1,1,1,1,1]],
  'F': [[1,1,1,1,1],[1,0,0,0,0],[1,0,0,0,0],[1,1,1,1,0],[1,0,0,0,0],[1,0,0,0,0],[1,0,0,0,0]],
  'G': [[0,1,1,1,0],[1,0,0,0,1],[1,0,0,0,0],[1,0,1,1,1],[1,0,0,0,1],[1,0,0,0,1],[0,1,1,1,0]],
  'H': [[1,0,0,0,1],[1,0,0,0,1],[1,0,0,0,1],[1,1,1,1,1],[1,0,0,0,1],[1,0,0,0,1],[1,0,0,0,1]],
  'I': [[1,1,1,1,1],[0,0,1,0,0],[0,0,1,0,0],[0,0,1,0,0],[0,0,1,0,0],[0,0,1,0,0],[1,1,1,1,1]],
  'J': [[0,0,1,1,1],[0,0,0,1,0],[0,0,0,1,0],[0,0,0,1,0],[0,0,0,1,0],[1,0,0,1,0],[0,1,1,0,0]],
  'K': [[1,0,0,0,1],[1,0,0,1,0],[1,0,1,0,0],[1,1,0,0,0],[1,0,1,0,0],[1,0,0,1,0],[1,0,0,0,1]],
  'L': [[1,0,0,0,0],[1,0,0,0,0],[1,0,0,0,0],[1,0,0,0,0],[1,0,0,0,0],[1,0,0,0,0],[1,1,1,1,1]],
  'M': [[1,0,0,0,1],[1,1,0,1,1],[1,0,1,0,1],[1,0,1,0,1],[1,0,0,0,1],[1,0,0,0,1],[1,0,0,0,1]],
  'N': [[1,0,0,0,1],[1,1,0,0,1],[1,0,1,0,1],[1,0,1,0,1],[1,0,0,1,1],[1,0,0,0,1],[1,0,0,0,1]],
  'O': [[0,1,1,1,0],[1,0,0,0,1],[1,0,0,0,1],[1,0,0,0,1],[1,0,0,0,1],[1,0,0,0,1],[0,1,1,1,0]],
  'P': [[1,1,1,1,0],[1,0,0,0,1],[1,0,0,0,1],[1,1,1,1,0],[1,0,0,0,0],[1,0,0,0,0],[1,0,0,0,0]],
  'Q': [[0,1,1,1,0],[1,0,0,0,1],[1,0,0,0,1],[1,0,0,0,1],[1,0,1,0,1],[1,0,0,1,0],[0,1,1,0,1]],
  'R': [[1,1,1,1,0],[1,0,0,0,1],[1,0,0,0,1],[1,1,1,1,0],[1,0,1,0,0],[1,0,0,1,0],[1,0,0,0,1]],
  'S': [[0,1,1,1,0],[1,0,0,0,1],[1,0,0,0,0],[0,1,1,1,0],[0,0,0,0,1],[1,0,0,0,1],[0,1,1,1,0]],
  'T': [[1,1,1,1,1],[0,0,1,0,0],[0,0,1,0,0],[0,0,1,0,0],[0,0,1,0,0],[0,0,1,0,0],[0,0,1,0,0]],
  'U': [[1,0,0,0,1],[1,0,0,0,1],[1,0,0,0,1],[1,0,0,0,1],[1,0,0,0,1],[1,0,0,0,1],[0,1,1,1,0]],
  'V': [[1,0,0,0,1],[1,0,0,0,1],[1,0,0,0,1],[1,0,0,0,1],[0,1,0,1,0],[0,1,0,1,0],[0,0,1,0,0]],
  'W': [[1,0,0,0,1],[1,0,0,0,1],[1,0,0,0,1],[1,0,1,0,1],[1,0,1,0,1],[1,1,0,1,1],[1,0,0,0,1]],
  'X': [[1,0,0,0,1],[0,1,0,1,0],[0,0,1,0,0],[0,0,1,0,0],[0,0,1,0,0],[0,1,0,1,0],[1,0,0,0,1]],
  'Y': [[1,0,0,0,1],[0,1,0,1,0],[0,0,1,0,0],[0,0,1,0,0],[0,0,1,0,0],[0,0,1,0,0],[0,0,1,0,0]],
  'Z': [[1,1,1,1,1],[0,0,0,0,1],[0,0,0,1,0],[0,0,1,0,0],[0,1,0,0,0],[1,0,0,0,0],[1,1,1,1,1]],
  '0': [[0,1,1,1,0],[1,0,0,0,1],[1,0,0,1,1],[1,0,1,0,1],[1,1,0,0,1],[1,0,0,0,1],[0,1,1,1,0]],
  '1': [[0,0,1,0,0],[0,1,1,0,0],[0,0,1,0,0],[0,0,1,0,0],[0,0,1,0,0],[0,0,1,0,0],[0,1,1,1,0]],
  '2': [[0,1,1,1,0],[1,0,0,0,1],[0,0,0,0,1],[0,0,0,1,0],[0,0,1,0,0],[0,1,0,0,0],[1,1,1,1,1]],
  '3': [[0,1,1,1,0],[1,0,0,0,1],[0,0,0,0,1],[0,0,1,1,0],[0,0,0,0,1],[1,0,0,0,1],[0,1,1,1,0]],
  '4': [[0,0,0,1,0],[0,0,1,1,0],[0,1,0,1,0],[1,0,0,1,0],[1,1,1,1,1],[0,0,0,1,0],[0,0,0,1,0]],
  '5': [[1,1,1,1,1],[1,0,0,0,0],[1,1,1,1,0],[0,0,0,0,1],[0,0,0,0,1],[1,0,0,0,1],[0,1,1,1,0]],
  '6': [[0,1,1,1,0],[1,0,0,0,0],[1,0,0,0,0],[1,1,1,1,0],[1,0,0,0,1],[1,0,0,0,1],[0,1,1,1,0]],
  '7': [[1,1,1,1,1],[0,0,0,0,1],[0,0,0,1,0],[0,0,1,0,0],[0,0,1,0,0],[0,0,1,0,0],[0,0,1,0,0]],
  '8': [[0,1,1,1,0],[1,0,0,0,1],[1,0,0,0,1],[0,1,1,1,0],[1,0,0,0,1],[1,0,0,0,1],[0,1,1,1,0]],
  '9': [[0,1,1,1,0],[1,0,0,0,1],[1,0,0,0,1],[0,1,1,1,1],[0,0,0,0,1],[0,0,0,0,1],[0,1,1,1,0]],
  ':': [[0,0,0,0,0],[0,0,1,0,0],[0,0,1,0,0],[0,0,0,0,0],[0,0,1,0,0],[0,0,1,0,0],[0,0,0,0,0]],
  '.': [[0,0,0,0,0],[0,0,0,0,0],[0,0,0,0,0],[0,0,0,0,0],[0,0,0,0,0],[0,0,0,0,0],[0,0,1,0,0]],
  '-': [[0,0,0,0,0],[0,0,0,0,0],[0,0,0,0,0],[1,1,1,1,1],[0,0,0,0,0],[0,0,0,0,0],[0,0,0,0,0]],
  ' ': [[0,0,0,0,0],[0,0,0,0,0],[0,0,0,0,0],[0,0,0,0,0],[0,0,0,0,0],[0,0,0,0,0],[0,0,0,0,0]],
  '/': [[0,0,0,0,1],[0,0,0,1,0],[0,0,0,1,0],[0,0,1,0,0],[0,1,0,0,0],[0,1,0,0,0],[1,0,0,0,0]],
  '·': [[0,0,0,0,0],[0,0,0,0,0],[0,0,1,0,0],[0,0,0,0,0],[0,0,0,0,0],[0,0,0,0,0],[0,0,0,0,0]],
  '!': [[0,0,1,0,0],[0,0,1,0,0],[0,0,1,0,0],[0,0,1,0,0],[0,0,1,0,0],[0,0,0,0,0],[0,0,1,0,0]],
  '?': [[0,1,1,1,0],[1,0,0,0,1],[0,0,0,0,1],[0,0,0,1,0],[0,0,1,0,0],[0,0,0,0,0],[0,0,1,0,0]],
};

// ===== Dot Matrix Engine =====

class DotMatrixEngine {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {Object} options
   * @param {number} options.dotSize      — half-size for circle, full side length for square (default 3)
   * @param {number} options.dotGap       — gap between pixels in px (default 2)
   * @param {number} options.charGap      — extra gap between characters in px (default 3)
   * @param {string} options.pixelShape   — 'circle' or 'square' (default 'circle')
   * @param {number} options.cornerRadius — corner radius for square pixels (default 1.5)
   * @param {string} options.activeColor   — color for active pixels
   * @param {string} options.inactiveColor — color for inactive pixels
   * @param {string} options.glowColor     — glow shadow color
   * @param {number} options.glowBlur      — glow shadow blur radius
   * @param {boolean} options.crtNoise     — enable CRT noise overlay
   */
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.dotSize = options.dotSize || 3;
    this.dotGap = options.dotGap || 2;
    this.charGap = options.charGap || 3;
    this.pixelShape = options.pixelShape || 'circle';
    this.cornerRadius = options.cornerRadius ?? 1.5;
    this.activeColor = options.activeColor || '#ffffff';
    this.inactiveColor = options.inactiveColor || 'rgba(255,255,255,0.05)';
    this.glowColor = options.glowColor || 'rgba(255,255,255,0.25)';
    this.glowBlur = options.glowBlur || 4;
    this.crtNoise = options.crtNoise || false;

    // For circles: dotSize is radius, cell = diameter + gap
    // For squares: dotSize is side length, cell = side + gap
    this._cellSize = this.pixelShape === 'circle'
      ? this.dotSize * 2 + this.dotGap
      : this.dotSize + this.dotGap;
    this._lastText = '';
    this._noiseOffset = 0;
  }

  /**
   * Measure the pixel dimensions needed for a given text string.
   */
  measure(text) {
    const chars = text.toUpperCase().split('');
    const charW = 5 * this._cellSize;
    const charH = 7 * this._cellSize;
    const totalW = chars.length * charW + (chars.length - 1) * this.charGap;
    return { width: totalW, height: charH, charW, charH };
  }

  /**
   * Resize the canvas to fit the given text with optional padding.
   */
  fitToText(text, padding = 0) {
    const m = this.measure(text);
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = (m.width + padding * 2) * dpr;
    this.canvas.height = (m.height + padding * 2) * dpr;
    this.canvas.style.width = `${m.width + padding * 2}px`;
    this.canvas.style.height = `${m.height + padding * 2}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this._padding = padding;
    return m;
  }

  /**
   * Draw a single pixel (circle or rounded square).
   * @param {number} x — center x
   * @param {number} y — center y
   * @param {string} color
   */
  _drawPixel(x, y, color) {
    const ctx = this.ctx;
    ctx.beginPath();
    if (this.pixelShape === 'square') {
      const half = this.dotSize / 2;
      const r = Math.min(this.cornerRadius, half);
      ctx.roundRect(x - half, y - half, this.dotSize, this.dotSize, r);
    } else {
      ctx.arc(x, y, this.dotSize, 0, Math.PI * 2);
    }
    ctx.fillStyle = color;
    ctx.fill();
  }

  /**
   * Render a full dot matrix text string.
   * @param {string} text
   * @param {Object} [overrides] — override activeColor, inactiveColor, glowColor per render
   */
  render(text, overrides = {}) {
    const ctx = this.ctx;
    const textUpper = text.toUpperCase();
    const chars = textUpper.split('');
    const m = this.measure(text);
    const pad = this._padding || 0;
    const activeColor = overrides.activeColor || this.activeColor;
    const inactiveColor = overrides.inactiveColor || this.inactiveColor;
    const glowColor = overrides.glowColor || this.glowColor;

    // Clear
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Draw all pixels
    let offsetX = pad;
    for (let ci = 0; ci < chars.length; ci++) {
      const bitmap = DOT_MATRIX_DATA[chars[ci]] || DOT_MATRIX_DATA[' '];
      const offsetY = pad;

      for (let row = 0; row < 7; row++) {
        for (let col = 0; col < 5; col++) {
          const active = bitmap[row][col];
          let x, y;
          if (this.pixelShape === 'square') {
            x = offsetX + col * this._cellSize + this.dotSize / 2;
            y = offsetY + row * this._cellSize + this.dotSize / 2;
          } else {
            x = offsetX + col * this._cellSize + this.dotSize;
            y = offsetY + row * this._cellSize + this.dotSize;
          }

          if (active) {
            if (this.glowBlur > 0) {
              ctx.save();
              ctx.shadowColor = glowColor;
              ctx.shadowBlur = this.glowBlur;
            }
            this._drawPixel(x, y, activeColor);
            if (this.glowBlur > 0) ctx.restore();
          } else {
            this._drawPixel(x, y, inactiveColor);
          }
        }
      }

      offsetX += 5 * this._cellSize + this.charGap;
    }

    // CRT noise overlay
    if (this.crtNoise) {
      this._drawCRTNoise(ctx, m.width + pad * 2, m.height + pad * 2);
    }

    this._lastText = textUpper;
  }

  /**
   * Update a single character position without full redraw.
   * Useful for clock colon blink.
   */
  setCharVisible(index, visible, text) {
    const chars = text.toUpperCase().split('');
    if (index < 0 || index >= chars.length) return;

    const ctx = this.ctx;
    const pad = this._padding || 0;
    let offsetX = pad + index * (5 * this._cellSize + this.charGap);
    const offsetY = pad;

    // Clear this character's area
    const charW = 5 * this._cellSize;
    const charH = 7 * this._cellSize;
    ctx.clearRect(offsetX - 1, offsetY - 1, charW + 2, charH + 2);

    // Redraw inactive grid for this char
    for (let row = 0; row < 7; row++) {
      for (let col = 0; col < 5; col++) {
        let x, y;
        if (this.pixelShape === 'square') {
          x = offsetX + col * this._cellSize + this.dotSize / 2;
          y = offsetY + row * this._cellSize + this.dotSize / 2;
        } else {
          x = offsetX + col * this._cellSize + this.dotSize;
          y = offsetY + row * this._cellSize + this.dotSize;
        }
        this._drawPixel(x, y, this.inactiveColor);
      }
    }

    // Draw active pixels if visible
    if (visible) {
      const bitmap = DOT_MATRIX_DATA[chars[index]] || DOT_MATRIX_DATA[' '];
      if (this.glowBlur > 0) {
        ctx.save();
        ctx.shadowColor = this.glowColor;
        ctx.shadowBlur = this.glowBlur;
      }
      for (let row = 0; row < 7; row++) {
        for (let col = 0; col < 5; col++) {
          if (bitmap[row][col]) {
            let x, y;
            if (this.pixelShape === 'square') {
              x = offsetX + col * this._cellSize + this.dotSize / 2;
              y = offsetY + row * this._cellSize + this.dotSize / 2;
            } else {
              x = offsetX + col * this._cellSize + this.dotSize;
              y = offsetY + row * this._cellSize + this.dotSize;
            }
            this._drawPixel(x, y, this.activeColor);
          }
        }
      }
      if (this.glowBlur > 0) ctx.restore();
    }
  }

  /**
   * Draw subtle CRT noise overlay.
   */
  _drawCRTNoise(ctx, w, h) {
    this._noiseOffset = (this._noiseOffset + 1) % 3;
    const imageData = ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
    const data = imageData.data;
    const dpr = window.devicePixelRatio || 1;

    for (let y = 0; y < h * dpr; y += 2) {
      for (let x = this._noiseOffset; x < w * dpr; x += 3) {
        const idx = (y * Math.floor(w * dpr) + x) * 4;
        if (idx < data.length && data[idx + 3] > 0) {
          // Subtle brightness variation on active pixels
          const noise = (Math.random() - 0.5) * 15;
          data[idx] = Math.min(255, Math.max(0, data[idx] + noise));
          data[idx + 1] = Math.min(255, Math.max(0, data[idx + 1] + noise));
          data[idx + 2] = Math.min(255, Math.max(0, data[idx + 2] + noise));
        }
      }
    }
    ctx.putImageData(imageData, 0, 0);
  }

  /**
   * Update colors (e.g. on theme change).
   */
  setColors(active, inactive, glow) {
    this.activeColor = active;
    this.inactiveColor = inactive;
    if (glow) this.glowColor = glow;
  }
}

// ===== DotMatrixText — General-purpose text component =====

class DotMatrixText {
  /**
   * @param {string|HTMLCanvasElement} canvasOrId — canvas element or its ID
   * @param {Object} options — same as DotMatrixEngine options
   */
  constructor(canvasOrId, options = {}) {
    this.canvas = typeof canvasOrId === 'string'
      ? document.getElementById(canvasOrId)
      : canvasOrId;

    if (!this.canvas) {
      console.error('[DotMatrixText] Canvas not found:', canvasOrId);
      return;
    }

    // Merge with theme-aware defaults
    const themeColors = this._getThemeColors();
    this.engine = new DotMatrixEngine(this.canvas, {
      activeColor: options.activeColor || themeColors.active,
      inactiveColor: options.inactiveColor || themeColors.inactive,
      glowColor: options.glowColor || themeColors.glow,
      ...options
    });

    this._text = '';
    this._options = options;
  }

  /**
   * Render text.
   */
  setText(text, padding = 0) {
    if (!this.engine) return;
    this._text = text;
    this.engine.fitToText(text, padding);
    this.engine.render(text);
  }

  /**
   * Re-render with current text (e.g. after theme change).
   */
  refresh() {
    if (!this.engine || !this._text) return;
    const themeColors = this._getThemeColors();
    this.engine.setColors(themeColors.active, themeColors.inactive, themeColors.glow);
    this.engine.render(this._text);
  }

  _getThemeColors() {
    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
    return isDark
      ? { active: '#ffffff', inactive: 'rgba(255,255,255,0.06)', glow: 'rgba(255,255,255,0.22)' }
      : { active: '#1a1a1a', inactive: 'rgba(0,0,0,0.06)', glow: 'rgba(0,0,0,0.14)' };
  }
}
