/**
 * App bootstrap — wires all UI modules to the store and audio engine.
 *
 * Lifecycle:
 *   1. boot overlay asks for user gesture (required for AudioContext)
 *   2. user clicks "Enter the studio"
 *   3. engine.init() creates AudioContext and builds the graph
 *   4. shell, sequencer, mixer, visualizer, presets, master FX mount
 *   5. the store hydrates from localStorage, then we kick off the loop
 *
 * @module main
 */

import { store } from './store.js';
import { engine } from './core/engine.js';
import { mountShell, showToast } from './ui/shell.js';
import { mountSequencer } from './ui/sequencer.js';
import { mountMixer } from './ui/mixer.js';
import { mountVisualizer } from './ui/visualizer.js';
import { mountPresets } from './ui/presets.js';
import { mountSong } from './ui/song.js';
import { mountKeyboard, isKeyboardModeActive } from './ui/keyboard.js';
import { mountTutorials } from './ui/tutorials.js';
import { mountPlayAlong } from './ui/play-along.js';
import { TRACKS } from './data/tracks.js';

/* ---------- PWA: offline support ---------- */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((e) => console.warn('[sw] registration failed', e));
  });
}

/* ---------- Background starfield ---------- */
(function makeStars() {
  const host = document.getElementById('stars');
  const frag = document.createDocumentFragment();
  for (let i = 0; i < 80; i++) {
    const s = document.createElement('span');
    s.style.left = Math.random() * 100 + '%';
    s.style.top = Math.random() * 100 + '%';
    s.style.animationDelay = `${Math.random() * 3}s`;
    s.style.animationDuration = `${2 + Math.random() * 3}s`;
    const sz = Math.random() * 2 + 0.5;
    s.style.width = sz + 'px';
    s.style.height = sz + 'px';
    frag.appendChild(s);
  }
  host.appendChild(frag);
})();

/* ---------- Boot ---------- */
const boot = document.getElementById('boot');
const bootBtn = document.getElementById('bootBtn');
const app = document.getElementById('app');

bootBtn.addEventListener('click', async () => {
  bootBtn.disabled = true;
  bootBtn.querySelector('.boot__btn-text').textContent = 'Warming up…';
  try {
    await engine.init();
  } catch (e) {
    console.error(e);
    bootBtn.disabled = false;
    bootBtn.querySelector('.boot__btn-text').textContent = 'Retry';
    return;
  }

  // hydrate from localStorage before mounting UI so initial render is correct
  store.hydrate();

  // inject pattern provider so engine reads the current pattern from the store
  engine.setPatternProvider(() => store.get().pattern);

  // mount UI
  mountShell(document.getElementById('shell'), {
    onTab: (tab) => switchTab(tab),
  });
  const viz = mountVisualizer(document.getElementById('vizHost'));
  viz.attach(engine.analyser, engine.analyserL, engine.analyserR);
  viz.start();

  mountSequencer(document.getElementById('sequencerHost'));
  mountMixer(document.getElementById('mixerHost'));
  mountPresets(document.getElementById('presetsHost'));
  mountMaster(document.getElementById('masterKnobs'));
  mountSong(document.getElementById('songHost'));
  mountKeyboard(document.getElementById('keyboardHost'));
  mountTutorials(document.getElementById('learnHost'));
  mountPlayAlong(document.getElementById('playAlongHost'));

  // connect engine events to visualizer
  engine.on('trigger', (e) => viz.onTrigger(e.trackId, e.step, e.time));

  // subscribe to store → engine (apply state changes)
  store.on('change', () => engine.applyState(store.get()));
  store.on('bpm', () => engine.applyState(store.get()));
  store.on('swing', () => engine.applyState(store.get()));

  // sync keyboard shortcuts (already wired in shell but also for global)
  document.addEventListener('keydown', onGlobalKey);

  // initial state apply
  engine.applyState(store.get());

  // fade boot, show app
  boot.classList.add('hidden');
  app.hidden = false;
  app.style.opacity = '0';
  requestAnimationFrame(() => {
    app.style.transition = 'opacity 0.6s ease-out';
    app.style.opacity = '1';
  });

  // boot done
  store.set({ bootedAt: Date.now() });
  showToast('Welcome back — pick a preset or hit PLAY');

  // start level meters loop
  startMeterLoop();
});

function onGlobalKey(e) {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    if (e.shiftKey) store.redo();
    else store.undo();
    e.preventDefault();
    return;
  }
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  // While Keyboard Mode owns the letter keys for playing notes, the
  // transport/clear/export shortcuts must stay out of the way entirely —
  // only Escape (handled inside keyboard.js) and the explicit exit button
  // get you out, per the intended "no stray shortcuts" behavior.
  if (isKeyboardModeActive()) return;
  switch (e.key) {
    case ' ':
      if (!e.repeat) document.getElementById('playBtn')?.click();
      e.preventDefault();
      return;
    case 'c':
    case 'C':
      if (!e.repeat) document.getElementById('clearBtn')?.click();
      e.preventDefault();
      return;
    case 'r':
    case 'R':
      if (!e.repeat) document.getElementById('recBtn')?.click();
      e.preventDefault();
      return;
    case 'e':
    case 'E':
      if (!e.repeat) document.getElementById('exportWavBtn')?.click();
      e.preventDefault();
      return;
    case 'm':
    case 'M':
      if (!e.repeat) document.getElementById('exportMidiBtn')?.click();
      e.preventDefault();
      return;
  }
}

/* ---------- Tab switching ---------- */
function switchTab(tab) {
  document.querySelectorAll('.tab-panel').forEach((p) => {
    p.classList.toggle('is-active', p.dataset.panel === tab);
  });
}

/* ---------- Master FX knobs ---------- */
function mountMaster(host) {
  const knobs = [
    { param: 'reverb', min: 0, max: 100, val: 22, label: 'REVERB' },
    { param: 'delay', min: 0, max: 100, val: 14, label: 'DELAY' },
    { param: 'filter', min: 200, max: 12000, val: 12000, label: 'FILTER' },
    { param: 'master', min: 0, max: 100, val: 80, label: 'MASTER' },
  ];

  knobs.forEach((k) => {
    const knob = document.createElement('div');
    knob.className = 'knob';
    knob.dataset.param = k.param;
    const knobId = `knob-${k.param}`;
    knob.innerHTML = `
      <div class="knob__dial" id="${knobId}" role="slider" tabindex="0"
        aria-label="${k.label}" aria-valuemin="${k.min}" aria-valuemax="${k.max}"><div class="knob__dot"></div></div>
      <label for="${knobId}">${k.label}</label>
      <span class="knob__val">${k.val}</span>
    `;
    host.appendChild(knob);
    const dial = knob.querySelector('.knob__dial');
    const dot = knob.querySelector('.knob__dot');
    const valEl = knob.querySelector('.knob__val');
    let val = k.val;

    function update() {
      const norm = (val - k.min) / (k.max - k.min);
      const deg = norm * 270 - 135;
      dial.style.background = `radial-gradient(circle at 50% 50%, color-mix(in srgb, var(--text) 5%, transparent), color-mix(in srgb, #000 40%, transparent) 70%), conic-gradient(from 220deg, var(--accent) ${deg + 135}deg, color-mix(in srgb, var(--text) 6%, transparent) 0deg)`;
      dot.style.setProperty('--rot', deg + 'deg');
      if (k.param === 'filter') valEl.textContent = val >= 1000 ? (val / 1000).toFixed(1) + 'k' : Math.round(val);
      else valEl.textContent = Math.round(val);
      dial.setAttribute('aria-valuenow', String(Math.round(val)));
      dial.setAttribute('aria-valuetext', valEl.textContent);
      store.setMasterFx(k.param, k.param === 'master' ? val / 100 : k.param === 'filter' ? val : val / 100);
    }
    update();

    let startY = 0, startVal = val;
    function onMove(e) {
      const y = e.touches ? e.touches[0].clientY : e.clientY;
      const delta = startY - y;
      const range = k.max - k.min;
      val = Math.max(k.min, Math.min(k.max, startVal + (delta / 150) * range));
      update();
    }
    function onUp() {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
    }
    function onDown(e) {
      e.preventDefault();
      startY = e.touches ? e.touches[0].clientY : e.clientY;
      startVal = val;
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
      window.addEventListener('touchmove', onMove, { passive: false });
      window.addEventListener('touchend', onUp);
    }
    dial.addEventListener('mousedown', onDown);
    dial.addEventListener('touchstart', onDown, { passive: false });
    dial.addEventListener('dblclick', () => {
      val = k.val;
      update();
    });
    dial.addEventListener('keydown', (e) => {
      const range = k.max - k.min;
      const step = range / 100;
      if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
        val = Math.max(k.min, Math.min(k.max, val + step));
        update();
        e.preventDefault();
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
        val = Math.max(k.min, Math.min(k.max, val - step));
        update();
        e.preventDefault();
      } else if (e.key === 'Home') {
        val = k.min;
        update();
        e.preventDefault();
      } else if (e.key === 'End') {
        val = k.max;
        update();
        e.preventDefault();
      }
    });
  });
}

/* ---------- Level meters ---------- */
const meterL = document.getElementById('meterL');
const meterR = document.getElementById('meterR');
const hudStep = document.getElementById('hudStep');
const hudLevel = document.getElementById('hudLevel');
function startMeterLoop() {
  const bufL = new Uint8Array(engine.analyserL.frequencyBinCount);
  const bufR = new Uint8Array(engine.analyserR.frequencyBinCount);
  function loop() {
    engine.analyserL.getByteFrequencyData(bufL);
    engine.analyserR.getByteFrequencyData(bufR);
    let lSum = 0, rSum = 0;
    for (let i = 0; i < bufL.length; i++) lSum += bufL[i];
    for (let i = 0; i < bufR.length; i++) rSum += bufR[i];
    const lv = (lSum / bufL.length / 255) * 100;
    const rv = (rSum / bufR.length / 255) * 100;
    meterL.style.right = 100 - lv + '%';
    meterR.style.right = 100 - rv + '%';
    hudLevel.querySelector('span').textContent = Math.round(Math.max(lv, rv));
    const step = engine.scheduler?.currentStep ?? -1;
    hudStep.textContent = step >= 0 ? `${step + 1} / 16` : '— / 16';
    requestAnimationFrame(loop);
  }
  loop();
}

/* ---------- Beforeunload cleanup ---------- */
window.addEventListener('beforeunload', () => {
  if (engine.recorder?.isRecording) engine.stopRecording();
  if (engine.scheduler?.running) engine.stop();
});

/* ---------- Boot logs (only in dev) ---------- */
console.info(
  '%c🌌 Nebula Studio 2.0',
  'font: 700 16px sans-serif; color: #00f5ff;',
  '\nZero dependencies · MIT licensed · Web Audio API · ' +
    `${TRACKS.length} voices`
);