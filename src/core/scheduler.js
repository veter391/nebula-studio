/**
 * Lookahead scheduler — pattern playback with sample-accurate timing.
 *
 * The scheduler runs on `setInterval` at `lookahead` ms. Each tick, it
 * schedules any steps that fall within `scheduleAhead` seconds of the
 * current audio time, then advances the next-step pointer.
 *
 * @module core/scheduler
 */

import { Emitter } from '../utils.js';

'use strict';

export class Scheduler extends Emitter {
  /**
   * @param {AudioContext} ctx
   * @param {object} opts
   * @param {Function} opts.getStepDuration - () => seconds per step
   * @param {Function} opts.getSwing - () => 0..1
   * @param {Function} opts.getStepCount - () => steps per bar (e.g. 16)
   * @param {Function} opts.onStep - (step, time) => void
   */
  constructor(ctx, opts = {}) {
    super();
    this.ctx = ctx;
    this.getStepDuration = opts.getStepDuration ?? (() => 60 / 120 / 4);
    this.getSwing = opts.getSwing ?? (() => 0);
    this.getStepCount = opts.getStepCount ?? (() => 16);
    this.onStep = opts.onStep ?? (() => {});

    this.lookahead = 0.025; // 25ms tick
    this.scheduleAhead = 0.12; // schedule 120ms ahead
    this.timer = null;
    this.currentStep = -1;
    this.nextStepTime = 0;
    this.running = false;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.currentStep = 0;
    this.nextStepTime = this.ctx.currentTime + 0.05;
    this.timer = setInterval(() => this._tick(), this.lookahead * 1000);
  }

  stop() {
    this.running = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.currentStep = -1;
    this.emit('step', { step: -1, time: 0 });
  }

  _tick() {
    while (this.nextStepTime < this.ctx.currentTime + this.scheduleAhead) {
      const stepDur = this.getStepDuration();
      const swing = this.getSwing();
      const swingOff = this.currentStep % 2 === 1 ? stepDur * swing : 0;
      const t = this.nextStepTime + swingOff;
      try {
        this.onStep(this.currentStep, t);
      } catch (e) {
        console.warn('[scheduler] onStep failed at step', this.currentStep, e);
      }
      this.emit('step', { step: this.currentStep, time: t });
      this.nextStepTime += stepDur;
      const total = this.getStepCount();
      this.currentStep = (this.currentStep + 1) % total;
    }
  }
}