/**
 * AI Assistant — translates a natural-language vibe description into
 * parameters for the existing deterministic pattern generator (ai.js).
 *
 * This module never generates audio, note data, or pattern steps itself —
 * it only picks {genre, seed, bpmFeel} from real user intent and hands off
 * to `generatePattern()`, which is 100% deterministic procedural code. That
 * keeps the honest split this project is built on: the LLM interprets
 * *intent*, the audio engine is always deterministic and inspectable.
 *
 * @module ai-assistant
 */

import { chatJSON } from './core/openrouter-client.js';
import { AI } from './ai.js';

const SYSTEM_PROMPT = `You are the AI Assistant inside Nebula Studio, a browser beat maker. The user describes a vibe, mood, or scene in their own words. Your only job is to map that description onto the app's existing genre engine — you never generate audio yourself. Available genres: ${AI.genres.join(', ')}. Respond with ONLY a JSON object: {"genre": one of the exact genre strings above, "reasoning": string (1 sentence, why this genre fits), "seedHint": integer between 1 and 999999 (pick something that feels intentional for the mood, e.g. a moodier vibe might get a different seed than an energetic one — this only affects which random variation is rolled, not the genre)}.`;

/**
 * @param {string} promptText - user's natural-language vibe description
 * @returns {Promise<{ok: true, genre: string, reasoning: string, pattern: object, bpm: number, swing: number, model: string} | {ok: false, error: string, isConfigError: boolean}>}
 */
export async function suggestFromPrompt(promptText) {
  if (!promptText || !promptText.trim()) {
    return { ok: false, error: 'Describe a vibe first.', isConfigError: false };
  }

  const result = await chatJSON([
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: promptText.trim().slice(0, 300) },
  ]);
  if (!result.ok) return result;

  const { genre, reasoning, seedHint } = result.parsed || {};
  // Fall back to a real genre (not the internal-only 'default' sentinel used
  // by generatePattern) so the UI never has to display "default" to a user.
  const FALLBACK_GENRE = 'house';
  const validGenre = AI.genres.includes(genre) ? genre : FALLBACK_GENRE;
  const rawSeed = Number.isFinite(seedHint) ? Math.floor(seedHint) : Date.now() % 1000000;
  const seed = Math.min(999999, Math.max(1, rawSeed));

  // The LLM picked *which* deterministic preset to roll and with what seed —
  // the actual pattern/bpm/swing come entirely from the existing procedural
  // engine, never from the model.
  const generated = AI.generatePattern(validGenre, seed);

  return {
    ok: true,
    genre: validGenre,
    reasoning: reasoning || `Mapped to ${AI.genreLabels[validGenre] || validGenre}.`,
    pattern: generated.pattern,
    bpm: generated.bpm,
    swing: generated.swing,
    model: result.model,
  };
}
