# 🌌 Nebula Studio

**A production-grade, browser-based beat maker and step sequencer built entirely on the Web Audio API.**

Zero dependencies. Zero build step. Zero servers — pure static files that you can open from disk, host on GitHub Pages, or deploy anywhere.

![Nebula Studio](https://img.shields.io/badge/version-2.0-00f5ff?style=flat-square) ![License](https://img.shields.io/badge/license-MIT-ff3df0?style=flat-square) ![No deps](https://img.shields.io/badge/dependencies-0-8b5cf6?style=flat-square) ![WebAudio](https://img.shields.io/badge/Web%20Audio-API-b8ff5c?style=flat-square)

---

## ✨ Features

### 🎚️ Production audio engine
- **12 unique voices** synthesized from scratch — kick, snare, hi-hat, clap, tom, rim, bass (saw + sub), lead (square + vibrato), pad (LFO-filtered chord), pluck, fx-sweep, sub-bass
- **Per-track FX chain** — every track gets its own filter + 3-band EQ + saturation + compressor
- **Master FX** — convolution reverb (procedurally generated impulse), feedback delay, soft-clip limiter
- **Lookahead scheduler** with sample-accurate timing (25 ms tick, 120 ms horizon)
- **Variable swing** (0–60 %)
- **Audio worklet–ready** graph topology

### 🎼 Composition
- **16-step sequencer** with 12 tracks
- **Song mode** with 4 pattern slots (A / B / C / D) chained in any order
- **Pattern save / load** with named slots in `localStorage` (10 slots, persists across sessions)
- **AI pattern generator** — generate beats, basslines, melodies from genre presets
- **Virtual MIDI keyboard** — play melodies and basslines with mouse or computer keys
- **Chord pad** — one-click chord progressions

### 🎨 Visuals
- **4 visualizer modes** — spectrum, oscilloscope, particle field, nebula clouds
- **Audio-reactive particles** that burst on every hit
- **4 themes** — Cosmic (default), Light, Sunset, Matrix
- **Glassmorphism + aurora background** with smooth animations
- **Fully responsive** — works from 360 px phone to 4K display

### 📚 Learn
- **Built-in tutorial system** with progressive lessons
- **Progress saved per lesson** in `localStorage`
- **Interactive**: highlights relevant UI elements and guides you through real edits

### 💾 Export
- **WAV export** — offline-rendered 16-bit PCM via `OfflineAudioContext` (up to 8 bars)
- **MIDI export** — standard `.mid` files that open in Ableton, FL Studio, Logic, etc.
- **Live recording** — captures the actual output to `.webm`
- **Project share** — encode/decode full session as URL hash for sharing

### ⌨️ Keyboard shortcuts
- `Space` — play / pause
- `C` — clear pattern
- `R` — record
- `E` — export WAV
- `M` — export MIDI
- `1–9, 0, -, =` — trigger tracks live
- `Z X C V B N M , . /` — virtual keyboard notes

---

## 🚀 Quick start

### Option A — open the file
```bash
git clone https://github.com/veter391/nebula-studio.git
cd nebula-studio
open index.html          # macOS
xdg-open index.html      # Linux
start index.html         # Windows
```
That's it. No `npm install`, no build.

> Modern browsers (Chrome / Edge / Firefox / Safari ≥ 14) require a user gesture before audio starts — the boot screen handles this.

### Option B — local dev server (recommended for hot reload)
```bash
npm install
npm run dev              # python3 -m http.server 8080
```
Then visit `http://localhost:8080`.

### Option C — deploy
The repo is 100 % static. Drop `index.html` + `src/` + `public/` onto:
- GitHub Pages
- Netlify (`drag-and-drop` the folder)
- Vercel (`vercel --prod`)
- Cloudflare Pages
- S3 + CloudFront
- Any static host

---

## 🏗 Architecture

```
nebula-studio/
├── index.html              # single entry, ES module bootstrap
├── README.md
├── LICENSE                 # MIT
├── CHANGELOG.md
├── CONTRIBUTING.md
├── package.json            # dev tooling only (no runtime deps)
├── .eslintrc.json
├── .prettierrc
├── .gitignore
├── public/                 # static assets
│   └── favicon.svg
└── src/
    ├── main.js             # app bootstrap
    ├── styles.css          # design tokens + components + themes
    ├── store.js            # central state (pub/sub + localStorage)
    ├── utils.js            # helpers
    ├── ai.js               # pattern generator
    ├── core/
    │   ├── engine.js       # AudioEngine (top-level)
    │   ├── graph.js        # audio graph builder
    │   ├── voices.js       # 12 synth voices
    │   ├── effects.js      # per-track FX factories
    │   ├── scheduler.js    # lookahead scheduler
    │   ├── recorder.js     # live recording via MediaStream
    │   ├── wav-encoder.js  # 16-bit PCM WAV writer
    │   └── midi-export.js  # Standard MIDI File (SMF) writer
    ├── ui/
    │   ├── shell.js        # header, transport, theme, tabs, toast
    │   ├── sequencer.js    # 16-step grid
    │   ├── mixer.js        # per-track mixer strips
    │   ├── visualizer.js   # canvas visualizer (4 modes)
    │   ├── presets.js      # preset browser
    │   ├── tutorials.js    # interactive lessons
    │   ├── song.js         # song mode (A/B/C/D + chain)
    │   └── keyboard.js     # virtual MIDI keyboard + chord pad
    └── data/
        ├── tracks.js       # track definitions
        ├── presets.js      # 24+ genre presets
        ├── tutorials.js    # lesson content
        └── themes.js       # theme tokens
```

### Audio graph

```
[voice] → [trackGain] → [trackFilter] → [trackEQ] → [trackSat] → [trackComp] ──┐
                                                                              │
                                              ┌────[reverbSend]────[reverb]──┐│
                                              ├────[delaySend]─────[delay]───┤│
                                              │                              ▼▼
                                              │                        [masterGain]
                                              │                              │
                                              │                              ▼
                                              │                       [masterLimiter]
                                              │                              │
                                              │                              ▼
                                              │                         [analyser]
                                              │                              │
                                              │                              ▼
                                              │                        [destination]
                                              │
                                              └──(parallel)──[recorder]──────▶ WebM
```

### State

A single `store.js` module exposes a tiny pub/sub state container. Every UI module subscribes to the slices it cares about (e.g. mixer subscribes to `tracks`, sequencer subscribes to `pattern`). State is persisted to `localStorage` on every change (debounced).

---

## 🧪 Browser support

| Browser | Status |
|---|---|
| Chrome / Edge ≥ 90 | ✅ full support |
| Firefox ≥ 88 | ✅ full support |
| Safari ≥ 14.5 | ✅ full support |
| Mobile Safari iOS 14+ | ✅ touch + virtual keyboard |
| Chrome Android | ✅ |

Required Web APIs: `AudioContext`, `OfflineAudioContext`, `AnalyserNode`, `ConvolverNode`, `MediaRecorder`, `MediaStreamDestination`, `localStorage`, ES Modules.

---

## 🤝 Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).

---

## 📜 License

MIT © Nebula Studio contributors. See [LICENSE](./LICENSE).

---

## 🙏 Acknowledgements

- Inspired by the workflow of **Ableton Live**, **Logic Pro**, **FL Studio** and the accessibility of **BandLab** / **Soundtrap**
- Built without any external libraries — every oscillator, every filter envelope, every particle is written from scratch
- Star ⭐ the repo if it helped you make something cool