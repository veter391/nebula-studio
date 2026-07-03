import { describe, it, expect } from 'vitest';
import { patternToMidi, patternToMidiBlob } from '../src/core/midi-export.js';
import { TRACK_IDS } from '../src/data/tracks.js';

function emptyPattern() {
  const p = {};
  for (const id of TRACK_IDS) p[id] = new Array(16).fill(0);
  return p;
}

describe('patternToMidi', () => {
  it('throws on invalid input', () => {
    expect(() => patternToMidi(null)).toThrow(/invalid pattern/);
    expect(() => patternToMidi('not an object')).toThrow(/invalid pattern/);
  });

  it('produces a valid MThd/MTrk Standard MIDI File structure', () => {
    const bytes = patternToMidi(emptyPattern());
    const str = (start, len) => String.fromCharCode(...bytes.slice(start, start + len));
    expect(str(0, 4)).toBe('MThd');
    // header length is always 6, format 0, 1 track
    expect(bytes[8]).toBe(0); // format high byte
    expect(bytes[9]).toBe(0); // format low byte -> format 0
    expect(bytes[10]).toBe(0);
    expect(bytes[11]).toBe(1); // ntrks = 1
    expect(str(14, 4)).toBe('MTrk');
  });

  it('an empty pattern still ends with a well-formed end-of-track meta event', () => {
    const bytes = patternToMidi(emptyPattern());
    // last 3 bytes of a minimal SMF end-of-track event: FF 2F 00 (preceded by a delta-time VLQ byte)
    const tail = Array.from(bytes.slice(-3));
    expect(tail).toEqual([0xff, 0x2f, 0x00]);
  });

  it('a single active step produces a note-on and matching note-off event', () => {
    const pattern = emptyPattern();
    pattern.kick[0] = 1;
    const bytes = patternToMidi(pattern, { bars: 1 });
    // status byte 0x90-0x9f = note on, channel 9 (drums) => 0x99
    const hasNoteOn = Array.from(bytes).some((b) => b === 0x99);
    const hasNoteOff = Array.from(bytes).some((b) => b === 0x89);
    expect(hasNoteOn).toBe(true);
    expect(hasNoteOff).toBe(true);
  });

  it('respects the bars option — more bars means more bytes for a busy pattern', () => {
    const pattern = emptyPattern();
    pattern.hat = new Array(16).fill(1);
    const oneBar = patternToMidi(pattern, { bars: 1 });
    const fourBars = patternToMidi(pattern, { bars: 4 });
    expect(fourBars.length).toBeGreaterThan(oneBar.length);
  });

  it('is deterministic — same pattern and options produce byte-identical output', () => {
    const pattern = emptyPattern();
    pattern.kick[0] = 1;
    pattern.snare[4] = 1;
    const a = patternToMidi(pattern, { bpm: 128, bars: 2 });
    const b = patternToMidi(pattern, { bpm: 128, bars: 2 });
    expect(Array.from(a)).toEqual(Array.from(b));
  });
});

describe('patternToMidiBlob', () => {
  it('wraps the bytes in a Blob with the correct MIME type', () => {
    const blob = patternToMidiBlob(emptyPattern());
    expect(blob.type).toBe('audio/midi');
    expect(blob.size).toBeGreaterThan(0);
  });

  it('surfaces a clear error instead of an opaque failure on invalid input', () => {
    expect(() => patternToMidiBlob(undefined)).toThrow(/MIDI file construction failed/);
  });
});
