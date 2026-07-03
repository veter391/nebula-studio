# Changelog

All notable changes to Nebula Studio are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project adheres to [Semantic Versioning](https://semver.org/).

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