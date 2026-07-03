# AI engineering notes

What this project actually uses, stated plainly — no term below is decorative.
This file exists so you (the owner) can accurately describe what's real when
talking to recruiters, not so it reads impressively. If something below
sounds unglamorous, that's on purpose.

## Where the LLM is, and isn't

Nebula's audio engine (sequencer, synth voices, FX, WAV/MIDI export) is 100%
deterministic procedural code. No model ever touches audio generation. The
only LLM integration is the **AI Assistant** (`src/ai-assistant.js`): the
operator describes a vibe in natural language, a model call maps that
description onto the app's fixed genre vocabulary, and the existing
deterministic generator (`src/ai.js`) does the actual work.

The **Play Along** practice mode (`src/ui/play-along.js`, `src/data/songs.js`)
is explicitly *not* AI — it's a hand-authored note timeline plus real-time
hit detection. It's mentioned here only to be clear it isn't, since it's easy
to assume anything in a "Learn" tab next to an AI feature is also AI-driven.
It isn't. (We looked into having a model transcribe a well-known song for
this and found two reference sources disagreeing on the note sequence for
the same phrase — see the comment at the top of `songs.js`. Rather than ship
a guess in a learning tool, the two exercises there are self-composed and
correct by construction: a C major scale and a C major arpeggio have exactly
one right answer.)

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
  response is rejected — `chatJSON()` returns `{ok: false}` rather than a
  best-effort guess.

Both the direct (BYOK) and proxied (shared) request paths now also request
native JSON mode from OpenRouter (`response_format: {type: "json_object"}`),
not just prompt-and-hope — the regex extraction in `chatJSON()` stays as a
second line of defense for models/providers that don't fully honor the
parameter, rather than the only line of defense.

See `test/ai-assistant.test.js` for the enforced contract: every test in
that file exists specifically to prove that a malformed/hallucinated model
response cannot reach the audio engine unfiltered.

## Model routing — biggest free model first, verified live

`FREE_MODEL_CHAIN` is ordered by actual model size (up to a 405B-parameter
and a 550B-parameter MoE model at the top), not guessed — every model in the
list was hit directly against the OpenRouter API while building this to
confirm it currently returns valid completions, not assumed from a model
card. Free-tier capacity is genuinely volatile hour to hour (the 405B model
was rate-limited during testing, then worked minutes later) — that's *why*
this is a fallback chain and not a single hardcoded model: the fallback
exists to survive a real, observed failure mode, not a hypothetical one.

## Two AI transport modes: shared proxy vs. bring-your-own-key

This is the part most worth understanding if asked about it:

- **Shared (default)**: the browser calls this deployment's own `/api/ai`
  endpoint. `worker.js` holds a real OpenRouter key as a **Cloudflare Worker
  secret** (`wrangler secret put OPENROUTER_KEY`) — never in source, never in
  the deployed bundle, never visible via devtools, because it never leaves
  the server. A client-side "hidden" key is not a real option for a static
  site — anything shipped to the browser is trivially extractable, no
  obfuscation changes that. A tiny server-side proxy is the only correct way
  to offer a no-setup default.
- **BYOK**: the operator's own key, stored only in `localStorage`, calls
  OpenRouter directly — never touches `/api/ai`, never touches this app's
  server at all. Verified by test (`openrouter-client.test.js`): the BYOK
  path and the shared-proxy path are asserted to hit different URLs and
  never cross over.

### Rate limiting on the shared endpoint

Cloudflare's native Rate Limiting binding only supports 10s/60s windows (not
a real "N per hour" quota) — `wrangler.toml` configures 6 requests per 60
seconds per visitor IP. This is fair-use burst protection, not a security
boundary; there's nothing sensitive to protect beyond keeping the shared
free-tier pool usable for everyone, since only free models are ever called.
Verified live with a 15-request concurrent burst: exactly 6 succeeded, 9 got
`429`, matching the configured limit exactly.

The proxy also caps prompt size server-side (not just trusting the client to
have already truncated input) and rejects non-JSON bodies before doing
anything else.

## Graceful degradation, not silent failure

If the entire fallback chain fails (rate limits, timeout, malformed output
from every model), the UI auto-falls-back to the same deterministic roll the
manual 🎲 button uses, clearly labeled as a fallback rather than silently
pretending the AI call succeeded.

A distinct failure mode — a BYOK key being rejected (401/403) — is *not*
auto-recovered, since silently rolling a pattern would hide a problem the
operator actually needs to fix (a bad key). A rate-limited shared-mode
request *is* auto-recovered, since that's an expected, temporary condition,
not a misconfiguration.

## Testing

`test/` covers the deterministic core and the AI transport/contract with
Vitest (dev dependency only — the shipped app still has zero runtime
dependencies), 66 tests across 7 files:

- `utils.test.js` — pure helpers, the event emitter's error isolation
- `wav-encoder.test.js` — RIFF/WAVE header correctness, sample clamping
- `midi-export.test.js` — Standard MIDI File structure, determinism
- `ai.test.js` — procedural generator determinism and genre/BPM mapping
- `ai-assistant.test.js` — the tool-contract boundary: hallucinated genre,
  out-of-range seed, malformed JSON, all with the OpenRouter client mocked
  so tests never make a real network call
- `openrouter-client.test.js` — the BYOK-vs-shared-proxy transport split;
  confirms which URL each mode actually calls, confirms a rejected BYOK key
  stops immediately instead of burning the whole fallback chain
- `songs.test.js` — the Play Along data is self-verifying (asserts the C
  major scale is actually C-D-E-F-G-A-B-C), not just trusted by inspection

This is **not** a full evals setup — there's no LLM-as-judge, no golden
dataset scoring actual output *quality* (as opposed to schema validity). If
asked specifically about evals: what exists here is contract/schema testing,
which is a different (narrower) thing, and it's worth being precise about
that distinction rather than conflating the two.

Run with `npm test`.

## What would be the honest next step, not done here

- Real evals (LLM-as-judge or a golden set) for the AI Assistant's genre
  choices, if that's ever worth the cost for a feature this small.
- A verified transcription (real MIDI source, not a scraped page) to expand
  the Play Along song list beyond the two self-composed exercises.
- An AudioWorklet migration for the synth engine — unrelated to AI, but
  worth noting here too since it's the other place this project has been
  historically over-claimed (see CHANGELOG's "Honesty fixes").
