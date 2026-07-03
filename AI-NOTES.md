# AI engineering notes

What this project actually uses, stated plainly — no term below is decorative.

## Where the LLM is, and isn't

Nebula's audio engine (sequencer, synth voices, FX, WAV/MIDI export) is 100%
deterministic procedural code. No model ever touches audio generation. The
only LLM integration is the **AI Assistant** (`src/ai-assistant.js`): the
operator describes a vibe in natural language, a model call maps that
description onto the app's fixed genre vocabulary, and the existing
deterministic generator (`src/ai.js`) does the actual work.

## Tool-contract pattern (structured output + validation)

The model is never trusted to control app behavior directly. It returns
JSON, and every field is validated against a closed contract before it can
touch anything:

- `genre` must be one of the app's real genre strings (`AI.genres`). A
  hallucinated or malformed genre falls back to a real genre (`house`), never
  to an internal-only sentinel value that could leak into the UI.
- `seedHint` is clamped to `[1, 999999]` regardless of what the model
  returns (a model has been observed returning out-of-range and even
  non-numeric values here in testing).
- If the JSON doesn't parse, or required fields are missing, the whole
  response is rejected — `src/core/openrouter-client.js#chatJSON` returns
  `{ok: false}` rather than a best-effort guess.

See `test/ai-assistant.test.js` for the enforced contract: every test in
that file exists specifically to prove that a malformed/hallucinated model
response cannot reach the audio engine unfiltered.

## Graceful degradation, not silent failure

Every OpenRouter call is one hop in a **model fallback chain**
(`FREE_MODEL_CHAIN` in `openrouter-client.js`) — free-tier capacity on
individual models fluctuates hour to hour, so a single rate-limited model
must not fail the whole feature. If the entire chain fails (rate limits,
timeout, malformed output from every model), the UI auto-falls-back to the
same deterministic roll the manual 🎲 button uses, clearly labeled as a
fallback rather than silently pretending the AI call succeeded.

A distinct failure mode — the stored API key itself being rejected
(401/403) — is *not* auto-recovered, since silently rolling a pattern would
hide a problem the operator actually needs to fix.

## Security: bring-your-own-key, client-side only

This is a static site with no backend. There is nowhere to safely hide a
shared API key, so the app doesn't try: the operator's OpenRouter key lives
only in `localStorage`, is never hardcoded, never committed, and is sent
only to `https://openrouter.ai` directly from the browser. This is stated
explicitly in the in-app key-entry prompt, not hidden in fine print.

## Testing

`test/` covers the deterministic core with Vitest (dev dependency only —
the shipped app still has zero runtime dependencies):

- `utils.test.js` — pure helpers, the event emitter's error isolation
- `wav-encoder.test.js` — RIFF/WAVE header correctness, sample clamping
- `midi-export.test.js` — Standard MIDI File structure, determinism
- `ai.test.js` — procedural generator determinism and genre/BPM mapping
- `ai-assistant.test.js` — the tool-contract boundary above, with the
  OpenRouter client mocked so tests never make a real network call

Run with `npm test`.
