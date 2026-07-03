/**
 * Client for the AI Assistant's model calls, in two modes:
 *
 *  - DEFAULT (shared): no setup needed. Calls this deployment's own
 *    `/api/ai` Worker endpoint, which holds a shared OpenRouter key as a
 *    Cloudflare secret (never shipped to the browser) and applies a
 *    fair-use rate limit. Good enough to just try the feature.
 *  - BYOK (bring your own key): the operator pastes their own OpenRouter
 *    key in Settings. It is stored ONLY in this browser's localStorage,
 *    used to call https://openrouter.ai directly (never touches our
 *    Worker, never sent anywhere else), and is not subject to the shared
 *    rate limit. Use this if you want your requests private from the
 *    shared pool, or want to pick a specific model.
 *
 * Nebula's audio engine has zero server dependency either way -- this
 * proxy exists purely to make the *AI Assistant* usable out of the box
 * without exposing a real credential to every visitor's browser.
 *
 * @module core/openrouter-client
 */

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODELS_URL = 'https://openrouter.ai/api/v1/models';
const PROXY_URL = '/api/ai';
const STORAGE_KEY = 'nebula:openrouter_key';
const STORAGE_MODEL_KEY = 'nebula:openrouter_model';
const CATALOG_CACHE_KEY = 'nebula:free_model_catalog_v3'; // bump when ranking changes to drop stale ordering
const CATALOG_CACHE_TTL_MS = 60 * 60 * 1000; // 1h
const REQUEST_TIMEOUT_MS = 25000;

/**
 * Absolute last-resort model list. NOT the primary source of truth for
 * "which free models to try" -- see getFreeModelChain() below, which
 * fetches OpenRouter's live catalog instead. A hardcoded model ID is a
 * real failure mode: free-tier availability changes over time,
 * independent of this codebase, and a fully static list would eventually
 * go stale and break the feature. Exported so the Settings UI has a
 * reasonable list to show before the live catalog has loaded.
 */
export const FREE_MODEL_CHAIN = [
  // Fast instruct models first (see rankFreeModels) — big reasoning models
  // are correct but slow (8-20s) for this trivial task, kept lower as a net.
  'meta-llama/llama-3.3-70b-instruct:free',
  'qwen/qwen3-next-80b-a3b-instruct:free',
  'openai/gpt-oss-120b:free',
  'nvidia/nemotron-nano-9b-v2:free',
  'nousresearch/hermes-3-llama-3.1-405b:free',
  'nvidia/nemotron-3-super-120b-a12b:free',
  'nvidia/nemotron-3-ultra-550b-a55b:free',
  'liquid/lfm-2.5-1.2b-instruct:free',
];

/**
 * Fetch and rank the live free-tier text models from OpenRouter (mirrors
 * the same logic worker.js uses server-side for the shared proxy), cached
 * in localStorage for an hour so BYOK mode doesn't hit /models on every
 * single generate click. Falls back to the last cached catalog (even if
 * stale) if the live fetch fails, and to FREE_MODEL_CHAIN only if there's
 * no cache at all yet.
 */
export async function getFreeModelChain() {
  try {
    const cached = JSON.parse(localStorage.getItem(CATALOG_CACHE_KEY) || 'null');
    if (cached && Date.now() - cached.fetchedAt < CATALOG_CACHE_TTL_MS && Array.isArray(cached.models) && cached.models.length) {
      return cached.models;
    }
  } catch {
    /* corrupt cache, ignore */
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(MODELS_URL, { signal: controller.signal });
    clearTimeout(timer);
    if (res.ok) {
      const data = await res.json();
      const ranked = rankFreeModels(data.data || []);
      if (ranked.length > 0) {
        try {
          localStorage.setItem(CATALOG_CACHE_KEY, JSON.stringify({ models: ranked, fetchedAt: Date.now() }));
        } catch {
          /* storage full/unavailable — non-fatal, just skip caching */
        }
        return ranked;
      }
    }
  } catch {
    /* network error — fall through to stale cache / hardcoded list below */
  }

  try {
    const cached = JSON.parse(localStorage.getItem(CATALOG_CACHE_KEY) || 'null');
    if (cached?.models?.length) return cached.models;
  } catch {
    /* ignore */
  }

  return FREE_MODEL_CHAIN;
}

// Curated fast instruct models first, then a size-ranked tail (reasoning
// models deprioritized) — a mid-size instruct model maps a vibe to a genre
// in ~2-4s, where a 400B+ reasoning model takes 20-30s. Same rationale and
// list as worker.js.
const PREFERRED_FAST = [
  'meta-llama/llama-3.3-70b-instruct:free',
  'qwen/qwen3-next-80b-a3b-instruct:free',
  'openai/gpt-oss-20b:free',
  'google/gemma-4-31b-it:free',
  'nvidia/nemotron-nano-9b-v2:free',
];
function rankFreeModels(models) {
  const ranked = models
    .filter((m) => m.id?.endsWith(':free'))
    .filter((m) => m.architecture?.modality === 'text->text' || m.architecture?.input_modalities?.includes('text'))
    .map((m) => ({
      id: m.id,
      reasoning: m.reasoning?.default_enabled ? 1 : 0,
      size: parseParamCount(m.name, m.description),
      ctx: m.context_length || 0,
    }))
    .sort((a, b) => a.reasoning - b.reasoning || b.size - a.size || b.ctx - a.ctx)
    .map((m) => m.id);
  const available = new Set(ranked);
  const front = PREFERRED_FAST.filter((id) => available.has(id));
  const frontSet = new Set(front);
  return [...front, ...ranked.filter((id) => !frontSet.has(id))];
}

function parseParamCount(name = '', description = '') {
  const text = `${name} ${description}`;
  const matches = [...text.matchAll(/(\d+(?:\.\d+)?)\s*B\b/gi)];
  if (matches.length === 0) return 0;
  return Math.max(...matches.map((m) => parseFloat(m[1])));
}

export function getStoredKey() {
  try {
    return localStorage.getItem(STORAGE_KEY) || null;
  } catch {
    return null;
  }
}

export function setStoredKey(key) {
  try {
    if (!key) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, key.trim());
  } catch {
    // localStorage unavailable — falls back to shared mode, roll button still works.
  }
}

/** @returns {string|null} the operator's preferred model override, if set. */
export function getPreferredModel() {
  try {
    return localStorage.getItem(STORAGE_MODEL_KEY) || null;
  } catch {
    return null;
  }
}

export function setPreferredModel(model) {
  try {
    if (!model) localStorage.removeItem(STORAGE_MODEL_KEY);
    else localStorage.setItem(STORAGE_MODEL_KEY, model);
  } catch {
    /* non-fatal */
  }
}

/** @returns {'byok'|'shared'} which mode the AI Assistant is currently in. */
export function getMode() {
  return getStoredKey() ? 'byok' : 'shared';
}

/** The AI Assistant is always usable — shared mode needs no setup. */
export function hasLiveAI() {
  return true;
}

async function callDirect(model, messages, { apiKey, signal, temperature, maxTokens }) {
  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': typeof location !== 'undefined' ? location.origin : 'https://nebula.studio',
      'X-Title': 'Nebula Studio',
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: temperature ?? 0.6,
      // Comfortable budget for reasoning models' thinking + the JSON. Do NOT
      // send reasoning:{enabled:false} — it 400s on reasoning-mandatory
      // endpoints. See the same note in worker.js.
      max_tokens: maxTokens ?? 700,
      response_format: { type: 'json_object' },
    }),
    signal,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body?.error?.message || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  const content = body?.choices?.[0]?.message?.content;
  if (!content) throw new Error('Empty completion from model');
  return content;
}

async function callProxy(messages, { signal, temperature, maxTokens }) {
  const res = await fetch(PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, temperature, maxTokens }),
    signal,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.ok) {
    const err = new Error(body?.error || `HTTP ${res.status}`);
    err.status = res.status;
    err.isRateLimited = Boolean(body?.isRateLimited);
    throw err;
  }
  return { content: body.content, model: body.model };
}

/**
 * Chat completion, BYOK-direct or shared-proxy depending on whether the
 * operator has set their own key. Returns `{ok:false}` instead of
 * throwing — callers must fall back to the deterministic generator.
 */
export async function chatText(messages, opts = {}) {
  const apiKey = getStoredKey();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    if (apiKey) {
      const chain = opts.models || (await getFreeModelChain());
      const preferred = getPreferredModel();
      const models = preferred ? [preferred, ...chain.filter((m) => m !== preferred)] : chain;
      let lastError = 'Unknown error';
      for (const model of models) {
        try {
          const content = await callDirect(model, messages, {
            apiKey,
            signal: controller.signal,
            temperature: opts.temperature,
            maxTokens: opts.maxTokens,
          });
          return { ok: true, content, model };
        } catch (e) {
          lastError = e.message;
          if (e.status === 401 || e.status === 403) {
            return { ok: false, error: `OpenRouter rejected your API key (${e.status}).`, isConfigError: true };
          }
        }
      }
      return { ok: false, error: `All models failed. Last error: ${lastError}`, isConfigError: false };
    }

    // Shared mode — one call to our own Worker, which walks its own
    // fallback chain server-side.
    const { content, model } = await callProxy(messages, {
      signal: controller.signal,
      temperature: opts.temperature,
      maxTokens: opts.maxTokens,
    });
    return { ok: true, content, model };
  } catch (e) {
    if (e.name === 'AbortError') return { ok: false, error: 'Request timed out.', isConfigError: false };
    return { ok: false, error: e.message, isConfigError: false, isRateLimited: e.isRateLimited };
  } finally {
    clearTimeout(timer);
  }
}

/** Same as chatText but parses the response as JSON. */
export async function chatJSON(messages, opts = {}) {
  const result = await chatText(messages, opts);
  if (!result.ok) return result;
  const match = result.content.trim().match(/\{[\s\S]*\}/);
  try {
    return { ...result, parsed: JSON.parse(match ? match[0] : result.content) };
  } catch {
    return { ok: false, error: `Model (${result.model}) did not return valid JSON.` };
  }
}
