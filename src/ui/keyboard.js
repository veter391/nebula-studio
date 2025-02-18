/**
 * Virtual MIDI keyboard + chord pad.
 *
 * Click any key to trigger the active voice. Use computer keys
 * `z x c v b n m , . /` to play notes while focused on the keyboard.
 *
 * @module ui/keyboard
 */

import { store } from '../store.js';
import { engine } from '../core/engine.js';
import { midiToFreq, midiToName, CHORD_TYPES } from '../utils.js';

'use strict';

const KEY_MAP = {
  z: 0, s: 1, x: 2, d: 3, c: 4, v: 5, g: 6, b: 7, h: 8, n: 9, j: 10, m: 11,
  ',': 12, l: 13, '.': 14, ';': 15, '/': 16,
};

export function mountKeyboard(host) {
  host.innerHTML = `
    <header class="card__head">
      <h2>VIRTUAL KEYBOARD</h2>
      <span class="card__hint">click keys · use computer keys z / x / c / v / b / n / m / , / . / /</span>
    </header>

    <div class="kb__controls">
      <label>VOICE</label>
      <select id="kbVoice">
        <option value="lead">Lead</option>
        <option value="pluck">Pluck</option>
        <option value="pad">Pad</option>
        <option value="bass">Bass</option>
        <option value="sub">Sub</option>
      </select>
      <label>OCTAVE</label>
      <button class="kb__oct" data-oct="-">−</button>
      <span id="kbOctave">4</span>
      <button class="kb__oct" data-oct="+">+</button>
    </div>

    <div class="kb__keys" id="kbKeys"></div>

    <div class="kb__chords">
      <h3>CHORDS</h3>
      <div class="chord-row">
        ${['C', 'D', 'E', 'F', 'G', 'A', 'B'].map((r) => `
          <div class="chord-col">
            <span class="chord-root">${r}</span>
            <button class="chord-btn" data-root="${r}" data-type="major">maj</button>
            <button class="chord-btn" data-root="${r}" data-type="minor">min</button>
            <button class="chord-btn" data-root="${r}" data-type="7">7</button>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  let octave = store.get().keyboard.octave || 4;
  let voice = store.get().keyboard.voice || 'lead';

  const octEl = host.querySelector('#kbOctave');
  const voiceEl = host.querySelector('#kbVoice');
  const keysEl = host.querySelector('#kbKeys');

  function renderKeys() {
    keysEl.innerHTML = '';
    // 2 octaves: C(oct) to C(oct+2)
    const startMidi = 12 * (octave + 1); // C of octave
    const endMidi = startMidi + 24;
    // White keys first
    const whites = [];
    for (let m = startMidi; m < endMidi; m++) {
      if (!isBlack(m)) whites.push(m);
    }
    // layout
    const whiteWidth = 100 / whites.length;
    whites.forEach((m, idx) => {
      const k = document.createElement('button');
      k.className = 'kb-key kb-key--white';
      k.dataset.midi = m;
      k.style.width = `calc(${whiteWidth}% - 4px)`;
      k.style.left = `calc(${idx * whiteWidth}% + 2px)`;
      k.innerHTML = `<span class="kb-key__label">${midiToName(m)}</span>`;
      k.addEventListener('mousedown', () => trigger(m));
      keysEl.appendChild(k);
    });
    // Black keys on top
    for (let m = startMidi; m < endMidi; m++) {
      if (!isBlack(m)) continue;
      const idx = whites.findIndex((wm) => wm > m) - 1;
      if (idx < 0) continue;
      const k = document.createElement('button');
      k.className = 'kb-key kb-key--black';
      k.dataset.midi = m;
      k.style.width = `calc(${whiteWidth * 0.6}% - 4px)`;
      k.style.left = `calc(${idx * whiteWidth + whiteWidth * 0.7}% + 2px)`;
      k.innerHTML = `<span class="kb-key__label">${midiToName(m)}</span>`;
      k.addEventListener('mousedown', () => trigger(m));
      keysEl.appendChild(k);
    }
  }

  function isBlack(m) {
    const n = m % 12;
    return n === 1 || n === 3 || n === 6 || n === 8 || n === 10;
  }

  function trigger(midi) {
    if (!engine.initialized) return;
    engine.previewNote(voice, midi);
    flash(midi);
  }

  function flash(midi) {
    const key = keysEl.querySelector(`[data-midi="${midi}"]`);
    if (key) {
      key.classList.add('is-pressed');
      setTimeout(() => key.classList.remove('is-pressed'), 180);
    }
  }

  // octave / voice controls
  host.querySelectorAll('[data-oct]').forEach((b) =>
    b.addEventListener('click', () => {
      const sign = b.dataset.oct === '+' ? 1 : -1;
      octave = Math.max(1, Math.min(7, octave + sign));
      octEl.textContent = octave;
      store.set({ keyboard: { ...store.get().keyboard, octave } });
      renderKeys();
    })
  );
  voiceEl.addEventListener('change', () => {
    voice = voiceEl.value;
    store.set({ keyboard: { ...store.get().keyboard, voice } });
  });

  // chord pad
  const NOTE_OFFSETS = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  host.querySelectorAll('.chord-btn').forEach((b) => {
    b.addEventListener('click', () => {
      const root = NOTE_OFFSETS[b.dataset.root];
      const type = b.dataset.type;
      const intervals = CHORD_TYPES[type];
      const baseMidi = 12 * (octave + 1) + root;
      intervals.forEach((iv) => trigger(baseMidi + iv));
    });
  });

  // computer-key support
  const keyDown = new Set();
  document.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
    const k = e.key.toLowerCase();
    if (k in KEY_MAP) {
      e.preventDefault();
      const midi = 12 * (octave + 1) + KEY_MAP[k];
      trigger(midi);
      keyDown.add(k);
    }
  });
  document.addEventListener('keyup', (e) => {
    const k = e.key.toLowerCase();
    keyDown.delete(k);
  });

  octEl.textContent = octave;
  voiceEl.value = voice;
  renderKeys();
}