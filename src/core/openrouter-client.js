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
const PROXY_URL = '/api/ai';
const STORAGE_KEY = 'nebula:openrouter_key';
const STORAGE_MODEL_KEY = 'nebula:openrouter_model';
const REQUEST_TIMEOUT_MS = 25000;

/**
 * Ordered fallback chain, biggest/most-capable free models first, small
 * reliable ones at the bottom as a safety net when the big ones are
 * saturated (free-tier capacity genuinely fluctuates hour to hour --
 * verified live against the OpenRouter API while building this, not
 * guessed). Used for the direct BYOK path; the shared proxy keeps its own
 * copy server-side in worker.js since the browser never sees the request
 * that matters there.
 */
export const FREE_MODEL_CHAIN = [
  'nvidia/nemotron-3-ultra-550b-a55b:free',
  'nousresearch/hermes-3-llama-3.1-405b:free',
  'openai/gpt-oss-120b:free',
  'nvidia/nemotron-3-super-120b-a12b:free',
  'qwen/qwen3-next-80b-a3b-instruct:free',
  'meta-llama/llama-3.3-70b-instruct:free',
  'nvidia/nemotron-nano-9b-v2:free',
  'liquid/lfm-2.5-1.2b-instruct:free',
];

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
      max_tokens: maxTokens ?? 300,
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
      const models = opts.models || (getPreferredModel() ? [getPreferredModel(), ...FREE_MODEL_CHAIN] : FREE_MODEL_CHAIN);
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
