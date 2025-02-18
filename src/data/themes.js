/**
 * Theme tokens. Each theme is a set of CSS custom-property overrides
 * applied to :root via inline style. The defaults are in styles.css.
 *
 * @module data/themes
 */

export const THEMES = [
  {
    id: 'cosmic',
    name: 'Cosmic',
    description: 'Deep space · cyan · magenta',
    tokens: {
      '--bg-0': '#05010d',
      '--bg-1': '#0a0014',
      '--bg-2': '#11042b',
      '--line': 'rgba(255, 255, 255, 0.08)',
      '--line-strong': 'rgba(255, 255, 255, 0.18)',
      '--text': '#ecf0ff',
      '--text-dim': 'rgba(236, 240, 255, 0.6)',
      '--text-mute': 'rgba(236, 240, 255, 0.35)',
      '--accent': '#00f5ff',
      '--accent-2': '#ff3df0',
      '--aurora-1': '#8b5cf6',
      '--aurora-2': '#00f5ff',
      '--aurora-3': '#ff3df0',
    },
  },
  {
    id: 'light',
    name: 'Light',
    description: 'Soft pearl · daylight',
    tokens: {
      '--bg-0': '#f4f1ff',
      '--bg-1': '#ffffff',
      '--bg-2': '#e9e3ff',
      '--line': 'rgba(20, 10, 50, 0.12)',
      '--line-strong': 'rgba(20, 10, 50, 0.24)',
      '--text': '#1a1238',
      '--text-dim': 'rgba(26, 18, 56, 0.65)',
      '--text-mute': 'rgba(26, 18, 56, 0.4)',
      '--accent': '#7c3aed',
      '--accent-2': '#ec4899',
      '--aurora-1': '#a78bfa',
      '--aurora-2': '#22d3ee',
      '--aurora-3': '#f9a8d4',
    },
  },
  {
    id: 'sunset',
    name: 'Sunset',
    description: 'Warm coral · dusk',
    tokens: {
      '--bg-0': '#1a0a08',
      '--bg-1': '#2a110d',
      '--bg-2': '#3a1a14',
      '--line': 'rgba(255, 220, 180, 0.1)',
      '--line-strong': 'rgba(255, 220, 180, 0.22)',
      '--text': '#fff2e3',
      '--text-dim': 'rgba(255, 242, 227, 0.65)',
      '--text-mute': 'rgba(255, 242, 227, 0.4)',
      '--accent': '#ff8a3d',
      '--accent-2': '#ffd166',
      '--aurora-1': '#ff5e7a',
      '--aurora-2': '#ffb84d',
      '--aurora-3': '#ff3df0',
    },
  },
  {
    id: 'matrix',
    name: 'Matrix',
    description: 'Terminal · phosphor green',
    tokens: {
      '--bg-0': '#000800',
      '--bg-1': '#001a0a',
      '--bg-2': '#002814',
      '--line': 'rgba(184, 255, 92, 0.12)',
      '--line-strong': 'rgba(184, 255, 92, 0.28)',
      '--text': '#b8ff5c',
      '--text-dim': 'rgba(184, 255, 92, 0.7)',
      '--text-mute': 'rgba(184, 255, 92, 0.4)',
      '--accent': '#b8ff5c',
      '--accent-2': '#00ff9d',
      '--aurora-1': '#00ff9d',
      '--aurora-2': '#b8ff5c',
      '--aurora-3': '#ffe066',
    },
  },
];

export const DEFAULT_THEME = 'cosmic';