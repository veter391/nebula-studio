/**
 * Preset browser — lists all built-in presets with genre grouping,
 * AI generation panel, and named save slots.
 *
 * @module ui/presets
 */

import { store } from '../store.js';
import { showToast } from './shell.js';
import { PRESETS, PRESETS_BY_GENRE } from '../data/presets.js';
import { AI } from '../ai.js';
import { resolveVar } from '../utils.js';

'use strict';

export function mountPresets(host) {
  host.innerHTML = `
    <header class="card__head">
      <h2>PRESETS</h2>
      <span class="card__hint">click to load · scroll for more</span>
    </header>
    <div class="presets__bar">
      <div class="presets__filter">
        <input type="text" id="presetSearch" placeholder="Search presets…" />
      </div>
      <div class="presets__ai">
        <select id="aiGenre"></select>
        <button id="aiRoll" class="ai-btn" title="Generate random beat">🎲 ROLL</button>
      </div>
    </div>
    <div class="presets__groups" id="presetGroups"></div>
    <div class="presets__slots">
      <header class="card__head">
        <h2>YOUR SAVES</h2>
        <span class="card__hint">click + to save current pattern</span>
      </header>
      <div class="slots" id="slots"></div>
    </div>
  `;

  // populate genre select
  const sel = host.querySelector('#aiGenre');
  AI.genres.forEach((g) => {
    const opt = document.createElement('option');
    opt.value = g;
    opt.textContent = AI.genreLabels[g] || g;
    sel.appendChild(opt);
  });

  // build preset groups
  const groups = host.querySelector('#presetGroups');
  for (const [genre, list] of Object.entries(PRESETS_BY_GENRE)) {
    const wrap = document.createElement('div');
    wrap.className = 'preset-group';
    wrap.innerHTML = `<h3 class="preset-group__title">${genre}</h3><div class="preset-group__grid"></div>`;
    const grid = wrap.querySelector('.preset-group__grid');
    list.forEach((p) => {
      const card = makePresetCard(p);
      grid.appendChild(card);
    });
    groups.appendChild(wrap);
  }

  // search filter
  const search = host.querySelector('#presetSearch');
  search.addEventListener('input', () => {
    const q = search.value.toLowerCase().trim();
    groups.querySelectorAll('.preset').forEach((card) => {
      const name = card.dataset.name.toLowerCase();
      card.style.display = !q || name.includes(q) ? '' : 'none';
    });
  });

  // AI roll
  host.querySelector('#aiRoll').addEventListener('click', () => {
    const genre = sel.value;
    const seed = Date.now() + Math.floor(Math.random() * 1e9);
    const gen = AI.generatePattern(genre, seed);
    // apply directly to store
    store.set({ pattern: gen.pattern, bpm: gen.bpm, swing: gen.swing });
    showToast(`AI: generated ${AI.genreLabels[genre]} pattern`);
  });

  // slots
  renderSlots(host.querySelector('#slots'));
  store.on('saveSlots', () => renderSlots(host.querySelector('#slots')));

  // mark selected preset
  store.on('selectedPresetId', (id) => {
    groups.querySelectorAll('.preset').forEach((c) => c.classList.toggle('is-active', c.dataset.id === id));
  });
  groups.querySelector(`.preset[data-id="${store.get().selectedPresetId}"]`)?.classList.add('is-active');
}

function makePresetCard(p) {
  const card = document.createElement('button');
  card.className = 'preset';
  card.dataset.id = p.id;
  card.dataset.name = p.name;
  card.style.setProperty('--accent', p.color);
  const dens = p.pattern.map((row) => row.filter(Boolean).length);
  const maxD = Math.max(...dens, 1);
  const bars = dens.map((d) => `<span style="height:${(d / maxD) * 100}%"></span>`).join('');
  card.innerHTML = `
    <div class="preset__name">${p.name}</div>
    <div class="preset__meta">${p.bpm} BPM · ${p.swing ? Math.round(p.swing * 100) + '% SWING' : 'STRAIGHT'}</div>
    <div class="preset__bars">${bars}</div>
  `;
  card.addEventListener('click', () => {
    store.loadPreset(p.id);
    showToast(`Loaded "${p.name}"`);
  });
  return card;
}

function renderSlots(host) {
  host.innerHTML = '';
  const slots = store.get().saveSlots;
  const ids = Object.keys(slots).sort();

  const addBtn = document.createElement('button');
  addBtn.className = 'slot slot--add';
  addBtn.textContent = '+ Save current';
  addBtn.addEventListener('click', () => {
    const name = prompt('Name your save:', `My beat ${ids.length + 1}`);
    if (!name) return;
    const id = store.saveToNamedSlot(name);
    showToast(`Saved "${name}"`);
  });
  host.appendChild(addBtn);

  ids.forEach((id) => {
    const slot = slots[id];
    const div = document.createElement('div');
    div.className = 'slot';
    div.innerHTML = `
      <div class="slot__head">
        <span class="slot__name">${slot.name}</span>
        <button class="slot__del" title="Delete">✕</button>
      </div>
      <div class="slot__meta">${slot.bpm} BPM · ${Math.round(slot.swing * 100)}% SWING</div>
      <div class="slot__actions">
        <button class="slot__load">Load</button>
      </div>
    `;
    div.querySelector('.slot__load').addEventListener('click', () => {
      store.loadFromNamedSlot(id);
      showToast(`Loaded "${slot.name}"`);
    });
    div.querySelector('.slot__del').addEventListener('click', () => {
      if (confirm(`Delete save "${slot.name}"?`)) {
        store.deleteNamedSlot(id);
        showToast('Deleted');
      }
    });
    host.appendChild(div);
  });
}