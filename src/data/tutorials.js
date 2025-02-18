/**
 * Built-in interactive tutorials.
 *
 * Each step is an object:
 *   {
 *     title:     step title shown in the coach mark
 *     body:      instruction text (HTML allowed)
 *     hint?:     small grey helper line below the body
 *     tab?:      'pattern' | 'song' | 'keyboard' | 'learn' — auto-switch to this tab
 *     highlight?: CSS selector — element gets a pulsing glow + arrow points at it
 *     placement?: 'top' | 'bottom' — coach mark placement
 *     verify?:   (store) => boolean — auto-advance when true
 *     autoNext?: ms — auto-advance after this many ms (skips user input)
 *   }
 *
 * @module data/tutorials
 */

const step = (title, body, opts = {}) => ({ title, body, ...opts });

export const TUTORIALS = [
  {
    id: 'first-beat',
    title: 'Your First Beat',
    summary: 'Build a four-on-the-floor kick + clap from scratch.',
    icon: '🥁',
    estimatedMinutes: 2,
    steps: [
      step(
        'Welcome to Nebula',
        'You are about to build your first beat. Every row in the grid below is a sound, every column is a step in time. We will fill in a classic house groove together.',
        { tab: 'pattern', autoNext: 2200, hint: 'The first step will appear automatically…' }
      ),
      step(
        'Click the first KICK cell',
        'Find the row labelled <b>KICK</b> (top of the grid, pink). Click the very first cell — you should hear a kick drum.',
        {
          tab: 'pattern',
          highlight: '[data-track="kick"] .step[data-step="0"]',
          placement: 'bottom',
          hint: '🔊 Make sure your audio is on — you should hear a thump.',
          verify: (s) => s.pattern.kick[0],
        }
      ),
      step(
        'Add three more kicks',
        'Click cells <b>5</b>, <b>9</b> and <b>13</b> in the KICK row. That is the classic four-on-the-floor pulse.',
        {
          tab: 'pattern',
          highlight: '[data-track="kick"]',
          hint: 'Cell 5, 9, 13 — every fourth step.',
          verify: (s) => s.pattern.kick[4] && s.pattern.kick[8] && s.pattern.kick[12],
        }
      ),
      step(
        'Layer a clap on top',
        'Clap lives on row 4 (green). Add claps on steps <b>5</b> and <b>13</b> — right on top of the kick for extra punch.',
        {
          tab: 'pattern',
          highlight: '[data-track="clap"]',
          verify: (s) => s.pattern.clap[4] && s.pattern.clap[12],
        }
      ),
      step(
        'Offbeat hi-hats',
        'Light up every odd step in the HI-HAT row (yellow). That is the classic offbeat groove.',
        {
          tab: 'pattern',
          highlight: '[data-track="hat"]',
          hint: 'Click cells 1, 3, 5, 7, 9, 11, 13, 15.',
          verify: (s) =>
            s.pattern.hat.filter((v, i) => i % 2 === 0).every(Boolean) &&
            s.pattern.hat.filter((v, i) => i % 2 === 1).every((v) => !v),
        }
      ),
      step(
        'Hit PLAY',
        'Press the PLAY button in the transport bar. Listen to your beat!',
        {
          tab: 'pattern',
          highlight: '#playBtn',
          placement: 'bottom',
          hint: 'Tip: SPACE also plays/pauses.',
          verify: (s) => s.isPlaying,
        }
      ),
      step(
        'You just made a beat 🎉',
        'Try the BPM buttons (top-right) — slower feels chill, faster feels energetic. When you are ready, hit EXPORT to download your beat as a WAV file.',
        {
          tab: 'pattern',
          autoNext: 3500,
          hint: 'Next lesson: build a full House groove with bass and melody.',
        }
      ),
    ],
  },

  {
    id: 'house-groove',
    title: 'Build a House Groove',
    summary: 'Layer sub, bass and melody on top of a beat.',
    icon: '🏠',
    estimatedMinutes: 4,
    steps: [
      step(
        'Start with a beat',
        'A house track is a beat + bass + melody. Open the PRESETS panel on the right and load "House Classic" — it skips ahead so we can focus on the next layer.',
        {
          tab: 'pattern',
          highlight: '#presetsHost .preset[data-id="house-classic"]',
          placement: 'left',
        }
      ),
      step(
        'Slow the groove down',
        'Click the <b>−</b> button next to BPM until you are around 118 BPM. House lives in 118–126.',
        {
          tab: 'pattern',
          highlight: '[data-bpm-delta="-5"]',
          placement: 'bottom',
          hint: 'Five BPM at a time. Press it twice.',
        }
      ),
      step(
        'Add a SUB bass',
        'SUB (cyan, row 7) is the felt-not-heard low end. Place one hit on step <b>1</b>.',
        {
          tab: 'pattern',
          highlight: '[data-track="sub"] .step[data-step="0"]',
          placement: 'bottom',
          verify: (s) => s.pattern.sub[0],
        }
      ),
      step(
        'Walking bassline',
        'BASS row (sky blue, row 8). Add hits on steps <b>1, 4, 7, 9, 12</b> — bouncy 16th-note feel.',
        {
          tab: 'pattern',
          highlight: '[data-track="bass"]',
          hint: 'Five notes, spread out.',
          verify: (s) => [0, 3, 6, 8, 11].every((i) => s.pattern.bass[i]),
        }
      ),
      step(
        'Lead melody',
        'LEAD (violet, row 9). Drop 2–3 hits — try steps <b>5, 9, 14</b>. Make it sing.',
        {
          tab: 'pattern',
          highlight: '[data-track="lead"]',
          verify: (s) => s.pattern.lead.filter(Boolean).length >= 2,
        }
      ),
      step(
        'PAD for atmosphere',
        'Add one PAD hit (pink, row 11) on step <b>1</b>. It will sustain and fill the space.',
        {
          tab: 'pattern',
          highlight: '[data-track="pad"] .step[data-step="0"]',
          verify: (s) => s.pattern.pad[0],
        }
      ),
      step(
        'Mix it down',
        'Open the MIXER section. Try pulling the KICK and SUB down to ~70 % so the low end does not muddy. Push the LEAD up a touch.',
        {
          tab: 'keyboard',
          highlight: '#mixerHost',
          placement: 'top',
          hint: 'Mixer lives in the Keyboard tab.',
        }
      ),
      step(
        'Press PLAY',
        'Listen to your full house groove. Tweak until it feels right.',
        {
          tab: 'pattern',
          highlight: '#playBtn',
          verify: (s) => s.isPlaying,
        }
      ),
      step(
        'Export',
        'Click the WAV button in the transport bar to download your track as a 16-bit WAV file. Or hit MIDI to send it to Ableton / FL Studio.',
        {
          tab: 'pattern',
          highlight: '#exportWavBtn',
          placement: 'bottom',
        }
      ),
    ],
  },

  {
    id: 'lo-fi-from-scratch',
    title: 'Lo-Fi from Scratch',
    summary: 'Make a chill dusty beat with the warm side of the synths.',
    icon: '☕',
    estimatedMinutes: 5,
    steps: [
      step(
        'Pick the Lo-Fi kit',
        'Open the PRESETS panel and load "Lo-Fi Chill". We will edit it to make it ours.',
        {
          tab: 'pattern',
          highlight: '#presetsHost .preset[data-id="lo-fi-chill"]',
          placement: 'left',
        }
      ),
      step(
        'Add some swing',
        'The groove is straight — push the SWING slider up to ~24 %. Notice how the hats start to feel looser.',
        {
          tab: 'pattern',
          highlight: '#swing',
          placement: 'top',
          hint: 'Swing lives in the top-right.',
        }
      ),
      step(
        'Drop the BPM',
        'Lo-Fi lives in 70–85 BPM. Click the <b>−</b> button twice from 78 to ~68.',
        {
          tab: 'pattern',
          highlight: '[data-bpm-delta="-5"]',
          placement: 'bottom',
        }
      ),
      step(
        'Mute the pad to start clean',
        'Hit the M button on the PAD row. We will re-add it later, but first let us listen to just drums.',
        {
          tab: 'pattern',
          highlight: '[data-track="pad"] [data-act="mute"]',
          verify: (s) => {
            const pad = s.tracks.find((t) => t.id === 'pad');
            return pad && pad.mute;
          },
        }
      ),
      step(
        'Play and listen',
        'Hit PLAY. Listen to the swing. It should feel lazy and warm.',
        {
          tab: 'pattern',
          highlight: '#playBtn',
          verify: (s) => s.isPlaying,
        }
      ),
      step(
        'Bring the pad back',
        'Mute is still on — click the M again on the PAD row to unmute.',
        {
          tab: 'pattern',
          highlight: '[data-track="pad"] [data-act="mute"]',
          verify: (s) => {
            const pad = s.tracks.find((t) => t.id === 'pad');
            return pad && !pad.mute;
          },
        }
      ),
      step(
        'Try the virtual keyboard',
        'Switch to the KEYBOARD tab. Click any key to play the LEAD voice. Try clicking the chord buttons to hear major / minor / 7th chords.',
        {
          tab: 'keyboard',
          highlight: '#keyboardHost .kb__keys',
          placement: 'top',
        }
      ),
      step(
        'Export your lo-fi beat',
        'Back to the Pattern tab. Hit EXPORT → WAV. Open the file in any audio player.',
        {
          tab: 'pattern',
          highlight: '#exportWavBtn',
          placement: 'bottom',
        }
      ),
    ],
  },

  {
    id: 'mixing-101',
    title: 'Mixing 101',
    summary: 'Balance your track and add master FX like a pro.',
    icon: '🎛️',
    estimatedMinutes: 5,
    steps: [
      step(
        'What is mixing?',
        'Mixing is making every sound sit in its own space. The three main tools are <b>volume</b>, <b>EQ</b> and <b>master FX</b>. We will use all three.',
        { tab: 'keyboard', autoNext: 3000, hint: 'Mixer lives in the Keyboard tab.' }
      ),
      step(
        'Open the mixer',
        'The MIXER panel below has a strip for every track. Each strip has EQ, a low-pass filter, and a saturation knob.',
        {
          tab: 'keyboard',
          highlight: '#mixerHost',
          placement: 'top',
        }
      ),
      step(
        'Pull the low end down',
        'Click the VOL slider on the KICK strip and drag it to ~70 %. Then do the same for SUB. This stops the bass from muddying up.',
        {
          tab: 'keyboard',
          highlight: '.mix[data-id="kick"] input[data-control="gain"]',
          hint: 'EQ stays at 0 for now.',
        }
      ),
      step(
        'Open master FX',
        'Switch to the Pattern tab. The MASTER FX card has knobs for reverb, delay, filter and master volume.',
        {
          tab: 'pattern',
          highlight: '#masterHost',
          placement: 'top',
        }
      ),
      step(
        'Add a touch of reverb',
        'Drag the REVERB knob to about 22 %. Just a hint — too much washes out the beat.',
        {
          tab: 'pattern',
          highlight: '.knob[data-param="reverb"]',
          placement: 'bottom',
          hint: 'You can drag the knob up and down.',
        }
      ),
      step(
        'A bit of delay',
        'Drag the DELAY knob to about 14 %. Notice the echoes bouncing on the hats.',
        {
          tab: 'pattern',
          highlight: '.knob[data-param="delay"]',
          placement: 'bottom',
        }
      ),
      step(
        'Roll off the harshness',
        'Drop the FILTER knob from 12k down to about 8k. This removes some of the high-end fizz without losing detail.',
        {
          tab: 'pattern',
          highlight: '.knob[data-param="filter"]',
          placement: 'bottom',
        }
      ),
      step(
        'Master volume',
        'Set MASTER to about 80 %. Leave headroom — the final loudness pass happens after.',
        {
          tab: 'pattern',
          highlight: '.knob[data-param="master"]',
          placement: 'bottom',
        }
      ),
      step(
        'Export your mixed track',
        'Hit EXPORT → WAV. Compare to your earlier version — you should hear more space and less harshness.',
        {
          tab: 'pattern',
          highlight: '#exportWavBtn',
          placement: 'bottom',
        }
      ),
    ],
  },

  {
    id: 'sound-design',
    title: 'Sound Design Basics',
    summary: 'Try the synth voices and build a chord.',
    icon: '🎹',
    estimatedMinutes: 4,
    steps: [
      step(
        'Synthesized vs sampled',
        'Nebula Studio synthesizes every sound from oscillators — that means every voice can be shaped. Let us explore.',
        { tab: 'keyboard', autoNext: 2800 }
      ),
      step(
        'Try the virtual keyboard',
        'This is a real piano. Click any white key to play the LEAD voice.',
        {
          tab: 'keyboard',
          highlight: '.kb-key--white',
          placement: 'top',
        }
      ),
      step(
        'Switch voice to PLUCK',
        'Change the VOICE selector to PLUCK. Same note, totally different character.',
        {
          tab: 'keyboard',
          highlight: '#kbVoice',
          placement: 'right',
        }
      ),
      step(
        'Switch to PAD',
        'PAD plays a slow-attack chord. Click once and listen — it sustains for almost a second.',
        {
          tab: 'keyboard',
          highlight: '#kbVoice',
          placement: 'right',
        }
      ),
      step(
        'Hold a major chord',
        'Click the C major chord button (root C, type "maj"). Three notes at once — that is a chord.',
        {
          tab: 'keyboard',
          highlight: '.chord-btn[data-root="C"][data-type="major"]',
          placement: 'top',
        }
      ),
      step(
        'Try the minor chord',
        'Now click C minor. Same root, different feel — that is the difference between major and minor.',
        {
          tab: 'keyboard',
          highlight: '.chord-btn[data-root="C"][data-type="minor"]',
          placement: 'top',
        }
      ),
      step(
        'Change octaves',
        'Use the <b>+</b> and <b>−</b> octave buttons to move up and down. The PAD on a lower octave is huge.',
        {
          tab: 'keyboard',
          highlight: '.kb__oct',
          placement: 'right',
        }
      ),
      step(
        'You just designed sounds',
        'Voice + envelope + chord = sound design. This is the most creative part of making music. Go experiment.',
        { tab: 'keyboard', autoNext: 3000 },
      ),
    ],
  },

  {
    id: 'song-mode',
    title: 'Build a Full Song',
    summary: 'Use song mode to chain patterns into a complete track.',
    icon: '🎼',
    estimatedMinutes: 5,
    steps: [
      step(
        'What is song mode?',
        'A pattern is one bar. A song is a sequence of patterns. We will build A → B → A → C — verse / chorus / verse / bridge.',
        { tab: 'song', autoNext: 3500 }
      ),
      step(
        'Save your current pattern to slot A',
        'Click "Save current here" on slot <b>A</b>. This captures your current pattern.',
        {
          tab: 'song',
          highlight: '.song-slot[data-slot="A"] [data-act="copy"]',
        }
      ),
      step(
        'Tweak the pattern and save to slot B',
        'Switch to the Pattern tab and tweak the pattern. Add a few extra notes. Then come back to Song and save to slot <b>B</b>.',
        {
          tab: 'song',
          highlight: '.song-slot[data-slot="B"] [data-act="copy"]',
        }
      ),
      step(
        'Make a third variation, save to slot C',
        'Switch back, make another variation, save to slot <b>C</b>.',
        {
          tab: 'song',
          highlight: '.song-slot[data-slot="C"] [data-act="copy"]',
        }
      ),
      step(
        'Build the chain',
        'In the CHAIN row, click <b>+ A</b>, <b>+ B</b>, <b>+ A</b>, <b>+ C</b> to build a 4-slot song. Each chip is one bar of music.',
        {
          tab: 'song',
          highlight: '.chain__add',
          placement: 'top',
          hint: 'Click a chip to remove it from the chain.',
        }
      ),
      step(
        'Press PLAY SONG',
        'The chain will play through automatically — each bar advances to the next pattern after 4 beats.',
        {
          tab: 'song',
          highlight: '#songPlay',
          placement: 'top',
        }
      ),
      step(
        'Export the full song',
        'When you are happy, switch to Pattern and EXPORT → WAV. The render captures the full song length.',
        {
          tab: 'pattern',
          highlight: '#exportWavBtn',
          placement: 'bottom',
        }
      ),
    ],
  },
];

export const TUTORIALS_BY_ID = Object.fromEntries(TUTORIALS.map((t) => [t.id, t]));