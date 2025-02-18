/**
 * Track definitions for the sequencer.
 *
 * Each track has:
 *  - id: stable string identifier (used as DOM id and for storage)
 *  - name: short uppercase label shown in the UI
 *  - kind: voice category — drum / bass / lead / pad / fx
 *  - voice: function id from core/voices.js
 *  - color: CSS variable name (resolved against the active theme)
 *  - defaultGain: 0..1
 *  - octaves: optional — for tonal voices, default playback octave
 *
 * @module data/tracks
 */

export const TRACKS = [
  {
    id: 'kick',
    name: 'KICK',
    kind: 'drum',
    voice: 'kick',
    color: '--c-rose',
    defaultGain: 0.95,
  },
  {
    id: 'snare',
    name: 'SNARE',
    kind: 'drum',
    voice: 'snare',
    color: '--c-amber',
    defaultGain: 0.7,
  },
  {
    id: 'hat',
    name: 'HI-HAT',
    kind: 'drum',
    voice: 'hat',
    color: '--c-yellow',
    defaultGain: 0.42,
  },
  {
    id: 'clap',
    name: 'CLAP',
    kind: 'drum',
    voice: 'clap',
    color: '--c-lime',
    defaultGain: 0.55,
  },
  {
    id: 'tom',
    name: 'TOM',
    kind: 'drum',
    voice: 'tom',
    color: '--c-orange',
    defaultGain: 0.7,
  },
  {
    id: 'rim',
    name: 'RIM',
    kind: 'drum',
    voice: 'rim',
    color: '--c-peach',
    defaultGain: 0.5,
  },
  {
    id: 'sub',
    name: 'SUB',
    kind: 'bass',
    voice: 'sub',
    color: '--c-cyan',
    defaultGain: 0.65,
    octaves: [1, 2],
  },
  {
    id: 'bass',
    name: 'BASS',
    kind: 'bass',
    voice: 'bass',
    color: '--c-sky',
    defaultGain: 0.7,
    octaves: [1, 2, 3],
  },
  {
    id: 'lead',
    name: 'LEAD',
    kind: 'lead',
    voice: 'lead',
    color: '--c-violet',
    defaultGain: 0.5,
    octaves: [3, 4, 5],
  },
  {
    id: 'pluck',
    name: 'PLUCK',
    kind: 'lead',
    voice: 'pluck',
    color: '--c-magenta',
    defaultGain: 0.55,
    octaves: [3, 4, 5],
  },
  {
    id: 'pad',
    name: 'PAD',
    kind: 'pad',
    voice: 'pad',
    color: '--c-pink',
    defaultGain: 0.5,
    octaves: [3, 4],
  },
  {
    id: 'fx',
    name: 'FX',
    kind: 'fx',
    voice: 'fx',
    color: '--c-aqua',
    defaultGain: 0.6,
  },
];

export const TRACK_IDS = TRACKS.map((t) => t.id);

export const TRACK_BY_ID = Object.fromEntries(TRACKS.map((t) => [t.id, t]));