/**
 * Spring — Lightweight spring physics for UI animation.
 *
 * Critically damped spring with configurable stiffness and damping.
 * No overshoot, no oscillation — just smooth, physical-feeling motion.
 *
 * Usage:
 *   const s = new Spring({ stiffness: 120, damping: 1.0 });
 *   s.setTarget(1);
 *   // in your rAF loop:
 *   const value = s.step(dt);
 */

class Spring {
  /**
   * @param {Object} options
   * @param {number} options.stiffness  — spring stiffness (default 120)
   * @param {number} options.damping    — damping ratio, 1.0 = critically damped (default 1.0)
   * @param {number} options.precision  — settle threshold (default 0.001)
   */
  constructor(options = {}) {
    this.stiffness = options.stiffness || 120;
    this.damping = options.damping || 1.0;
    this.precision = options.precision || 0.001;

    this._value = 0;
    this._velocity = 0;
    this._target = 0;
    this._settled = true;
  }

  /**
   * Set the target value. Spring will animate toward it.
   */
  setTarget(target) {
    if (Math.abs(target - this._target) < this.precision) return;
    this._target = target;
    this._settled = false;
  }

  /**
   * Get current value.
   */
  get value() {
    return this._value;
  }

  /**
   * Get current target.
   */
  get target() {
    return this._target;
  }

  /**
   * Whether the spring has settled (value ≈ target).
   */
  get settled() {
    return this._settled;
  }

  /**
   * Step the simulation forward.
   * @param {number} dt — delta time in seconds (e.g. 0.016 for 60fps)
   * @returns {number} — current value after step
   */
  step(dt) {
    if (this._settled) return this._value;

    // Clamp dt to avoid instability
    const h = Math.min(dt, 0.064);

    // Critically damped spring:
    //   a = stiffness * (target - value) - 2 * damping * sqrt(stiffness) * velocity
    const omega = Math.sqrt(this.stiffness);
    const delta = this._target - this._value;
    const friction = 2 * this.damping * omega * this._velocity;
    const acceleration = this.stiffness * delta - friction;

    // Semi-implicit Euler (stable)
    this._velocity += acceleration * h;
    this._value += this._velocity * h;

    // Check if settled
    if (Math.abs(this._value - this._target) < this.precision &&
        Math.abs(this._velocity) < this.precision) {
      this._value = this._target;
      this._velocity = 0;
      this._settled = true;
    }

    return this._value;
  }

  /**
   * Immediately snap to a value (no animation).
   */
  snap(value) {
    this._value = value;
    this._target = value;
    this._velocity = 0;
    this._settled = true;
  }

  /**
   * Reset to zero.
   */
  reset() {
    this.snap(0);
  }
}
