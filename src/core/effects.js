/**
 * Effects factories.
 *
 * Builds reusable audio nodes from declarative configs. Each factory
 * returns `{ input, output, update(config) }`.
 *
 * @module core/effects
 */

import { makeSatCurve, makeNoiseBuffer } from './voices.js';

'use strict';

/** Three-band EQ (low shelf @ 250Hz, peaking mid @ 1kHz, high shelf @ 4kHz). */
export function makeEQ(ctx) {
  const low = ctx.createBiquadFilter();
  low.type = 'lowshelf';
  low.frequency.value = 250;
  low.gain.value = 0;
  const mid = ctx.createBiquadFilter();
  mid.type = 'peaking';
  mid.frequency.value = 1000;
  mid.Q.value = 1.2;
  mid.gain.value = 0;
  const high = ctx.createBiquadFilter();
  high.type = 'highshelf';
  high.frequency.value = 4000;
  high.gain.value = 0;
  low.connect(mid).connect(high);
  return {
    input: low,
    output: high,
    update({ low: lG, mid: mG, high: hG }) {
      low.gain.value = lG ?? 0;
      mid.gain.value = mG ?? 0;
      high.gain.value = hG ?? 0;
    },
  };
}

/** Low-pass filter with cutoff normalised to 0..1 (mapped to 80..18000 Hz). */
export function makeFilter(ctx) {
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 18000;
  f.Q.value = 0.7;
  return {
    input: f,
    output: f,
    update({ cutoff }) {
      // 0..1 → 80..18000 (exponential)
      const min = Math.log(80);
      const max = Math.log(18000);
      const c = cutoff ?? 1;
      f.frequency.value = Math.exp(min + (max - min) * c);
    },
  };
}

/** Soft-clip saturation via WaveShaper. */
export function makeSaturator(ctx) {
  const shaper = ctx.createWaveShaper();
  shaper.curve = makeSatCurve(0);
  shaper.oversample = '2x';
  const trim = ctx.createGain();
  trim.gain.value = 1;
  shaper.connect(trim);
  return {
    input: shaper,
    output: trim,
    update({ amount }) {
      shaper.curve = makeSatCurve(amount ?? 0);
      trim.gain.value = 1 - Math.min(0.5, (amount ?? 0) * 0.5);
    },
  };
}

/** Per-track compressor. */
export function makeCompressor(ctx) {
  const c = ctx.createDynamicsCompressor();
  c.threshold.value = -18;
  c.knee.value = 12;
  c.ratio.value = 4;
  c.attack.value = 0.005;
  c.release.value = 0.15;
  return {
    input: c,
    output: c,
    update({ threshold, ratio }) {
      if (threshold != null) c.threshold.value = threshold;
      if (ratio != null) c.ratio.value = ratio;
    },
  };
}

/** Stereo panner. */
export function makePanner(ctx) {
  const p = ctx.createStereoPanner();
  return {
    input: p,
    output: p,
    update({ pan }) {
      p.pan.value = Math.max(-1, Math.min(1, pan ?? 0));
    },
  };
}

/** Per-track gain. */
export function makeGain(ctx, value = 1) {
  const g = ctx.createGain();
  g.gain.value = value;
  return {
    input: g,
    output: g,
    update({ value: v }) {
      g.gain.value = v ?? 1;
    },
  };
}

/** Build the per-track FX chain. */
export function makeTrackFx(ctx, initial = {}) {
  const trackGain = makeGain(ctx, 1);
  const panner = makePanner(ctx);
  const filter = makeFilter(ctx);
  const eq = makeEQ(ctx);
  const sat = makeSaturator(ctx);
  const comp = makeCompressor(ctx);

  // chain
  trackGain.output.connect(panner.input);
  panner.output.connect(filter.input);
  filter.output.connect(eq.input);
  eq.output.connect(sat.input);
  sat.output.connect(comp.input);

  // apply initial
  applyTrackFx({ trackGain, panner, filter, eq, sat, comp }, initial);

  return {
    input: trackGain.input,
    output: comp.output,
    update(cfg) {
      applyTrackFx({ trackGain, panner, filter, eq, sat, comp }, cfg);
    },
  };
}

function applyTrackFx(parts, cfg = {}) {
  parts.trackGain.update({ value: cfg.userGain ?? 1 });
  parts.panner.update({ pan: cfg.pan ?? 0 });
  parts.filter.update({ cutoff: cfg.filterCutoff ?? 1 });
  parts.eq.update(cfg.eq ?? { low: 0, mid: 0, high: 0 });
  parts.sat.update({ amount: cfg.saturation ?? 0 });
}

/* ------------------------------------------------------------------
 * MASTER FX
 * ------------------------------------------------------------------ */

/** Generate a procedural convolution impulse. */
export function makeReverbImpulse(ctx, duration = 2.4, decay = 2.0) {
  const len = Math.floor(ctx.sampleRate * duration);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
  }
  return buf;
}

/** Master chain: reverb (parallel) + delay (parallel) + master filter + compressor + gain. */
export function makeMasterBus(ctx, opts = {}) {
  // master filter
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 12000;
  filter.Q.value = 0.5;

  // master compressor / limiter
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -2;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.001;
  limiter.release.value = 0.1;

  // master gain
  const gain = ctx.createGain();
  gain.gain.value = 0.8;

  // series: filter -> limiter -> gain
  filter.connect(limiter).connect(gain);

  // parallel reverb send
  const reverb = ctx.createConvolver();
  reverb.buffer = makeReverbImpulse(ctx, 2.4, 2.0);
  const reverbIn = ctx.createGain();
  reverbIn.gain.value = 1;
  const reverbGain = ctx.createGain();
  reverbGain.gain.value = 0.22;
  reverbIn.connect(reverb).connect(reverbGain).connect(gain);

  // parallel delay send
  const delay = ctx.createDelay(1.5);
  delay.delayTime.value = 0.32;
  const delayFb = ctx.createGain();
  delayFb.gain.value = 0.42;
  const delayLp = ctx.createBiquadFilter();
  delayLp.type = 'lowpass';
  delayLp.frequency.value = 1800;
  delay.connect(delayLp).connect(delayFb).connect(delay);
  const delayIn = ctx.createGain();
  delayIn.gain.value = 1;
  const delayGain = ctx.createGain();
  delayGain.gain.value = 0.14;
  delayIn.connect(delay).connect(delayGain).connect(gain);

  // two send buses that connect from outside
  const reverbSend = reverbIn;
  const delaySend = delayIn;

  return {
    input: filter,
    output: gain,
    sends: { reverb: reverbSend, delay: delaySend },
    update({ master, filter: fc, reverb, delay }) {
      if (master != null) gain.gain.value = master;
      if (fc != null) filter.frequency.value = fc;
      if (reverb != null) reverbGain.gain.value = reverb;
      if (delay != null) delayGain.gain.value = delay;
    },
  };
}

/** Build a recorder that captures the master output to a WebM blob. */
export function makeRecorder(ctx, masterOut) {
  const dest = ctx.createMediaStreamDestination();
  masterOut.connect(dest);
  let recorder = null;
  let chunks = [];

  return {
    start() {
      chunks = [];
      recorder = new MediaRecorder(dest.stream, { mimeType: 'audio/webm' });
      recorder.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      recorder.start();
    },
    async stop() {
      return new Promise((resolve) => {
        if (!recorder) return resolve(null);
        recorder.onstop = () => {
          const blob = new Blob(chunks, { type: 'audio/webm' });
          resolve(blob);
        };
        recorder.stop();
      });
    },
    get isRecording() {
      return recorder?.state === 'recording';
    },
  };
}