/**
 * Sequencer UI — renders the 16-step grid for all tracks.
 *
 * Subscribes to `pattern` for cell states and `step` engine events for
 * the current-step highlight.
 *
 * @module ui/sequencer
 */

import { store } from '../store.js';
import { engine } from '../core/engine.js';
import { TRACKS } from '../data/tracks.js';
import { resolveVar } from '../utils.js';

'use strict';

export function mountSequencer(host) {
  host.innerHTML = '';
  host.classList.add('seq');

  TRACKS.forEach((tr, ti) => {
    const row = document.createElement('div');
    row.className = 'seq__row';
    row.dataset.track = tr.id;
    row.dataset.idx = ti;

    const color = resolveVar(tr.color);
    row.style.setProperty('--track-color', color);

    row.innerHTML = `
      <div class="seq__label">
        <span class="dot" style="background:${color}; color:${color}"></span>
        <span class="seq__name">${tr.name}</span>
        <span class="seq__num">${ti + 1}</span>
        <div class="seq__ctrl">
          <button class="seq__mini-btn" data-act="mute" title="Mute">M</button>
          <button class="seq__mini-btn" data-act="solo" title="Solo">S</button>
          <button class="seq__mini-btn" data-act="preview" title="Preview">▶</button>
        </div>
      </div>
      <div class="seq__steps"></div>
    `;

    const steps = row.querySelector('.seq__steps');
    for (let i = 0; i < 16; i++) {
      const cell = document.createElement('div');
      cell.className = 'step' + (i % 4 === 0 ? ' is-beat' : '');
      cell.dataset.step = i;
      cell.style.setProperty('--track-color', color);
      cell.addEventListener('click', (e) => {
        if (e.shiftKey) engine.trigger(tr.id);
        store.toggleCell(tr.id, i);
      });
      cell.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        engine.trigger(tr.id);
      });
      steps.appendChild(cell);
    }

    row.querySelector('[data-act="mute"]').addEventListener('click', (e) => {
      const t = store.get().tracks.find((x) => x.id === tr.id);
      store.setTrack(tr.id, { mute: !t.mute });
      engine.applyState(store.get());
      e.currentTarget.classList.toggle('is-mute', !t.mute);
    });
    row.querySelector('[data-act="solo"]').addEventListener('click', (e) => {
      const t = store.get().tracks.find((x) => x.id === tr.id);
      store.setTrack(tr.id, { solo: !t.solo });
      engine.applyState(store.get());
      e.currentTarget.classList.toggle('is-solo', !t.solo);
    });
    row.querySelector('[data-act="preview"]').addEventListener('click', () => engine.trigger(tr.id));

    host.appendChild(row);
  });

  // subscribe to pattern changes — only update the affected track to avoid full re-render
  store.on('pattern', (pattern) => {
    const rows = host.querySelectorAll('.seq__row');
    rows.forEach((row) => {
      const ti = +row.dataset.idx;
      const id = row.dataset.track;
      const cells = row.querySelectorAll('.step');
      cells.forEach((cell) => {
        const step = +cell.dataset.step;
        cell.classList.toggle('is-active', !!pattern[id][step]);
      });
    });
  });
  // initial paint
  const pattern = store.get().pattern;
  host.querySelectorAll('.seq__row').forEach((row) => {
    const id = row.dataset.track;
    row.querySelectorAll('.step').forEach((cell, i) => {
      cell.classList.toggle('is-active', !!pattern[id][i]);
    });
  });

  // subscribe to engine step events for the playhead
  engine.on('step', ({ step }) => {
    const cells = host.querySelectorAll('.step.is-current');
    cells.forEach((c) => c.classList.remove('is-current'));
    if (step < 0) return;
    host.querySelectorAll('.seq__row').forEach((row) => {
      const cell = row.querySelectorAll('.step')[step];
      if (cell) cell.classList.add('is-current');
    });
  });
}