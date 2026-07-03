/**
 * Virtual MIDI keyboard + chord pad.
 *
 * Click-and-hold (or press-and-hold a mapped computer key) any key to
 * sustain the active voice; release to stop it. The chord pad stays a
 * one-shot preview (engine.previewNote), since chords aren't held notes.
 *
 * Computer-key input only plays notes while "Keyboard Mode" is active
 * (see the panel toggle / Escape to exit) — this keeps bare letter keys
 * from hijacking typing or other global shortcuts while the user is on
 * a different tab. Other modules can check `isKeyboardModeActive()`
 * before acting on their own letter shortcuts.
 *
 * @module ui/keyboard
 */

import { store } from '../store.js';
import { engine } from '../core/engine.js';
import { midiToName, CHORD_TYPES } from '../utils.js';

// One continuous chromatic run, not scattered across unrelated key groups:
// the bottom row (z through /) plays semitones 0-16 in a single unbroken
// sequence, alternating between the bottom letter row (white keys) and the
// row directly above it (black keys) -- the same "Z=C, S=C#, X=D..."
// convention most DAWs/web synths use for a QWERTY-as-piano layout, so it
// reads as one flowing row, not a grid of unrelated letters.
// When that single row runs out (17 semitones -- a bit over an octave),
// the SAME alternating pattern continues one row up (q through r), exactly
// mirroring the bottom row's logic rather than switching to a different
// scheme, so it still reads as "another row, same idea" rather than random.
const KEY_MAP = {
  z: 0, s: 1, x: 2, d: 3, c: 4, v: 5, g: 6, b: 7, h: 8, n: 9, j: 10, m: 11,
  ',': 12, l: 13, '.': 14, ';': 15, '/': 16,
  q: 17, 2: 18, w: 19, 3: 20, e: 21, 4: 22, r: 23,
};

const SEMITONE_TO_KEY = Object.fromEntries(Object.entries(KEY_MAP).map(([k, semitone]) => [semitone, k]));

/**
 * Which physical key plays a given semitone offset (0-23) within an octave,
 * assuming the keyboard panel is at its default octave. Used by the Learn
 * play-along mode to tell the learner exactly which key to press.
 */
export function keyForSemitone(semitone) {
  return SEMITONE_TO_KEY[semitone] ?? null;
}

let keyboardModeActive = false;
let externalModeSetter = null;
const modeChangeListeners = new Set();

/** Whether the computer-keyboard note input is currently capturing letter keys. */
export function isKeyboardModeActive() {
  return keyboardModeActive;
}

/**
 * Subscribe to Keyboard Mode on/off changes, regardless of which UI
 * triggered the change (the Keyboard tab's own toggle, Escape, or the
 * shortcut button elsewhere in the shell). Returns an unsubscribe function.
 */
export function onKeyboardModeChange(fn) {
  modeChangeListeners.add(fn);
  return () => modeChangeListeners.delete(fn);
}

/**
 * Let another module (the Learn play-along mode) turn Keyboard Mode on/off
 * programmatically — e.g. auto-enabling it when a practice session starts,
 * so the learner doesn't have to remember to flip it on themselves first.
 * No-ops if the keyboard panel hasn't mounted yet.
 */
export function setKeyboardModeExternal(active) {
  if (externalModeSetter) externalModeSetter(active);
}

export function mountKeyboard(host) {
  host.innerHTML = `
    <header class="card__head">
      <h2>VIRTUAL KEYBOARD</h2>
      <span class="card__hint">click &amp; hold keys to sustain</span>
    </header>

    <div class="kb__controls">
      <button class="kb__mode-toggle" id="kbModeToggle" type="button" aria-pressed="false">
        ENABLE KEYBOARD MODE
      </button>
      <span class="kb__mode-status" id="kbModeStatus" hidden>
        <span class="kb__mode-dot"></span> KEYBOARD MODE ON — letters play notes · Esc to exit
      </span>
    </div>

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
  const modeToggleEl = host.querySelector('#kbModeToggle');
  const modeStatusEl = host.querySelector('#kbModeStatus');

  // midi -> active note handle, for both mouse and computer-key sustain
  const activeNotes = new Map();
  // computer key -> midi, so keyup releases exactly the note that keydown started
  const keyDown = new Map();

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
      k.innerHTML = renderKeyLabel(m, startMidi);
      bindKeyPointerEvents(k, m);
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
      k.innerHTML = renderKeyLabel(m, startMidi);
      bindKeyPointerEvents(k, m);
      keysEl.appendChild(k);
    }
  }

  // The physical key you actually need to press is the primary, glanceable
  // information (big, centered); the note name is secondary reference info
  // (small, tucked in a corner) -- the reverse of the old layout, which
  // only ever showed the note name and made you hunt for the right key.
  function renderKeyLabel(midi, startMidi) {
    const semitone = midi - startMidi;
    const key = semitone >= 0 && semitone <= 23 ? keyForSemitone(semitone) : null;
    const keyLabel = key ? key.toUpperCase() : '';
    return `
      <span class="kb-key__note">${midiToName(midi)}</span>
      <span class="kb-key__letter">${keyLabel}</span>
    `;
  }

  function bindKeyPointerEvents(el, midi) {
    el.addEventListener('mousedown', () => startNote(midi));
    el.addEventListener('mouseup', () => stopNote(midi));
    el.addEventListener('mouseleave', () => stopNote(midi));
  }

  function isBlack(m) {
    const n = m % 12;
    return n === 1 || n === 3 || n === 6 || n === 8 || n === 10;
  }

  /** One-shot preview — used by the chord pad, which isn't a held note. */
  function trigger(midi) {
    if (!engine.initialized) return;
    engine.previewNote(voice, midi);
    flash(midi);
  }

  /** Begin a sustained note; idempotent per-midi (re-pressing before release is a no-op). */
  function startNote(midi) {
    if (!engine.initialized) return;
    if (activeNotes.has(midi)) return;
    const handle = engine.startNote(voice, midi);
    if (!handle) {
      // voice has no sustained variant (shouldn't happen for keyboard voices) — fall back
      trigger(midi);
      return;
    }
    activeNotes.set(midi, handle);
    flash(midi, true);
  }

  /** Release a sustained note started with startNote(). Safe if already released. */
  function stopNote(midi) {
    const handle = activeNotes.get(midi);
    if (!handle) return;
    engine.stopNote(handle);
    activeNotes.delete(midi);
    unflash(midi);
  }

  function flash(midi, held = false) {
    const key = keysEl.querySelector(`[data-midi="${midi}"]`);
    if (!key) return;
    key.classList.add('is-pressed');
    if (!held) setTimeout(() => key.classList.remove('is-pressed'), 180);
  }

  function unflash(midi) {
    const key = keysEl.querySelector(`[data-midi="${midi}"]`);
    if (key) key.classList.remove('is-pressed');
  }

  /** Release every currently-held note (mouse + keyboard). Used on mode-exit / blur / voice change. */
  function releaseAllNotes() {
    activeNotes.forEach((handle, midi) => {
      engine.stopNote(handle);
      unflash(midi);
    });
    activeNotes.clear();
    keyDown.clear();
  }

  // octave / voice controls
  host.querySelectorAll('[data-oct]').forEach((b) =>
    b.addEventListener('click', () => {
      releaseAllNotes(); // held notes reference the old octave's midi numbers
      const sign = b.dataset.oct === '+' ? 1 : -1;
      octave = Math.max(1, Math.min(7, octave + sign));
      octEl.textContent = octave;
      store.set({ keyboard: { ...store.get().keyboard, octave } });
      renderKeys();
    })
  );
  voiceEl.addEventListener('change', () => {
    releaseAllNotes(); // held notes reference the old voice's sustained handle
    voice = voiceEl.value;
    store.set({ keyboard: { ...store.get().keyboard, voice } });
  });

  // chord pad — one-shot, not a held note
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

  // ---------- Keyboard Mode toggle ----------
  function setKeyboardMode(active) {
    keyboardModeActive = active;
    modeToggleEl.textContent = active ? 'EXIT KEYBOARD MODE (Esc)' : 'ENABLE KEYBOARD MODE';
    modeToggleEl.setAttribute('aria-pressed', String(active));
    modeToggleEl.classList.toggle('is-active', active);
    modeStatusEl.hidden = !active;
    host.classList.toggle('kb--mode-active', active);
    if (!active) releaseAllNotes();
    modeChangeListeners.forEach((fn) => fn(active));
  }

  modeToggleEl.addEventListener('click', () => setKeyboardMode(!keyboardModeActive));
  externalModeSetter = setKeyboardMode;

  // computer-key support — only acts while keyboard mode is active
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && keyboardModeActive) {
      setKeyboardMode(false);
      return;
    }
    if (!keyboardModeActive) return;
    if (e.repeat) return;
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
    const k = e.key.toLowerCase();
    if (k in KEY_MAP) {
      e.preventDefault();
      const midi = 12 * (octave + 1) + KEY_MAP[k];
      startNote(midi);
      keyDown.set(k, midi);
    }
  });
  document.addEventListener('keyup', (e) => {
    if (!keyboardModeActive) return;
    const k = e.key.toLowerCase();
    const midi = keyDown.get(k);
    if (midi === undefined) return;
    stopNote(midi);
    keyDown.delete(k);
  });
  // if the window loses focus while keys are held, don't leave notes stuck sustaining
  window.addEventListener('blur', () => releaseAllNotes());

  octEl.textContent = octave;
  voiceEl.value = voice;
  renderKeys();
}
