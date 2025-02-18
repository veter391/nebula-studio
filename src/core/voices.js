/**
 * Synth voices — every sound in Nebula Studio is generated from scratch
 * using Web Audio API oscillators, noise buffers and biquad filters.
 *
 * Each voice has the signature:
 *   (ctx, dest, time, opts) => void
 *
 * It schedules a sound starting at the audio-context time `time`. The voice
 * owns its envelope and is responsible for stopping all its nodes.
 *
 * @module core/voices
 */

'use strict';

/** Generate a white-noise buffer of `duration` seconds, length 1 channel. */
export function makeNoiseBuffer(ctx, duration = 1) {
  const len = Math.floor(ctx.sampleRate * duration);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

/** Soft-clip waveshaper curve for saturation. */
export function makeSatCurve(amount = 0) {
  const n = 1024;
  const curve = new Float32Array(n);
  const k = amount * 100;
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
  }
  return curve;
}

/* ------------------------------------------------------------------
 * DRUM VOICES
 * ------------------------------------------------------------------ */

/** Kick — sine sweep + click + body. */
export function kick(ctx, dest, t, opts = {}) {
  const osc = ctx.createOscillator();
  const sub = ctx.createOscillator();
  const og = ctx.createGain();
  const subG = ctx.createGain();
  osc.type = 'sine';
  sub.type = 'sine';
  const f0 = opts.freq ?? 150;
  osc.frequency.setValueAtTime(f0, t);
  osc.frequency.exponentialRampToValueAtTime(40, t + 0.18);
  sub.frequency.setValueAtTime(f0 / 2, t);
  sub.frequency.exponentialRampToValueAtTime(35, t + 0.25);
  og.gain.setValueAtTime(0, t);
  og.gain.linearRampToValueAtTime(1.0, t + 0.003);
  og.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
  subG.gain.setValueAtTime(0, t);
  subG.gain.linearRampToValueAtTime(0.6, t + 0.005);
  subG.gain.exponentialRampToValueAtTime(0.001, t + 0.55);

  // Click transient
  const click = ctx.createOscillator();
  const cg = ctx.createGain();
  click.type = 'triangle';
  click.frequency.setValueAtTime(1800, t);
  cg.gain.setValueAtTime(0.4, t);
  cg.gain.exponentialRampToValueAtTime(0.001, t + 0.02);

  osc.connect(og).connect(dest);
  sub.connect(subG).connect(dest);
  click.connect(cg).connect(dest);
  osc.start(t); osc.stop(t + 0.5);
  sub.start(t); sub.stop(t + 0.6);
  click.start(t); click.stop(t + 0.04);
}

/** Snare — noise body + warm tonal body with envelope-shaped filter. */
export function snare(ctx, dest, t, opts = {}) {
  // Noise body with envelope-shaped lowpass for crispness without fizz
  const noise = ctx.createBufferSource();
  noise.buffer = ctx.noiseBuffer;
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 1500;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(9000, t);
  lp.frequency.exponentialRampToValueAtTime(3000, t + 0.12);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.7, t + 0.002);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);

  // Tonal body — slightly detuned pair for warmth
  const osc = ctx.createOscillator();
  const osc2 = ctx.createOscillator();
  const oscLp = ctx.createBiquadFilter();
  const og = ctx.createGain();
  osc.type = 'triangle';
  osc2.type = 'triangle';
  osc.frequency.setValueAtTime(200, t);
  osc.frequency.exponentialRampToValueAtTime(110, t + 0.08);
  osc2.frequency.setValueAtTime(207, t); // slight detune = warmth
  osc2.frequency.exponentialRampToValueAtTime(115, t + 0.08);
  oscLp.type = 'lowpass';
  oscLp.frequency.setValueAtTime(1200, t);
  oscLp.frequency.exponentialRampToValueAtTime(600, t + 0.08);
  og.gain.setValueAtTime(0.4, t);
  og.gain.exponentialRampToValueAtTime(0.001, t + 0.1);

  noise.connect(hp).connect(lp).connect(g).connect(dest);
  osc.connect(oscLp);
  osc2.connect(oscLp);
  oscLp.connect(og).connect(dest);
  noise.start(t); noise.stop(t + 0.22);
  osc.start(t); osc.stop(t + 0.12);
  osc2.start(t); osc2.stop(t + 0.12);
}

/** Hi-hat — HP+LP-filtered noise, open or closed. */
export function hat(ctx, dest, t, opts = {}) {
  const open = opts.open ?? (t % 1 < 0.5);
  const dur = open ? 0.32 : 0.05;
  const noise = ctx.createBufferSource();
  noise.buffer = ctx.noiseBuffer;
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 7000;
  // gentle LP on top — takes the harsh fizz off dense hat patterns
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 14000;
  lp.Q.value = 0.5;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.55, t + 0.001);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  noise.connect(hp).connect(lp).connect(g).connect(dest);
  noise.start(t); noise.stop(t + dur + 0.05);
}

/** Clap — 3 quick bursts of BP-filtered noise + tail. */
export function clap(ctx, dest, t) {
  for (let i = 0; i < 3; i++) {
    const noise = ctx.createBufferSource();
    noise.buffer = ctx.noiseBuffer;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1200;
    bp.Q.value = 1.4;
    const g = ctx.createGain();
    const off = i * 0.013;
    g.gain.setValueAtTime(0, t + off);
    g.gain.linearRampToValueAtTime(0.65, t + off + 0.002);
    g.gain.exponentialRampToValueAtTime(0.001, t + off + 0.05);
    noise.connect(bp).connect(g).connect(dest);
    noise.start(t + off); noise.stop(t + off + 0.06);
  }
  // Tail
  const tn = ctx.createBufferSource();
  tn.buffer = ctx.noiseBuffer;
  const tbp = ctx.createBiquadFilter();
  tbp.type = 'bandpass'; tbp.frequency.value = 1200; tbp.Q.value = 1.4;
  const tg = ctx.createGain();
  tg.gain.setValueAtTime(0, t + 0.04);
  tg.gain.linearRampToValueAtTime(0.4, t + 0.045);
  tg.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
  tn.connect(tbp).connect(tg).connect(dest);
  tn.start(t + 0.04); tn.stop(t + 0.24);
}

/** Tom — sine with pitch envelope, mellow. */
export function tom(ctx, dest, t, opts = {}) {
  const f = opts.freq ?? 180;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(f * 1.5, t);
  osc.frequency.exponentialRampToValueAtTime(f, t + 0.12);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.8, t + 0.003);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
  osc.connect(g).connect(dest);
  osc.start(t); osc.stop(t + 0.45);
}

/** Rim — short tonal click. */
export function rim(ctx, dest, t) {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = 'square';
  osc.frequency.setValueAtTime(880, t);
  osc.frequency.exponentialRampToValueAtTime(440, t + 0.04);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 1500;
  bp.Q.value = 6;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.5, t + 0.001);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
  osc.connect(bp).connect(g).connect(dest);
  osc.start(t); osc.stop(t + 0.07);
}

/* ------------------------------------------------------------------
 * TONAL VOICES
 * ------------------------------------------------------------------ */

/** Sub-bass — pure sine, very clean, perfect for sub layer. */
export function sub(ctx, dest, t, opts = {}) {
  const freq = opts.freq ?? 55;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.7, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
  osc.connect(g).connect(dest);
  osc.start(t); osc.stop(t + 0.45);
}

/** Bass — saw + sub + LP envelope. */
export function bass(ctx, dest, t, opts = {}) {
  const freq = opts.freq ?? 55;
  const osc = ctx.createOscillator();
  const sub = ctx.createOscillator();
  const lp = ctx.createBiquadFilter();
  const g = ctx.createGain();
  osc.type = 'sawtooth';
  sub.type = 'sine';
  osc.frequency.value = freq;
  sub.frequency.value = freq / 2;
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(2200, t);
  lp.frequency.exponentialRampToValueAtTime(380, t + 0.35);
  lp.Q.value = 6;

  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.65, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.38);

  osc.connect(lp);
  sub.connect(lp);
  lp.connect(g).connect(dest);
  osc.start(t); osc.stop(t + 0.42);
  sub.start(t); sub.stop(t + 0.42);
}

/** Lead — square + detuned saw + vibrato + LP envelope. */
export function lead(ctx, dest, t, opts = {}) {
  const freq = opts.freq ?? 440;
  const dur = opts.dur ?? 0.3;
  const osc1 = ctx.createOscillator();
  const osc2 = ctx.createOscillator();
  const lp = ctx.createBiquadFilter();
  const g = ctx.createGain();
  osc1.type = 'square';
  osc2.type = 'sawtooth';
  osc1.frequency.value = freq;
  osc2.frequency.value = freq * 1.005;

  // vibrato
  const lfo = ctx.createOscillator();
  const lfoG = ctx.createGain();
  lfo.frequency.value = 6;
  lfoG.gain.value = freq * 0.008;
  lfo.connect(lfoG).connect(osc1.frequency);
  lfo.connect(lfoG).connect(osc2.frequency);

  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(3000, t);
  lp.frequency.exponentialRampToValueAtTime(900, t + dur);
  lp.Q.value = 4;

  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.3, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);

  osc1.connect(lp);
  osc2.connect(lp);
  lp.connect(g).connect(dest);
  osc1.start(t); osc1.stop(t + dur + 0.05);
  osc2.start(t); osc2.stop(t + dur + 0.05);
  lfo.start(t); lfo.stop(t + dur + 0.05);
}

/** Pluck — quick-decay sine + harmonic for marimba/electric piano feel. */
export function pluck(ctx, dest, t, opts = {}) {
  const freq = opts.freq ?? 440;
  const osc = ctx.createOscillator();
  const osc2 = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = 'sine';
  osc2.type = 'triangle';
  osc.frequency.value = freq;
  osc2.frequency.value = freq * 2;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.55, t + 0.002);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.45);
  const g2 = ctx.createGain();
  g2.gain.setValueAtTime(0, t);
  g2.gain.linearRampToValueAtTime(0.18, t + 0.002);
  g2.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
  osc.connect(g).connect(dest);
  osc2.connect(g2).connect(dest);
  osc.start(t); osc.stop(t + 0.5);
  osc2.start(t); osc2.stop(t + 0.22);
}

/** Pad — detuned saw chord + slow LFO. */
export function pad(ctx, dest, t, opts = {}) {
  const root = opts.freq ?? 220;
  const dur = opts.dur ?? 0.95;
  const freqs = [root, root * 1.5, root * 2]; // triad-ish
  freqs.forEach((f, idx) => {
    const osc = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const g = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    osc.type = 'sawtooth';
    osc2.type = 'sawtooth';
    osc.frequency.value = f;
    osc2.frequency.value = f * 1.007;
    lp.type = 'lowpass';
    lp.frequency.value = 1100;
    lp.Q.value = 1.5;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.13, t + 0.18);
    g.gain.linearRampToValueAtTime(0.1, t + dur - 0.2);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    const lfo = ctx.createOscillator();
    const lfoG = ctx.createGain();
    lfo.frequency.value = 0.4 + idx * 0.15;
    lfoG.gain.value = 400;
    lfo.connect(lfoG).connect(lp.frequency);
    osc.connect(lp);
    osc2.connect(lp);
    lp.connect(g).connect(dest);
    osc.start(t); osc.stop(t + dur + 0.05);
    osc2.start(t); osc2.stop(t + dur + 0.05);
    lfo.start(t); lfo.stop(t + dur + 0.05);
  });
}

/** FX sweep — rising BP noise. */
export function fx(ctx, dest, t, opts = {}) {
  const noise = ctx.createBufferSource();
  noise.buffer = ctx.noiseBuffer;
  const bp = ctx.createBiquadFilter();
  const g = ctx.createGain();
  bp.type = 'bandpass';
  bp.Q.value = 8;
  bp.frequency.setValueAtTime(opts.from ?? 200, t);
  bp.frequency.exponentialRampToValueAtTime(opts.to ?? 8000, t + 0.6);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.4, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.65);
  noise.connect(bp).connect(g).connect(dest);
  noise.start(t); noise.stop(t + 0.7);
}

/* ------------------------------------------------------------------
 * VOICE CATALOG
 * ------------------------------------------------------------------ */

export const VOICES = {
  kick,
  snare,
  hat,
  clap,
  tom,
  rim,
  sub,
  bass,
  lead,
  pluck,
  pad,
  fx,
};