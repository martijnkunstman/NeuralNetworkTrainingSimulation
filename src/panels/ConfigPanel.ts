// src/panels/ConfigPanel.ts
// Live configuration sliders for GA and simulation parameters.

import { simState } from '../SimState';
import { buildPanel } from './BrainPanel';

export function createConfigPanel(): HTMLElement {
    const panel = buildPanel('config', '⚙️ Config', 300, 400, window.innerWidth - 325, 330);
    const body = panel.querySelector('.panel-body') as HTMLElement;
    body.style.overflowY = 'auto';
    body.style.padding = '10px 14px';

    body.innerHTML = `
    <div class="cfg-section">
      <div class="cfg-label">Population Size</div>
      <div class="cfg-row">
        <input type="range" id="cfg-pop-size" min="10" max="200" step="5" value="${simState.populationSize}">
        <span class="cfg-value" id="cfg-pop-size-val">${simState.populationSize}</span>
      </div>
    </div>

    <div class="cfg-section">
      <div class="cfg-label">Mutation Rate</div>
      <div class="cfg-row">
        <input type="range" id="cfg-mutation" min="0.01" max="0.5" step="0.01" value="0.1">
        <span class="cfg-value" id="cfg-mutation-val">0.10</span>
      </div>
    </div>

    <div class="cfg-section">
      <div class="cfg-label">Tournament Size</div>
      <div class="cfg-row">
        <input type="range" id="cfg-tournament" min="2" max="10" step="1" value="3">
        <span class="cfg-value" id="cfg-tournament-val">3</span>
      </div>
    </div>

    <div class="cfg-section">
      <div class="cfg-label">Elite Count</div>
      <div class="cfg-row">
        <input type="range" id="cfg-elite" min="1" max="10" step="1" value="1">
        <span class="cfg-value" id="cfg-elite-val">1</span>
      </div>
    </div>

    <div class="cfg-section">
      <div class="cfg-label">Max Lifespan (frames)</div>
      <div class="cfg-row">
        <input type="range" id="cfg-lifespan" min="200" max="5000" step="100" value="2000">
        <span class="cfg-value" id="cfg-lifespan-val">2000</span>
      </div>
    </div>

    <div class="cfg-section">
      <div class="cfg-label">Track Options</div>
      <div class="cfg-row-v">
        <button id="cfg-btn-randomize">🔀 Randomize Track</button>
        <div style="display:flex;align-items:center;gap:8px;margin-top:6px;">
          <input type="checkbox" id="cfg-auto-randomize">
          <label for="cfg-auto-randomize" style="font-size:0.85rem;">Auto-randomize every</label>
          <input type="number" id="cfg-auto-gens" min="1" max="100" value="${simState.randomizeInterval}"
                 style="width:46px;background:#1a1a2e;border:1px solid #333;color:#ddd;border-radius:4px;padding:2px 4px;font-size:0.85rem;">
          <span style="font-size:0.85rem;">gen</span>
        </div>
        <div style="margin-top:6px;font-size:0.8rem;color:#666;">
          Seed: <span id="cfg-track-seed">Default</span>
        </div>
      </div>
    </div>

    <div class="cfg-section">
      <button id="cfg-btn-fast" class="cfg-btn-danger">⚡ Toggle Fast Training</button>
    </div>
  `;

    wireSlider(body, 'cfg-pop-size', 'cfg-pop-size-val', (v) => { simState.populationSize = v; });
    wireSlider(body, 'cfg-mutation', 'cfg-mutation-val', (v) => { if (simState.ga) simState.ga.mutationRate = v; }, 2);
    wireSlider(body, 'cfg-tournament', 'cfg-tournament-val', (v) => {
        if (!simState.ga) return;
        // Tournament size must be smaller than population size to avoid infinite loops
        const clamped = Math.min(v, simState.populationSize - 1);
        simState.ga.tournamentSize = clamped;
        if (clamped !== v) {
            const slider = body.querySelector('#cfg-tournament') as HTMLInputElement;
            const valEl = body.querySelector('#cfg-tournament-val');
            if (slider) slider.value = String(clamped);
            if (valEl) valEl.textContent = String(clamped);
        }
    });
    wireSlider(body, 'cfg-elite', 'cfg-elite-val', (v) => {
        if (!simState.ga) return;
        // Elite count must leave room for at least one crossover child
        const clamped = Math.min(v, simState.populationSize - 2);
        simState.ga.eliteCount = clamped;
        if (clamped !== v) {
            const slider = body.querySelector('#cfg-elite') as HTMLInputElement;
            const valEl = body.querySelector('#cfg-elite-val');
            if (slider) slider.value = String(clamped);
            if (valEl) valEl.textContent = String(clamped);
        }
    });
    wireSlider(body, 'cfg-lifespan', 'cfg-lifespan-val', (v) => { if (simState.ga) simState.ga.maxLifespan = v; });

    body.querySelector('#cfg-btn-randomize')?.addEventListener('click', () => {
        if (!simState.track || !simState.ga) return;
        const newSeed = simState.track.randomize(1200, 1200);
        const seedEl = document.getElementById('cfg-track-seed');
        if (seedEl) seedEl.textContent = String(newSeed);
        resetBoidsForNewTrack();
    });

    const autoCheck = body.querySelector('#cfg-auto-randomize') as HTMLInputElement;
    autoCheck?.addEventListener('change', () => {
        simState.autoRandomizeTrack = autoCheck.checked;
    });

    body.querySelector('#cfg-auto-gens')?.addEventListener('change', (e) => {
        const v = parseInt((e.target as HTMLInputElement).value);
        if (!isNaN(v) && v > 0) simState.randomizeInterval = v;
    });

    const fastBtn = body.querySelector('#cfg-btn-fast') as HTMLButtonElement;
    fastBtn?.addEventListener('click', () => {
        simState.isFastTraining = !simState.isFastTraining;
        fastBtn.textContent = simState.isFastTraining ? '🐢 Toggle Normal Viz' : '⚡ Toggle Fast Training';
    });

    return panel;
}

export function updateConfigPanel() {
    const panel = document.querySelector('[data-panel-id="config"]') as HTMLElement | null;
    if (!panel || panel.style.display === 'none') return;
    const seedEl = document.getElementById('cfg-track-seed');
    if (seedEl && simState.track) {
        seedEl.textContent = simState.track.seed === 0 ? 'Default' : String(simState.track.seed);
    }
}

function wireSlider(
    root: HTMLElement,
    sliderId: string,
    valId: string,
    onChange: (v: number) => void,
    decimals = 0,
) {
    const slider = root.querySelector(`#${sliderId}`) as HTMLInputElement;
    const valEl = root.querySelector(`#${valId}`) as HTMLElement;
    if (!slider || !valEl) return;
    slider.addEventListener('input', () => {
        const v = parseFloat(slider.value);
        valEl.textContent = v.toFixed(decimals);
        onChange(v);
    });
}

export function resetBoidsForNewTrack() {
    const { ga, track } = simState;
    if (!ga || !track) return;
    for (const boid of ga.boids) {
        boid.pos.x = track.startPoint.x;
        boid.pos.y = track.startPoint.y;
        boid.heading = track.startAngle;
        boid.isDead = false;
        boid.fitness = 0;
        boid.distanceTraveled = 0;
        boid.checkpointCount = 0;
        boid.life = 500;
    }
    ga.timer = 0;
}
