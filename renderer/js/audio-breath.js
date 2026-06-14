/**
 * AudioBreathEffect — Audio-driven breathing animation.
 *
 * Connects to an <audio> element, computes real-time RMS energy,
 * and drives subtle border/shadow/scale animation via spring physics.
 *
 * Two layers:
 *   1. Window border glow — soft ambient light bleeding from app edges
 *   2. Now-bar micro-breathing — subtle scale + border on the player bar
 *
 * Design: Teenage Engineering / Nothing / Braun — restrained, physical, alive.
 * No rainbow, no strong glow, no infinite pulse.
 */

class AudioBreathEffect {
  /**
   * @param {Object} options
   * @param {HTMLAudioElement} options.audioEl         — primary audio (music)
   * @param {HTMLAudioElement} options.secondaryAudioEl — secondary audio (TTS), optional
   * @param {HTMLElement}      options.targetEl        — now-bar element for micro-breathing
   * @param {number} options.attackMs   — response time for energy increase (default 150)
   * @param {number} options.releaseMs  — decay time for energy decrease (default 500)
   * @param {number} options.smoothAttack  — EMA alpha for rising energy (default 0.3)
   * @param {number} options.smoothRelease — EMA alpha for falling energy (default 0.06)
   */
  constructor(options = {}) {
    this.audioEl = options.audioEl;
    this.secondaryAudioEl = options.secondaryAudioEl || null;
    this.targetEl = options.targetEl;
    this.attackMs = options.attackMs || 150;
    this.releaseMs = options.releaseMs || 500;
    this.smoothAttack = options.smoothAttack || 0.3;
    this.smoothRelease = options.smoothRelease || 0.06;

    this._ctx = null;
    this._source = null;         // primary MediaElementSource (music)
    this._source2 = null;        // secondary MediaElementSource (TTS)
    this._gainPrimary = null;    // GainNode for music
    this._gainSecondary = null;  // GainNode for TTS
    this._analyser = null;
    this._data = null;
    this._spring = null;
    this._smoothed = 0;
    this._raf = null;
    this._running = false;
    this._glowEl = null;
    this._borderGlowEl = null;

    // Precompute spring params from timing
    this._attackStiffness = this._msToStiffness(this.attackMs);
    this._releaseStiffness = this._msToStiffness(this.releaseMs);
  }

  /**
   * Initialize audio analysis. Call once after user interaction.
   */
  init() {
    if (this._ctx) return;

    this._ctx = new (window.AudioContext || window.webkitAudioContext)();
    this._analyser = this._ctx.createAnalyser();
    this._analyser.fftSize = 256;
    this._analyser.smoothingTimeConstant = 0.8;
    this._data = new Uint8Array(this._analyser.fftSize);

    this._spring = new Spring({
      stiffness: this._releaseStiffness,
      damping: 1.0,
      precision: 0.0005,
    });

    this._createGlowLayer();

    // Find the existing border glow created by app.js
    this._borderGlowEl = document.querySelector('.window-border-glow');
  }

  /**
   * Connect to audio elements. Call after init().
   * Creates two source→gain chains feeding the same analyser.
   */
  connect() {
    if (!this._ctx || this._source) return;

    try {
      // Primary (music): source → gain → analyser → destination
      this._gainPrimary = this._ctx.createGain();
      this._source = this._ctx.createMediaElementSource(this.audioEl);
      this._source.connect(this._gainPrimary);
      this._gainPrimary.connect(this._analyser);

      // Secondary (TTS): source → gain → analyser (initially muted)
      if (this.secondaryAudioEl) {
        this._gainSecondary = this._ctx.createGain();
        this._gainSecondary.gain.value = 0; // muted by default
        this._source2 = this._ctx.createMediaElementSource(this.secondaryAudioEl);
        this._source2.connect(this._gainSecondary);
        this._gainSecondary.connect(this._analyser);
      }

      this._analyser.connect(this._ctx.destination);
    } catch (e) {
      console.warn('[AudioBreath] Source already connected');
    }
  }

  /**
   * Start the animation loop.
   */
  start() {
    if (this._running) return;
    this._running = true;
    this._lastTime = performance.now();
    this._tick();
  }

  /**
   * Stop the animation loop and reset visuals.
   */
  stop() {
    this._running = false;
    if (this._raf) {
      cancelAnimationFrame(this._raf);
      this._raf = null;
    }
    this._smoothed = 0;
    this._spring?.snap(0);
    this._applyVisuals(0);
  }

  /**
   * Resume AudioContext if suspended (required by browser policy).
   */
  async resume() {
    if (this._ctx?.state === 'suspended') {
      await this._ctx.resume();
    }
  }

  /**
   * Switch breath analysis to the secondary audio source (TTS).
   * Mutes primary, unmutes secondary.
   */
  switchToSecondary() {
    if (!this._gainSecondary) return;
    this._gainPrimary.gain.value = 0;
    this._gainSecondary.gain.value = 1;
  }

  /**
   * Restore breath analysis to the primary audio source (music).
   * Mutes secondary, unmutes primary.
   */
  restorePrimary() {
    if (!this._gainPrimary) return;
    this._gainSecondary.gain.value = 0;
    this._gainPrimary.gain.value = 1;
  }

  /**
   * Full cleanup.
   */
  destroy() {
    this.stop();
    if (this._glowEl?.parentNode) {
      this._glowEl.parentNode.removeChild(this._glowEl);
    }
    this._source = null;
    this._analyser = null;
    this._ctx = null;
  }

  // ===== Internals =====

  /**
   * Compute RMS energy from analyser, normalized to 0~1.
   */
  _computeEnergy() {
    if (!this._analyser || !this._data) return 0;

    this._analyser.getByteTimeDomainData(this._data);

    let sum = 0;
    for (let i = 0; i < this._data.length; i++) {
      const v = (this._data[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / this._data.length);

    // Normalize: quiet room ≈ 0.01~0.03, loud music ≈ 0.4~0.8
    return Math.min(1, rms * 4.0);
  }

  /**
   * Animation tick.
   */
  _tick() {
    if (!this._running) return;

    const now = performance.now();
    const dt = (now - this._lastTime) / 1000;
    this._lastTime = now;

    const raw = this._computeEnergy();

    // Exponential smoothing with separate attack/release
    const alpha = raw > this._smoothed ? this.smoothAttack : this.smoothRelease;
    this._smoothed += (raw - this._smoothed) * alpha;

    // Adapt spring stiffness: fast attack, slow release
    if (this._smoothed > this._spring.target) {
      this._spring.stiffness = this._attackStiffness;
    } else {
      this._spring.stiffness = this._releaseStiffness;
    }

    this._spring.setTarget(this._smoothed);
    const energy = this._spring.step(dt);

    this._applyVisuals(energy);

    this._raf = requestAnimationFrame(() => this._tick());
  }

  /**
   * Apply visual properties driven by energy (0~1).
   * Two layers: window border glow + now-bar micro-breathing.
   * All updates via CSS custom properties — browser batches these efficiently.
   */
  _applyVisuals(energy) {
    const root = document.documentElement;

    // === Window border glow (via CSS vars on :root) ===
    // Inner glow: 12px → 30px spread, opacity 0.15 → 0.55
    root.style.setProperty('--glow-inner-blur', (12 + energy * 18).toFixed(0) + 'px');
    root.style.setProperty('--glow-inner-alpha', (0.15 + energy * 0.40).toFixed(3));
    // Outer halo: 35px → 80px spread, opacity 0.06 → 0.15
    root.style.setProperty('--glow-outer-blur', (35 + energy * 45).toFixed(0) + 'px');
    root.style.setProperty('--glow-outer-alpha', (0.06 + energy * 0.09).toFixed(3));
  }

  /**
   * Create the ambient glow layer behind the now-bar.
   */
  _createGlowLayer() {
    const parent = this.targetEl?.parentElement;
    if (!parent) return;

    const pos = getComputedStyle(parent).position;
    if (pos === 'static') {
      parent.style.position = 'relative';
    }

    const glow = document.createElement('div');
    glow.className = 'breath-glow';
    glow.setAttribute('aria-hidden', 'true');

    parent.insertBefore(glow, this.targetEl);
    this._glowEl = glow;
  }

  /**
   * Convert millisecond response time to spring stiffness.
   */
  _msToStiffness(ms) {
    const t = ms / 1000;
    return Math.pow(3.5 / t, 2);
  }
}
