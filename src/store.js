/**
 * Central reactive store.
 *
 * Single source of truth for all UI state. Components subscribe to slices
 * they care about and re-render when those slices change.
 *
 * Persists to `localStorage` under a single key with debounced writes.
 *
 * @module store
 */

import { Emitter, deepClone, debounce } from './utils.js';
import { TRACKS, TRACK_IDS } from './data/tracks.js';
import { DEFAULT_THEME, THEMES } from './data/themes.js';
import { DEFAULT_PRESET_ID, PRESETS_BY_ID } from './data/presets.js';
import { TUTORIALS } from './data/tutorials.js';

const STORAGE_KEY = 'nebula-studio:v2';

/** Build the initial empty pattern (12 tracks × 16 steps). */
const emptyPattern = () => {
  const out = {};
  for (const id of TRACK_IDS) out[id] = new Array(16).fill(false);
  return out;
};

/** Build the initial state object. */
const makeInitialState = () => {
  const tracks = TRACKS.map((t) => ({
    id: t.id,
    userGain: 1,
    pan: 0,
    mute: false,
    solo: false,
    eq: { low: 0, mid: 0, high: 0 },
    filterCutoff: 1, // 0..1 normalised
    saturation: 0,
  }));

  return {
    // transport
    bpm: 124,
    swing: 0,
    isPlaying: false,
    currentStep: -1,

    // pattern
    pattern: emptyPattern(),
    currentPatternSlot: 'A',
    patternSlots: { A: emptyPattern(), B: emptyPattern(), C: emptyPattern(), D: emptyPattern() },

    // song mode
    songChain: ['A', 'B', 'A', 'C'],
    songPosition: 0,

    // tracks
    tracks,

    // master fx
    masterFx: {
      master: 0.8,
      filter: 12000,
      reverb: 0.22,
      delay: 0.14,
    },

    // ui
    theme: DEFAULT_THEME,
    visualizerMode: 'particles', // spectrum | oscilloscope | particles | nebula
    currentTab: 'pattern', // pattern | song | keyboard | learn
    selectedPresetId: DEFAULT_PRESET_ID,

    // tutorials
    tutorials: TUTORIALS.reduce((acc, t) => {
      acc[t.id] = { currentStep: 0, completed: false };
      return acc;
    }, {}),
    activeTutorial: null,

    // history (undo/redo)
    history: { past: [], future: [] },

    // pattern save slots (named, persisted)
    saveSlots: {}, // { slotName: { name, bpm, swing, pattern, masterFx, tracks } }

    // keyboard state
    keyboard: { octave: 4, voice: 'lead' },

    // meta
    bootedAt: null,
  };
};

class Store extends Emitter {
  constructor() {
    super();
    this.state = makeInitialState();
    this._persist = debounce(this._persistNow.bind(this), 250);
  }

  /** Hydrate from localStorage. Returns true if anything was restored. */
  hydrate() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      // shallow merge with defaults to be forward-compatible
      this.state = {
        ...makeInitialState(),
        ...data,
        tracks: data.tracks || makeInitialState().tracks,
        pattern: data.pattern || emptyPattern(),
        patternSlots: data.patternSlots || makeInitialState().patternSlots,
        masterFx: data.masterFx || makeInitialState().masterFx,
        tutorials: data.tutorials || makeInitialState().tutorials,
        saveSlots: data.saveSlots || {},
        history: { past: [], future: [] }, // never persist history
      };
      return true;
    } catch (e) {
      console.warn('hydrate failed', e);
      return false;
    }
  }

  _persistNow() {
    try {
      // strip non-serialisable / transient fields
      const toSave = {
        ...this.state,
        isPlaying: false,
        currentStep: -1,
        history: undefined,
        bootedAt: undefined,
      };
      delete toSave.history;
      delete toSave.bootedAt;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
    } catch (e) {
      console.warn('persist failed', e);
    }
  }

  /** Get the current state. */
  get() {
    return this.state;
  }

  /** Update a top-level key with a partial object (shallow merge). */
  set(patch, opts = {}) {
    const prev = this.state;
    const next = { ...prev, ...patch };
    this.state = next;
    if (!opts.silent) {
      if (!opts.skipHistory) this._pushHistory(prev);
      this.emit('change', { prev, next });
      // emit on each key for granular subscribers
      for (const k of Object.keys(patch)) this.emit(k, next[k]);
      this._persist();
    }
  }

  /** Update state at a nested path. */
  update(path, updater) {
    const segs = path.split('.');
    const next = deepClone(this.state);
    let cur = next;
    for (let i = 0; i < segs.length - 1; i++) cur = cur[segs[i]];
    cur[segs[segs.length - 1]] = updater(cur[segs[segs.length - 1]]);
    this.state = next;
    this.emit('change', { prev: null, next });
    this.emit(path, cur[segs[segs.length - 1]]);
    this._persist();
  }

  /** Toggle a single pattern cell. Returns the new value. */
  toggleCell(trackId, step) {
    const cur = this.state.pattern[trackId][step];
    const next = !cur;
    const newPattern = {
      ...this.state.pattern,
      [trackId]: this.state.pattern[trackId].map((v, i) => (i === step ? next : v)),
    };
    this.set({ pattern: newPattern });
    return next;
  }

  /** Set a single cell. */
  setCell(trackId, step, value) {
    if (this.state.pattern[trackId][step] === value) return;
    const newPattern = {
      ...this.state.pattern,
      [trackId]: this.state.pattern[trackId].map((v, i) => (i === step ? !!value : v)),
    };
    this.set({ pattern: newPattern });
  }

  /** Clear the entire pattern. */
  clearPattern() {
    this.set({ pattern: emptyPattern() });
  }

  /** Load a preset into the current pattern. */
  loadPreset(presetId) {
    const preset = PRESETS_BY_ID[presetId];
    if (!preset) return false;
    const newPattern = emptyPattern();
    preset.pattern.forEach((row, i) => {
      const id = TRACK_IDS[i];
      if (!id) return;
      newPattern[id] = row.slice(0, 16);
    });
    this.set({
      pattern: newPattern,
      bpm: preset.bpm,
      swing: preset.swing ?? 0,
      selectedPresetId: presetId,
    });
    return true;
  }

  /** Copy current pattern into slot (A/B/C/D). */
  copyToSlot(slot) {
    this.set({
      patternSlots: { ...this.state.patternSlots, [slot]: deepClone(this.state.pattern) },
      currentPatternSlot: slot,
    });
  }

  /** Load from slot into current pattern. */
  loadFromSlot(slot) {
    const p = this.state.patternSlots[slot];
    if (!p) return;
    this.set({ pattern: deepClone(p), currentPatternSlot: slot });
  }

  /** Save the current session into a named slot. */
  saveToNamedSlot(name) {
    const id = name.toLowerCase().replace(/\s+/g, '-');
    this.set({
      saveSlots: {
        ...this.state.saveSlots,
        [id]: {
          name,
          bpm: this.state.bpm,
          swing: this.state.swing,
          pattern: deepClone(this.state.pattern),
          masterFx: deepClone(this.state.masterFx),
          tracks: deepClone(this.state.tracks),
        },
      },
    });
    return id;
  }

  /** Load from named slot. */
  loadFromNamedSlot(id) {
    const slot = this.state.saveSlots[id];
    if (!slot) return false;
    this.set({
      pattern: deepClone(slot.pattern),
      bpm: slot.bpm,
      swing: slot.swing,
      masterFx: deepClone(slot.masterFx),
      tracks: deepClone(slot.tracks),
    });
    return true;
  }

  /** Delete a named slot. */
  deleteNamedSlot(id) {
    const slots = { ...this.state.saveSlots };
    delete slots[id];
    this.set({ saveSlots: slots });
  }

  /** Undo last pattern-changing action. */
  undo() {
    const past = this.state.history.past;
    if (past.length === 0) return false;
    const prev = past[past.length - 1];
    const newHistory = { past: past.slice(0, -1), future: [this.state.pattern, ...this.state.history.future].slice(0, 50) };
    this.set({ pattern: prev, history: newHistory }, { skipHistory: true });
    return true;
  }

  /** Redo. */
  redo() {
    const future = this.state.history.future;
    if (future.length === 0) return false;
    const next = future[0];
    const newHistory = { past: [...this.state.history.past, this.state.pattern].slice(-50), future: future.slice(1) };
    this.set({ pattern: next, history: newHistory }, { skipHistory: true });
    return true;
  }

  _pushHistory(prev) {
    if (!prev) return;
    if (JSON.stringify(prev.pattern) === JSON.stringify(this.state.pattern)) return;
    const past = [...this.state.history.past, prev.pattern].slice(-50);
    this.state.history = { past, future: [] };
  }

  /** Apply a theme by id. */
  setTheme(id) {
    const theme = THEMES.find((t) => t.id === id);
    if (!theme) return;
    const root = document.documentElement;
    Object.entries(theme.tokens).forEach(([k, v]) => root.style.setProperty(k, v));
    this.set({ theme: id });
  }

  /** Set visualizer mode. */
  setVisualizerMode(mode) {
    this.set({ visualizerMode: mode });
  }

  /** Set current tab. */
  setTab(tab) {
    this.set({ currentTab: tab });
  }

  /** Set master FX value. */
  setMasterFx(key, value) {
    this.set({ masterFx: { ...this.state.masterFx, [key]: value } });
  }

  /** Update track settings (gain / pan / eq / filter / saturation / mute / solo). */
  setTrack(trackId, patch) {
    const idx = this.state.tracks.findIndex((t) => t.id === trackId);
    if (idx < 0) return;
    const tracks = [...this.state.tracks];
    tracks[idx] = { ...tracks[idx], ...patch };
    this.set({ tracks }, { skipHistory: true });
  }
}

export const store = new Store();
window.NebulaStore = store;