import { describe, it, expect, vi } from 'vitest';
import {
  clamp,
  lerp,
  remap,
  formatBytes,
  formatTime,
  freqToMidi,
  midiToFreq,
  midiToName,
  Emitter,
} from '../src/utils.js';

describe('clamp', () => {
  it('keeps values inside range unchanged', () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });
  it('clamps below the minimum', () => {
    expect(clamp(-5, 0, 10)).toBe(0);
  });
  it('clamps above the maximum', () => {
    expect(clamp(15, 0, 10)).toBe(10);
  });
});

describe('lerp', () => {
  it('interpolates at t=0 and t=1', () => {
    expect(lerp(0, 100, 0)).toBe(0);
    expect(lerp(0, 100, 1)).toBe(100);
  });
  it('interpolates at the midpoint', () => {
    expect(lerp(0, 100, 0.5)).toBe(50);
  });
});

describe('remap', () => {
  it('maps a value from one range to another', () => {
    expect(remap(5, 0, 10, 0, 100)).toBe(50);
    expect(remap(0, 0, 10, 100, 200)).toBe(100);
  });
});

describe('formatBytes', () => {
  it('formats sub-1KB as bytes', () => {
    expect(formatBytes(512)).toBe('512 B');
  });
  it('formats KB range', () => {
    expect(formatBytes(2048)).toBe('2.0 KB');
  });
  it('formats MB range', () => {
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.00 MB');
  });
});

describe('formatTime', () => {
  it('formats sub-minute durations', () => {
    expect(formatTime(45000)).toBe('00:45');
  });
  it('formats minute+ durations', () => {
    expect(formatTime(125000)).toBe('02:05');
  });
  it('never goes negative', () => {
    expect(formatTime(-500)).toBe('00:00');
  });
});

describe('freqToMidi / midiToFreq round-trip', () => {
  it('A4 (440Hz) is MIDI note 69', () => {
    expect(midiToFreq(69)).toBeCloseTo(440, 5);
    expect(freqToMidi(440)).toBeCloseTo(69, 5);
  });
  it('round-trips within floating point tolerance', () => {
    for (const note of [21, 40, 60, 69, 88, 108]) {
      const freq = midiToFreq(note);
      expect(freqToMidi(freq)).toBeCloseTo(note, 5);
    }
  });
});

describe('midiToName', () => {
  it('names middle C (60) as C4', () => {
    expect(midiToName(60)).toBe('C4');
  });
  it('names A4 (69) as A4', () => {
    expect(midiToName(69)).toBe('A4');
  });
  it('wraps octaves correctly', () => {
    expect(midiToName(72)).toBe('C5');
    expect(midiToName(48)).toBe('C3');
  });
});

describe('Emitter', () => {
  it('calls registered listeners with the payload', () => {
    const e = new Emitter();
    const fn = vi.fn();
    e.on('tick', fn);
    e.emit('tick', { n: 1 });
    expect(fn).toHaveBeenCalledWith({ n: 1 });
  });

  it('stops calling a listener after off()', () => {
    const e = new Emitter();
    const fn = vi.fn();
    e.on('tick', fn);
    e.off('tick', fn);
    e.emit('tick');
    expect(fn).not.toHaveBeenCalled();
  });

  it('the unsubscribe function returned by on() also works', () => {
    const e = new Emitter();
    const fn = vi.fn();
    const unsub = e.on('tick', fn);
    unsub();
    e.emit('tick');
    expect(fn).not.toHaveBeenCalled();
  });

  it('one listener throwing does not stop other listeners from running', () => {
    const e = new Emitter();
    const bad = vi.fn(() => {
      throw new Error('boom');
    });
    const good = vi.fn();
    e.on('tick', bad);
    e.on('tick', good);
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    e.emit('tick');
    expect(good).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});
