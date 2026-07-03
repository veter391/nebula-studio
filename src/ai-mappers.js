/**
 * AI intent → concrete parameters (the "helper scripts").
 *
 * The model isn't the strongest, so instead of asking it for precise numbers
 * (which it fumbles), we ask it to pick from small, named vocabularies —
 * "spacious", "dark", key "F#", scale "minor" — and these deterministic
 * mappers turn those choices into correct, in-range values. A weak model
 * can only pick a valid option; the mapping can't produce garbage. Anything
 * unrecognised maps to `null` so the caller leaves that setting at its
 * default (don't touch what the model didn't clearly ask to change).
 *
 * @module ai-mappers
 */

/** space descriptor → master reverb + delay (UI units 0-100). */
const SPACE_TO_FX = {
  dry: { reverb: 6, delay: 4 },
  medium: { reverb: 22, delay: 15 },
  spacious: { reverb: 48, delay: 36 },
  cavernous: { reverb: 70, delay: 55 },
};

/** tone descriptor → master low-pass filter cutoff (Hz; 12000 = fully open). */
const TONE_TO_FILTER = {
  dark: 2200,
  warm: 5000,
  neutral: 9000,
  bright: 12000,
};

const NOTE_OFFSET = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10], // natural minor
};

/** @returns {{reverb:number, delay:number}|null} */
export function spaceToFx(space) {
  return SPACE_TO_FX[String(space).toLowerCase()] || null;
}

/** @returns {number|null} filter cutoff in Hz */
export function toneToFilter(tone) {
  const hz = TONE_TO_FILTER[String(tone).toLowerCase()];
  return Number.isFinite(hz) ? hz : null;
}

/**
 * @param {string} key - note name C..B (with optional #), flats normalised
 * @param {string} scale - "major" | "minor"
 * @returns {{rootMidi:number, intervals:number[]}|null}
 */
export function keyToMusicalKey(key, scale) {
  const normalized = normalizeNote(key);
  if (normalized == null) return null;
  const intervals = SCALES[String(scale).toLowerCase()] || SCALES.minor;
  // Root in the A3-ish register (C3=48 .. B3=59) so tracks sit where the
  // original hardcoded voicing did.
  const rootMidi = 48 + NOTE_OFFSET[normalized];
  return { rootMidi, intervals };
}

/** Normalise a note name to a sharp spelling in NOTE_OFFSET, or null. */
function normalizeNote(note) {
  if (typeof note !== 'string') return null;
  let n = note.trim().toUpperCase().replace('♯', '#').replace('♭', 'b');
  const FLAT_TO_SHARP = { DB: 'C#', EB: 'D#', GB: 'F#', AB: 'G#', BB: 'A#', CB: 'B', FB: 'E' };
  if (n.length === 2 && n[1] === 'B') n = FLAT_TO_SHARP[n] || n;
  return n in NOTE_OFFSET ? n : null;
}
