import { describe, it, expect } from 'vitest';
import { audioBufferToWav } from '../src/core/wav-encoder.js';

/** Minimal fake AudioBuffer — just enough surface for the encoder. */
function fakeAudioBuffer({ numberOfChannels = 1, length = 4, sampleRate = 44100, fill = 0 } = {}) {
  const channels = Array.from({ length: numberOfChannels }, () => {
    const arr = new Float32Array(length);
    arr.fill(fill);
    return arr;
  });
  return {
    numberOfChannels,
    length,
    sampleRate,
    getChannelData: (i) => channels[i],
  };
}

async function readHeaderString(blob, offset, len) {
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf, offset, len);
  return String.fromCharCode(...bytes);
}

describe('audioBufferToWav', () => {
  it('throws on invalid input instead of returning a bogus file', () => {
    expect(() => audioBufferToWav(null)).toThrow(/invalid AudioBuffer/);
    expect(() => audioBufferToWav({})).toThrow(/invalid AudioBuffer/);
  });

  it('produces a valid RIFF/WAVE header', async () => {
    const blob = audioBufferToWav(fakeAudioBuffer());
    expect(await readHeaderString(blob, 0, 4)).toBe('RIFF');
    expect(await readHeaderString(blob, 8, 4)).toBe('WAVE');
    expect(await readHeaderString(blob, 12, 4)).toBe('fmt ');
    expect(await readHeaderString(blob, 36, 4)).toBe('data');
  });

  it('sizes the file correctly: 44-byte header + 2 bytes per sample per channel', async () => {
    const buffer = fakeAudioBuffer({ numberOfChannels: 2, length: 10 });
    const blob = audioBufferToWav(buffer);
    expect(blob.size).toBe(44 + 10 * 2 * 2);
  });

  it('encodes the declared sample rate and channel count into the fmt chunk', async () => {
    const buffer = fakeAudioBuffer({ numberOfChannels: 2, length: 4, sampleRate: 48000 });
    const blob = audioBufferToWav(buffer);
    const view = new DataView(await blob.arrayBuffer());
    expect(view.getUint16(22, true)).toBe(2); // numChannels
    expect(view.getUint32(24, true)).toBe(48000); // sampleRate
    expect(view.getUint16(34, true)).toBe(16); // bits per sample
  });

  it('clamps out-of-range samples instead of wrapping/corrupting them', async () => {
    const buffer = fakeAudioBuffer({ numberOfChannels: 1, length: 1, fill: 5.0 }); // way above [-1, 1]
    const blob = audioBufferToWav(buffer);
    const view = new DataView(await blob.arrayBuffer());
    const sample = view.getInt16(44, true);
    expect(sample).toBe(0x7fff); // clamped to max positive 16-bit value
  });
});
