/**
 * Play Along — practice mode that lives across two places on purpose:
 *
 *   - The song PICKER lives in the Learn tab (browsing/choosing an exercise
 *     belongs with the other lesson content).
 *   - The active practice STAGE lives at the bottom of the main Pattern
 *     screen, not in a separate tab. Starting a song switches you there,
 *     loads a matching backing beat into the real sequencer (the same
 *     squares you already use), and starts it playing — so from the first
 *     second it's visibly and audibly one instrument (drum grid + keys),
 *     not two disconnected features.
 *
 * Shows a scrolling note timeline (which note, and when, in beats) plus a
 * live "press this key now" indicator, and checks real key presses (via
 * engine's 'trigger' event, which carries the played MIDI note) against
 * the expected note within a timing tolerance.
 *
 * This is a practice/follow-along aid, not a strict pass/fail game — it
 * tracks and shows hit/miss feedback, but never blocks progress. The
 * clock driving the timeline is a plain JS clock (performance.now()),
 * not the Web Audio clock — that's an intentional, honest simplification:
 * this mode doesn't play back the *melody* itself, it only listens for
 * notes the learner triggers on the keyboard, so sample-accurate sync
 * isn't needed here the way it is for the sequencer's own beat.
 *
 * @module ui/play-along
 */

import { engine } from '../core/engine.js';
import { store } from '../store.js';
import { AI } from '../ai.js';
import { midiToName } from '../utils.js';
import { keyForSemitone, setKeyboardModeExternal, isKeyboardModeActive } from './keyboard.js';
import { SONGS } from '../data/songs.js';

const HIT_WINDOW_BEATS = 0.6; // how close (in beats) a keypress must land to count as a "hit"

/**
 * @param {Object} opts
 * @param {HTMLElement} opts.pickerHost - where the song list renders (Learn tab)
 * @param {HTMLElement} opts.stageHost - where the active practice bar renders (Pattern tab, bottom)
 * @param {() => void} opts.switchToPatternTab - switches the app to the Pattern tab
 */
export function mountPlayAlong({ pickerHost, stageHost, switchToPatternTab }) {
  pickerHost.innerHTML = SONGS.map(
    (s) => `
      <button class="pa__song" data-song="${s.id}">
        <span class="pa__song-name">${s.name}</span>
        <span class="pa__song-desc">${s.description}</span>
      </button>
    `
  ).join('');

  stageHost.innerHTML = `
    <div class="pa__stage" id="paStage" hidden>
      <div class="pa__stage-head">
        <span class="pa__stage-title" id="paSongName">—</span>
        <button class="ai-btn" id="paStop">Stop practice</button>
      </div>
      <div class="pa__now">
        <span class="pa__now-label">NOW</span>
        <span class="pa__now-key" id="paNowKey">—</span>
        <span class="pa__now-note" id="paNowNote"></span>
      </div>
      <div class="pa__highway" id="paHighway">
        <div class="pa__playhead"></div>
        <div class="pa__lane" id="paLane"></div>
      </div>
      <div class="pa__controls">
        <span class="pa__score" id="paScore">0 hit · 0 missed</span>
      </div>
    </div>
  `;

  const stage = stageHost.querySelector('#paStage');
  const songNameEl = stageHost.querySelector('#paSongName');
  const lane = stageHost.querySelector('#paLane');
  const nowKeyEl = stageHost.querySelector('#paNowKey');
  const nowNoteEl = stageHost.querySelector('#paNowNote');
  const scoreEl = stageHost.querySelector('#paScore');
  const stopBtn = stageHost.querySelector('#paStop');

  let session = null; // { song, startTime, raf, hits, misses, hitNoteIndices, offTrigger, wasKeyboardModeActive, wasPattern, wasBpm, wasSwing }

  pickerHost.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-song]');
    if (!btn) return;
    startSession(SONGS.find((s) => s.id === btn.dataset.song));
  });

  stopBtn.addEventListener('click', stopSession);

  function startSession(song) {
    if (session) stopSession();

    // Remember exactly what was on the main screen so "Stop practice"
    // gives it back, rather than leaving the backing beat in place forever.
    const prev = store.get();
    const wasKeyboardModeActive = isKeyboardModeActive();

    switchToPatternTab();

    const backing = AI.generatePattern(song.backingGenre, song.backingSeed);
    store.set({ pattern: backing.pattern, bpm: backing.bpm, swing: backing.swing });
    if (!engine.scheduler?.running) engine.play();

    if (!wasKeyboardModeActive) setKeyboardModeExternal(true);

    songNameEl.textContent = song.name;
    lane.innerHTML = song.notes
      .map(
        (n) => `
          <div class="pa__note" data-beat="${n.beat}" data-midi="${n.midi}" style="left:${n.beat * 60}px; width:${n.duration * 60 - 4}px;">
            <span class="pa__note-letter">${(keyForSemitone(n.midi - 60) || '?').toUpperCase()}</span>
            <span class="pa__note-name">${midiToName(n.midi)}</span>
          </div>
        `
      )
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
      wasPattern: prev.pattern,
      wasBpm: prev.bpm,
      wasSwing: prev.swing,
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
    tick();
  }

  function tick() {
    if (!session) return;
    const beatsElapsed = msToBeats(performance.now() - session.startTime, session.song.bpm);
    const highway = stageHost.querySelector('#paHighway');
    const playheadOffset = highway.clientWidth * 0.25;
    lane.style.transform = `translateX(${playheadOffset - beatsElapsed * 60}px)`;

    const current = session.song.notes.find((n) => beatsElapsed >= n.beat && beatsElapsed < n.beat + n.duration);
    if (current) {
      // The physical key is the primary, glanceable info -- big; the note
      // name is secondary reference info -- small. Same principle as the
      // on-screen piano keys.
      const semitone = current.midi - 60;
      const key = semitone >= 0 && semitone <= 23 ? keyForSemitone(semitone) : null;
      nowKeyEl.textContent = key ? key.toUpperCase() : '?';
      nowNoteEl.textContent = midiToName(current.midi);
    } else {
      nowKeyEl.textContent = '—';
      nowNoteEl.textContent = '';
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
      // Loop the exercise rather than just stopping dead -- restarting the
      // clock and clearing hit/miss marks so it reads as "again", not "done".
      session.startTime = performance.now();
      session.hitNoteIndices.clear();
      lane.querySelectorAll('.is-hit, .is-miss').forEach((el) => el.classList.remove('is-hit', 'is-miss'));
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
    engine.stop();
    store.set({ pattern: session.wasPattern, bpm: session.wasBpm, swing: session.wasSwing });
    session = null;
    stage.hidden = true;
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
