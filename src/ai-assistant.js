/**
 * AI Assistant — the model actually COMPOSES the beat.
 *
 * From the user's description the model writes the pattern itself: for each
 * drum/instrument track it decides which of the 16 steps are hit, plus the
 * tempo and swing. It is not picking a preset or a genre template — it
 * authors the step grid. We validate only the *structure* (exactly 16
 * steps per track, coerced to 0/1, unknown tracks dropped) so malformed
 * output can't reach the engine, but the musical *content* is the model's.
 *
 * The deterministic engine still SYNTHESISES the audio — an LLM can't emit
 * sound, only decide which steps trigger. That's the honest split: the
 * model composes the rhythm, the engine renders it. If the model is
 * unavailable or returns nothing usable, we fall back to the deterministic
 * procedural generator so the button always does something.
 *
 * @module ai-assistant
 */

import { chatJSON } from './core/openrouter-client.js';
import { AI } from './ai.js';
import { TRACK_IDS } from './data/tracks.js';
import { spaceToFx, toneToFilter, keyToMusicalKey } from './ai-mappers.js';

const STEPS = 16;

const SYSTEM_PROMPT = `You are the beat-producer inside Nebula Studio, a 16-step drum machine. From the user's vibe you COMPOSE an original beat and shape its sound — you decide everything below, you are not choosing a preset.

The grid is 16 steps = one bar of 4/4. Steps 1,5,9,13 are the strong beats (downbeats); 3,7,11,15 are the backbeats; the rest are offbeats/syncopation.

Tracks you can use (include only the ones you want playing):
- kick: the pulse. snare/clap: backbeat, usually steps 5 & 13. hat: keeps time (offbeats/16ths). tom, rim: fills & accents. sub, bass: low end. lead, pluck: melodic hooks. pad: sustained chord/atmosphere. fx: risers/impacts.

Compose something that genuinely fits the description — sparse and spacious vs dense and driving, straight vs swung, where the accents land. Don't default to four-on-the-floor unless it fits.

You ALSO choose, from these fixed vocabularies (a helper turns them into exact settings, so just pick the best-fitting word — pick the neutral option if unsure):
- key + scale: which musical key the tonal parts (bass, lead, pluck, pad, sub) play in. key = one of C, C#, D, D#, E, F, F#, G, G#, A, A#, B. scale = "minor" (darker, tense, emotional) or "major" (brighter, happy, open).
- space: "dry" (tight, no ambience), "medium", "spacious" (roomy, some echo), "cavernous" (huge reverb/echo, dub/ambient). Pick dry for punchy/minimal, spacious/cavernous for dreamy/dub/ambient.
- tone: "dark" (muffled, lo-fi, underwater), "warm", "neutral", "bright" (crisp, open).

Available genres (pick the closest label): ${AI.genres.join(', ')}.

Respond with ONLY a JSON object:
{
  "genre": one of the genre labels above,
  "bpm": integer tempo (chill ~70-95, mid ~100-120, upbeat ~120-135, fast ~140-175),
  "swing": number 0.0-0.5 (0 = straight, ~0.15-0.25 = human groove),
  "key": one of the note names above,
  "scale": "minor" or "major",
  "space": one of dry|medium|spacious|cavernous,
  "tone": one of dark|warm|neutral|bright,
  "pattern": { "kick":[16 x 0 or 1], "snare":[...], ...only the tracks you use... },
  "reasoning": ONE short sentence tying the groove, key and sound to the vibe
}
Every pattern array MUST have exactly 16 numbers, each 0 or 1.`;

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

/**
 * Coerce whatever the model returned into a valid 12-track x 16-step grid of
 * 0/1. Unknown tracks are ignored, arrays are padded/truncated to 16, values
 * forced to 0/1. Returns null if the model supplied no actual hits (so the
 * caller can fall back to the deterministic generator).
 */
function sanitizePattern(aiPattern) {
  if (!aiPattern || typeof aiPattern !== 'object') return null;
  const out = {};
  let anyHit = false;
  for (const id of TRACK_IDS) {
    const row = Array.isArray(aiPattern[id]) ? aiPattern[id] : [];
    const steps = new Array(STEPS);
    for (let i = 0; i < STEPS; i++) steps[i] = row[i] ? 1 : 0;
    if (steps.some(Boolean)) anyHit = true;
    out[id] = steps;
  }
  return anyHit ? out : null;
}

/**
 * Build the master-FX overrides (UI units) from the model's space/tone
 * descriptors. Returns only the knobs the model actually chose (so anything
 * it left out stays at the app default). null if it chose nothing.
 */
function buildFx(space, tone) {
  const fx = {};
  const sp = spaceToFx(space);
  if (sp) {
    fx.reverb = sp.reverb;
    fx.delay = sp.delay;
  }
  const filter = toneToFilter(tone);
  if (filter != null) fx.filter = filter;
  return Object.keys(fx).length ? fx : null;
}

/**
 * @param {string} promptText - user's natural-language vibe description
 * @returns {Promise<{ok: true, genre: string, reasoning: string, pattern: object, bpm: number, swing: number, fx: object|null, musicalKey: object|null, keyLabel: string|null, model: string, composedByAI: boolean} | {ok: false, error: string, isConfigError?: boolean, isRateLimited?: boolean}>}
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

  const { genre, bpm, swing, pattern, key, scale, space, tone, reasoning } = result.parsed || {};

  const FALLBACK_GENRE = 'house';
  const validGenre = AI.genres.includes(genre) ? genre : FALLBACK_GENRE;

  // The model's own composition, structurally validated.
  const aiPattern = sanitizePattern(pattern);
  const composedByAI = aiPattern !== null;
  const finalPattern = aiPattern || AI.generatePattern(validGenre, Date.now() % 1000000).pattern;

  const genreDefaults = AI.generatePattern(validGenre, 1);
  const finalBpm = Number.isFinite(bpm) ? Math.round(clamp(bpm, 60, 200)) : genreDefaults.bpm;
  const finalSwing = Number.isFinite(swing) ? clamp(swing, 0, 0.6) : genreDefaults.swing;

  // Descriptors → concrete params via the deterministic helpers.
  const fx = buildFx(space, tone);
  const musicalKey = keyToMusicalKey(key, scale);
  const keyLabel = musicalKey ? `${normalizeKeyLabel(key)} ${String(scale).toLowerCase() === 'major' ? 'major' : 'minor'}` : null;

  return {
    ok: true,
    genre: validGenre,
    reasoning: reasoning || (composedByAI ? 'Composed a custom groove.' : `Rolled a ${AI.genreLabels[validGenre] || validGenre} beat.`),
    pattern: finalPattern,
    bpm: finalBpm,
    swing: finalSwing,
    fx,
    musicalKey,
    keyLabel,
    model: result.model,
    composedByAI,
  };
}

function normalizeKeyLabel(key) {
  return typeof key === 'string' ? key.trim().toUpperCase().replace('♯', '#') : '';
}
