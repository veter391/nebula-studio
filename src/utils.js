/**
 * Tiny utility helpers used across the app.
 * @module utils
 */

/** Clamp `n` between `min` and `max`. */
export const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

/** Linear interpolation. */
export const lerp = (a, b, t) => a + (b - a) * t;

/** Map `x` from [a,b] to [c,d]. */
export const remap = (x, a, b, c, d) => c + ((x - a) * (d - c)) / (b - a);

/** Format a number of bytes as a human-readable string. */
export const formatBytes = (n) => {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
};

/** Format milliseconds as MM:SS. */
export const formatTime = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

/** Resolve a CSS custom property from :root to its computed value. */
export const resolveVar = (varName) => {
  const probe = document.createElement('span');
  probe.style.color = `var(${varName})`;
  document.body.appendChild(probe);
  const c = getComputedStyle(probe).color;
  document.body.removeChild(probe);
  return c;
};

/** Tiny event emitter. */
export class Emitter {
  constructor() {
    this._listeners = new Map();
  }
  on(event, fn) {
    if (!this._listeners.has(event)) this._listeners.set(event, new Set());
    this._listeners.get(event).add(fn);
    return () => this.off(event, fn);
  }
  off(event, fn) {
    this._listeners.get(event)?.delete(fn);
  }
  emit(event, payload) {
    this._listeners.get(event)?.forEach((fn) => {
      try {
        fn(payload);
      } catch (e) {
        console.error('listener error', event, e);
      }
    });
  }
}

/** Debounce a function. */
export const debounce = (fn, wait) => {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
};

/** Throttle a function to once per `wait` ms (trailing edge). */
export const throttle = (fn, wait) => {
  let last = 0;
  let pending = null;
  return (...args) => {
    const now = Date.now();
    const remaining = wait - (now - last);
    if (remaining <= 0) {
      last = now;
      fn(...args);
    } else {
      clearTimeout(pending);
      pending = setTimeout(() => {
        last = Date.now();
        fn(...args);
      }, remaining);
    }
  };
};

/** Generate a unique-ish ID. */
export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

/** Deep clone JSON-safe values. */
export const deepClone = (x) => JSON.parse(JSON.stringify(x));

/** Convert a frequency in Hz to a MIDI note number. */
export const freqToMidi = (f) => 69 + 12 * Math.log2(f / 440);

/** Convert a MIDI note number to a frequency in Hz. */
export const midiToFreq = (n) => 440 * Math.pow(2, (n - 69) / 12);

/** Note name from MIDI number (e.g. 60 → "C4"). */
export const midiToName = (n) => {
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const o = Math.floor(n / 12) - 1;
  return `${names[n % 12]}${o}`;
};

/** Common chord progressions as semitone offsets from a root. */
export const CHORD_TYPES = {
  major: [0, 4, 7],
  minor: [0, 3, 7],
  '7': [0, 4, 7, 10],
  m7: [0, 3, 7, 10],
  maj7: [0, 4, 7, 11],
  sus4: [0, 5, 7],
};

/** Standard progressions in semitones from a root note. */
export const PROGRESSIONS = {
  'I-V-vi-IV': [0, 7, 9, 5],
  'vi-IV-I-V': [9, 5, 0, 7],
  'I-vi-IV-V': [0, 9, 5, 7],
  'ii-V-I': [2, 7, 0],
  'I-IV-V-I': [0, 5, 7, 0],
  'i-iv-v-i': [0, 5, 7, 0],
};

/** Trigger a browser file download for a Blob. */
export const downloadBlob = (blob, name) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 250);
};