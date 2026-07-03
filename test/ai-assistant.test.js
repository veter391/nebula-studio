import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the OpenRouter client so these tests never make a real network call —
// they verify the *contract* between the LLM's output and the deterministic
// engine: the model may only ever select a value from a fixed, validated
// vocabulary. Garbage in must not reach the audio engine unfiltered.
//
// AI is available by default (shared server-side proxy, no key required) —
// see core/openrouter-client.js for the BYOK-vs-shared-proxy split. These
// tests operate one level above that: they only care that suggestFromPrompt
// enforces the contract on whatever chatJSON returns, regardless of which
// transport produced it.
vi.mock('../src/core/openrouter-client.js', () => ({
  chatJSON: vi.fn(),
}));

import { chatJSON } from '../src/core/openrouter-client.js';
import { suggestFromPrompt } from '../src/ai-assistant.js';
import { AI, generatePattern } from '../src/ai.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('suggestFromPrompt — the tool-contract boundary between LLM and engine', () => {
  it('rejects an empty prompt without calling the model', async () => {
    const result = await suggestFromPrompt('   ');
    expect(result.ok).toBe(false);
    expect(chatJSON).not.toHaveBeenCalled();
  });

  it('passes through a network/parse/rate-limit failure from the client unchanged', async () => {
    chatJSON.mockResolvedValue({ ok: false, error: 'All models failed.' });
    const result = await suggestFromPrompt('cozy sunday morning');
    expect(result.ok).toBe(false);
    expect(result.error).toBe('All models failed.');
  });

  it('accepts a valid, in-vocabulary genre and defers entirely to the deterministic engine', async () => {
    chatJSON.mockResolvedValue({
      ok: true,
      model: 'test-model',
      parsed: { genre: 'synthwave', reasoning: 'moody neon vibe', seedHint: 777 },
    });
    const result = await suggestFromPrompt('driving at night through neon city lights');
    expect(result.ok).toBe(true);
    expect(result.genre).toBe('synthwave');
    expect(result.model).toBe('test-model');
    // The pattern must be byte-for-byte what the deterministic generator
    // produces for that exact (genre, seed) -- the model never authors audio.
    const expected = generatePattern('synthwave', 777);
    expect(result.pattern).toEqual(expected.pattern);
    expect(result.bpm).toBe(expected.bpm);
  });

  it('rejects a hallucinated genre outside the fixed vocabulary and falls back safely', async () => {
    chatJSON.mockResolvedValue({
      ok: true,
      model: 'test-model',
      parsed: { genre: 'dubstep-experimental-fusion', reasoning: 'made up', seedHint: 5 },
    });
    const result = await suggestFromPrompt('something intense');
    expect(result.ok).toBe(true);
    expect(AI.genres).toContain(result.genre); // must land in the real vocabulary
    expect(result.genre).not.toBe('default'); // never the internal-only sentinel
  });

  it('clamps a hallucinated out-of-range seed instead of passing it through raw', async () => {
    chatJSON.mockResolvedValue({
      ok: true,
      model: 'test-model',
      parsed: { genre: 'techno', reasoning: 'x', seedHint: 99999999999 },
    });
    const result = await suggestFromPrompt('fast and hard');
    expect(result.ok).toBe(true);
    // Whatever seed was actually used must be reproducible via the public API.
    const expected = generatePattern('techno', 999999);
    expect(result.pattern).toEqual(expected.pattern);
  });

  it('handles a missing/malformed parsed payload without throwing', async () => {
    chatJSON.mockResolvedValue({ ok: true, model: 'test-model', parsed: null });
    const result = await suggestFromPrompt('anything');
    expect(result.ok).toBe(true);
    expect(AI.genres).toContain(result.genre);
  });
});
