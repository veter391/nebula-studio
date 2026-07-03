/**
 * Tutorial mode — interactive visual lessons.
 *
 * Each step can:
 *   - show plain instruction text
 *   - highlight a DOM element with a pulsing glow + animated arrow
 *   - spawn a floating "coach mark" tooltip near the element
 *   - automatically advance when `verify(store) === true`
 *   - require explicit "Next" click
 *
 * Progress is saved in store under `tutorials.<id>.currentStep`.
 *
 * @module ui/tutorials
 */

import { store } from '../store.js';
import { showToast } from './shell.js';
import { TUTORIALS, TUTORIALS_BY_ID } from '../data/tutorials.js';

/* ---------- Coach mark: floating tooltip with arrow ---------- */

class CoachMark {
  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'coach';
    this.el.setAttribute('role', 'dialog');
    this.el.setAttribute('aria-live', 'polite');
    this.el.innerHTML = `
      <div class="coach__arrow"></div>
      <div class="coach__card">
        <div class="coach__step"></div>
        <h3 class="coach__title"></h3>
        <p class="coach__body"></p>
        <div class="coach__hint"></div>
        <div class="coach__actions"></div>
      </div>
    `;
    document.body.appendChild(this.el);

    this.arrow = this.el.querySelector('.coach__arrow');
    this.card = this.el.querySelector('.coach__card');
    this.stepEl = this.el.querySelector('.coach__step');
    this.titleEl = this.el.querySelector('.coach__title');
    this.bodyEl = this.el.querySelector('.coach__body');
    this.hintEl = this.el.querySelector('.coach__hint');
    this.actionsEl = this.el.querySelector('.coach__actions');

    this.targetEl = null;
    this.placement = 'top'; // top | bottom
    this.onResize = this.reposition.bind(this);
    window.addEventListener('resize', this.onResize);
    window.addEventListener('scroll', this.onResize, true);
  }

  show({ target, step, totalSteps, title, body, hint, placement = 'top', actions = [], autoAdvance = false }) {
    this.targetEl = target;
    this.placement = placement;
    this.stepEl.textContent = `Step ${step} / ${totalSteps}`;
    this.titleEl.textContent = title;
    this.bodyEl.innerHTML = body; // allow inline markup
    this.hintEl.textContent = hint || '';
    this.hintEl.style.display = hint ? '' : 'none';

    this.actionsEl.innerHTML = '';
    actions.forEach((a) => {
      const btn = document.createElement('button');
      btn.className = 'coach__btn' + (a.primary ? ' coach__btn--primary' : '');
      btn.textContent = a.label;
      if (a.disabled) btn.disabled = true;
      btn.addEventListener('click', a.onClick);
      this.actionsEl.appendChild(btn);
    });

    this.el.classList.add('is-visible');
    this.el.dataset.placement = placement;
    this.el.dataset.auto = autoAdvance ? '1' : '0';

    // Position once now. Event-based reposition (scroll / resize) handles
    // the rest — no per-frame RAF loop.
    requestAnimationFrame(() => this.reposition());
  }

  hide() {
    this.el.classList.remove('is-visible');
    this.targetEl = null;
  }

  reposition() {
    if (!this.targetEl) return;
    const r = this.targetEl.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return; // not visible

    // measure the coach card — cap at 320px but shrink to fit narrow
    // (phone-width) viewports so the card never overflows horizontally.
    const cw = Math.min(320, window.innerWidth - 24);
    this.card.style.maxWidth = cw + 'px';

    // decide placement
    const spaceAbove = r.top;
    const spaceBelow = window.innerHeight - r.bottom;
    const placement = spaceAbove < 220 && spaceBelow > spaceAbove ? 'bottom' : 'top';

    const cardH = this.card.offsetHeight || 160;
    const gap = 18;

    let top;
    if (placement === 'top') {
      top = r.top - cardH - gap;
      if (top < 12) top = r.bottom + gap; // fallback
    } else {
      top = r.bottom + gap;
      if (top + cardH > window.innerHeight - 12) top = r.top - cardH - gap;
    }

    // horizontally: center over the target, clamp to viewport
    let left = r.left + r.width / 2 - cw / 2;
    const pad = 12;
    left = Math.max(pad, Math.min(window.innerWidth - cw - pad, left));

    this.el.style.top = `${top}px`;
    this.el.style.left = `${left}px`;
    this.el.style.width = cw + 'px';
    this.el.dataset.placement = placement;

    // arrow position relative to the card — points at the target centre
    const arrowX = r.left + r.width / 2 - left;
    this.arrow.style.left = `${Math.max(20, Math.min(cw - 20, arrowX))}px`;
  }
}

const coach = new CoachMark();

/* ---------- Mount UI ---------- */

export function mountTutorials(host) {
  host.innerHTML = `
    <header class="card__head">
      <h2>LEARN</h2>
      <span class="card__hint">interactive lessons · visual coach marks · progress saved</span>
    </header>

    <div class="learn__layout">
      <aside class="learn__list" id="learnList"></aside>
      <main class="learn__main">
        <div class="learn__card" id="learnCard">
          <h3 class="learn__title">Pick a lesson</h3>
          <p class="learn__body">Choose a lesson from the list — when you start one, a coach mark will pop up and guide you step by step through the interface.</p>
          <div class="learn__empty-cta">
            <span class="learn__hint">💡 The first lesson takes about 2 minutes.</span>
          </div>
        </div>
      </main>
    </div>
  `;

  const listEl = host.querySelector('#learnList');
  TUTORIALS.forEach((t) => {
    const card = document.createElement('button');
    card.className = 'learn__item';
    card.dataset.id = t.id;
    const progress = store.get().tutorials[t.id];
    card.innerHTML = `
      <span class="learn__icon">${t.icon || '🎓'}</span>
      <div class="learn__item-text">
        <div class="learn__item-title">${t.title}</div>
        <div class="learn__item-summary">${t.summary}</div>
        <div class="learn__item-meta">${t.estimatedMinutes} min · ${progress.completed ? '✅ Done' : progress.currentStep > 0 ? `Step ${progress.currentStep + 1}/${t.steps.length}` : 'Not started'}</div>
      </div>
    `;
    card.addEventListener('click', () => store.set({ activeTutorial: t.id }));
    listEl.appendChild(card);
  });

  let activeId = null;
  let activeStepIdx = 0;
  let verifyTimer = null;
  let autoTimer = null;

  function clearTimers() {
    if (verifyTimer) { clearInterval(verifyTimer); verifyTimer = null; }
    if (autoTimer) { clearTimeout(autoTimer); autoTimer = null; }
  }

  function clearHighlights() {
    document.querySelectorAll('.is-highlighted').forEach((el) => el.classList.remove('is-highlighted'));
    coach.hide();
    clearTimers();
  }

  function renderActive() {
    // Any timer armed by the previously-rendered step (autoNext setTimeout or
    // verify setInterval) must die here. Otherwise it keeps polling/firing in
    // the background after we've already moved to a new step, silently
    // calling advance() again and again — the lesson appears to "skip"
    // several steps because a stale interval from step N is still ticking
    // while step N+1, N+2, ... are on screen.
    clearTimers();

    const cardEl = host.querySelector('#learnCard');
    listEl.querySelectorAll('.learn__item').forEach((x) => x.classList.toggle('is-active', x.dataset.id === activeId));

    if (!activeId) {
      cardEl.innerHTML = `
        <h3 class="learn__title">Pick a lesson</h3>
        <p class="learn__body">Choose a lesson from the list — when you start one, a coach mark will pop up and guide you step by step through the interface.</p>
        <div class="learn__empty-cta">
          <span class="learn__hint">💡 The first lesson takes about 2 minutes.</span>
        </div>
      `;
      clearHighlights();
      return;
    }

    const t = TUTORIALS_BY_ID[activeId];
    if (!t) return;

    const step = t.steps[activeStepIdx];
    if (!step) {
      cardEl.innerHTML = `
        <h3 class="learn__title">🎉 Lesson complete!</h3>
        <p class="learn__body">You finished "${t.title}". Try another lesson or go make something of your own.</p>
        <div class="learn__actions">
          <button class="big-btn big-btn--play" id="learnRestart">↻ Restart lesson</button>
          <button class="big-btn big-btn--ghost" id="learnExit">Back to lessons</button>
        </div>
      `;
      cardEl.querySelector('#learnRestart').addEventListener('click', () => {
        store.set({ tutorials: { ...store.get().tutorials, [t.id]: { currentStep: 0, completed: false } } });
        activeStepIdx = 0;
        renderActive();
      });
      cardEl.querySelector('#learnExit').addEventListener('click', () => store.set({ activeTutorial: null }));
      clearHighlights();
      return;
    }

    // ensure the right tab is shown (so the highlighted element is visible)
    if (step.tab) {
      store.setTab(step.tab);
      // store.setTab fires the currentTab event which shell.js hooks into
      // and updates both the tab UI and the panel visibility.
    }

    // keep side panel as a backup info view
    cardEl.innerHTML = `
      <div class="learn__head">
        <span class="learn__step">Step ${activeStepIdx + 1} / ${t.steps.length}</span>
        <h3 class="learn__title">${step.title}</h3>
      </div>
      <p class="learn__body">${step.body}</p>
      <div class="learn__progress">
        ${t.steps.map((_, i) => `<div class="learn__progress-dot ${i < activeStepIdx ? 'is-done' : i === activeStepIdx ? 'is-current' : ''}"></div>`).join('')}
      </div>
      <div class="learn__actions">
        <button class="big-btn big-btn--play" id="learnNext" ${step.verify ? 'disabled' : ''}>${activeStepIdx === t.steps.length - 1 ? 'Finish ✓' : 'Next →'}</button>
        <button class="big-btn big-btn--ghost" id="learnBack" ${activeStepIdx === 0 ? 'disabled' : ''}>← Back</button>
        <button class="big-btn big-btn--ghost" id="learnExit2">Exit</button>
      </div>
    `;
    cardEl.querySelector('#learnNext').addEventListener('click', () => advance());
    cardEl.querySelector('#learnBack').addEventListener('click', () => {
      activeStepIdx = Math.max(0, activeStepIdx - 1);
      renderActive();
    });
    cardEl.querySelector('#learnExit2').addEventListener('click', () => store.set({ activeTutorial: null }));

    // clear previous highlights
    document.querySelectorAll('.is-highlighted').forEach((el) => el.classList.remove('is-highlighted'));

    // show coach mark if there's a target
    if (step.highlight) {
      const targetEl = document.querySelector(step.highlight);
      if (targetEl) {
        targetEl.classList.add('is-highlighted');
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const totalSteps = t.steps.length;
        const isLast = activeStepIdx === totalSteps - 1;
        coach.show({
          target: targetEl,
          step: activeStepIdx + 1,
          totalSteps,
          title: step.title,
          body: step.body,
          hint: step.hint,
          placement: step.placement || 'top',
          actions: step.verify
            ? [
                {
                  label: isLast ? 'Finish ✓' : 'Skip step',
                  primary: false,
                  onClick: () => advance(),
                },
              ]
            : [
                {
                  label: isLast ? 'Finish ✓' : 'Next →',
                  primary: true,
                  onClick: () => advance(),
                },
              ],
          autoAdvance: !!step.autoNext,
        });

        // auto-advance if specified (no user action needed)
        if (step.autoNext) {
          clearTimeout(autoTimer);
          autoTimer = setTimeout(() => advance(), step.autoNext);
        }

        // verify-based auto-advance
        if (step.verify) {
          clearInterval(verifyTimer);
          verifyTimer = setInterval(() => {
            if (step.verify(store.get())) advance();
          }, 250);
        }
      } else {
        // target not visible — fall back to side panel only
        coach.hide();
      }
    } else {
      coach.hide();
    }
  }

  function advance() {
    activeStepIdx++;
    const t = TUTORIALS_BY_ID[activeId];
    if (activeStepIdx >= t.steps.length) {
      store.set({
        tutorials: { ...store.get().tutorials, [activeId]: { currentStep: t.steps.length, completed: true } },
      });
      showToast('Lesson complete 🎉');
    } else {
      store.set({
        tutorials: { ...store.get().tutorials, [activeId]: { currentStep: activeStepIdx, completed: false } },
      });
    }
    renderActive();
    refreshList();
  }

  function refreshList() {
    listEl.querySelectorAll('.learn__item').forEach((card) => {
      const id = card.dataset.id;
      const t = TUTORIALS_BY_ID[id];
      const progress = store.get().tutorials[id];
      card.querySelector('.learn__item-meta').textContent = `${t.estimatedMinutes} min · ${progress.completed ? '✅ Done' : progress.currentStep > 0 ? `Step ${progress.currentStep + 1}/${t.steps.length}` : 'Not started'}`;
    });
  }

  store.on('activeTutorial', (id) => {
    activeId = id;
    const progress = store.get().tutorials[id];
    activeStepIdx = progress?.currentStep ?? 0;
    if (progress?.completed) activeStepIdx = 0;
    renderActive();
  });
}