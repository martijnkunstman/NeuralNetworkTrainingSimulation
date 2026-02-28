// src/panels/DebugPanel.ts
// Live readouts: FPS, stats, boid I/O, console log capture.

import { simState } from '../SimState';
import { buildPanel } from './BrainPanel';

const MAX_LOG_LINES = 200;
let logLines: string[] = [];

/** Write a message to the Debug panel's log textarea. */
export function debugLog(...args: unknown[]) {
    const line = args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
    logLines.push(`[log] ${line}`);
    if (logLines.length > MAX_LOG_LINES * 2) logLines = logLines.slice(-MAX_LOG_LINES);
}

export function createDebugPanel(): HTMLElement {
    const panel = buildPanel('debug', '🐛 Debug', 320, 380, 390, 60);
    const body = panel.querySelector('.panel-body') as HTMLElement;
    body.style.display = 'flex';
    body.style.flexDirection = 'column';
    body.style.padding = '10px 12px';
    body.style.gap = '6px';

    body.innerHTML = `
    <div class="dbg-stats">
      <div class="dbg-row"><span>FPS</span><span id="dbg-fps">—</span></div>
      <div class="dbg-row"><span>Generation</span><span id="dbg-gen">—</span></div>
      <div class="dbg-row"><span>Frames Left</span><span id="dbg-frames">—</span></div>
      <div class="dbg-row"><span>Alive</span><span id="dbg-alive">—</span></div>
      <div class="dbg-row"><span>Best Fitness</span><span id="dbg-fitness">—</span></div>
      <div class="dbg-row"><span>Diversity</span><span id="dbg-diversity">—</span></div>
    </div>
    <div class="dbg-section-title">Best Boid I/O</div>
    <div class="dbg-stats" id="dbg-io"></div>
    <div class="dbg-section-title" style="display:flex;justify-content:space-between;">
      Console Log <button id="dbg-clear-log" style="font-size:0.75rem;padding:1px 6px;">Clear</button>
    </div>
    <textarea id="dbg-log" readonly style="flex:1;resize:none;background:#0a0c10;border:1px solid #222;border-radius:6px;color:#8be;font-family:monospace;font-size:0.72rem;padding:6px;overflow-y:auto;"></textarea>
  `;

    body.querySelector('#dbg-clear-log')?.addEventListener('click', () => {
        logLines = [];
        const ta = document.getElementById('dbg-log') as HTMLTextAreaElement;
        if (ta) ta.value = '';
    });

    return panel;
}

export function updateDebugPanel() {
    const panel = document.querySelector('[data-panel-id="debug"]') as HTMLElement | null;
    if (!panel || panel.style.display === 'none') return;
    const { ga, fps } = simState;
    if (!ga) return;

    setText('dbg-fps', fps.toFixed(1));
    setText('dbg-gen', String(ga.generation));
    setText('dbg-frames', String(Math.max(0, ga.maxLifespan - ga.timer)));

    const alive = ga.boids.filter(b => !b.isDead).length;
    setText('dbg-alive', `${alive} / ${simState.populationSize}`);

    const best = ga.getBestActiveBoid();
    setText('dbg-fitness', best ? Math.floor(best.fitness).toString() : '—');

    if (ga.timer % 15 === 0) {
        const div = ga.calculateDiversity();
        const divEl = document.getElementById('dbg-diversity');
        if (divEl) {
            divEl.textContent = div.toFixed(2);
            divEl.style.color = div < 1 ? '#f87171' : div < 3 ? '#fb923c' : '#4ade80';
        }
    }

    // Sensor I/O
    const ioContainer = document.getElementById('dbg-io');
    if (ioContainer && best) {
        const sensorLabels = ['L', 'FL', 'F', 'FR', 'R'];
        const outLabels = ['Thr', 'Str'];
        let html = '';
        best.lastInputs.forEach((v, i) => {
            html += `<div class="dbg-row"><span>In[${sensorLabels[i] || i}]</span><span>${v.toFixed(3)}</span></div>`;
        });
        best.lastOutputs.forEach((v, i) => {
            html += `<div class="dbg-row"><span>Out[${outLabels[i] || i}]</span><span>${v.toFixed(3)}</span></div>`;
        });
        ioContainer.innerHTML = html;
    }

    // Push new log lines to textarea
    if (logLines.length) {
        const ta = document.getElementById('dbg-log') as HTMLTextAreaElement;
        if (ta) {
            const lines = logLines.splice(0);
            ta.value += lines.join('\n') + '\n';
            // Trim to last N lines
            const all = ta.value.split('\n');
            if (all.length > MAX_LOG_LINES) ta.value = all.slice(-MAX_LOG_LINES).join('\n');
            ta.scrollTop = ta.scrollHeight;
        }
    }
}

function setText(id: string, v: string) {
    const el = document.getElementById(id);
    if (el) el.textContent = v;
}

