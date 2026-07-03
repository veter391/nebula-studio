/**
 * Preset browser — lists all built-in presets with genre grouping,
 * AI generation panel, and named save slots.
 *
 * @module ui/presets
 */

import { store } from '../store.js';
import { showToast } from './shell.js';
import { PRESETS_BY_GENRE } from '../data/presets.js';
import { AI } from '../ai.js';
import { suggestFromPrompt } from '../ai-assistant.js';
import {
  getStoredKey,
  setStoredKey,
  getPreferredModel,
  setPreferredModel,
  getMode,
  getFreeModelChain,
  FREE_MODEL_CHAIN,
} from '../core/openrouter-client.js';

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
        <button id="aiAssistantKey" class="ai-assistant__key" title="AI settings — shared free tier or your own OpenRouter key">
          ${getMode() === 'byok' ? 'MY KEY' : 'SHARED · FREE'}
        </button>
      </div>
      <p class="ai-assistant__hint">Describe a vibe — a real model picks the genre and seed, the deterministic engine builds the beat. Works out of the box (shared, fair-use limited); add your own key in settings for higher limits and privacy.</p>
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

const MODEL_LABELS = {
  'nvidia/nemotron-3-ultra-550b-a55b:free': 'Nemotron 3 Ultra (550B, biggest)',
  'nousresearch/hermes-3-llama-3.1-405b:free': 'Hermes 3 Llama 405B',
  'openai/gpt-oss-120b:free': 'GPT-OSS 120B',
  'nvidia/nemotron-3-super-120b-a12b:free': 'Nemotron 3 Super 120B',
  'qwen/qwen3-next-80b-a3b-instruct:free': 'Qwen3 Next 80B',
  'meta-llama/llama-3.3-70b-instruct:free': 'Llama 3.3 70B',
  'nvidia/nemotron-nano-9b-v2:free': 'Nemotron Nano 9B (fast/reliable)',
  'liquid/lfm-2.5-1.2b-instruct:free': 'LFM 2.5 1.2B (fastest fallback)',
};

function renderModelOptions(models, selected) {
  return (
    `<option value="">Auto (biggest available first)</option>` +
    models
      .map((m) => `<option value="${m}" ${m === selected ? 'selected' : ''}>${MODEL_LABELS[m] || m}</option>`)
      .join('')
  );
}

function openAISettingsModal(keyBtn) {
  const existing = document.getElementById('ai-settings-modal');
  if (existing) existing.remove();

  const currentKey = getStoredKey();
  const currentModel = getPreferredModel();

  // Self-contained inline styles — this modal has no stylesheet of its own
  // in styles.css (Nebula otherwise uses native prompt()/confirm() for
  // simple inputs), and this needs two fields so a native prompt() won't do.
  const modal = document.createElement('div');
  modal.id = 'ai-settings-modal';
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-labelledby', 'aiModalTitle');
  modal.style.cssText =
    'position:fixed; inset:0; z-index:200; display:flex; align-items:center; justify-content:center; background:rgba(0,0,0,0.6); padding:16px;';
  modal.innerHTML = `
    <div style="width:100%; max-width:440px; max-height:90vh; overflow-y:auto; background:var(--bg-1); border:1px solid var(--line-strong); border-radius:var(--radius-md); padding:20px;">
      <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:12px; margin-bottom:12px;">
        <h3 id="aiModalTitle" style="margin:0; font-size:15px; color:var(--text);">AI Assistant settings</h3>
        <button id="aiModalClose" aria-label="Close" style="font-size:16px; color:var(--text-mute); padding:2px 6px;">✕</button>
      </div>
      <p style="font-size:12.5px; color:var(--text-dim); line-height:1.6; margin:0 0 14px;">
        By default the AI Assistant runs on a shared key hosted server-side (a fair-use limit
        applies: a few requests per minute per visitor). Paste your own OpenRouter key below for
        higher limits, request privacy, and to pick a specific model. Your key is stored only in
        this browser's <code>localStorage</code> and sent only to <code>openrouter.ai</code> directly
        — never to us. Get a free key at
        <a href="https://openrouter.ai/settings/keys" target="_blank" rel="noreferrer" style="color:var(--accent);">openrouter.ai/settings/keys</a>.
      </p>
      <label style="display:block; font-size:11px; color:var(--text-mute); margin-bottom:4px;">OpenRouter API key (optional)</label>
      <input type="password" id="aiKeyInput" placeholder="sk-or-v1-…" autocomplete="off"
        value="${currentKey ? '••••••••••••••••••••••••' : ''}"
        style="width:100%; box-sizing:border-box; padding:9px 12px; margin-bottom:12px; background:color-mix(in srgb, var(--text) 4%, transparent); border:1px solid var(--line); border-radius:var(--radius-sm); color:var(--text); font-family:var(--font-mono); font-size:12px;" />
      <label style="display:block; font-size:11px; color:var(--text-mute); margin-bottom:4px;">
        Preferred model (only used with your own key)
        <span id="aiModelListStatus" style="color:var(--text-mute); font-weight:400;"></span>
      </label>
      <select id="aiModelSelect"
        style="width:100%; box-sizing:border-box; padding:9px 12px; margin-bottom:16px; background:color-mix(in srgb, var(--text) 4%, transparent); border:1px solid var(--line); border-radius:var(--radius-sm); color:var(--text); font-family:var(--font-mono); font-size:12px;">
        ${renderModelOptions(FREE_MODEL_CHAIN, currentModel)}
      </select>
      <div style="display:flex; gap:8px; justify-content:flex-end;">
        <button id="aiKeyClear" class="ai-btn" style="background:color-mix(in srgb, var(--text) 8%, transparent);">Use shared</button>
        <button id="aiKeySave" class="ai-btn">Save</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  // The select above renders instantly with the hardcoded fallback list so
  // the modal never looks empty/broken while loading — then swaps in the
  // live-ranked catalog once it resolves (same source of truth the "Auto"
  // path actually uses), preserving whatever the operator already picked.
  const statusEl = modal.querySelector('#aiModelListStatus');
  const selectEl = modal.querySelector('#aiModelSelect');
  statusEl.textContent = '· loading live list…';
  getFreeModelChain()
    .then((models) => {
      if (!modal.isConnected) return; // modal was closed before this resolved
      const picked = selectEl.value;
      selectEl.innerHTML = renderModelOptions(models, picked);
      statusEl.textContent = '';
    })
    .catch(() => {
      if (modal.isConnected) statusEl.textContent = '· using default list';
    });

  const close = () => modal.remove();
  modal.querySelector('#aiModalClose').onclick = close;
  modal.addEventListener('click', (e) => {
    if (e.target === modal) close();
  });
  modal.querySelector('#aiKeyClear').onclick = () => {
    setStoredKey('');
    setPreferredModel('');
    keyBtn.textContent = 'SHARED · FREE';
    showToast('Switched to shared AI');
    close();
  };
  modal.querySelector('#aiKeySave').onclick = () => {
    const input = modal.querySelector('#aiKeyInput');
    const value = input.value.trim();
    if (value && !value.startsWith('••')) {
      setStoredKey(value);
    }
    setPreferredModel(modal.querySelector('#aiModelSelect').value);
    keyBtn.textContent = getMode() === 'byok' ? 'MY KEY' : 'SHARED · FREE';
    showToast(getMode() === 'byok' ? 'Using your own OpenRouter key' : 'Switched to shared AI');
    close();
  };
}

function wireAIAssistant(host) {
  const keyBtn = host.querySelector('#aiAssistantKey');
  const input = host.querySelector('#aiAssistantPrompt');
  const goBtn = host.querySelector('#aiAssistantGo');
  const status = host.querySelector('#aiAssistantStatus');
  // The genre <select> lives in the presets bar; grab it here so the
  // AI-failure fallback below can roll a pattern in the selected genre.
  // (Previously referenced an out-of-scope `sel`, which threw
  // "sel is not defined" the moment the AI call failed.)
  const genreSel = host.querySelector('#aiGenre');

  keyBtn.addEventListener('click', () => openAISettingsModal(keyBtn));

  const run = async () => {
    const promptText = input.value.trim();
    if (!promptText) {
      input.focus();
      return;
    }
    goBtn.disabled = true;
    goBtn.textContent = 'THINKING…';
    status.hidden = false;
    status.className = 'ai-assistant__status';
    status.textContent = getMode() === 'byok' ? 'Calling OpenRouter…' : 'Calling shared AI…';

    const result = await suggestFromPrompt(promptText);

    goBtn.disabled = false;
    goBtn.textContent = 'GENERATE';

    if (!result.ok) {
      if (result.isConfigError) {
        // A bad/rejected key needs the operator's attention — auto-rolling
        // here would hide the real problem, so surface it plainly instead.
        status.className = 'ai-assistant__status ai-assistant__status--warn';
        status.textContent = `OpenRouter rejected your key (${result.error}) — check settings via the ✨ button.`;
        return;
      }
      // Transient failure (shared-mode rate limit, timeout, malformed response from a
      // free model) — the assistant must never leave the app stuck. Fall
      // back to the same deterministic roll the 🎲 button uses, clearly
      // labeled as a fallback rather than pretending the AI call succeeded.
      const genre = genreSel?.value || 'house';
      const seed = Date.now() + Math.floor(Math.random() * 1e9);
      const gen = AI.generatePattern(genre, seed);
      store.set({ pattern: gen.pattern, bpm: gen.bpm, swing: gen.swing });
      status.className = 'ai-assistant__status ai-assistant__status--warn';
      // The shared free key has a per-day cap shared by everyone; when it's
      // hit, point the user at their own key (which bypasses it) rather than
      // showing a raw upstream error.
      const quotaHit = /rate.?limit|per-day|429|quota/i.test(result.error || '');
      status.textContent = quotaHit
        ? `Shared free AI is out of requests for now — rolled a ${AI.genreLabels[genre]} beat instead. Add your own free key via ✨ for no limits.`
        : `AI unavailable (${result.error}) — rolled a ${AI.genreLabels[genre]} pattern instead.`;
      showToast(`AI unavailable — rolled a ${AI.genreLabels[genre]} beat instead`);
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
    store.saveToNamedSlot(name);
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