/**
 * Play Along — learn a short exercise on the keyboard, over a backing beat.
 *
 * Lives in two places on purpose:
 *   - The song PICKER is in the Learn tab (choosing belongs with lessons).
 *   - The active practice runs as a semi-transparent OVERLAY on the
 *     visualizer on the main Pattern screen — the scrolling note line and
 *     the "press this key" prompt sit right where you're looking, over the
 *     animation, not in a separate block miles down the page.
 *
 * Two modes:
 *   - TRAINING (default): the line WAITS on each note until you press the
 *     correct key, then advances. No clock, no failing — you set the pace
 *     while the drums loop underneath so you feel the groove. This is how
 *     you learn the shape the first time.
 *   - PLAY: a "ready · set · go" countdown, then the line scrolls in real
 *     time and marks each note green (hit) or red (missed). This is for
 *     once you know it and want to perform it in tempo.
 *
 * The backing beat loaded into the sequencer is stripped of its melodic
 * voices (lead / pluck / pad) so it can't clash with the notes you play —
 * only drums and bass groove underneath.
 *
 * @module ui/play-along
 */

import { engine } from '../core/engine.js';
import { store } from '../store.js';
import { AI } from '../ai.js';
import { midiToName } from '../utils.js';
import { keyForSemitone, setKeyboardModeExternal, isKeyboardModeActive } from './keyboard.js';
import { SONGS } from '../data/songs.js';

const PX_PER_BEAT = 64;
const HIT_WINDOW_BEATS = 0.6; // play-mode timing tolerance
const MIN_EXERCISE_BEATS = 32; // repeat the core phrase until it's at least this long
const MELODIC_VOICES = ['lead', 'pluck', 'pad']; // stripped from the backing beat so they don't clash with the learner

/** Repeat a song's core phrase so a practice run has real length, not 4 notes. */
function expandSong(song) {
  const phraseBeats = Math.max(...song.notes.map((n) => n.beat + n.duration));
  const reps = Math.max(2, Math.ceil(MIN_EXERCISE_BEATS / phraseBeats));
  const notes = [];
  for (let r = 0; r < reps; r++) {
    for (const n of song.notes) {
      notes.push({ midi: n.midi, beat: n.beat + r * phraseBeats, duration: n.duration });
    }
  }
  return { notes, totalBeats: phraseBeats * reps };
}

/** Zero out the melodic rows of a generated pattern — keep only drums + bass. */
function drumsAndBassOnly(pattern) {
  const out = {};
  for (const [id, row] of Object.entries(pattern)) {
    out[id] = MELODIC_VOICES.includes(id) ? row.map(() => 0) : row;
  }
  return out;
}

/**
 * @param {Object} opts
 * @param {HTMLElement} opts.pickerHost - song list (Learn tab)
 * @param {HTMLElement} opts.overlayEl - the practice overlay on the visualizer
 * @param {() => void} opts.switchToPatternTab
 */
export function mountPlayAlong({ pickerHost, overlayEl, switchToPatternTab }) {
  pickerHost.innerHTML = SONGS.map(
    (s) => `
      <button class="pa__song" data-song="${s.id}">
        <span class="pa__song-name">${s.name}</span>
        <span class="pa__song-desc">${s.description}</span>
      </button>
    `
  ).join('');

  const songNameEl = overlayEl.querySelector('#paSongName');
  const laneEl = overlayEl.querySelector('#paLane');
  const highwayEl = overlayEl.querySelector('#paHighway');
  const statusEl = overlayEl.querySelector('#paStatus');
  const countdownEl = overlayEl.querySelector('#paCountdown');
  const stopBtn = overlayEl.querySelector('#paStop');
  const trainBtn = overlayEl.querySelector('#paModeTraining');
  const playModeBtn = overlayEl.querySelector('#paModePlay');

  let session = null;
  // Snapshot of the main screen taken BEFORE the first exercise starts, so
  // "Stop" restores it. Kept outside `session` so switching modes (which
  // tears down and rebuilds the session) never overwrites it with the
  // backing beat that's currently loaded.
  let restoreSnapshot = null;

  pickerHost.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-song]');
    if (!btn) return;
    startSession(SONGS.find((s) => s.id === btn.dataset.song), 'training');
  });

  stopBtn.addEventListener('click', () => stopSession());
  trainBtn.addEventListener('click', () => session && session.mode !== 'training' && restartMode('training'));
  playModeBtn.addEventListener('click', () => session && session.mode !== 'play' && restartMode('play'));

  function restartMode(mode) {
    const song = session.song;
    cleanupRun(session);
    session = null;
    startSession(song, mode); // restoreSnapshot is preserved across this
  }

  function startSession(song, mode) {
    if (!restoreSnapshot) {
      restoreSnapshot = {
        wasKeyboardModeActive: isKeyboardModeActive(),
        wasPattern: store.get().pattern,
        wasBpm: store.get().bpm,
        wasSwing: store.get().swing,
      };
    }
    if (session) cleanupRun(session);

    switchToPatternTab();

    const backing = AI.generatePattern(song.backingGenre, song.backingSeed);
    store.set({ pattern: drumsAndBassOnly(backing.pattern), bpm: backing.bpm, swing: backing.swing });
    if (!engine.scheduler?.running) engine.play();
    if (!isKeyboardModeActive()) setKeyboardModeExternal(true);

    const { notes, totalBeats } = expandSong(song);

    songNameEl.textContent = song.name;
    trainBtn.classList.toggle('is-active', mode === 'training');
    playModeBtn.classList.toggle('is-active', mode === 'play');

    laneEl.style.width = `${totalBeats * PX_PER_BEAT + highwayEl.clientWidth}px`;
    laneEl.innerHTML = notes
      .map(
        (n, i) => `
          <div class="pa-note" data-i="${i}" style="left:${n.beat * PX_PER_BEAT}px; width:${n.duration * PX_PER_BEAT - 4}px;">
            <span class="pa-note__letter">${(keyForSemitone(n.midi - 60) || '?').toUpperCase()}</span>
            <span class="pa-note__name">${midiToName(n.midi)}</span>
          </div>`
      )
      .join('');

    session = {
      song,
      mode,
      phase: 'countdown',
      notes,
      totalBeats,
      currentIdx: 0,
      startTime: 0,
      hits: 0,
      misses: 0,
      settled: new Set(), // note indices already resolved (hit or miss) this pass
      raf: 0,
      countdownTimer: 0,
      offTrigger: null,
    };

    session.offTrigger = engine.on('trigger', onPlayerNote);

    overlayEl.hidden = false;
    positionLaneToBeat(0, false);
    if (mode === 'training') highlightTrainingNote();
    runCountdown();
  }

  function runCountdown() {
    const steps = ['READY', 'SET', 'GO'];
    let i = 0;
    countdownEl.hidden = false;
    const show = () => {
      if (!session) return;
      if (i >= steps.length) {
        countdownEl.hidden = true;
        beginRun();
        return;
      }
      countdownEl.textContent = steps[i++];
      session.countdownTimer = setTimeout(show, 650);
    };
    show();
  }

  function beginRun() {
    if (!session) return;
    session.phase = 'running';
    if (session.mode === 'play') {
      session.startTime = performance.now();
      statusEl.textContent = '0 hit · 0 missed';
      session.raf = requestAnimationFrame(playTick);
    } else {
      statusEl.textContent = `note 1 / ${session.notes.length}`;
    }
  }

  /** A note the player actually triggered on the keyboard. */
  function onPlayerNote(e) {
    if (!session || session.phase !== 'running' || typeof e.midi !== 'number') return;

    if (session.mode === 'training') {
      const cur = session.notes[session.currentIdx];
      if (!cur) return;
      if (e.midi === cur.midi) {
        markNote(session.currentIdx, 'hit');
        session.currentIdx++;
        if (session.currentIdx >= session.notes.length) {
          // finished a pass — loop for continued practice
          session.currentIdx = 0;
          session.notes.forEach((_, i) => unmarkNote(i));
        }
        positionLaneToBeat(session.notes[session.currentIdx].beat, true);
        highlightTrainingNote();
        statusEl.textContent = `note ${session.currentIdx + 1} / ${session.notes.length}`;
      } else {
        flashWrong(session.currentIdx);
      }
      return;
    }

    // play mode: match against the nearest unsettled note within the window
    const beatsElapsed = msToBeats(performance.now() - session.startTime, session.song.bpm);
    let bestIdx = -1;
    let bestDist = Infinity;
    session.notes.forEach((n, i) => {
      if (session.settled.has(i) || n.midi !== e.midi) return;
      const dist = Math.abs(n.beat - beatsElapsed);
      if (dist <= HIT_WINDOW_BEATS && dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    });
    if (bestIdx >= 0) {
      session.settled.add(bestIdx);
      session.hits++;
      markNote(bestIdx, 'hit');
      updatePlayScore();
    }
  }

  function playTick() {
    if (!session || session.phase !== 'running') return;
    const beatsElapsed = msToBeats(performance.now() - session.startTime, session.song.bpm);
    positionLaneToBeat(beatsElapsed, false);

    // mark notes whose window has passed unsettled as missed (once each)
    session.notes.forEach((n, i) => {
      if (!session.settled.has(i) && beatsElapsed > n.beat + HIT_WINDOW_BEATS) {
        session.settled.add(i);
        session.misses++;
        markNote(i, 'miss');
        updatePlayScore();
      }
    });

    if (beatsElapsed > session.totalBeats + 1.5) {
      // loop cleanly: reset marks + counters so misses can't run away
      session.settled.clear();
      session.hits = 0;
      session.misses = 0;
      session.notes.forEach((_, i) => unmarkNote(i));
      session.startTime = performance.now();
      updatePlayScore();
    }
    session.raf = requestAnimationFrame(playTick);
  }

  function highlightTrainingNote() {
    laneEl.querySelectorAll('.pa-note').forEach((el) => el.classList.remove('is-current'));
    laneEl.querySelector(`.pa-note[data-i="${session.currentIdx}"]`)?.classList.add('is-current');
  }

  function markNote(i, kind) {
    const el = laneEl.querySelector(`.pa-note[data-i="${i}"]`);
    if (el) {
      el.classList.remove('is-current');
      el.classList.add(kind === 'hit' ? 'is-hit' : 'is-miss');
    }
  }
  function unmarkNote(i) {
    laneEl.querySelector(`.pa-note[data-i="${i}"]`)?.classList.remove('is-hit', 'is-miss', 'is-current', 'is-wrong');
  }
  function flashWrong(i) {
    const el = laneEl.querySelector(`.pa-note[data-i="${i}"]`);
    if (!el) return;
    el.classList.add('is-wrong');
    setTimeout(() => el.classList.remove('is-wrong'), 200);
  }

  function positionLaneToBeat(beat, smooth) {
    const playheadX = highwayEl.clientWidth * 0.22;
    laneEl.style.transition = smooth ? 'transform 0.18s ease-out' : 'none';
    laneEl.style.transform = `translateX(${playheadX - beat * PX_PER_BEAT}px)`;
  }

  function updatePlayScore() {
    statusEl.textContent = `${session.hits} hit · ${session.misses} missed`;
  }

  function cleanupRun(s) {
    cancelAnimationFrame(s.raf);
    clearTimeout(s.countdownTimer);
    s.offTrigger?.();
  }

  function stopSession() {
    if (!session) return;
    cleanupRun(session);
    session = null;
    if (restoreSnapshot) {
      if (!restoreSnapshot.wasKeyboardModeActive) setKeyboardModeExternal(false);
      engine.stop();
      store.set({
        pattern: restoreSnapshot.wasPattern,
        bpm: restoreSnapshot.wasBpm,
        swing: restoreSnapshot.wasSwing,
      });
      restoreSnapshot = null;
    }
    overlayEl.hidden = true;
    countdownEl.hidden = true;
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
