/**
 * AI pattern generator — produces musically-sensible beats, basslines,
 * melodies from a genre + optional seed.
 *
 * Uses genre-specific statistical models (transition probabilities for
 * kick / snare / hat placement; simple arpeggio patterns for tonal
 * tracks). Everything is deterministic given the seed so the user can
 * re-roll until they like the result.
 *
 * @module ai
 */

import { TRACK_IDS, TRACKS } from './data/tracks.js';
import { CHORD_TYPES, PROGRESSIONS, midiToFreq, midiToName } from './utils.js';

'use strict';

/** Tiny seeded RNG (mulberry32). */
function rng(seed) {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Probability tables for kick placement per step (16 steps). */
const KICK_PROFILES = {
  house: [0.95, 0.05, 0.0, 0.05, 0.95, 0.05, 0.0, 0.05, 0.95, 0.05, 0.0, 0.05, 0.95, 0.05, 0.0, 0.05],
  techno: [0.95, 0.1, 0.05, 0.1, 0.85, 0.15, 0.4, 0.05, 0.95, 0.1, 0.05, 0.1, 0.85, 0.15, 0.4, 0.05],
  'hip-hop': [0.95, 0.0, 0.0, 0.0, 0.05, 0.0, 0.0, 0.4, 0.95, 0.0, 0.05, 0.0, 0.05, 0.0, 0.0, 0.0],
  trap: [0.95, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.05, 0.6, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
  'drum-and-bass': [0.85, 0.0, 0.0, 0.0, 0.05, 0.05, 0.7, 0.0, 0.85, 0.0, 0.0, 0.0, 0.05, 0.05, 0.7, 0.0],
  funk: [0.9, 0.0, 0.05, 0.3, 0.05, 0.0, 0.4, 0.05, 0.85, 0.0, 0.05, 0.4, 0.05, 0.0, 0.3, 0.0],
  rock: [0.95, 0.0, 0.0, 0.05, 0.0, 0.0, 0.05, 0.05, 0.95, 0.0, 0.0, 0.05, 0.0, 0.0, 0.05, 0.05],
  ambient: [0.5, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
  pop: [0.95, 0.0, 0.0, 0.05, 0.0, 0.0, 0.0, 0.05, 0.95, 0.0, 0.0, 0.05, 0.0, 0.0, 0.0, 0.05],
  synthwave: [0.95, 0.0, 0.0, 0.0, 0.0, 0.0, 0.05, 0.0, 0.95, 0.0, 0.0, 0.0, 0.0, 0.0, 0.05, 0.0],
  default: [0.9, 0.0, 0.05, 0.0, 0.0, 0.0, 0.05, 0.0, 0.85, 0.0, 0.0, 0.0, 0.0, 0.0, 0.05, 0.0],
};

const SNARE_PROFILES = {
  house: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
  techno: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
  'hip-hop': [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0.5, 0, 0, 0],
  trap: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.7, 0, 0, 0.4],
  'drum-and-bass': [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0.4],
  funk: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0.3, 0],
  rock: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
  ambient: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  pop: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
  synthwave: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
  default: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
};

const HAT_PROFILES = {
  house: Array(16).fill(0.5).map((v, i) => (i % 2 === 1 ? 0.85 : 0.4)),
  techno: Array(16).fill(0.85),
  'hip-hop': Array(16).fill(0).map((v, i) => (i % 2 === 0 ? 0.7 : 0.4)),
  trap: Array(16).fill(0).map((v, i) => (i % 4 === 0 ? 0.85 : i % 2 === 0 ? 0.5 : 0.3)),
  'drum-and-bass': Array(16).fill(0.7),
  funk: Array(16).fill(0.5),
  rock: Array(16).fill(0).map((v, i) => (i % 2 === 0 ? 0.5 : 0.3)),
  ambient: Array(16).fill(0).map(() => 0.15),
  pop: Array(16).fill(0).map((v, i) => (i % 2 === 0 ? 0.6 : 0.4)),
  synthwave: Array(16).fill(0.4).map((v, i) => (i % 2 === 0 ? 0.7 : 0.4)),
  default: Array(16).fill(0.4).map((v, i) => (i % 2 === 0 ? 0.6 : 0.3)),
};

const CLAP_PROFILES = {
  house: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
  techno: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
  trap: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0.4],
  'drum-and-bass': [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
  pop: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0.4, 0],
  funk: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
  synthwave: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
  default: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
};

const BASS_PROFILES = {
  house: [1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0],
  techno: [1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1],
  'hip-hop': [1, 0, 0, 0, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 0, 0],
  trap: [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
  'drum-and-bass': [1, 0, 1, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0, 1],
  funk: [1, 0, 0, 1, 0, 1, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0],
  pop: [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0],
  synthwave: [1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0],
  ambient: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  default: [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0],
};

const MELODY_PROFILES = {
  pop: [0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0, 0],
  synthwave: [0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 1, 0, 0, 0],
  house: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 1],
  'drum-and-bass': [0, 1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 0],
  funk: [0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0],
  default: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 0],
};

const PAD_PROFILES = {
  ambient: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  default: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
};

function pick(profile, random) {
  return profile.map((p) => (random() < p ? 1 : 0));
}

const GENRES = [
  'house',
  'techno',
  'hip-hop',
  'trap',
  'drum-and-bass',
  'funk',
  'rock',
  'pop',
  'synthwave',
  'ambient',
];

const GENRE_LABELS = {
  house: 'House',
  techno: 'Techno',
  'hip-hop': 'Hip-Hop',
  trap: 'Trap',
  'drum-and-bass': 'Drum & Bass',
  funk: 'Funk',
  rock: 'Rock',
  pop: 'Pop',
  synthwave: 'Synthwave',
  ambient: 'Ambient',
};

/**
 * Generate a full pattern from genre + seed.
 * @param {string} genre
 * @param {number} seed
 * @returns {Object} - { pattern, bpm, swing }
 */
export function generatePattern(genre = 'house', seed = Date.now()) {
  const r = rng(seed);
  const g = GENRES.includes(genre) ? genre : 'default';
  const pattern = {};
  pattern.kick = pick(KICK_PROFILES[g] || KICK_PROFILES.default, r);
  pattern.snare = pick(SNARE_PROFILES[g] || SNARE_PROFILES.default, r);
  pattern.hat = pick(HAT_PROFILES[g] || HAT_PROFILES.default, r);
  pattern.clap = pick(CLAP_PROFILES[g] || CLAP_PROFILES.default, r);
  pattern.tom = new Array(16).fill(0);
  pattern.rim = new Array(16).fill(0);
  pattern.sub = pick([1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0], r);
  pattern.bass = pick(BASS_PROFILES[g] || BASS_PROFILES.default, r);
  pattern.lead = pick(MELODY_PROFILES[g] || MELODY_PROFILES.default, r);
  pattern.pluck = new Array(16).fill(0);
  pattern.pad = pick(PAD_PROFILES[g] || PAD_PROFILES.default, r);
  pattern.fx = new Array(16).fill(0);
  // rare fx on the last step for impact
  if (r() < 0.4) pattern.fx[15] = 1;
  if (g === 'ambient' || g === 'synthwave') {
    // give some lift to lead/pluck
    pattern.lead = pattern.lead.map((v) => v || (r() < 0.2 ? 1 : 0));
  }
  const bpm = ({ house: 124, techno: 132, 'hip-hop': 92, trap: 140, 'drum-and-bass': 174, funk: 104, rock: 128, pop: 120, synthwave: 110, ambient: 72, default: 120 })[g];
  const swing = ({ 'hip-hop': 0.18, funk: 0.2, default: 0 })[g] ?? 0;
  return { pattern, bpm, swing };
}

/**
 * Generate a chord progression and a simple arpeggio melody that fits it.
 * @param {string} progressionName - key of PROGRESSIONS
 * @param {string} chordType - key of CHORD_TYPES
 * @param {number} rootMidi - MIDI number for root
 * @returns {Array<{chord: number[], arpeggio: number[]}>}
 */
export function generateChordProgression(progressionName = 'I-V-vi-IV', chordType = 'minor', rootMidi = 60) {
  const prog = PROGRESSIONS[progressionName] || PROGRESSIONS['I-V-vi-IV'];
  const intervals = CHORD_TYPES[chordType] || CHORD_TYPES.minor;
  return prog.map((rootOffset) => {
    const chordRoot = rootMidi + rootOffset;
    const chord = intervals.map((i) => chordRoot + i);
    // simple arpeggio pattern: up-down
    const arpeggio = [
      chord[0],
      chord[1],
      chord[2],
      chord[1],
      chord[2],
      chord[0] + 12,
      chord[2],
      chord[1],
    ];
    return { chord, arpeggio };
  });
}

export const AI = {
  generatePattern,
  generateChordProgression,
  genres: GENRES,
  genreLabels: GENRE_LABELS,
  progressions: Object.keys(PROGRESSIONS),
  chordTypes: Object.keys(CHORD_TYPES),
};