/**
 * Mixer UI — per-track strips with gain, pan, EQ, filter, saturation,
 * mute / solo controls.
 *
 * @module ui/mixer
 */

import { store } from '../store.js';
import { engine } from '../core/engine.js';
import { TRACKS } from '../data/tracks.js';
import { resolveVar } from '../utils.js';

export function mountMixer(host) {
  host.innerHTML = `
    <header class="card__head">
      <h2>MIXER</h2>
      <span class="card__hint">gain · pan · EQ · filter · saturation · mute / solo</span>
    </header>
    <div class="mixer__grid" id="mixerGrid"></div>
  `;

  const grid = host.querySelector('#mixerGrid');

  TRACKS.forEach((tr) => {
    const color = resolveVar(tr.color);
    const mix = document.createElement('div');
    mix.className = 'mix';
    mix.dataset.id = tr.id;
    mix.style.setProperty('--track-color', color);
    mix.innerHTML = `
      <div class="mix__head">
        <span class="mix__name">${tr.name}</span>
        <span class="mix__db">1.00×</span>
      </div>

      <div class="mix__row">
        <label>VOL</label>
        <input type="range" min="0" max="150" value="100" data-control="gain" />
      </div>

      <div class="mix__row">
        <label>PAN</label>
        <input type="range" min="-100" max="100" value="0" data-control="pan" />
      </div>

      <div class="mix__row mix__row--eq">
        <label>EQ</label>
        <div class="eq">
          <div class="eq__band">
            <input type="range" min="-12" max="12" value="0" data-control="eq.low" />
            <span>L</span>
          </div>
          <div class="eq__band">
            <input type="range" min="-12" max="12" value="0" data-control="eq.mid" />
            <span>M</span>
          </div>
          <div class="eq__band">
            <input type="range" min="-12" max="12" value="0" data-control="eq.high" />
            <span>H</span>
          </div>
        </div>
      </div>

      <div class="mix__row">
        <label>CUT</label>
        <input type="range" min="0" max="100" value="100" data-control="filterCutoff" />
      </div>

      <div class="mix__row">
        <label>DRV</label>
        <input type="range" min="0" max="100" value="0" data-control="saturation" />
      </div>

      <div class="mix__btns">
        <button class="mix__btn" data-act="mute" title="Mute">M</button>
        <button class="mix__btn" data-act="solo" title="Solo">S</button>
      </div>
    `;
    grid.appendChild(mix);

    // wire inputs
    mix.querySelectorAll('input[type="range"]').forEach((slider) => {
      slider.style.setProperty('--val', '50%');
      slider.addEventListener('input', () => {
        const control = slider.dataset.control;
        const v = +slider.value;
        const t = store.get().tracks.find((x) => x.id === tr.id);
        if (control === 'gain') {
          store.setTrack(tr.id, { userGain: v / 100 });
          mix.querySelector('.mix__db').textContent = (v / 100).toFixed(2) + '×';
          slider.style.setProperty('--val', (v / 150) * 100 + '%');
        } else if (control === 'pan') {
          store.setTrack(tr.id, { pan: v / 100 });
          slider.style.setProperty('--val', ((v + 100) / 200) * 100 + '%');
        } else if (control === 'eq.low') {
          store.setTrack(tr.id, { eq: { ...t.eq, low: v } });
          slider.style.setProperty('--val', ((v + 12) / 24) * 100 + '%');
        } else if (control === 'eq.mid') {
          store.setTrack(tr.id, { eq: { ...t.eq, mid: v } });
          slider.style.setProperty('--val', ((v + 12) / 24) * 100 + '%');
        } else if (control === 'eq.high') {
          store.setTrack(tr.id, { eq: { ...t.eq, high: v } });
          slider.style.setProperty('--val', ((v + 12) / 24) * 100 + '%');
        } else if (control === 'filterCutoff') {
          store.setTrack(tr.id, { filterCutoff: v / 100 });
          slider.style.setProperty('--val', v + '%');
        } else if (control === 'saturation') {
          store.setTrack(tr.id, { saturation: v / 100 });
          slider.style.setProperty('--val', v + '%');
        }
        engine.applyState(store.get());
      });
    });

    mix.querySelector('[data-act="mute"]').addEventListener('click', (e) => {
      const t = store.get().tracks.find((x) => x.id === tr.id);
      store.setTrack(tr.id, { mute: !t.mute });
      e.currentTarget.classList.toggle('is-mute', !t.mute);
      engine.applyState(store.get());
    });
    mix.querySelector('[data-act="solo"]').addEventListener('click', (e) => {
      const t = store.get().tracks.find((x) => x.id === tr.id);
      store.setTrack(tr.id, { solo: !t.solo });
      e.currentTarget.classList.toggle('is-solo', !t.solo);
      engine.applyState(store.get());
    });
  });
}