// src/panels/SaveLoadPanel.ts
// Export / Import brain JSON and full session JSON.

import { simState } from '../SimState';
import { GeneticAlgorithm } from '../AI';
import type { NeuralNetworkJSON } from '../brain-js';
import { buildPanel } from './BrainPanel';
import { resetChartData, finalizeRun, setCurrentRunStartGen, clearRunHistory } from './ChartPanel';

export function createSaveLoadPanel(): HTMLElement {
    const panel = buildPanel('saveload', '💾 Save / Load', 280, 310, window.innerWidth - 305, window.innerHeight - 330);
    const body = panel.querySelector('.panel-body') as HTMLElement;
    body.style.padding = '12px 14px';
    body.style.gap = '8px';
    body.style.display = 'flex';
    body.style.flexDirection = 'column';

    body.innerHTML = `
    <div class="sl-section">
      <div class="sl-title">Brain</div>
      <button id="sl-btn-export">⬇ Export Best Brain (.json)</button>
      <button id="sl-btn-import">⬆ Import Brain (.json)</button>
    </div>
    <div class="sl-section">
      <div class="sl-title">Session</div>
      <button id="sl-btn-save-session">📦 Save Session</button>
      <button id="sl-btn-load-session">📂 Load Session</button>
    </div>
    <div class="sl-section">
      <div class="sl-title">Generation</div>
      <button id="sl-btn-restart">↩ Restart Generation</button>
      <button id="sl-btn-load-preset">🧬 New Sim from brain1.json</button>
      <button id="sl-btn-clear" class="sl-btn-danger">🗑 Clear History</button>
    </div>
    <div id="sl-status" style="font-size:0.78rem;color:#888;min-height:18px;"></div>
  `;

    body.querySelector('#sl-btn-export')?.addEventListener('click', exportBrain);
    body.querySelector('#sl-btn-import')?.addEventListener('click', importBrain);
    body.querySelector('#sl-btn-save-session')?.addEventListener('click', saveSession);
    body.querySelector('#sl-btn-load-session')?.addEventListener('click', loadSession);

    body.querySelector('#sl-btn-restart')?.addEventListener('click', () => {
        const { ga, track } = simState;
        if (!ga || !track) return;
        finalizeRun(ga);
        resetChartData();
        simState.ga = new GeneticAlgorithm(
            simState.populationSize,
            track.startPoint.x, track.startPoint.y, track.startAngle,
        );
        simState.ga.generation = 1;
        setCurrentRunStartGen(1);
        setStatus('Generation restarted.');
    });

    body.querySelector('#sl-btn-load-preset')?.addEventListener('click', () => {
        if (!confirm('Start a completely new simulation seeded from brain1.json?')) return;
        const { ga, track } = simState;
        if (ga) finalizeRun(ga);
        clearRunHistory();
        resetChartData();
        localStorage.removeItem('best_boid_brain');
        localStorage.removeItem('current_generation');
        if (!track) return;
        fetch('./brain1.json')
            .then(r => r.json())
            .then((data: { network?: object }) => {
                if (!data.network) { setStatus('❌ brain1.json missing network'); return; }
                simState.ga = new GeneticAlgorithm(
                    simState.populationSize,
                    track.startPoint.x, track.startPoint.y, track.startAngle,
                );
                simState.ga.generation = 1;
                setCurrentRunStartGen(1);
                simState.ga.boids[0].network.fromJSON(data.network as NeuralNetworkJSON);
                localStorage.setItem('best_boid_brain', JSON.stringify(data.network));
                setStatus('✅ New sim started from brain1.json');
            })
            .catch(() => setStatus('❌ Could not load brain1.json'));
    });

    body.querySelector('#sl-btn-clear')?.addEventListener('click', () => {
        if (!confirm('Clear all training history? This will reset the brain.')) return;
        const { ga, track } = simState;
        if (ga) finalizeRun(ga);
        clearRunHistory();
        resetChartData();
        localStorage.removeItem('best_boid_brain');
        localStorage.removeItem('current_generation');
        if (!track) return;
        simState.ga = new GeneticAlgorithm(
            simState.populationSize,
            track.startPoint.x, track.startPoint.y, track.startAngle,
        );
        simState.ga.generation = 1;
        setCurrentRunStartGen(1);
        setStatus('History cleared.');
    });

    return panel;
}

function setStatus(msg: string) {
    const el = document.getElementById('sl-status');
    if (el) { el.textContent = msg; setTimeout(() => { if (el) el.textContent = ''; }, 3000); }
}

function exportBrain() {
    const { ga } = simState;
    if (!ga) return;
    const best = ga.boids.reduce((b, c) => c.fitness > b.fitness ? c : b, ga.boids[0]);
    if (!best) return;
    const data = {
        generation: ga.generation,
        fitness: best.fitness,
        network: best.network.toJSON() as NeuralNetworkJSON,
        exportedAt: new Date().toISOString(),
    };
    downloadJSON(data, `brain-gen${ga.generation}-fit${Math.floor(best.fitness)}.json`);
    setStatus(`Exported gen ${ga.generation}.`);
}

function importBrain() {
    pickFile('.json', async (file) => {
        try {
            const data = JSON.parse(await file.text());
            if (!data.network?.layers) { setStatus('❌ Invalid brain file'); return; }
            const { ga } = simState;
            if (!ga) return;
            ga.boids[0].network.fromJSON(data.network as NeuralNetworkJSON);
            localStorage.setItem('best_boid_brain', JSON.stringify(data.network));
            if (data.generation) {
                ga.generation = data.generation;
                localStorage.setItem('current_generation', String(data.generation));
            }
            setStatus(`✅ Brain imported (gen ${data.generation ?? '?'}, fit ${Math.floor(data.fitness ?? 0)})`);
        } catch (err) {
            setStatus(`❌ ${(err as Error).message}`);
        }
    });
}

function saveSession() {
    const { ga, track } = simState;
    if (!ga || !track) return;
    const best = ga.getBestActiveBoid();
    const data = {
        generation: ga.generation,
        trackSeed: track.seed,
        bestBrainJSON: best ? best.network.toJSON() : null,
        savedAt: new Date().toISOString(),
    };
    downloadJSON(data, `session-gen${ga.generation}-${Date.now()}.json`);
    setStatus('Session saved.');
}

function loadSession() {
    pickFile('.json', async (file) => {
        try {
            const data = JSON.parse(await file.text());
            const { ga } = simState;
            if (!ga) return;
            if (data.generation) ga.generation = data.generation;
            if (data.bestBrainJSON) {
                ga.boids[0].network.fromJSON(data.bestBrainJSON);
                localStorage.setItem('best_boid_brain', JSON.stringify(data.bestBrainJSON));
            }
            if (data.trackSeed && simState.track) {
                simState.track.generateSimpleLoopedTrack(1200, 1200, data.trackSeed);
            }
            setStatus(`✅ Session loaded (gen ${data.generation ?? '?'})`);
        } catch (err) {
            setStatus(`❌ ${(err as Error).message}`);
        }
    });
}

function downloadJSON(data: object, filename: string) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
}

function pickFile(accept: string, cb: (f: File) => void) {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = accept;
    inp.onchange = (e) => {
        const f = (e.target as HTMLInputElement).files?.[0];
        if (f) cb(f);
    };
    inp.click();
}
