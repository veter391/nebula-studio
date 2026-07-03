import { describe, it, expect } from 'vitest';
import { SONGS, SONGS_BY_ID } from '../src/data/songs.js';
import { midiToName } from '../src/utils.js';

describe('song pack data integrity', () => {
  it('every song has at least one note and a positive bpm', () => {
    expect(SONGS.length).toBeGreaterThan(0);
    for (const song of SONGS) {
      expect(song.notes.length).toBeGreaterThan(0);
      expect(song.bpm).toBeGreaterThan(0);
    }
  });

  it('every note stays within octave 4 (MIDI 60-72) so the default keyboard octave always shows it', () => {
    for (const song of SONGS) {
      for (const n of song.notes) {
        expect(n.midi).toBeGreaterThanOrEqual(60);
        expect(n.midi).toBeLessThanOrEqual(72);
      }
    }
  });

  it('every note has a positive duration and non-negative beat offset', () => {
    for (const song of SONGS) {
      for (const n of song.notes) {
        expect(n.beat).toBeGreaterThanOrEqual(0);
        expect(n.duration).toBeGreaterThan(0);
      }
    }
  });

  it('SONGS_BY_ID indexes every song by its id', () => {
    for (const song of SONGS) {
      expect(SONGS_BY_ID[song.id]).toBe(song);
    }
  });

  it('the C major scale is actually a C major scale (sanity check the hand-authored data)', () => {
    const scale = SONGS_BY_ID['c-major-scale'];
    const names = scale.notes.slice(0, 8).map((n) => midiToName(n.midi));
    expect(names).toEqual(['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4', 'C5']);
  });

  it('the arpeggio is actually a C major triad (C-E-G)', () => {
    const arp = SONGS_BY_ID['c-major-arpeggio'];
    const firstFour = arp.notes.slice(0, 4).map((n) => midiToName(n.midi));
    expect(firstFour).toEqual(['C4', 'E4', 'G4', 'C5']);
  });
});
