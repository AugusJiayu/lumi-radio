/**
 * DotClock — Dot matrix clock component
 *
 * Renders HH:MM with blinking colon on a canvas element.
 * Manages its own animation loop for the colon blink.
 */

class DotClock {
  /**
   * @param {string|HTMLCanvasElement} canvasOrId — canvas element or its ID
   * @param {Object} options
   * @param {number} options.dotSize    — dot radius (default 4)
   * @param {number} options.dotGap     — gap between dots (default 2)
   * @param {number} options.charGap    — gap between characters (default 5)
   * @param {number} options.blinkMs    — colon blink interval (default 1500)
   * @param {boolean} options.crtNoise  — enable CRT noise (default false)
   */
  constructor(canvasOrId, options = {}) {
    this.canvas = typeof canvasOrId === 'string'
      ? document.getElementById(canvasOrId)
      : canvasOrId;

    if (!this.canvas) {
      console.error('[DotClock] Canvas not found:', canvasOrId);
      return;
    }

    this.dotSize = options.dotSize || 4;
    this.dotGap = options.dotGap || 2;
    this.charGap = options.charGap || 5;
    this.blinkMs = options.blinkMs || 1500;
    this.crtNoise = options.crtNoise || false;
    this.glowBlur = options.glowBlur || 6;

    // The colon is at index 2 in "HH:MM"
    this._colonIndex = 2;
    this._colonVisible = true;
    this._lastTime = '';
    this._blinkTimer = null;

    // Create engine
    const themeColors = this._getThemeColors();
    this.engine = new DotMatrixEngine(this.canvas, {
      dotSize: this.dotSize,
      dotGap: this.dotGap,
      charGap: this.charGap,
      pixelShape: options.pixelShape || 'square',
      cornerRadius: options.cornerRadius ?? 1.5,
      activeColor: themeColors.active,
      inactiveColor: themeColors.inactive,
      glowColor: themeColors.glow,
      glowBlur: this.glowBlur,
      crtNoise: this.crtNoise,
    });

    // Initial sizing for "00:00"
    this.engine.fitToText('00:00', 4);

    // Start colon blink
    this._startBlink();
  }

  /**
   * Update the clock display with a Date object.
   */
  update(date) {
    if (!this.engine) return;

    const h = String(date.getHours()).padStart(2, '0');
    const m = String(date.getMinutes()).padStart(2, '0');
    const timeStr = `${h}:${m}`;

    // Only full re-render if time changed
    if (timeStr !== this._lastTime) {
      this._lastTime = timeStr;
      this.engine.render(timeStr);
    }

    // Apply colon blink state
    this.engine.setCharVisible(this._colonIndex, this._colonVisible, timeStr);
  }

  /**
   * Refresh colors after theme change.
   */
  refresh() {
    if (!this.engine) return;
    const themeColors = this._getThemeColors();
    this.engine.setColors(themeColors.active, themeColors.inactive, themeColors.glow);
    if (this._lastTime) {
      this.engine.render(this._lastTime);
      this.engine.setCharVisible(this._colonIndex, this._colonVisible, this._lastTime);
    }
  }

  /**
   * Start the colon blink animation.
   */
  _startBlink() {
    if (this._blinkTimer) clearInterval(this._blinkTimer);
    this._blinkTimer = setInterval(() => {
      this._colonVisible = !this._colonVisible;
      if (this._lastTime) {
        this.engine.setCharVisible(this._colonIndex, this._colonVisible, this._lastTime);
      }
    }, this.blinkMs);
  }

  /**
   * Stop the colon blink animation.
   */
  destroy() {
    if (this._blinkTimer) {
      clearInterval(this._blinkTimer);
      this._blinkTimer = null;
    }
  }

  _getThemeColors() {
    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
    return isDark
      ? { active: '#ffffff', inactive: 'rgba(255,255,255,0.08)', glow: 'rgba(255,255,255,0.25)' }
      : { active: '#1a1a1a', inactive: 'rgba(0,0,0,0.08)', glow: 'rgba(0,0,0,0.15)' };
  }
}
