# Contributing to Nebula Studio

Thanks for your interest in making Nebula Studio better. 🎶

## Quick rules

1. **No build step** — everything is hand-written JS / CSS. Don't introduce a bundler, framework, or package that requires building. Pull requests that add `webpack`, `vite`, `react`, etc. will be closed.
2. **No runtime dependencies** — `package.json` exists for dev tooling only. The `dependencies` field must remain `{}`.
3. **Keep it modular** — new audio code goes in `src/core/`, new UI in `src/ui/`, new data in `src/data/`.
4. **Match the style** — `npm run lint` runs ESLint with the rules in `.eslintrc.json`. `npm run format` runs Prettier.

## How to add a voice

1. Open `src/core/voices.js`
2. Write a function with signature `(ctx, dest, time, opts = {}) => void`
3. Add the voice to the `VOICES` map at the bottom of the file with `{ id, name, color, kind, synth, defaultGain, octaves? }`
4. Add it to the `tracks.js` default track list if you want it in the sequencer
5. Add a preset that uses it (optional but encouraged)
6. Update the relevant tutorial if it teaches this kind of sound

## How to add a preset

1. Open `src/data/presets.js`
2. Add an object: `{ id, name, genre, color, bpm, swing, pattern: [[…], …], description }`
3. The pattern is an array of arrays — one inner array per track, 16 booleans per inner array
4. Reload the page

## How to add a tutorial

1. Open `src/data/tutorials.js`
2. Add an object: `{ id, title, summary, steps: [{ title, body, action?, verify? }, …] }`
3. The `action` field can be one of `click-step`, `select-preset`, `open-tab`
4. The `verify` field is a function `(state) => boolean`

## Code style

- Use `'use strict';` at the top of every module
- Prefer `const` over `let`; never use `var`
- Two-space indent, single quotes, no semicolons only if you really want — we use semis
- Public APIs get JSDoc comments
- Web Audio nodes are stored on the engine instance, never on globals

## Reporting bugs

Open a GitHub issue with:
- Browser + version
- OS
- Steps to reproduce
- What you expected vs what happened
- A screenshot or screen recording if possible

## Suggesting features

Open a GitHub issue tagged `enhancement`. Describe the user story, not just the implementation:

> As a **musician**, I want to **share my beat with a friend** so that **we can collaborate without signing up for an account**.

A clear user story beats a feature spec.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.