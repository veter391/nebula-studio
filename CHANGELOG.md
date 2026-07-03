# Changelog

All notable changes to Nebula Studio are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project adheres to [Semantic Versioning](https://semver.org/).

## [2.9.0] — 2026-07-03 — "Keys & Copilot"

### 🎉 Added
- **AI Assistant** — a real OpenRouter LLM call maps a natural-language vibe onto the existing deterministic generator; works out of the box via a shared server-side proxy (Cloudflare secret, rate-limited), or bring your own key in Settings for privacy/higher limits/model choice
- **Play Along** (Learn tab) — practice mode with a scrolling note timeline and real-time hit detection against two hand-verified exercises (C major scale, C major arpeggio)
- Sustained notes on the virtual keyboard (press-and-hold, with release envelope) — was a one-shot trigger before
- Full 2-octave computer-key mapping (was ~17 of 24 keys reachable)
- Explicit **Keyboard Mode** toggle — computer-key note input no longer runs silently in the background on every tab; Escape or the on-screen button exits cleanly
- Real `Space`/`C`/`R`/`E`/`M` keyboard shortcuts (previously advertised in the UI but not implemented — now they actually work)
- PWA support — installable, works offline once loaded (this fits an offline beat-maker better than most PWA add-ons)
- Vitest suite (66 tests) covering the deterministic core and the AI tool-contract
- GitHub Actions CI (lint + test on every push)

### 🐛 Fixed
- A stale-timer leak in the Learn tab's tutorial engine caused lessons to silently skip several steps in the background
- A hallucinated AI genre fell back to an internal-only sentinel value instead of a real genre
- Full mobile-responsive pass: Learn-tab popups no longer overflow narrow viewports, touch targets meet minimum size, horizontal overflow eliminated at 375-414px widths

### 🔒 Security
- The AI Assistant's shared key is a Cloudflare Worker secret — never present in client code, never committed
- `/api/ai` rejects non-JSON bodies, caps prompt size server-side, and is rate-limited per visitor
- Removed 17 redundant `'use strict'` directives (no-ops under ES modules) and fixed the lint config that was silently allowing loose `!=` comparisons in one file

### ⚠️ Honesty fixes (things that were claimed but not real)
- README claimed `Space`/`C`/`R`/`E`/`M` shortcuts, `1-9,0,-,=` track triggers, and an "audio worklet-ready" graph — only the first was later made real (see above); the rest were removed or reworded to reflect what's actually shipped
- README referenced `core/graph.js` and `core/recorder.js`, which never existed (recording lives in `engine.js`)

## [2.0.0] — 2026-06-27 — "Aurora"

### 🎉 Added
- **ES module architecture** — clean separation of core / ui / data
- **12 synth voices** (was 8) — new: tom, rim, pluck, sub-bass
- **Per-track FX chain** — filter + 3-band EQ + saturation + compressor on every track
- **Master limiter** to prevent clipping
- **Song mode** with 4 pattern slots (A / B / C / D) and chain order
- **Pattern save / load** with 10 named slots in `localStorage`
- **AI pattern generator** — generate beats / basslines / melodies from genre
- **Virtual MIDI keyboard** with computer-key mapping
- **Chord pad** with one-click major / minor / 7th chords
- **4 visualizer modes** — spectrum, oscilloscope, particles, nebula
- **4 themes** — Cosmic (default), Light, Sunset, Matrix
- **Built-in tutorial system** with progress saved per lesson
- **MIDI export** (`.mid` Standard MIDI File format)
- **Project sharing** — encode session as URL hash
- **Undo / Redo** for pattern edits (50-deep history)
- **Tab navigation** — Pattern · Song · Keyboard · Learn
- **Status bar** with live CPU + render time
- **Track-level randomization** — generate fills and variations

### ⚡ Changed
- Audio engine refactored — graph is now built declaratively from `tracks.js`
- Per-track gain normalised to prevent clipping when many tracks play
- Lookahead scheduler tuned for tighter timing on slow devices
- Visualizer runs at native DPR (was capped at 2)

### 🐛 Fixed
- Hi-hat no longer clicks at step boundaries
- Pad voice sustained notes no longer steal voices from new triggers
- WAV export now correctly applies swing to offline render

### 🔒 Security
- All audio buffers generated procedurally — no user-supplied content
- No network requests at runtime — 100 % client-side
- No third-party CDN scripts — fonts loaded with `crossorigin` from Google Fonts (optional)

## [1.0.0] — 2026-06-26 — "Genesis"

Initial release. 8 voices, 8 presets, single-pattern sequencer, WAV export, live recording.