/**
 * Standard MIDI File (SMF) writer — produces a Type-0 MIDI file
 * that opens in any DAW. We render the current pattern as a series
 * of note-on / note-off events, with delta-time encoding.
 *
 * Drum tracks use GM note numbers. Tonal tracks arpeggiate a
 * fixed minor pentatonic scale so the MIDI sounds musical when
 * dropped into a synth.
 *
 * @module core/midi-export
 */

import { TRACKS, TRACK_BY_ID } from '../data/tracks.js';
import { midiToFreq } from '../utils.js';

'use strict';

/** GM drum notes (channel 9). */
const DRUM_NOTES = {
  kick: 36, // Bass Drum 1
  snare: 38, // Acoustic Snare
  hat: 42, // Closed Hi-Hat
  clap: 39, // Hand Clap
  tom: 45, // Low Tom
  rim: 37, // Side Stick
};

/** Scales (semitone offsets from root). */
const SCALES = {
  minor: [0, 2, 3, 5, 7, 8, 10],
  major: [0, 2, 4, 5, 7, 9, 11],
  pentatonic: [0, 3, 5, 7, 10],
};

/** Choose note for a tonal track on a given step. */
function pickTonalNote(trackId, step, rootMidi) {
  const scale = SCALES.minor;
  const idx = step % scale.length;
  const oct = Math.floor(step / scale.length) % 3;
  let baseOctaveOffset = 0;
  if (trackId === 'sub') baseOctaveOffset = -24;
  else if (trackId === 'bass') baseOctaveOffset = -12;
  else if (trackId === 'pad') baseOctaveOffset = -12;
  else if (trackId === 'pluck') baseOctaveOffset = 0;
  return rootMidi + baseOctaveOffset + scale[idx] + oct * 12;
}

/** Encode a variable-length quantity (delta time). */
function vlq(n) {
  const buf = [];
  let value = n & 0x0fffffff;
  buf.push(value & 0x7f);
  value >>= 7;
  while (value > 0) {
    buf.unshift((value & 0x7f) | 0x80);
    value >>= 7;
  }
  return buf;
}

function u32(n) {
  return [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
}

function u16(n) {
  return [(n >>> 8) & 0xff, n & 0xff];
}

function strBytes(s) {
  return s.split('').map((c) => c.charCodeAt(0));
}

function chunk(type, data) {
  return [...strBytes(type), ...u32(data.length), ...data];
}

/**
 * Build MIDI bytes for a single pattern repeated `bars` times.
 *
 * @param {Object} pattern - { trackId: bool[16] }
 * @param {Object} [opts]
 * @param {number} [opts.bpm=120]
 * @param {number} [opts.swing=0]
 * @param {number} [opts.bars=4]
 * @param {number} [opts.rootMidi=60]
 * @returns {Uint8Array}
 */
export function patternToMidi(pattern, opts = {}) {
  if (!pattern || typeof pattern !== 'object') {
    throw new Error('patternToMidi: invalid pattern');
  }

  const bpm = opts.bpm ?? 120;
  const swing = opts.swing ?? 0;
  const bars = opts.bars ?? 4;
  const rootMidi = opts.rootMidi ?? 60;

  // ticks per quarter note
  const TPN = 480;
  // 16th-note ticks
  const stepTicks = TPN / 4; // 120

  const events = [];

  // Tempo event (meta)
  const microsPerQ = Math.round(60_000_000 / bpm);
  events.push({
    absTick: 0,
    bytes: [0xff, 0x51, 0x03, (microsPerQ >> 16) & 0xff, (microsPerQ >> 8) & 0xff, microsPerQ & 0xff],
  });

  // Time signature 4/4
  events.push({ absTick: 0, bytes: [0xff, 0x58, 0x04, 0x04, 0x02, 0x18, 0x08] });

  // Track name
  events.push({ absTick: 0, bytes: [0xff, 0x03, ...vlq(11), ...strBytes('Nebula Beat')] });

  // For each step, schedule note events
  const totalSteps = 16 * bars;
  for (let step = 0; step < totalSteps; step++) {
    const barStep = step % 16;
    const swingOffset = barStep % 2 === 1 ? Math.round(stepTicks * swing) : 0;
    const baseTick = step * stepTicks + swingOffset;

    // determine note duration in ticks (almost a step long, slightly shorter)
    const noteDur = Math.round(stepTicks * 0.85);

    for (let ti = 0; ti < TRACKS.length; ti++) {
      const tr = TRACKS[ti];
      if (!pattern[tr.id] || !pattern[tr.id][barStep]) continue;

      let note, channel, velocity;
      if (tr.kind === 'drum') {
        note = DRUM_NOTES[tr.id] ?? 60;
        channel = 9; // GM drum channel
        velocity = tr.id === 'kick' ? 110 : tr.id === 'snare' ? 100 : tr.id === 'clap' ? 95 : 80;
      } else {
        note = pickTonalNote(tr.id, barStep, rootMidi);
        channel = ti % 8; // distribute across channels (avoid drum channel)
        velocity = tr.kind === 'lead' ? 95 : tr.kind === 'pluck' ? 90 : 70;
      }

      // Note on
      events.push({
        absTick: baseTick,
        bytes: [0x90 | (channel & 0x0f), note & 0x7f, velocity & 0x7f],
      });
      // Note off
      events.push({
        absTick: baseTick + noteDur,
        bytes: [0x80 | (channel & 0x0f), note & 0x7f, 0x40],
      });
    }
  }

  // Sort by absTick, encode delta times
  events.sort((a, b) => a.absTick - b.absTick);

  const trackData = [];
  let lastTick = 0;
  for (const ev of events) {
    const delta = ev.absTick - lastTick;
    trackData.push(...vlq(delta), ...ev.bytes);
    lastTick = ev.absTick;
  }
  // End-of-track meta
  trackData.push(...vlq(0), 0xff, 0x2f, 0x00);

  // Header chunk
  const header = chunk('MThd', [...u16(0), ...u16(1), ...u16(TPN)]); // format 0, 1 track
  const track = chunk('MTrk', trackData);

  return new Uint8Array([...header, ...track]);
}

/**
 * Wrap the result as a Blob.
 */
export function patternToMidiBlob(pattern, opts) {
  try {
    return new Blob([patternToMidi(pattern, opts)], { type: 'audio/midi' });
  } catch (e) {
    console.warn('[midi-export] failed to build MIDI blob', e);
    throw new Error('MIDI file construction failed: ' + (e?.message || 'unknown error'));
  }
}