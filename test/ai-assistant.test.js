import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the OpenRouter client so these tests never make a real network call.
// The AI now COMPOSES the pattern (it authors the step grid), so the contract
// under test is: whatever grid the model returns is structurally sanitized
// (exactly 16 steps per known track, coerced to 0/1, unknown tracks dropped)
// before it can reach the engine -- but the musical content is the model's.
vi.mock('../src/core/openrouter-client.js', () => ({
  chatJSON: vi.fn(),
}));

import { chatJSON } from '../src/core/openrouter-client.js';
import { suggestFromPrompt } from '../src/ai-assistant.js';
import { AI } from '../src/ai.js';
import { TRACK_IDS } from '../src/data/tracks.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('suggestFromPrompt — AI composes the pattern, structure is validated', () => {
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

  it('uses the AI-composed pattern verbatim (structurally), marked composedByAI', async () => {
    const kick = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];
    const snare = [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0];
    chatJSON.mockResolvedValue({
      ok: true,
      model: 'test-model',
      parsed: { genre: 'house', bpm: 122, swing: 0.1, pattern: { kick, snare }, reasoning: 'four on the floor' },
    });
    const result = await suggestFromPrompt('classic house groove');
    expect(result.ok).toBe(true);
    expect(result.composedByAI).toBe(true);
    expect(result.pattern.kick).toEqual(kick); // the model's own steps, not a template
    expect(result.pattern.snare).toEqual(snare);
    expect(result.bpm).toBe(122);
  });

  it('produces a full 12-track grid: tracks the model omitted are empty 16-step rows', async () => {
    chatJSON.mockResolvedValue({
      ok: true,
      model: 'm',
      parsed: { genre: 'techno', bpm: 130, pattern: { kick: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0] } },
    });
    const result = await suggestFromPrompt('driving techno');
    for (const id of TRACK_IDS) {
      expect(result.pattern[id]).toHaveLength(16);
      for (const v of result.pattern[id]) expect([0, 1]).toContain(v);
    }
    // an omitted track is all zeros
    expect(result.pattern.pad.some(Boolean)).toBe(false);
  });

  it('sanitizes a malformed grid: wrong length -> padded/truncated to 16, junk values -> 0/1', async () => {
    chatJSON.mockResolvedValue({
      ok: true,
      model: 'm',
      parsed: {
        genre: 'funk',
        pattern: {
          kick: [1, 1, 1], // too short -> padded to 16
          hat: new Array(40).fill(1), // too long -> truncated to 16
          snare: [1, 'x', true, null, 0.9, {}, 0, 1], // junk -> coerced to 0/1
        },
      },
    });
    const result = await suggestFromPrompt('funky');
    expect(result.pattern.kick).toEqual([1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(result.pattern.hat).toHaveLength(16);
    expect(result.pattern.hat.every((v) => v === 1)).toBe(true);
    // truthy junk -> 1, falsy -> 0
    expect(result.pattern.snare.slice(0, 8)).toEqual([1, 1, 1, 0, 1, 1, 0, 1]);
  });

  it('drops unknown track ids the model invents', async () => {
    chatJSON.mockResolvedValue({
      ok: true,
      model: 'm',
      parsed: { genre: 'house', pattern: { kick: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0], cowbell: new Array(16).fill(1) } },
    });
    const result = await suggestFromPrompt('needs more cowbell');
    expect(result.pattern.cowbell).toBeUndefined();
    expect(Object.keys(result.pattern).sort()).toEqual([...TRACK_IDS].sort());
  });

  it('falls back to a deterministic pattern when the model returns no usable grid', async () => {
    chatJSON.mockResolvedValue({ ok: true, model: 'm', parsed: { genre: 'house', pattern: {} } });
    const result = await suggestFromPrompt('anything');
    expect(result.ok).toBe(true);
    expect(result.composedByAI).toBe(false);
    // still a valid, non-empty pattern from the deterministic engine
    const anyHit = Object.values(result.pattern).some((row) => row.some(Boolean));
    expect(anyHit).toBe(true);
  });

  it('rejects a hallucinated genre label but still uses the AI pattern', async () => {
    chatJSON.mockResolvedValue({
      ok: true,
      model: 'm',
      parsed: { genre: 'dubstep-fusion-9000', pattern: { kick: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0] } },
    });
    const result = await suggestFromPrompt('weird');
    expect(AI.genres).toContain(result.genre);
    expect(result.genre).not.toBe('default');
    expect(result.composedByAI).toBe(true);
  });

  it('clamps out-of-range tempo and swing into safe bounds', async () => {
    chatJSON.mockResolvedValue({
      ok: true,
      model: 'm',
      parsed: { genre: 'techno', bpm: 9000, swing: 5, pattern: { kick: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0] } },
    });
    const result = await suggestFromPrompt('impossibly fast');
    expect(result.bpm).toBeLessThanOrEqual(200);
    expect(result.bpm).toBeGreaterThanOrEqual(60);
    expect(result.swing).toBeLessThanOrEqual(0.6);
    expect(result.swing).toBeGreaterThanOrEqual(0);
  });

  it('handles a missing/malformed parsed payload without throwing', async () => {
    chatJSON.mockResolvedValue({ ok: true, model: 'm', parsed: null });
    const result = await suggestFromPrompt('anything');
    expect(result.ok).toBe(true);
    expect(AI.genres).toContain(result.genre);
    expect(result.composedByAI).toBe(false); // no pattern -> deterministic fallback
  });
});
