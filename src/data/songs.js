/**
 * Play-along exercises for the Learn tab's practice mode.
 *
 * IMPORTANT — why these are original exercises, not a well-known song:
 * we looked into transcribing a recognizable tune (Jingle Bells) and found
 * two different reference sources disagreeing on the note sequence for the
 * same opening phrase. Rather than ship a guess and label it "correct" in
 * a learning tool, these two exercises are self-composed and unambiguous
 * by construction (a scale and an arpeggio have exactly one correct
 * answer). A verified, real transcription (from an actual MIDI file, not
 * a scraped page) can replace/extend this list later — the data shape
 * below is designed to make that a drop-in addition.
 *
 * Each note: { midi, beat, duration } — `beat` and `duration` are in
 * quarter-note units from the start of the exercise. All exercises stay
 * within octave 4 (MIDI 60-72) so the on-screen keyboard's default octave
 * always shows the target key without the learner needing to change it.
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
    notes: [
      note(60, 0), note(64, 1), note(67, 2), note(72, 3, 2),
      note(67, 5), note(64, 6), note(60, 7, 2),
    ],
  },
];

export const SONGS_BY_ID = Object.fromEntries(SONGS.map((s) => [s.id, s]));
