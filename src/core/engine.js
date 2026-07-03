/**
 * Top-level audio engine — wires together the audio graph, scheduler,
 * recorder, per-track FX, master FX, and export pipeline.
 *
 * Public API (consumed by the UI):
 *   engine.init()                  — create AudioContext (must be called from a user gesture)
 *   engine.play() / engine.stop()  — transport
 *   engine.toggleCell / setCell    — pattern edits that also feed the scheduler
 *   engine.previewTrack            — trigger a single track live
 *   engine.previewNote             — trigger a one-shot tonal note (chord pad / previews)
 *   engine.startNote / stopNote    — held note-on/note-off pair (virtual keyboard sustain)
 *   engine.updateTrackSettings     — apply new per-track FX / gain
 *   engine.updateMasterFx          — apply master FX
 *   engine.exportWAV / exportMIDI  — offline render
 *   engine.startRecording / stopRecording
 *
 * @module core/engine
 */

import { Emitter, midiToFreq } from '../utils.js';
import { TRACKS, TRACK_BY_ID } from '../data/tracks.js';
import { VOICES, makeNoiseBuffer, startSustainedVoice, stopSustainedVoice } from './voices.js';
import { makeTrackFx, makeMasterBus, makeRecorder } from './effects.js';
import { Scheduler } from './scheduler.js';
import { audioBufferToWav } from './wav-encoder.js';
import { patternToMidiBlob } from './midi-export.js';

export class AudioEngine extends Emitter {
  constructor() {
    super();
    this.ctx = null;
    this.tracks = TRACKS;
    this.trackFx = {}; // id -> makeTrackFx output
    this.master = null;
    this.analyser = null;
    this.analyserL = null;
    this.analyserR = null;
    this.recorder = null;
    this.scheduler = null;
    this.initialized = false;
  }

  /** Lazily create the AudioContext and build the graph. */
  async init() {
    if (this.initialized) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new Ctx({ latencyHint: 'interactive' });
    if (this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume();
      } catch (e) {
        /* ignore */
      }
    }
    this.noiseBuffer = makeNoiseBuffer(this.ctx, 1);
    // inject noiseBuffer into ctx so voices can pick it up
    this.ctx.noiseBuffer = this.noiseBuffer;
    this._buildGraph();
    this.initialized = true;
    this.emit('ready');
  }

  _buildGraph() {
    const ctx = this.ctx;

    // master bus
    this.master = makeMasterBus(ctx);

    // analysers (split the master output for stereo metering)
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.78;
    this.analyserL = ctx.createAnalyser();
    this.analyserL.fftSize = 256;
    this.analyserL.smoothingTimeConstant = 0.6;
    this.analyserR = ctx.createAnalyser();
    this.analyserR.fftSize = 256;
    this.analyserR.smoothingTimeConstant = 0.6;
    const splitter = ctx.createChannelSplitter(2);
    this.master.output.connect(this.analyser);
    this.master.output.connect(splitter);
    splitter.connect(this.analyserL, 0);
    splitter.connect(this.analyserR, 1);
    this.analyser.connect(ctx.destination);

    // per-track FX chains
    this.tracks.forEach((tr) => {
      const fx = makeTrackFx(ctx, { userGain: 1, pan: 0, eq: { low: 0, mid: 0, high: 0 }, filterCutoff: 1, saturation: 0 });
      fx.output.connect(this.master.input);
      fx.output.connect(this.master.sends.reverb);
      fx.output.connect(this.master.sends.delay);
      this.trackFx[tr.id] = fx;
    });

    // recorder
    this.recorder = makeRecorder(ctx, this.master.output);

    // scheduler
    this.scheduler = new Scheduler(ctx, {
      getStepDuration: () => 60 / this._bpm / 4,
      getSwing: () => this._swing,
      getStepCount: () => this._stepCount ?? 16,
      onStep: (step, time) => this._onStep(step, time),
    });
  }

  /** Inject the function that returns the current pattern (decouples engine from store). */
  setPatternProvider(fn) {
    this._getPattern = fn;
  }

  setBpm(b) {
    this._bpm = Math.max(60, Math.min(200, b));
    this.emit('bpm', this._bpm);
  }
  getBpm() {
    return this._bpm ?? 120;
  }
  setSwing(s) {
    this._swing = Math.max(0, Math.min(0.6, s));
    this.emit('swing', this._swing);
  }
  getSwing() {
    return this._swing ?? 0;
  }

  /** Apply the store state to all audio nodes (gain, FX, master). */
  applyState(s) {
    if (!this.initialized) return;
    this.setBpm(s.bpm);
    this.setSwing(s.swing);

    // per-track
    for (const t of s.tracks) {
      const fx = this.trackFx[t.id];
      if (fx) fx.update(t);
    }

    // mute/solo resolution
    const anySolo = s.tracks.some((t) => t.solo);
    for (const t of s.tracks) {
      const fx = this.trackFx[t.id];
      if (!fx) continue;
      let g = t.userGain;
      if (anySolo) g = t.solo ? t.userGain : 0;
      else if (t.mute) g = 0;
      fx.update({ userGain: g, pan: t.pan, eq: t.eq, filterCutoff: t.filterCutoff, saturation: t.saturation });
    }

    // master
    this.master.update({
      master: s.masterFx.master,
      filter: s.masterFx.filter,
      reverb: s.masterFx.reverb,
      delay: s.masterFx.delay,
    });
  }

  /** Trigger a single voice live (for previews / virtual keyboard). */
  trigger(trackId, opts = {}) {
    if (!this.initialized) return;
    const tr = TRACK_BY_ID[trackId];
    if (!tr) return;
    const synth = VOICES[tr.voice];
    if (!synth) return;
    const time = this.ctx.currentTime + 0.005;
    try {
      synth(this.ctx, this.trackFx[trackId].input, time, opts);
    } catch (e) {
      console.warn('[engine] trigger failed', trackId, e);
      return;
    }
    this.emit('trigger', { trackId, time, step: -1 });
  }

  /** Trigger a note at a specific MIDI number — only meaningful for tonal tracks. */
  previewNote(trackId, midi) {
    if (!this.initialized) return;
    const tr = TRACK_BY_ID[trackId];
    if (!tr) return;
    const synth = VOICES[tr.voice];
    if (!synth) return;
    // for drums, map the midi to a per-step frequency option (kick high/mid/low)
    if (tr.kind === 'drum') {
      if (tr.id === 'kick') {
        const f = 90 + (midi - 36) * 4;
        this.trigger(trackId, { freq: f });
        return;
      }
      if (tr.id === 'tom') {
        this.trigger(trackId, { freq: midiToFreq(midi) });
        return;
      }
    }
    // tonal
    this.trigger(trackId, { freq: midiToFreq(midi), dur: 0.4 });
  }

  /**
   * Begin a HELD note for `trackId` at `midi` (attack into sustain, stays
   * open until `stopNote` is called). Used by the virtual keyboard so a
   * key held down keeps sounding instead of firing a fixed-length preview.
   *
   * Returns an opaque handle to pass to `stopNote`, or null if the track's
   * voice has no sustained variant (e.g. drums) or the engine isn't ready.
   */
  startNote(trackId, midi) {
    if (!this.initialized) return null;
    const tr = TRACK_BY_ID[trackId];
    if (!tr) return null;
    const fx = this.trackFx[trackId];
    if (!fx) return null;
    const time = this.ctx.currentTime + 0.005;
    let voiceHandle;
    try {
      voiceHandle = startSustainedVoice(tr.voice, this.ctx, fx.input, time, { freq: midiToFreq(midi) });
    } catch (e) {
      console.warn('[engine] startNote failed', trackId, e);
      return null;
    }
    if (!voiceHandle) return null;
    // `midi` is included alongside the existing trackId/time/step fields so
    // consumers that only care about the visual pulse (the visualizer) are
    // unaffected, while new listeners (e.g. the Learn play-along mode) can
    // tell exactly which note was actually played.
    this.emit('trigger', { trackId, time, step: -1, midi });
    return { trackId, voiceHandle };
  }

  /** Release a note started with `startNote`. Safe to call with null/already-released handles. */
  stopNote(handle) {
    if (!this.initialized || !handle) return;
    const time = this.ctx.currentTime + 0.005;
    try {
      stopSustainedVoice(handle.voiceHandle, this.ctx, time);
    } catch (e) {
      console.warn('[engine] stopNote failed', handle.trackId, e);
    }
  }

  /** Start playback. */
  play() {
    if (!this.initialized) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    this.scheduler.start();
    this.emit('play');
  }
  /** Stop playback. */
  stop() {
    if (!this.initialized) return;
    this.scheduler.stop();
    this.emit('stop');
  }

  /** Scheduler callback: trigger all active cells at this step. */
  _onStep(step, time) {
    // pull the live pattern via injected provider
    const pattern = this._getPattern ? this._getPattern() : null;
    if (!pattern) return;
    for (const tr of this.tracks) {
      const row = pattern[tr.id];
      if (!row || !row[step]) continue;
      const synth = VOICES[tr.voice];
      if (!synth) continue;
      // tonal tracks: pick a note per step
      let opts = {};
      if (tr.kind !== 'drum') {
        opts = this._pickTonalOpts(tr.id, step);
      } else if (tr.id === 'kick') {
        opts.freq = 150;
      } else if (tr.id === 'hat') {
        opts.open = step % 4 === 3;
      } else if (tr.id === 'tom') {
        // tom rises through the bar
        const freqs = [180, 220, 160, 240];
        opts.freq = freqs[step % 4];
      }
      try {
        synth(this.ctx, this.trackFx[tr.id].input, time, opts);
      } catch (e) {
        console.warn('[engine] step trigger failed', tr.id, 'step', step, e);
        continue;
      }
      this.emit('trigger', { trackId: tr.id, step, time });
    }
    this.emit('step', { step, time });
  }

  _pickTonalOpts(trackId, step) {
    // simple arpeggiator patterns
    const scales = {
      sub: [55, 55, 73.4, 82.4],
      bass: [55, 55, 73.4, 82.4, 65.4, 73.4],
      lead: [330, 392, 440, 523, 587, 659, 784, 880],
      pluck: [440, 523, 659, 784, 880, 784, 659, 523],
      pad: [220],
    };
    const arr = scales[trackId] || [220];
    return { freq: arr[step % arr.length], dur: trackId === 'pad' ? 0.95 : 0.3 };
  }

  /* ------------------------------------------------------------------
   * EXPORTS
   * ------------------------------------------------------------------ */

  /** Offline-render the current pattern to a WAV blob. */
  async exportWAV(s, opts = {}) {
    const bars = opts.bars ?? 4;
    const ctx = this.ctx;
    const totalSteps = 16 * bars;
    const stepDur = 60 / s.bpm / 4;
    const duration = stepDur * totalSteps + 1.5;
    const off = new OfflineAudioContext(2, Math.ceil(ctx.sampleRate * duration), ctx.sampleRate);

    // procedural noise
    const len = Math.floor(off.sampleRate * 1);
    const noiseBuf = off.createBuffer(1, len, off.sampleRate);
    const nd = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) nd[i] = Math.random() * 2 - 1;
    off.noiseBuffer = noiseBuf;

    // build a parallel offline graph mirroring the live one
    const offlineMaster = makeMasterBus(off);
    offlineMaster.update({
      master: s.masterFx.master,
      filter: s.masterFx.filter,
      reverb: s.masterFx.reverb,
      delay: s.masterFx.delay,
    });
    offlineMaster.output.connect(off.destination);

    const offlineTrackFx = {};
    const anySolo = s.tracks.some((t) => t.solo);
    for (const tr of this.tracks) {
      const fx = makeTrackFx(off, {});
      const tState = s.tracks.find((x) => x.id === tr.id);
      let g = tState.userGain;
      if (anySolo) g = tState.solo ? g : 0;
      else if (tState.mute) g = 0;
      fx.update({ ...tState, userGain: g });
      fx.output.connect(offlineMaster.input);
      fx.output.connect(offlineMaster.sends.reverb);
      fx.output.connect(offlineMaster.sends.delay);
      offlineTrackFx[tr.id] = fx;
    }

    // schedule events
    let t = 0;
    for (let bar = 0; bar < bars; bar++) {
      for (let step = 0; step < 16; step++) {
        const swingOffset = step % 2 === 1 ? stepDur * s.swing : 0;
        const st = t + swingOffset;
        for (const tr of this.tracks) {
          const cell = s.pattern[tr.id]?.[step];
          if (!cell) continue;
          let opts = {};
          if (tr.kind !== 'drum') {
            opts = this._pickTonalOpts(tr.id, step + bar * 3);
          } else if (tr.id === 'kick') {
            opts.freq = 150;
          } else if (tr.id === 'hat') {
            opts.open = step % 4 === 3;
          } else if (tr.id === 'tom') {
            const freqs = [180, 220, 160, 240];
            opts.freq = freqs[step % 4];
          }
          try {
            VOICES[tr.voice](off, offlineTrackFx[tr.id].input, st, opts);
          } catch (e) {
            console.warn('[engine] export voice failed', tr.id, 'bar', bar, 'step', step, e);
          }
        }
        t += stepDur;
      }
    }

    let rendered;
    try {
      rendered = await off.startRendering();
    } catch (e) {
      console.warn('[engine] offline render failed', e);
      throw new Error('WAV render failed: ' + (e?.message || 'unknown error'));
    }
    try {
      return audioBufferToWav(rendered);
    } catch (e) {
      console.warn('[engine] WAV encode failed', e);
      throw new Error('WAV encode failed: ' + (e?.message || 'unknown error'));
    }
  }

  /** Export current pattern as a MIDI blob. */
  exportMIDI(s, opts = {}) {
    try {
      return patternToMidiBlob(s.pattern, {
        bpm: s.bpm,
        swing: s.swing,
        bars: opts.bars ?? 4,
      });
    } catch (e) {
      console.warn('[engine] MIDI export failed', e);
      throw new Error('MIDI export failed: ' + (e?.message || 'unknown error'));
    }
  }

  startRecording() {
    if (!this.initialized) return false;
    this.recorder.start();
    return true;
  }
  async stopRecording() {
    if (!this.initialized) return null;
    return this.recorder.stop();
  }
}

export const engine = new AudioEngine();
window.NebulaEngine = engine;