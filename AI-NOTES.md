# AI engineering notes

What this project actually uses, stated plainly — no term below is decorative.
This file exists so you (the owner) can accurately describe what's real when
talking to recruiters, not so it reads impressively. If something below
sounds unglamorous, that's on purpose.

## Where the LLM is, and isn't

The **AI Assistant** (`src/ai-assistant.js`) is a real generative feature:
from the user's description, the model **composes the actual 16-step
pattern** — it decides, for each track (kick, snare, hat, bass, lead, …),
which of the 16 steps are hit, plus the tempo and swing. It is not picking
a genre or a preset; it authors the step grid. Two live examples (same
build, different prompts) show it genuinely composing, not templating:

```
"sparse minimal deep techno, lots of space"   "busy energetic dnb breakbeat"
  kick   X...X...X...X...                        kick   X.X.X...X.X.X.X.
  snare  ........X.......                        snare  ....X.......X...
  hat    ..X...X...X...X.                        hat    .X.X.X.X.X.X.X.X
                                                 tom    ......X.......X.
```

The honest boundary: the LLM **can't emit audio**, only decide which steps
trigger. So the deterministic engine (`src/ai.js` voices, FX, scheduler)
still *synthesises* the sound from the grid the model composed. That's the
real split — the model composes the rhythm, the engine renders it. If the
model is unavailable or returns nothing usable, it falls back to the
deterministic procedural generator so the button always does something.

(Earlier versions of this feature only had the model pick a genre label and
let the deterministic engine roll a template — which was fair to call
"decorative AI." It now composes the pattern itself.)

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

The model composes the pattern, but its output is never trusted
*structurally*. It returns JSON, and everything is sanitized against a
closed contract before it can reach the engine — the musical *content* is
the model's, the *shape* is enforced:

- The composed `pattern` is coerced to exactly the 12 known tracks × 16
  steps, each value forced to 0/1. Rows the model made too short are padded,
  too long are truncated, junk values (`"x"`, `null`, `0.9`, `{}`) become
  0/1. Track ids the model invents (`cowbell`) are dropped. If the model
  supplies no actual hits, the whole thing falls back to the deterministic
  generator.
- `genre` (used for the label + tempo default) must be one of the app's real
  genre strings; a hallucinated one falls back to a real genre, never the
  internal-only sentinel.
- `bpm` and `swing` are clamped to safe ranges (`[60,200]`, `[0,0.6]`).
- If the JSON doesn't parse (e.g. a truncated grid), the response is
  rejected — `chatJSON()` returns `{ok: false}` rather than a best-effort
  guess, and the shared proxy walks to the next model.

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
