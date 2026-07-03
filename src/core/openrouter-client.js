/**
 * Minimal client for OpenRouter's chat completions API.
 *
 * Nebula Studio is a static, serverless site — no backend exists. The API
 * key is supplied by the user at runtime and stored only in this browser's
 * localStorage: never hardcoded in source, never committed, never sent
 * anywhere except https://openrouter.ai directly.
 *
 * @module core/openrouter-client
 */

const API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const STORAGE_KEY = 'nebula:openrouter_key';
const REQUEST_TIMEOUT_MS = 25000;

/** Ordered fallback chain — mixes large capable models with smaller, less
 * contended ones, since free-tier capacity fluctuates hour to hour. */
export const FREE_MODEL_CHAIN = [
  'meta-llama/llama-3.3-70b-instruct:free',
  'qwen/qwen3-next-80b-a3b-instruct:free',
  'openai/gpt-oss-120b:free',
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
    // localStorage unavailable — live AI won't persist, roll button still works.
  }
}

export function hasLiveAI() {
  return Boolean(getStoredKey());
}

async function callOnce(model, messages, { apiKey, signal }) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': typeof location !== 'undefined' ? location.origin : 'https://nebula.studio',
      'X-Title': 'Nebula Studio',
    },
    body: JSON.stringify({ model, messages, temperature: 0.6, max_tokens: 300 }),
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

/**
 * Chat completion with model fallback chain. Returns `{ok:false}` instead
 * of throwing — callers must fall back to the deterministic generator.
 */
export async function chatText(messages, opts = {}) {
  const apiKey = getStoredKey();
  if (!apiKey) return { ok: false, error: 'No OpenRouter API key configured.', isConfigError: true };

  const models = opts.models || FREE_MODEL_CHAIN;
  let lastError = 'Unknown error';

  for (const model of models) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const content = await callOnce(model, messages, { apiKey, signal: controller.signal });
      clearTimeout(timer);
      return { ok: true, content, model };
    } catch (e) {
      clearTimeout(timer);
      lastError = e.name === 'AbortError' ? `${model} timed out` : e.message;
      if (e.status === 401 || e.status === 403) {
        return { ok: false, error: `OpenRouter rejected the API key (${e.status}).`, isConfigError: true };
      }
    }
  }
  return { ok: false, error: `All models failed. Last error: ${lastError}`, isConfigError: false };
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
