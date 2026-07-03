/**
 * Learn tab — "Play Along" practice mode.
 *
 * Shows a scrolling note timeline (which note, and when, in beats) plus a
 * live "press this key now" indicator, and checks real key presses (via
 * engine's 'trigger' event, which now carries the played MIDI note)
 * against the expected note within a timing tolerance.
 *
 * This is a practice/follow-along aid, not a strict pass/fail game — it
 * tracks and shows hit/miss feedback, but never blocks progress. The
 * clock driving the timeline is a plain JS clock (performance.now()),
 * not the Web Audio clock — that's an intentional, honest simplification:
 * this mode doesn't play back audio itself, it only listens for notes the
 * learner triggers on the keyboard panel, so sample-accurate sync isn't
 * needed here the way it is for the sequencer.
 *
 * @module ui/play-along
 */

import { engine } from '../core/engine.js';
import { midiToName } from '../utils.js';
import { keyForSemitone, setKeyboardModeExternal, isKeyboardModeActive } from './keyboard.js';
import { SONGS } from '../data/songs.js';

const HIT_WINDOW_BEATS = 0.6; // how close (in beats) a keypress must land to count as a "hit"

export function mountPlayAlong(host) {
  host.innerHTML = `
    <header class="card__head">
      <h2>PLAY ALONG</h2>
      <span class="card__hint">practice mode — press the highlighted key on time</span>
    </header>
    <div class="pa__picker" id="paPicker"></div>
    <div class="pa__stage" id="paStage" hidden>
      <div class="pa__now">
        <span class="pa__now-label">NOW</span>
        <span class="pa__now-note" id="paNowNote">—</span>
        <span class="pa__now-key" id="paNowKey"></span>
      </div>
      <div class="pa__highway" id="paHighway">
        <div class="pa__playhead"></div>
        <div class="pa__lane" id="paLane"></div>
      </div>
      <div class="pa__controls">
        <span class="pa__score" id="paScore">0 hit · 0 missed</span>
        <button class="ai-btn" id="paStop">Stop</button>
      </div>
    </div>
  `;

  const picker = host.querySelector('#paPicker');
  const stage = host.querySelector('#paStage');
  const lane = host.querySelector('#paLane');
  const nowNoteEl = host.querySelector('#paNowNote');
  const nowKeyEl = host.querySelector('#paNowKey');
  const scoreEl = host.querySelector('#paScore');
  const stopBtn = host.querySelector('#paStop');

  picker.innerHTML = SONGS.map(
    (s) => `
      <button class="pa__song" data-song="${s.id}">
        <span class="pa__song-name">${s.name}</span>
        <span class="pa__song-desc">${s.description}</span>
      </button>
    `
  ).join('');

  let session = null; // { song, startTime, raf, hits, misses, offTrigger, wasKeyboardModeActive }

  picker.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-song]');
    if (!btn) return;
    startSession(SONGS.find((s) => s.id === btn.dataset.song));
  });

  stopBtn.addEventListener('click', stopSession);

  function startSession(song) {
    if (session) stopSession();

    const wasKeyboardModeActive = isKeyboardModeActive();
    if (!wasKeyboardModeActive) setKeyboardModeExternal(true);

    lane.innerHTML = song.notes
      .map((n) => `<div class="pa__note" data-beat="${n.beat}" data-midi="${n.midi}" style="left:${n.beat * 60}px; width:${n.duration * 60 - 4}px;">${midiToName(n.midi)}</div>`)
      .join('');

    const totalBeats = Math.max(...song.notes.map((n) => n.beat + n.duration));
    lane.style.width = `${totalBeats * 60 + 200}px`;

    session = {
      song,
      startTime: performance.now(),
      hits: 0,
      misses: 0,
      hitNoteIndices: new Set(),
      wasKeyboardModeActive,
    };

    session.offTrigger = engine.on('trigger', (e) => {
      if (!session || typeof e.midi !== 'number') return;
      const beatsElapsed = msToBeats(performance.now() - session.startTime, song.bpm);
      const idx = song.notes.findIndex(
        (n, i) => !session.hitNoteIndices.has(i) && n.midi === e.midi && Math.abs(n.beat - beatsElapsed) <= HIT_WINDOW_BEATS
      );
      if (idx >= 0) {
        session.hitNoteIndices.add(idx);
        session.hits++;
        lane.children[idx]?.classList.add('is-hit');
      }
      updateScore();
    });

    stage.hidden = false;
    picker.hidden = true;
    tick();
  }

  function tick() {
    if (!session) return;
    const beatsElapsed = msToBeats(performance.now() - session.startTime, session.song.bpm);
    const highway = host.querySelector('#paHighway');
    const playheadOffset = highway.clientWidth * 0.25;
    lane.style.transform = `translateX(${playheadOffset - beatsElapsed * 60}px)`;

    const current = session.song.notes.find((n) => beatsElapsed >= n.beat && beatsElapsed < n.beat + n.duration);
    if (current) {
      nowNoteEl.textContent = midiToName(current.midi);
      // The exercises are all within octave 4 (MIDI 60-72); map back to a
      // 0-23 semitone offset the same way keyboard.js's own KEY_MAP does.
      const semitone = current.midi - 60;
      nowKeyEl.textContent = semitone >= 0 && semitone <= 23 ? `press [${keyForSemitone(semitone) || '?'}]` : '';
    } else {
      nowNoteEl.textContent = '—';
      nowKeyEl.textContent = '';
    }

    // Count any note whose window has fully passed without a hit as missed, once.
    session.song.notes.forEach((n, i) => {
      if (!session.hitNoteIndices.has(i) && beatsElapsed > n.beat + HIT_WINDOW_BEATS && !lane.children[i]?.classList.contains('is-miss')) {
        lane.children[i]?.classList.add('is-miss');
        session.misses++;
        updateScore();
      }
    });

    const totalBeats = Math.max(...session.song.notes.map((n) => n.beat + n.duration));
    if (beatsElapsed > totalBeats + 2) {
      stopSession();
      return;
    }
    session.raf = requestAnimationFrame(tick);
  }

  function updateScore() {
    scoreEl.textContent = `${session.hits} hit · ${session.misses} missed`;
  }

  function stopSession() {
    if (!session) return;
    cancelAnimationFrame(session.raf);
    session.offTrigger?.();
    if (!session.wasKeyboardModeActive) setKeyboardModeExternal(false);
    session = null;
    stage.hidden = true;
    picker.hidden = false;
  }

  function msToBeats(ms, bpm) {
    return (ms / 1000) * (bpm / 60);
  }

  return {
    unmount() {
      stopSession();
    },
  };
}
