/**
 * Canvas visualizer with 4 modes:
 *   - spectrum     : classic frequency bars
 *   - oscilloscope : time-domain waveform
 *   - particles    : audio-reactive particle field
 *   - nebula       : flowing radial nebula clouds driven by FFT
 *
 * @module ui/visualizer
 */

import { store } from '../store.js';
import { engine } from '../core/engine.js';

const TRACK_COLORS = {
  kick: '255, 94, 122',
  snare: '255, 184, 77',
  hat: '255, 224, 102',
  clap: '184, 255, 92',
  tom: '255, 138, 61',
  rim: '255, 200, 168',
  sub: '0, 245, 255',
  bass: '56, 189, 248',
  lead: '139, 92, 246',
  pluck: '217, 70, 239',
  pad: '255, 61, 240',
  fx: '92, 243, 255',
};

// Performance caps — keep the visualizer smooth even with many triggers
const MAX_PARTICLES = 220;
const MAX_SHOCKWAVES = 24;

export class Visualizer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.particles = [];
    this.shockwaves = [];
    this.nebula = { angle: 0 };
    this.t0 = performance.now();
    this.W = 0;
    this.H = 0;
    this.mode = 'particles';
    this.freqData = null;
    this.waveData = null;
    this.levelData = null;
    this.bgPulse = 0;
    this.lastFrame = performance.now();
    this._resize = this._resize.bind(this);
    this._loop = this._loop.bind(this);
    this._resize();
    window.addEventListener('resize', this._resize);
  }

  _resize() {
    const r = this.canvas.getBoundingClientRect();
    this.canvas.width = r.width * this.dpr;
    this.canvas.height = r.height * this.dpr;
    this.W = r.width;
    this.H = r.height;
  }

  attach(an, aL, aR) {
    this.analyser = an;
    this.analyserL = aL;
    this.analyserR = aR;
    this.freqData = new Uint8Array(an.frequencyBinCount);
    this.waveData = new Uint8Array(an.fftSize);
    this.levelData = new Uint8Array(aL.frequencyBinCount);
    this.levelDataR = new Uint8Array(aR.frequencyBinCount);
  }

  setMode(mode) {
    const prev = this.mode;
    this.mode = mode;
    // when LEAVING particles mode, clear the field so we don't carry
    // hundreds of dead particles into the next mode.
    // when ENTERING particles mode, also clear — protects against the
    // "switch to spectrum then back" case where a backlog from before
    // would briefly draw all at once and spike the frame time.
    if (prev === 'particles' || mode === 'particles') {
      this.particles.length = 0;
      this.shockwaves.length = 0;
    }
  }

  onTrigger(trackId, _step, _time) {
    const color = TRACK_COLORS[trackId] || '0, 245, 255';
    const intensity = ({
      kick: 1.0, snare: 0.85, hat: 0.45, clap: 0.8, tom: 0.75,
      rim: 0.4, sub: 0.7, bass: 0.65, lead: 0.55, pluck: 0.6, pad: 0.5, fx: 0.9,
    })[trackId] || 0.6;
    const cx = this.W / 2 + (Math.random() - 0.5) * this.W * 0.5;
    const cy = this.H / 2 + (Math.random() - 0.5) * this.H * 0.3;
    // Reduce particle count per trigger when we're already near the cap, so
    // dense beats (e.g. trap rolls, dnb breakcore) don't blow the budget.
    const capLeft = MAX_PARTICLES - this.particles.length;
    const ratio = capLeft < 60 ? Math.max(0.3, capLeft / 60) : 1;
    const count = Math.max(2, Math.floor((intensity * 40 + 6) * ratio));
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (Math.random() * 4 + 2) * intensity;
      this.particles.push({
        x: cx, y: cy,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 1,
        life: 1,
        decay: 0.012 + Math.random() * 0.018,
        size: (Math.random() * 2.4 + 0.8) * intensity,
        color,
      });
    }
    // Hard cap: drop the oldest particles in one bulk operation.
    if (this.particles.length > MAX_PARTICLES) {
      this.particles.splice(0, this.particles.length - MAX_PARTICLES);
    }
    if (this.shockwaves.length < MAX_SHOCKWAVES) {
      this.shockwaves.push({
        x: cx, y: cy,
        r: 6,
        maxR: 140 + intensity * 100,
        life: 1,
        color,
      });
    }
    this.bgPulse = Math.max(this.bgPulse, intensity * 0.6);
  }

  start() { requestAnimationFrame(this._loop); }

  _loop() {
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.lastFrame) / 1000 || 0.016);
    this.lastFrame = now;
    this._draw(dt);
    requestAnimationFrame(this._loop);
  }

  _draw(dt) {
    const ctx = this.ctx;
    const W = this.W, H = this.H;
    // background fade
    ctx.fillStyle = 'rgba(5, 1, 13, 0.22)';
    ctx.fillRect(0, 0, W, H);

    // ambient pulse
    const ambient = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.7);
    ambient.addColorStop(0, `rgba(139, 92, 246, ${0.04 + this.bgPulse * 0.12})`);
    ambient.addColorStop(0.5, `rgba(0, 245, 255, ${0.02 + this.bgPulse * 0.06})`);
    ambient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = ambient;
    ctx.fillRect(0, 0, W, H);
    this.bgPulse *= 0.94;

    // grid
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1;
    const cols = 16, rows = 6;
    for (let i = 0; i <= cols; i++) {
      const x = (W / cols) * i;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let i = 0; i <= rows; i++) {
      const y = (H / rows) * i;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }

    if (this.analyser) {
      this.analyser.getByteFrequencyData(this.freqData);
      this.analyserL.getByteFrequencyData(this.levelData);
      this.analyserR.getByteFrequencyData(this.levelDataR);
      this.analyser.getByteTimeDomainData(this.waveData);
    }

    switch (this.mode) {
      case 'spectrum': this._drawSpectrum(ctx, W, H); break;
      case 'oscilloscope': this._drawOscilloscope(ctx, W, H); break;
      case 'particles': this._drawParticles(ctx, W, H, dt); break;
      case 'nebula': this._drawNebula(ctx, W, H, dt); break;
    }

    // step indicator
    if (engine.scheduler?.running) {
      const step = engine.scheduler.currentStep;
      const x = ((step + 0.5) / 16) * W;
      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, 0); ctx.lineTo(x, H);
      ctx.stroke();
    }
  }

  _drawSpectrum(ctx, W, H) {
    if (!this.freqData) return;
    const bins = 96;
    const step = Math.floor(this.freqData.length / bins);
    const barW = W / bins;
    const halfH = H * 0.85;
    for (let i = 0; i < bins; i++) {
      let sum = 0;
      for (let j = 0; j < step; j++) sum += this.freqData[i * step + j];
      const v = sum / step / 255;
      const h = v * halfH;
      const hue = 180 + i * 2;
      const grad = ctx.createLinearGradient(0, halfH - h, 0, halfH);
      grad.addColorStop(0, `hsla(${hue}, 100%, 70%, 0.95)`);
      grad.addColorStop(1, `hsla(${hue + 30}, 100%, 50%, 0.55)`);
      ctx.fillStyle = grad;
      const x = i * barW + barW * 0.15;
      const w = barW * 0.7;
      ctx.fillRect(x, halfH - h, w, h);
    }
  }

  _drawOscilloscope(ctx, W, H) {
    if (!this.waveData) return;
    const N = this.waveData.length;
    const cy = H / 2;
    const ampScale = H * 0.35;
    ctx.lineWidth = 2.6;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.shadowColor = '#00f5ff';
    ctx.shadowBlur = 14;
    ctx.beginPath();
    for (let i = 0; i < N; i++) {
      const x = (i / N) * W;
      const v = (this.waveData[i] - 128) / 128;
      const y = cy + v * ampScale;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;

    // mirror
    ctx.strokeStyle = 'rgba(255, 61, 240, 0.55)';
    ctx.lineWidth = 1.4;
    ctx.shadowColor = '#ff3df0';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    for (let i = 0; i < N; i++) {
      const x = (i / N) * W;
      const v = (this.waveData[i] - 128) / 128;
      const y = cy + v * ampScale * 0.55 + 8;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  _drawParticles(ctx, W, H, dt) {
    // background trace of the waveform as a faded line
    if (this.waveData) {
      const N = this.waveData.length;
      const cy = H / 2;
      const ampScale = H * 0.18;
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.18)';
      ctx.beginPath();
      for (let i = 0; i < N; i += 4) {
        const x = (i / N) * W;
        const v = (this.waveData[i] - 128) / 128;
        const y = cy + v * ampScale;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    // spectrum as faint radial bars
    if (this.freqData) {
      const cx = W / 2, cy = H / 2;
      const bins = 64;
      const step = Math.floor(this.freqData.length / bins);
      for (let i = 0; i < bins; i++) {
        let sum = 0;
        for (let j = 0; j < step; j++) sum += this.freqData[i * step + j];
        const v = sum / step / 255;
        const a = (i / bins) * Math.PI * 2 - Math.PI / 2;
        const r1 = Math.min(W, H) * 0.18;
        const r2 = r1 + v * Math.min(W, H) * 0.25;
        const hue = 180 + i * 3;
        ctx.strokeStyle = `hsla(${hue}, 100%, 70%, ${0.4 + v * 0.5})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
        ctx.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2);
        ctx.stroke();
      }
    }

    // shockwaves (swap-pop, O(1) removal)
    const sw = this.shockwaves;
    for (let i = sw.length - 1; i >= 0; i--) {
      const s = sw[i];
      s.r += dt * 180;
      s.life -= dt * 1.5;
      if (s.life <= 0) {
        sw[i] = sw[sw.length - 1];
        sw.pop();
        continue;
      }
      ctx.strokeStyle = `rgba(${s.color}, ${s.life * 0.6})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.stroke();
    }

    // particles (swap-pop)
    ctx.globalCompositeOperation = 'lighter';
    const ps = this.particles;
    for (let i = ps.length - 1; i >= 0; i--) {
      const p = ps[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.08;
      p.vx *= 0.985;
      p.vy *= 0.985;
      p.life -= p.decay;
      if (p.life <= 0) {
        ps[i] = ps[ps.length - 1];
        ps.pop();
        continue;
      }
      ctx.fillStyle = `rgba(${p.color}, ${Math.max(0, p.life)})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(${p.color}, ${p.life * 0.3})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * p.life * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  _drawNebula(ctx, W, H, dt) {
    // multiple radial gradients that drift and breathe with the spectrum
    const cx = W / 2, cy = H / 2;
    const baseRadius = Math.min(W, H) * 0.35;
    this.nebula.angle += dt * 0.1;
    const blobs = 5;
    for (let i = 0; i < blobs; i++) {
      const a = this.nebula.angle + (i / blobs) * Math.PI * 2;
      const r = baseRadius * (0.6 + 0.4 * Math.sin(this.nebula.angle * 0.7 + i));
      // pull energy from FFT bin
      let energy = 0;
      if (this.freqData) {
        const idx = Math.floor((i / blobs) * this.freqData.length);
        const range = Math.floor(this.freqData.length / blobs);
        for (let k = idx; k < idx + range && k < this.freqData.length; k++) energy += this.freqData[k];
        energy = energy / range / 255;
      }
      const blobX = cx + Math.cos(a) * r * (1 + energy * 0.4);
      const blobY = cy + Math.sin(a) * r * (1 + energy * 0.4);
      const hue = (i * 60 + 180) % 360;
      const grad = ctx.createRadialGradient(blobX, blobY, 0, blobX, blobY, baseRadius * (0.4 + energy));
      grad.addColorStop(0, `hsla(${hue}, 100%, 70%, ${0.35 + energy * 0.4})`);
      grad.addColorStop(0.6, `hsla(${hue + 30}, 100%, 50%, ${0.12 + energy * 0.2})`);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);
    }
    // waveform overlay
    if (this.waveData) {
      const N = this.waveData.length;
      const cy2 = H / 2;
      const ampScale = H * 0.3;
      ctx.lineWidth = 1.8;
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.beginPath();
      for (let i = 0; i < N; i++) {
        const x = (i / N) * W;
        const v = (this.waveData[i] - 128) / 128;
        const y = cy2 + v * ampScale;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }
}

export function mountVisualizer(host) {
  host.innerHTML = `
    <canvas id="viz" class="viz" aria-label="Audio visualizer"></canvas>
    <div class="viz-hud">
      <div class="viz-hud__pill" id="hudStep">— / 16</div>
      <div class="viz-hud__pill" id="hudLevel">LVL <span>0</span></div>
      <div class="viz-hud__pill viz-hud__pill--mode">
        <button class="viz-mode" data-mode="spectrum">SPECTRUM</button>
        <button class="viz-mode" data-mode="oscilloscope">OSCILLOSCOPE</button>
        <button class="viz-mode is-active" data-mode="particles">PARTICLES</button>
        <button class="viz-mode" data-mode="nebula">NEBULA</button>
      </div>
    </div>
  `;
  const canvas = host.querySelector('#viz');
  const viz = new Visualizer(canvas);

  host.querySelectorAll('.viz-mode').forEach((b) => {
    b.addEventListener('click', () => {
      host.querySelectorAll('.viz-mode').forEach((x) => x.classList.remove('is-active'));
      b.classList.add('is-active');
      const m = b.dataset.mode;
      viz.setMode(m);
      store.setVisualizerMode(m);
    });
  });

  // initial mode
  const initial = store.get().visualizerMode || 'particles';
  viz.setMode(initial);
  host.querySelectorAll('.viz-mode').forEach((b) => b.classList.toggle('is-active', b.dataset.mode === initial));

  return viz;
}