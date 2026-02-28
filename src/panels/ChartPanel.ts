// src/panels/ChartPanel.ts
// Rolling line chart of fitness, alive boids, and diversity over generations.
// Persists chart data and run history across page reloads via localStorage.

import { simState } from '../SimState';
import { GeneticAlgorithm } from '../AI';
import { buildPanel } from './BrainPanel';

const MAX_POINTS = 200;

interface RunRecord {
    runId: number;
    genCount: number;
    peakFitness: number;
    finalSurvivorCount: number;
    finalSurvivorPct: number;
    finalDiversity: number;
    timestamp: number;
}

// Per-generation chart arrays for current run
const fitnessData: number[] = [];
const aliveData: number[] = [];
const diversityData: number[] = [];

let lastGen = -1;
let currentRunStartGen = 1;
let currentRunPeakFitness = 0;
let runHistory: RunRecord[] = [];

// Restore state from localStorage on module load
(function restoreFromStorage() {
    try {
        const savedHistory = localStorage.getItem('nnts_run_history');
        if (savedHistory) runHistory = JSON.parse(savedHistory);

        const savedFitness = localStorage.getItem('nnts_chart_fitness');
        const savedAlive = localStorage.getItem('nnts_chart_alive');
        const savedDiv = localStorage.getItem('nnts_chart_diversity');
        const savedLastGen = localStorage.getItem('nnts_chart_lastgen');
        const savedPeak = localStorage.getItem('nnts_chart_peak');
        const savedStartGen = localStorage.getItem('nnts_chart_startgen');

        if (savedFitness) fitnessData.push(...JSON.parse(savedFitness));
        if (savedAlive) aliveData.push(...JSON.parse(savedAlive));
        if (savedDiv) diversityData.push(...JSON.parse(savedDiv));
        if (savedLastGen) lastGen = parseInt(savedLastGen);
        if (savedPeak) currentRunPeakFitness = parseFloat(savedPeak);
        if (savedStartGen) currentRunStartGen = parseInt(savedStartGen);
    } catch {
        // Corrupted storage — start fresh
    }
})();

export function createChartPanel(): HTMLElement {
    const panel = buildPanel('chart', '📈 Training Chart', 360, 380, window.innerWidth - 380, 60);
    const body = panel.querySelector('.panel-body') as HTMLElement;

    // Toggle checkboxes
    const controls = document.createElement('div');
    controls.className = 'chart-controls';
    controls.innerHTML = `
    <label><input type="checkbox" id="chart-show-fitness"   checked> <span style="color:#4ade80">Fitness</span></label>
    <label><input type="checkbox" id="chart-show-alive"     checked> <span style="color:#60a5fa">Survivors</span></label>
    <label><input type="checkbox" id="chart-show-diversity" checked> <span style="color:#f97316">Diversity</span></label>
  `;
    body.appendChild(controls);

    const canvas = document.createElement('canvas');
    canvas.id = 'chart-canvas';
    canvas.style.cssText = 'width:100%;display:block;';
    canvas.width = 340;
    canvas.height = 180;
    body.appendChild(canvas);

    const histDiv = document.createElement('div');
    histDiv.id = 'chart-run-history';
    histDiv.style.cssText = [
        'overflow-y:auto',
        'max-height:110px',
        'font-size:0.70rem',
        'color:#aaa',
        'border-top:1px solid rgba(255,255,255,0.08)',
        'padding-top:5px',
        'margin-top:4px',
        'flex-shrink:0',
    ].join(';');
    body.appendChild(histDiv);

    const ro = new ResizeObserver(() => {
        const b = panel.querySelector('.panel-body') as HTMLElement;
        canvas.width = b.clientWidth;
        // Reserve space for controls and history section
        canvas.height = Math.max(80, b.clientHeight - (controls.offsetHeight || 28) - (histDiv.offsetHeight || 120));
    });
    ro.observe(body);

    return panel;
}

/** Snapshot current run data and push a RunRecord to history. */
export function finalizeRun(ga: GeneticAlgorithm) {
    if (fitnessData.length === 0 && !ga.lastGenEndStats) return;

    const stats = ga.lastGenEndStats;
    const lastFitness = fitnessData[fitnessData.length - 1] ?? 0;
    const lastAlive = aliveData[aliveData.length - 1] ?? 0;
    const lastDiv = diversityData[diversityData.length - 1] ?? 0;

    const record: RunRecord = {
        runId: (runHistory[runHistory.length - 1]?.runId ?? 0) + 1,
        genCount: (stats?.generation ?? ga.generation) - currentRunStartGen,
        peakFitness: currentRunPeakFitness || lastFitness,
        finalSurvivorCount: stats
            ? stats.survivorCount
            : Math.round((lastAlive / 100) * simState.populationSize),
        finalSurvivorPct: lastAlive,
        finalDiversity: stats ? stats.diversity : lastDiv,
        timestamp: Date.now(),
    };

    runHistory.push(record);
    if (runHistory.length > 50) runHistory.shift();
    localStorage.setItem('nnts_run_history', JSON.stringify(runHistory));
}

/** Clear all chart history (call when restarting the GA). */
export function resetChartData() {
    fitnessData.length = 0;
    aliveData.length = 0;
    diversityData.length = 0;
    lastGen = -1;
    currentRunPeakFitness = 0;
    localStorage.removeItem('nnts_chart_fitness');
    localStorage.removeItem('nnts_chart_alive');
    localStorage.removeItem('nnts_chart_diversity');
    localStorage.removeItem('nnts_chart_lastgen');
    localStorage.removeItem('nnts_chart_peak');
    localStorage.removeItem('nnts_chart_startgen');
}

/** Set the generation at which the current run started (call after new GA is created). */
export function setCurrentRunStartGen(gen: number) {
    currentRunStartGen = gen;
    localStorage.setItem('nnts_chart_startgen', String(gen));
}

/** Wipe all run history from memory and localStorage. */
export function clearRunHistory() {
    runHistory.length = 0;
    localStorage.removeItem('nnts_run_history');
}

export function recordChartData() {
    const { ga } = simState;
    if (!ga) return;

    const stats = ga.lastGenEndStats;
    if (!stats || stats.generation === lastGen) return;
    lastGen = stats.generation;

    const maxFit = stats.bestFitness;
    const alivePct = (stats.survivorCount / simState.populationSize) * 100;
    const div = stats.diversity;

    currentRunPeakFitness = Math.max(currentRunPeakFitness, maxFit);

    fitnessData.push(maxFit);
    aliveData.push(alivePct);
    diversityData.push(div);

    if (fitnessData.length > MAX_POINTS) fitnessData.shift();
    if (aliveData.length > MAX_POINTS) aliveData.shift();
    if (diversityData.length > MAX_POINTS) diversityData.shift();

    localStorage.setItem('nnts_chart_fitness', JSON.stringify(fitnessData));
    localStorage.setItem('nnts_chart_alive', JSON.stringify(aliveData));
    localStorage.setItem('nnts_chart_diversity', JSON.stringify(diversityData));
    localStorage.setItem('nnts_chart_lastgen', String(lastGen));
    localStorage.setItem('nnts_chart_peak', String(currentRunPeakFitness));
}

export function updateChartPanel() {
    const panel = document.querySelector('[data-panel-id="chart"]') as HTMLElement | null;
    if (!panel || panel.style.display === 'none' || panel.classList.contains('panel--minimized')) return;
    const canvas = document.getElementById('chart-canvas') as HTMLCanvasElement;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;

    // Background
    ctx.fillStyle = '#0d0f14';
    ctx.fillRect(0, 0, W, H);

    // Grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
        const y = H * (i / 4);
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }

    const showFitness = (document.getElementById('chart-show-fitness') as HTMLInputElement)?.checked ?? true;
    const showAlive = (document.getElementById('chart-show-alive') as HTMLInputElement)?.checked ?? true;
    const showDiversity = (document.getElementById('chart-show-diversity') as HTMLInputElement)?.checked ?? true;

    drawLine(ctx, fitnessData, '#4ade80', W, H, showFitness);
    drawLine(ctx, aliveData, '#60a5fa', W, H, showAlive, 0, 100);
    drawLine(ctx, diversityData, '#f97316', W, H, showDiversity);

    // Axis label
    ctx.fillStyle = '#555';
    ctx.font = '10px Inter,sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`gen ${simState.ga?.generation ?? 0}`, W - 4, H - 4);

    // Run history table
    const histDiv = document.getElementById('chart-run-history');
    if (!histDiv) return;

    if (runHistory.length === 0) {
        histDiv.innerHTML = '<span style="color:#444;font-size:0.68rem;">No completed runs yet.</span>';
        return;
    }

    const rows = [...runHistory].reverse().map(r => {
        const d = new Date(r.timestamp);
        const pad = (n: number) => String(n).padStart(2, '0');
        const dateStr = `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${pad(d.getMinutes())}`;
        return `<tr>
          <td style="padding:1px 4px;color:#888">#${r.runId}</td>
          <td style="padding:1px 4px">${r.genCount}</td>
          <td style="padding:1px 4px;color:#4ade80">${Math.floor(r.peakFitness).toLocaleString()}</td>
          <td style="padding:1px 4px;color:#60a5fa">${Math.round(r.finalSurvivorPct)}%</td>
          <td style="padding:1px 4px;color:#f97316">${r.finalDiversity.toFixed(2)}</td>
          <td style="padding:1px 4px;color:#555">${dateStr}</td>
        </tr>`;
    }).join('');

    histDiv.innerHTML = `<table style="width:100%;border-collapse:collapse;line-height:1.4;">
      <thead><tr style="color:#444;border-bottom:1px solid rgba(255,255,255,0.06);">
        <th style="padding:1px 4px;font-weight:normal;text-align:left">Run</th>
        <th style="padding:1px 4px;font-weight:normal;text-align:left">Gens</th>
        <th style="padding:1px 4px;font-weight:normal;text-align:left">Peak</th>
        <th style="padding:1px 4px;font-weight:normal;text-align:left">Surv</th>
        <th style="padding:1px 4px;font-weight:normal;text-align:left">Div</th>
        <th style="padding:1px 4px;font-weight:normal;text-align:left">Date</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function drawLine(
    ctx: CanvasRenderingContext2D,
    data: number[],
    color: string,
    W: number, H: number,
    visible: boolean,
    minV?: number,
    maxV?: number,
) {
    if (!visible || data.length < 2) return;
    const lo = minV ?? Math.min(...data);
    const hi = maxV ?? Math.max(...data);
    const range = hi - lo || 1;

    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.shadowColor = color;
    ctx.shadowBlur = 4;

    for (let i = 0; i < data.length; i++) {
        const x = (i / (data.length - 1)) * W;
        const y = H - ((data[i] - lo) / range) * (H - 4) - 2;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;
}
