import { describe, it, expect } from 'vitest';
import { generatePattern, generateChordProgression, AI } from '../src/ai.js';

describe('generatePattern (procedural generator)', () => {
  it('is deterministic — same genre + seed always produces the same pattern', () => {
    const a = generatePattern('techno', 12345);
    const b = generatePattern('techno', 12345);
    expect(a).toEqual(b);
  });

  it('different seeds produce different patterns for the same genre', () => {
    const a = generatePattern('techno', 1);
    const b = generatePattern('techno', 2);
    expect(a.pattern).not.toEqual(b.pattern);
  });

  it('maps known genres to their documented BPM', () => {
    expect(generatePattern('house', 1).bpm).toBe(124);
    expect(generatePattern('trap', 1).bpm).toBe(140);
    expect(generatePattern('ambient', 1).bpm).toBe(72);
  });

  it('falls back to the default profile for an unknown genre instead of throwing', () => {
    expect(() => generatePattern('not-a-real-genre', 1)).not.toThrow();
    const result = generatePattern('not-a-real-genre', 1);
    expect(result.bpm).toBe(120); // default BPM
  });

  it('every pattern track is exactly 16 steps of 0/1', () => {
    const { pattern } = generatePattern('funk', 42);
    for (const [, steps] of Object.entries(pattern)) {
      expect(steps).toHaveLength(16);
      for (const v of steps) expect([0, 1]).toContain(v);
    }
  });

  it('AI.genres only lists genres that actually have a working profile', () => {
    for (const g of AI.genres) {
      expect(() => generatePattern(g, 1)).not.toThrow();
    }
  });
});

describe('generateChordProgression', () => {
  it('builds the correct number of chords for the progression', () => {
    const chords = generateChordProgression('I-V-vi-IV', 'minor', 60);
    expect(chords).toHaveLength(4);
  });

  it('applies the chord type intervals on top of each scale-degree root', () => {
    // I-V-vi-IV in semitone offsets from utils.js: [0, 7, 9, 5]
    // minor chord intervals: [0, 3, 7]
    const chords = generateChordProgression('I-V-vi-IV', 'minor', 60);
    expect(chords[0].chord).toEqual([60, 63, 67]); // root position, C minor at MIDI 60
    expect(chords[1].chord).toEqual([67, 70, 74]); // V degree (+7 semitones)
  });

  it('falls back to sane defaults for an unknown progression/chord name', () => {
    expect(() => generateChordProgression('not-a-real-progression', 'not-a-real-type', 60)).not.toThrow();
  });

  it('every chord comes with an 8-note arpeggio', () => {
    const chords = generateChordProgression('ii-V-I', 'maj7', 60);
    for (const c of chords) expect(c.arpeggio).toHaveLength(8);
  });
});
