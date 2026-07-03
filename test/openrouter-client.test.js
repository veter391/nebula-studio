import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Covers the security-relevant branch: no stored key -> calls our own
 * /api/ai proxy (never touches OpenRouter directly from the browser); a
 * stored key -> calls OpenRouter directly with that key, never our proxy.
 * This is the boundary that keeps a shared secret out of the browser.
 */

function makeLocalStorage() {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  };
}

let mod;

beforeEach(async () => {
  vi.resetModules();
  vi.stubGlobal('localStorage', makeLocalStorage());
  vi.stubGlobal('fetch', vi.fn());
  mod = await import('../src/core/openrouter-client.js');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getMode / hasLiveAI', () => {
  it('defaults to shared mode with no key stored', () => {
    expect(mod.getMode()).toBe('shared');
    expect(mod.hasLiveAI()).toBe(true); // AI is always available -- shared proxy needs no setup
  });

  it('switches to byok mode once a key is stored', () => {
    mod.setStoredKey('sk-or-v1-test');
    expect(mod.getMode()).toBe('byok');
  });

  it('setStoredKey("") clears back to shared mode', () => {
    mod.setStoredKey('sk-or-v1-test');
    mod.setStoredKey('');
    expect(mod.getMode()).toBe('shared');
  });
});

describe('chatText — shared mode (no key)', () => {
  it('calls our own /api/ai proxy, never openrouter.ai directly', async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, content: '{"x":1}', model: 'proxy-model' }),
    });
    const result = await mod.chatText([{ role: 'user', content: 'hi' }]);
    expect(result.ok).toBe(true);
    expect(result.model).toBe('proxy-model');
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url] = fetch.mock.calls[0];
    expect(url).toBe('/api/ai');
  });

  it('surfaces a rate-limit failure from the proxy without retrying client-side', async () => {
    fetch.mockResolvedValue({
      ok: false,
      status: 429,
      json: async () => ({ ok: false, error: 'rate limited', isRateLimited: true }),
    });
    const result = await mod.chatText([{ role: 'user', content: 'hi' }]);
    expect(result.ok).toBe(false);
    expect(result.isRateLimited).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1); // no client-side retry storm against our own limiter
  });
});

describe('chatText — byok mode (key stored)', () => {
  // getFreeModelChain() fetches OpenRouter's live catalog and caches it in
  // localStorage — pre-seed that cache so these tests exercise the actual
  // chat-completion call count in isolation, without also asserting on the
  // (separately-tested) catalog fetch. A cache hit is itself the intended
  // behavior: real usage shouldn't re-fetch /models on every generate click.
  beforeEach(() => {
    localStorage.setItem(
      'nebula:free_model_catalog_v4',
      JSON.stringify({ models: ['test/model-a:free', 'test/model-b:free'], fetchedAt: Date.now() })
    );
  });

  it('calls openrouter.ai directly with the stored key, never our proxy', async () => {
    mod.setStoredKey('sk-or-v1-mykey');
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: '{"x":1}' } }] }),
    });
    const result = await mod.chatText([{ role: 'user', content: 'hi' }]);
    expect(result.ok).toBe(true);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(init.headers.Authorization).toBe('Bearer sk-or-v1-mykey');
  });

  it('walks the fallback chain on a retryable failure and still calls OpenRouter directly, not the proxy', async () => {
    mod.setStoredKey('sk-or-v1-mykey');
    fetch
      .mockResolvedValueOnce({ ok: false, status: 429, json: async () => ({ error: { message: 'rate limited' } }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ choices: [{ message: { content: '{"x":1}' } }] }) });
    const result = await mod.chatText([{ role: 'user', content: 'hi' }]);
    expect(result.ok).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);
    for (const [url] of fetch.mock.calls) {
      expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
    }
  });

  it('stops immediately on a rejected key (401) instead of burning the whole fallback chain', async () => {
    mod.setStoredKey('sk-or-v1-bad');
    fetch.mockResolvedValue({ ok: false, status: 401, json: async () => ({ error: { message: 'invalid key' } }) });
    const result = await mod.chatText([{ role: 'user', content: 'hi' }]);
    expect(result.ok).toBe(false);
    expect(result.isConfigError).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

describe('getFreeModelChain — dynamic catalog with layered fallback', () => {
  it('fetches and ranks the live catalog by parsed size, biggest first', async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { id: 'small/model:free', name: 'Small Model 8B', architecture: { modality: 'text->text' }, context_length: 8000 },
          { id: 'big/model:free', name: 'Big Model 405B', architecture: { modality: 'text->text' }, context_length: 8000 },
          { id: 'not-free/model', name: 'Paid Model 999B', architecture: { modality: 'text->text' } }, // no :free suffix, must be excluded
          { id: 'image/model:free', name: 'Image Model 70B', architecture: { modality: 'text->image' } }, // wrong modality, must be excluded
        ],
      }),
    });
    const chain = await mod.getFreeModelChain();
    expect(chain).toEqual(['big/model:free', 'small/model:free']);
  });

  it('moves a known fast instruct model to the front, ahead of a bigger model', async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { id: 'nousresearch/hermes-3-llama-3.1-405b:free', name: 'Hermes 405B', architecture: { modality: 'text->text' } },
          { id: 'meta-llama/llama-3.3-70b-instruct:free', name: 'Llama 3.3 70B Instruct', architecture: { modality: 'text->text' } },
        ],
      }),
    });
    const chain = await mod.getFreeModelChain();
    // 70B is smaller but curated-fast -> must come before the bigger 405B.
    expect(chain[0]).toBe('meta-llama/llama-3.3-70b-instruct:free');
    expect(chain).toContain('nousresearch/hermes-3-llama-3.1-405b:free');
  });

  it('caches the result in localStorage so a second call does not re-fetch', async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ id: 'x/model:free', name: 'X 10B', architecture: { modality: 'text->text' } }] }),
    });
    await mod.getFreeModelChain();
    await mod.getFreeModelChain();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('falls back to a stale cached catalog if the live fetch fails', async () => {
    localStorage.setItem(
      'nebula:free_model_catalog_v4',
      JSON.stringify({ models: ['stale/model:free'], fetchedAt: Date.now() - 999999999 }) // expired TTL
    );
    fetch.mockRejectedValue(new Error('network down'));
    const chain = await mod.getFreeModelChain();
    expect(chain).toEqual(['stale/model:free']);
  });

  it('falls back to the hardcoded FREE_MODEL_CHAIN if there is no cache at all and the fetch fails', async () => {
    fetch.mockRejectedValue(new Error('network down'));
    const chain = await mod.getFreeModelChain();
    expect(chain).toEqual(mod.FREE_MODEL_CHAIN);
  });
});

describe('chatJSON', () => {
  it('extracts and parses a JSON object even if the model wraps it in prose', async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, content: 'Sure! Here you go: {"genre":"house"} hope that helps', model: 'm' }),
    });
    const result = await mod.chatJSON([{ role: 'user', content: 'hi' }]);
    expect(result.ok).toBe(true);
    expect(result.parsed).toEqual({ genre: 'house' });
  });

  it('fails cleanly (not throws) on unparseable content', async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, content: 'no json here at all', model: 'm' }),
    });
    const result = await mod.chatJSON([{ role: 'user', content: 'hi' }]);
    expect(result.ok).toBe(false);
  });
});
