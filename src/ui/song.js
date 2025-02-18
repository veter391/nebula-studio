/**
 * Song mode — pattern slots (A/B/C/D) and a chain editor.
 *
 * Lets the user:
 *   - copy the current pattern into a slot
 *   - load a slot into the current pattern
 *   - build a chain of slots (e.g. A → B → A → C) for full-track playback
 *
 * @module ui/song
 */

import { store } from '../store.js';
import { showToast } from './shell.js';
import { engine } from '../core/engine.js';

'use strict';

export function mountSong(host) {
  host.innerHTML = `
    <header class="card__head">
      <h2>SONG MODE</h2>
      <span class="card__hint">4 pattern slots · chain them to build a full track</span>
    </header>

    <div class="song__slots" id="songSlots"></div>

    <div class="song__chain">
      <header class="card__head">
        <h3>CHAIN</h3>
        <span class="card__hint">click a slot below to add it · click a chip to remove</span>
      </header>
      <div class="chain__chips" id="chainChips"></div>
      <div class="chain__add">
        ${['A', 'B', 'C', 'D'].map((s) => `<button class="chain__add-btn" data-add="${s}">+ ${s}</button>`).join('')}
        <button class="chain__clear" id="chainClear">Clear</button>
      </div>
    </div>

    <div class="song__playback">
      <button class="big-btn big-btn--play" id="songPlay">▶ PLAY SONG</button>
      <button class="big-btn" id="songStop">■ STOP</button>
      <span class="song__hint" id="songHint">Click PLAY SONG to start chain playback</span>
    </div>
  `;

  const slotsEl = host.querySelector('#songSlots');
  ['A', 'B', 'C', 'D'].forEach((slot) => {
    const div = document.createElement('div');
    div.className = 'song-slot';
    div.dataset.slot = slot;
    div.innerHTML = `
      <div class="song-slot__head">
        <span class="song-slot__letter">${slot}</span>
        <span class="song-slot__count" id="count-${slot}">0 hits</span>
      </div>
      <div class="song-slot__preview" id="preview-${slot}"></div>
      <div class="song-slot__btns">
        <button data-act="copy">Save current here</button>
        <button data-act="load">Load</button>
      </div>
    `;
    div.querySelector('[data-act="copy"]').addEventListener('click', () => {
      store.copyToSlot(slot);
      showToast(`Saved pattern to slot ${slot}`);
      refresh();
    });
    div.querySelector('[data-act="load"]').addEventListener('click', () => {
      store.loadFromSlot(slot);
      showToast(`Loaded slot ${slot}`);
      refresh();
    });
    slotsEl.appendChild(div);
  });

  host.querySelectorAll('[data-add]').forEach((b) => {
    b.addEventListener('click', () => {
      const chain = [...store.get().songChain, b.dataset.add];
      store.set({ songChain: chain });
      refresh();
    });
  });
  host.querySelector('#chainClear').addEventListener('click', () => {
    store.set({ songChain: [] });
    refresh();
  });

  const chipsEl = host.querySelector('#chainChips');
  chipsEl.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-chip-idx]');
    if (!chip) return;
    const idx = +chip.dataset.chipIdx;
    const chain = [...store.get().songChain];
    chain.splice(idx, 1);
    store.set({ songChain: chain });
    refresh();
  });

  const playBtn = host.querySelector('#songPlay');
  const stopBtn = host.querySelector('#songStop');
  const hintEl = host.querySelector('#songHint');
  let songTimer = null;
  let songBar = 0;

  playBtn.addEventListener('click', () => {
    if (engine.scheduler?.running) {
      engine.stop();
      clearInterval(songTimer);
      songTimer = null;
      hintEl.textContent = 'Stopped.';
      return;
    }
    const chain = store.get().songChain;
    if (chain.length === 0) {
      showToast('Add at least one slot to the chain', 'error');
      return;
    }
    songBar = 0;
    const playNext = () => {
      const slot = chain[songBar % chain.length];
      store.loadFromSlot(slot);
      hintEl.textContent = `Playing slot ${slot} (${(songBar % chain.length) + 1}/${chain.length})`;
      songBar++;
    };
    playNext();
    engine.play();
    // one bar = 16 steps at current BPM
    const barMs = (60 / store.get().bpm) * 4 * 1000;
    songTimer = setInterval(playNext, barMs);
  });
  stopBtn.addEventListener('click', () => {
    engine.stop();
    clearInterval(songTimer);
    songTimer = null;
    hintEl.textContent = 'Stopped.';
  });

  function refresh() {
    const slots = store.get().patternSlots;
    ['A', 'B', 'C', 'D'].forEach((s) => {
      const pattern = slots[s];
      const hits = pattern ? Object.values(pattern).reduce((sum, row) => sum + row.filter(Boolean).length, 0) : 0;
      const el = host.querySelector(`#count-${s}`);
      if (el) el.textContent = `${hits} hit${hits === 1 ? '' : 's'}`;
      const preview = host.querySelector(`#preview-${s}`);
      if (preview) previewRender(preview, pattern, s);
    });
    chipsEl.innerHTML = store.get().songChain
      .map((s, i) => `<button class="chain__chip" data-chip-idx="${i}">${s}</button>`)
      .join('');
  }

  function previewRender(host, pattern, slot) {
    host.innerHTML = '';
    if (!pattern) return;
    Object.values(pattern).forEach((row) => {
      const r = document.createElement('div');
      r.className = 'preview-row';
      row.forEach((v) => {
        const c = document.createElement('span');
        c.className = 'preview-cell' + (v ? ' is-on' : '');
        r.appendChild(c);
      });
      host.appendChild(r);
    });
  }

  refresh();
  store.on('patternSlots', refresh);
  store.on('songChain', refresh);
}