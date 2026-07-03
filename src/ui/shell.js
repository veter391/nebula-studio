/**
 * Shell — top bar, transport, BPM/swing, theme switcher, tab nav, toast.
 *
 * @module ui/shell
 */

import { store } from '../store.js';
import { engine } from '../core/engine.js';
import { THEMES } from '../data/themes.js';
import { downloadBlob } from '../utils.js';

/** Mount all shell components. Returns cleanup function. */
export function mountShell(host, hooks = {}) {
  host.innerHTML = `
    <header class="topbar">
      <div class="brand">
        <div class="brand__mark" aria-hidden="true"><span></span><span></span><span></span></div>
        <div class="brand__text">
          <h1>NEBULA <em>STUDIO</em></h1>
          <p>v2.9 · Web Audio · 0 deps</p>
        </div>
      </div>

      <div class="transport">
        <button class="t-btn t-btn--play" id="playBtn" title="Play / Pause (Space)" aria-label="Play">
          <svg viewBox="0 0 24 24" class="ico ico--play"><path d="M8 5v14l11-7z"/></svg>
          <svg viewBox="0 0 24 24" class="ico ico--pause"><path d="M6 5h4v14H6zm8 0h4v14h-4z"/></svg>
          <span class="t-btn__label">PLAY</span>
        </button>
        <button class="t-btn" id="stopBtn" title="Stop">
          <svg viewBox="0 0 24 24" class="ico"><rect x="6" y="6" width="12" height="12" rx="1"/></svg>
          <span class="t-btn__label">STOP</span>
        </button>
        <button class="t-btn" id="recBtn" title="Record (R)">
          <span class="rec-dot"></span>
          <span class="t-btn__label">REC</span>
        </button>
        <button class="t-btn" id="exportWavBtn" title="Export WAV (E)">
          <svg viewBox="0 0 24 24" class="ico"><path d="M5 20h14v-2H5v2zm7-18l-5 5h3v6h4v-6h3l-5-5z"/></svg>
          <span class="t-btn__label">WAV</span>
        </button>
        <button class="t-btn" id="exportMidiBtn" title="Export MIDI (M)">
          <svg viewBox="0 0 24 24" class="ico"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>
          <span class="t-btn__label">MIDI</span>
        </button>
        <button class="t-btn" id="undoBtn" title="Undo (⌘Z)">
          <svg viewBox="0 0 24 24" class="ico"><path d="M12 5V2L7 6l5 4V7c3.3 0 6 2.7 6 6s-2.7 6-6 6-6-2.7-6-6H4c0 4.4 3.6 8 8 8s8-3.6 8-8-3.6-8-8-8z"/></svg>
          <span class="t-btn__label">UNDO</span>
        </button>
        <button class="t-btn" id="redoBtn" title="Redo (⌘⇧Z)">
          <svg viewBox="0 0 24 24" class="ico"><path d="M12 5V2l5 4-5 4V7c-3.3 0-6 2.7-6 6s2.7 6 6 6 6-2.7 6-6h2c0 4.4-3.6 8-8 8s-8-3.6-8-8 3.6-8 8-8z"/></svg>
          <span class="t-btn__label">REDO</span>
        </button>
        <button class="t-btn" id="clearBtn" title="Clear pattern">
          <svg viewBox="0 0 24 24" class="ico"><path d="M6 7h12v13a2 2 0 01-2 2H8a2 2 0 01-2-2V7zm3-4h6l1 2h4v2H4V5h4l1-2z"/></svg>
          <span class="t-btn__label">CLEAR</span>
        </button>
      </div>

      <div class="meta">
        <div class="meta__bpm">
          <label for="bpm">BPM</label>
          <div class="bpm">
            <button class="bpm__btn" data-bpm-delta="-5" aria-label="Decrease BPM by 5">−</button>
            <input type="number" id="bpm" min="60" max="200" aria-label="BPM (beats per minute)" />
            <button class="bpm__btn" data-bpm-delta="5" aria-label="Increase BPM by 5">+</button>
          </div>
        </div>
        <div class="meta__swing">
          <label for="swing">SWING <span id="swingVal">0%</span></label>
          <input type="range" id="swing" min="0" max="60" aria-label="Swing amount" />
        </div>
      </div>
    </header>

    <nav class="tabs" id="tabs">
      <button class="tab is-active" data-tab="pattern">
        <svg viewBox="0 0 24 24"><path d="M3 3h7v7H3zm0 11h7v7H3zm11-11h7v7h-7zm0 11h7v7h-7z"/></svg>
        Pattern
      </button>
      <button class="tab" data-tab="song">
        <svg viewBox="0 0 24 24"><path d="M3 12h2l3-9 4 18 3-9h6"/></svg>
        Song
      </button>
      <button class="tab" data-tab="keyboard">
        <svg viewBox="0 0 24 24"><path d="M3 6h18v12H3zm2 2v8h2v-2h2v2h2v-8h2v2h2v-2h2v8h2v-2h2v2h2V8z"/></svg>
        Keyboard
      </button>
      <button class="tab" data-tab="learn">
        <svg viewBox="0 0 24 24"><path d="M12 3L1 9l11 6 9-4.9V17h2V9z M5 13.2v4L12 21l7-3.8v-4L12 17z"/></svg>
        Learn
      </button>
    </nav>
  `;

  // ---------- Theme switcher ----------
  const themeHost = document.createElement('div');
  themeHost.className = 'theme-switch';
  themeHost.innerHTML = THEMES.map(
    (t) =>
      `<button class="theme-pill" data-theme="${t.id}" title="${t.description}">${t.name}</button>`
  ).join('');
  host.querySelector('.brand').after(themeHost);
  themeHost.querySelectorAll('.theme-pill').forEach((p) => {
    p.addEventListener('click', () => store.setTheme(p.dataset.theme));
  });
  store.on('theme', (id) => {
    themeHost.querySelectorAll('.theme-pill').forEach((x) =>
      x.classList.toggle('is-active', x.dataset.theme === id)
    );
  });
  store.setTheme(store.get().theme);

  // ---------- Transport ----------
  const playBtn = host.querySelector('#playBtn');
  const stopBtn = host.querySelector('#stopBtn');
  const recBtn = host.querySelector('#recBtn');
  const exportWavBtn = host.querySelector('#exportWavBtn');
  const exportMidiBtn = host.querySelector('#exportMidiBtn');
  const undoBtn = host.querySelector('#undoBtn');
  const redoBtn = host.querySelector('#redoBtn');
  const clearBtn = host.querySelector('#clearBtn');
  const bpmInput = host.querySelector('#bpm');
  const swingInput = host.querySelector('#swing');
  const swingVal = host.querySelector('#swingVal');

  bpmInput.value = store.get().bpm;
  swingInput.value = Math.round(store.get().swing * 100);
  swingVal.textContent = swingInput.value + '%';
  swingInput.style.setProperty('--val', swingInput.value + '%');

  playBtn.addEventListener('click', () => {
    if (engine.scheduler?.running) {
      engine.stop();
    } else {
      engine.play();
    }
  });
  stopBtn.addEventListener('click', () => engine.stop());
  clearBtn.addEventListener('click', () => {
    if (engine.scheduler?.running) engine.stop();
    store.clearPattern();
    showToast('Pattern cleared');
  });

  recBtn.addEventListener('click', async () => {
    if (engine.recorder?.isRecording) {
      const blob = await engine.stopRecording();
      recBtn.classList.remove('is-recording');
      if (blob) {
        downloadBlob(blob, `nebula-live-${Date.now()}.webm`);
        showToast('Live recording saved');
      }
    } else {
      engine.startRecording();
      recBtn.classList.add('is-recording');
      showToast('Recording live output');
    }
  });
  exportWavBtn.addEventListener('click', async () => {
    exportWavBtn.disabled = true;
    showToast('Rendering WAV…');
    try {
      const blob = await engine.exportWAV(store.get(), { bars: 4 });
      downloadBlob(blob, `nebula-${Date.now()}.wav`);
      showToast('WAV exported · 4 bars');
    } catch (e) {
      console.error(e);
      showToast('Export failed', 'error');
    } finally {
      exportWavBtn.disabled = false;
    }
  });
  exportMidiBtn.addEventListener('click', () => {
    try {
      const blob = engine.exportMIDI(store.get(), { bars: 4 });
      downloadBlob(blob, `nebula-${Date.now()}.mid`);
      showToast('MIDI exported · 4 bars');
    } catch (e) {
      console.error(e);
      showToast('MIDI export failed', 'error');
    }
  });
  undoBtn.addEventListener('click', () => {
    if (store.undo()) showToast('Undo');
  });
  redoBtn.addEventListener('click', () => {
    if (store.redo()) showToast('Redo');
  });

  // BPM / Swing
  host.querySelectorAll('[data-bpm-delta]').forEach((b) =>
    b.addEventListener('click', () => {
      const delta = +b.dataset.bpmDelta;
      const v = Math.max(60, Math.min(200, store.get().bpm + delta));
      store.set({ bpm: v });
    })
  );
  bpmInput.addEventListener('input', () => {
    const v = +bpmInput.value || 120;
    store.set({ bpm: Math.max(60, Math.min(200, v)) });
  });
  swingInput.addEventListener('input', () => {
    const v = +swingInput.value;
    store.set({ swing: v / 100 });
    swingVal.textContent = v + '%';
    swingInput.style.setProperty('--val', v + '%');
  });

  // ---------- Tabs ----------
  const tabsEl = host.querySelector('#tabs');
  tabsEl.addEventListener('click', (e) => {
    const tab = e.target.closest('[data-tab]');
    if (!tab) return;
    store.setTab(tab.dataset.tab);
  });
  store.on('currentTab', (tab) => {
    tabsEl.querySelectorAll('.tab').forEach((t) =>
      t.classList.toggle('is-active', t.dataset.tab === tab)
    );
    hooks.onTab?.(tab);
  });

  // ---------- Subscriptions ----------
  store.on('bpm', (v) => {
    bpmInput.value = v;
    engine.setBpm(v);
  });
  store.on('swing', (v) => {
    swingInput.value = Math.round(v * 100);
    swingVal.textContent = Math.round(v * 100) + '%';
    swingInput.style.setProperty('--val', Math.round(v * 100) + '%');
    engine.setSwing(v);
  });

  engine.on('play', () => {
    playBtn.classList.add('is-playing');
  });
  engine.on('stop', () => {
    playBtn.classList.remove('is-playing');
    recBtn.classList.remove('is-recording');
  });

  // initial sync
  engine.setBpm(store.get().bpm);
  engine.setSwing(store.get().swing);
}

let toastTimer = null;
let toastEl = null;
function ensureToast() {
  if (toastEl) return toastEl;
  toastEl = document.createElement('div');
  toastEl.className = 'toast';
  toastEl.setAttribute('role', 'status');
  toastEl.setAttribute('aria-live', 'polite');
  document.body.appendChild(toastEl);
  return toastEl;
}
function showToast(msg, kind) {
  const t = ensureToast();
  t.textContent = msg;
  t.classList.toggle('is-error', kind === 'error');
  t.classList.add('is-show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('is-show'), 2200);
}

export { showToast };