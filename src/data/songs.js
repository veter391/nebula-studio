/**
 * Play-along exercises for the Learn tab's practice mode.
 *
 * IMPORTANT — why these are original exercises, not a well-known song:
 * we looked into transcribing a recognizable tune (Jingle Bells) and found
 * two different reference sources disagreeing on the note sequence for the
 * same opening phrase. Rather than ship a guess and label it "correct" in
 * a learning tool, every exercise here is self-composed and unambiguous
 * by construction (scales, arpeggios, an interval call-and-response and a
 * pentatonic run each have exactly one correct answer). A verified, real
 * transcription (from an actual MIDI file, not a scraped page) can
 * replace/extend this list later — the data shape below is designed to
 * make that a drop-in addition.
 *
 * Each note: { midi, beat, duration } — `beat` and `duration` are in
 * quarter-note units from the start of the exercise. All exercises stay
 * within octave 4 (MIDI 60-72) so the on-screen keyboard's default octave
 * always shows the target key without the learner needing to change it.
 *
 * `backingGenre` / `backingSeed` pick a deterministic drum pattern from
 * ai.js's generatePattern() to play underneath the exercise. The genre is
 * chosen so its fixed BPM sits within ~15% of the exercise's own bpm, and
 * the seed is verified to produce a non-degenerate pattern.
 *
 * @module data/songs
 */

const note = (midi, beat, duration = 1) => ({ midi, beat, duration });

export const SONGS = [
  {
    id: 'c-major-scale',
    name: 'C Major Scale',
    description: 'Up and down the white keys — the first thing every keyboard player learns.',
    bpm: 90,
    backingGenre: 'hip-hop',
    backingSeed: 1,
    notes: [
      note(60, 0), note(62, 1), note(64, 2), note(65, 3),
      note(67, 4), note(69, 5), note(71, 6), note(72, 7),
      note(71, 8), note(69, 9), note(67, 10), note(65, 11),
      note(64, 12), note(62, 13), note(60, 14, 2),
    ],
  },
  {
    id: 'c-major-arpeggio',
    name: 'C Major Arpeggio',
    description: 'The C major chord, one note at a time — up, then back down.',
    bpm: 100,
    backingGenre: 'funk',
    backingSeed: 1,
    notes: [
      note(60, 0), note(64, 1), note(67, 2), note(72, 3, 2),
      note(67, 5), note(64, 6), note(60, 7, 2),
    ],
  },
  {
    id: 'c-natural-minor-scale',
    name: 'C Natural Minor Scale',
    description: 'The same starting key as C major, but the flattened 3rd, 6th and 7th give it the darker minor colour. Up and back down.',
    bpm: 85,
    backingGenre: 'hip-hop',
    backingSeed: 3,
    notes: [
      note(60, 0), note(62, 1), note(63, 2), note(65, 3),
      note(67, 4), note(68, 5), note(70, 6), note(72, 7),
      note(70, 8), note(68, 9), note(67, 10), note(65, 11),
      note(63, 12), note(62, 13), note(60, 14, 2),
    ],
  },
  {
    id: 'c-minor-arpeggio',
    name: 'C Minor Arpeggio',
    description: 'The C minor triad one note at a time — C, E-flat, G — up then back down. The minor answer to the major arpeggio.',
    bpm: 96,
    backingGenre: 'hip-hop',
    backingSeed: 5,
    notes: [
      note(60, 0), note(63, 1), note(67, 2), note(72, 3, 2),
      note(67, 5), note(63, 6), note(60, 7, 2),
    ],
  },
  {
    id: 'c-dominant-7th-arpeggio',
    name: 'C Dominant 7th Arpeggio',
    description: 'A four-note chord: C, E, G and the flattened 7th (B-flat). One more note than a triad, so a slightly bigger stretch to hear.',
    bpm: 108,
    backingGenre: 'synthwave',
    backingSeed: 4,
    notes: [
      note(60, 0), note(64, 1), note(67, 2), note(70, 3),
      note(72, 4, 2), note(70, 6), note(67, 7), note(64, 8),
      note(60, 9, 2),
    ],
  },
  {
    id: 'perfect-fifths-call-response',
    name: 'Perfect Fifths — Call & Response',
    description: 'A low note answered by the note a perfect fifth above it, four times up the scale. Good for training the sound of a fifth.',
    bpm: 112,
    backingGenre: 'synthwave',
    backingSeed: 2,
    notes: [
      note(60, 0), note(67, 1), note(62, 2), note(69, 3),
      note(64, 4), note(71, 5), note(65, 6), note(72, 7, 2),
    ],
  },
  {
    id: 'c-major-pentatonic-run',
    name: 'C Major Pentatonic Run',
    description: 'The five-note major pentatonic (no 4th or 7th) — the safe, singable notes. Up and back down.',
    bpm: 120,
    backingGenre: 'pop',
    backingSeed: 1,
    notes: [
      note(60, 0), note(62, 1), note(64, 2), note(67, 3),
      note(69, 4), note(72, 5), note(69, 6), note(67, 7),
      note(64, 8), note(62, 9), note(60, 10, 2),
    ],
  },
  {
    id: 'stepwise-rhythm-steps',
    name: 'Rhythm Steps',
    description: 'A stepwise walk up and down the C major scale mixing half-beat and full-beat notes, to practise changing note length rather than pitch leaps.',
    bpm: 74,
    backingGenre: 'ambient',
    backingSeed: 7,
    notes: [
      note(60, 0, 0.5), note(62, 0.5, 0.5), note(64, 1, 1),
      note(65, 2, 0.5), note(67, 2.5, 0.5), note(69, 3, 1),
      note(67, 4, 0.5), note(65, 4.5, 0.5), note(64, 5, 1),
      note(62, 6, 0.5), note(60, 6.5, 0.5), note(60, 7, 1),
    ],
  },
];

export const SONGS_BY_ID = Object.fromEntries(SONGS.map((s) => [s.id, s]));
