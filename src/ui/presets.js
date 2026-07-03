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
import { suggestFromPrompt } from '../ai-assistant.js';
import { getStoredKey, setStoredKey, hasLiveAI } from '../core/openrouter-client.js';

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
        <button id="aiRoll" class="ai-btn" title="Roll a random pattern for the selected genre">🎲 ROLL</button>
      </div>
    </div>
    <div class="ai-assistant">
      <div class="ai-assistant__head">
        <span class="ai-assistant__title">✨ AI Assistant</span>
        <button id="aiAssistantKey" class="ai-assistant__key" title="Set your OpenRouter API key">
          ${hasLiveAI() ? 'LIVE AI' : 'SET KEY'}
        </button>
      </div>
      <p class="ai-assistant__hint">Describe a vibe — a real model picks the genre and seed, the deterministic engine builds the beat.</p>
      <div class="ai-assistant__row">
        <input type="text" id="aiAssistantPrompt" placeholder="e.g. dark warehouse rave at 3am…" maxlength="200" />
        <button id="aiAssistantGo" class="ai-btn">GENERATE</button>
      </div>
      <div id="aiAssistantStatus" class="ai-assistant__status" hidden></div>
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

  // Procedural roll (deterministic, no network call — honestly labeled 🎲, not "AI")
  host.querySelector('#aiRoll').addEventListener('click', () => {
    const genre = sel.value;
    const seed = Date.now() + Math.floor(Math.random() * 1e9);
    const gen = AI.generatePattern(genre, seed);
    // apply directly to store
    store.set({ pattern: gen.pattern, bpm: gen.bpm, swing: gen.swing });
    showToast(`Rolled a new ${AI.genreLabels[genre]} pattern`);
  });

  // AI Assistant — genuine LLM call (bring-your-own OpenRouter key)
  wireAIAssistant(host);

  // slots
  renderSlots(host.querySelector('#slots'));
  store.on('saveSlots', () => renderSlots(host.querySelector('#slots')));

  // mark selected preset
  store.on('selectedPresetId', (id) => {
    groups.querySelectorAll('.preset').forEach((c) => c.classList.toggle('is-active', c.dataset.id === id));
  });
  groups.querySelector(`.preset[data-id="${store.get().selectedPresetId}"]`)?.classList.add('is-active');
}

function wireAIAssistant(host) {
  const keyBtn = host.querySelector('#aiAssistantKey');
  const input = host.querySelector('#aiAssistantPrompt');
  const goBtn = host.querySelector('#aiAssistantGo');
  const status = host.querySelector('#aiAssistantStatus');

  keyBtn.addEventListener('click', () => {
    const current = getStoredKey();
    const value = prompt(
      current
        ? 'OpenRouter API key (stored only in this browser, sent only to openrouter.ai). Leave blank and cancel to keep, or clear the field and submit to remove:'
        : 'Paste your OpenRouter API key to enable the AI Assistant.\nStored only in this browser\'s localStorage — never sent anywhere but openrouter.ai (this is a static site, there is no backend to leak it to).\nGet a free key: https://openrouter.ai/settings/keys',
      current ? '' : ''
    );
    if (value === null) return; // cancelled
    setStoredKey(value.trim());
    keyBtn.textContent = hasLiveAI() ? 'LIVE AI' : 'SET KEY';
    showToast(hasLiveAI() ? 'AI Assistant enabled' : 'OpenRouter key cleared');
  });

  const run = async () => {
    const promptText = input.value.trim();
    if (!hasLiveAI()) {
      status.hidden = false;
      status.textContent = 'Set an OpenRouter key first (✨ button above).';
      status.className = 'ai-assistant__status ai-assistant__status--warn';
      return;
    }
    if (!promptText) {
      input.focus();
      return;
    }
    goBtn.disabled = true;
    goBtn.textContent = 'THINKING…';
    status.hidden = false;
    status.className = 'ai-assistant__status';
    status.textContent = 'Calling OpenRouter…';

    const result = await suggestFromPrompt(promptText);

    goBtn.disabled = false;
    goBtn.textContent = 'GENERATE';

    if (!result.ok) {
      if (result.isConfigError) {
        // A bad/rejected key needs the operator's attention — auto-rolling
        // here would hide the real problem, so surface it plainly instead.
        status.className = 'ai-assistant__status ai-assistant__status--warn';
        status.textContent = `OpenRouter rejected the request (${result.error}) — check your key via the ✨ button.`;
        return;
      }
      // Transient failure (rate limit, timeout, malformed response from a
      // free model) — the assistant must never leave the app stuck. Fall
      // back to the same deterministic roll the 🎲 button uses, clearly
      // labeled as a fallback rather than pretending the AI call succeeded.
      const genre = sel.value;
      const seed = Date.now() + Math.floor(Math.random() * 1e9);
      const gen = AI.generatePattern(genre, seed);
      store.set({ pattern: gen.pattern, bpm: gen.bpm, swing: gen.swing });
      status.className = 'ai-assistant__status ai-assistant__status--warn';
      status.textContent = `AI unavailable (${result.error}) — rolled a ${AI.genreLabels[genre]} pattern instead.`;
      showToast(`AI unavailable — rolled a ${AI.genreLabels[genre]} pattern instead`);
      return;
    }

    store.set({ pattern: result.pattern, bpm: result.bpm, swing: result.swing });
    status.className = 'ai-assistant__status ai-assistant__status--ok';
    status.textContent = `${AI.genreLabels[result.genre] || result.genre} · ${result.reasoning} (${result.model})`;
    showToast(`AI Assistant: ${AI.genreLabels[result.genre] || result.genre} pattern generated`);
  };

  goBtn.addEventListener('click', run);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') run();
  });
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