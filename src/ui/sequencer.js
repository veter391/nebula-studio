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

export function mountSequencer(host) {
  host.innerHTML = '';
  host.classList.add('seq');
  host.setAttribute('role', 'group');
  host.setAttribute('aria-label', '16-step sequencer grid — toggle steps to build a pattern for each track');

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
          <button class="seq__mini-btn" data-act="mute" title="Mute" aria-pressed="false">M</button>
          <button class="seq__mini-btn" data-act="solo" title="Solo" aria-pressed="false">S</button>
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
      cell.setAttribute('role', 'button');
      cell.setAttribute('tabindex', '0');
      cell.setAttribute('aria-pressed', 'false');
      cell.setAttribute('aria-label', `${tr.name} step ${i + 1}`);
      cell.addEventListener('click', (e) => {
        if (e.shiftKey) engine.trigger(tr.id);
        store.toggleCell(tr.id, i);
      });
      cell.addEventListener('keydown', (e) => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          store.toggleCell(tr.id, i);
        }
      });
      cell.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        engine.trigger(tr.id);
      });
      steps.appendChild(cell);
    }

    // Reflect whatever mute/solo state this track already has (e.g. loaded
    // from a preset/save slot) instead of always starting visually "off".
    const initial = store.get().tracks.find((x) => x.id === tr.id);
    const muteBtn = row.querySelector('[data-act="mute"]');
    const soloBtn = row.querySelector('[data-act="solo"]');
    muteBtn.classList.toggle('is-mute', Boolean(initial?.mute));
    muteBtn.setAttribute('aria-pressed', String(Boolean(initial?.mute)));
    soloBtn.classList.toggle('is-solo', Boolean(initial?.solo));
    soloBtn.setAttribute('aria-pressed', String(Boolean(initial?.solo)));

    muteBtn.addEventListener('click', (e) => {
      const t = store.get().tracks.find((x) => x.id === tr.id);
      store.setTrack(tr.id, { mute: !t.mute });
      engine.applyState(store.get());
      e.currentTarget.classList.toggle('is-mute', !t.mute);
      e.currentTarget.setAttribute('aria-pressed', String(!t.mute));
    });
    soloBtn.addEventListener('click', (e) => {
      const t = store.get().tracks.find((x) => x.id === tr.id);
      store.setTrack(tr.id, { solo: !t.solo });
      engine.applyState(store.get());
      e.currentTarget.classList.toggle('is-solo', !t.solo);
      e.currentTarget.setAttribute('aria-pressed', String(!t.solo));
    });
    row.querySelector('[data-act="preview"]').addEventListener('click', () => engine.trigger(tr.id));

    host.appendChild(row);
  });

  // subscribe to pattern changes — only update the affected track to avoid full re-render
  store.on('pattern', (pattern) => {
    const rows = host.querySelectorAll('.seq__row');
    rows.forEach((row) => {
      const id = row.dataset.track;
      const cells = row.querySelectorAll('.step');
      cells.forEach((cell) => {
        const step = +cell.dataset.step;
        const active = !!pattern[id][step];
        cell.classList.toggle('is-active', active);
        cell.setAttribute('aria-pressed', String(active));
      });
    });
  });
  // initial paint
  const pattern = store.get().pattern;
  host.querySelectorAll('.seq__row').forEach((row) => {
    const id = row.dataset.track;
    row.querySelectorAll('.step').forEach((cell, i) => {
      const active = !!pattern[id][i];
      cell.classList.toggle('is-active', active);
      cell.setAttribute('aria-pressed', String(active));
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