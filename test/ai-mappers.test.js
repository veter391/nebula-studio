import { describe, it, expect } from 'vitest';
import { spaceToFx, toneToFilter, keyToMusicalKey } from '../src/ai-mappers.js';

describe('spaceToFx — descriptor -> reverb/delay', () => {
  it('maps each known descriptor to in-range reverb+delay', () => {
    for (const s of ['dry', 'medium', 'spacious', 'cavernous']) {
      const fx = spaceToFx(s);
      expect(fx.reverb).toBeGreaterThanOrEqual(0);
      expect(fx.reverb).toBeLessThanOrEqual(100);
      expect(fx.delay).toBeGreaterThanOrEqual(0);
      expect(fx.delay).toBeLessThanOrEqual(100);
    }
  });
  it('more space = more reverb (dry < spacious < cavernous)', () => {
    expect(spaceToFx('dry').reverb).toBeLessThan(spaceToFx('spacious').reverb);
    expect(spaceToFx('spacious').reverb).toBeLessThan(spaceToFx('cavernous').reverb);
  });
  it('is case-insensitive and returns null for anything unknown', () => {
    expect(spaceToFx('SPACIOUS')).toEqual(spaceToFx('spacious'));
    expect(spaceToFx('wubwub')).toBeNull();
    expect(spaceToFx(undefined)).toBeNull();
  });
});

describe('toneToFilter — descriptor -> cutoff Hz', () => {
  it('darker = lower cutoff, brighter = higher', () => {
    expect(toneToFilter('dark')).toBeLessThan(toneToFilter('warm'));
    expect(toneToFilter('warm')).toBeLessThan(toneToFilter('neutral'));
    expect(toneToFilter('neutral')).toBeLessThan(toneToFilter('bright'));
  });
  it('stays within the filter range and returns null for unknown', () => {
    expect(toneToFilter('dark')).toBeGreaterThanOrEqual(200);
    expect(toneToFilter('bright')).toBeLessThanOrEqual(12000);
    expect(toneToFilter('spicy')).toBeNull();
  });
});

describe('keyToMusicalKey — note + scale -> {rootMidi, intervals}', () => {
  it('maps C minor to root C3 (48) with natural-minor intervals', () => {
    expect(keyToMusicalKey('C', 'minor')).toEqual({ rootMidi: 48, intervals: [0, 2, 3, 5, 7, 8, 10] });
  });
  it('maps A major to root A3 (57) with major intervals', () => {
    expect(keyToMusicalKey('A', 'major')).toEqual({ rootMidi: 57, intervals: [0, 2, 4, 5, 7, 9, 11] });
  });
  it('accepts sharps and normalises common flats (Eb -> D#)', () => {
    expect(keyToMusicalKey('F#', 'minor').rootMidi).toBe(48 + 6);
    expect(keyToMusicalKey('Eb', 'minor').rootMidi).toBe(48 + 3); // D#
  });
  it('defaults to minor for an unknown scale, returns null for an unknown note', () => {
    expect(keyToMusicalKey('C', 'phrygian').intervals).toEqual([0, 2, 3, 5, 7, 8, 10]);
    expect(keyToMusicalKey('H', 'minor')).toBeNull(); // H is not a note name
    expect(keyToMusicalKey(undefined, 'minor')).toBeNull();
  });
});
