// src/panels/ChartPanel.ts
// Rolling line chart of fitness, alive boids, and diversity over generations.

import { simState } from '../SimState';
import { buildPanel } from './BrainPanel';

const MAX_POINTS = 200;

// Separate arrays per metric
const fitnessData: number[] = [];
const aliveData: number[] = [];
const diversityData: number[] = [];

let lastGen = -1;

export function createChartPanel(): HTMLElement {
    const panel = buildPanel('chart', '📈 Training Chart', 360, 260, window.innerWidth - 380, 60);
    const body = panel.querySelector('.panel-body') as HTMLElement;

    // Toggle checkboxes
    const controls = document.createElement('div');
    controls.className = 'chart-controls';
    controls.innerHTML = `
    <label><input type="checkbox" id="chart-show-fitness"   checked> <span style="color:#4ade80">Fitness</span></label>
    <label><input type="checkbox" id="chart-show-alive"     checked> <span style="color:#60a5fa">Alive %</span></label>
    <label><input type="checkbox" id="chart-show-diversity" checked> <span style="color:#f97316">Diversity</span></label>
  `;
    body.appendChild(controls);

    const canvas = document.createElement('canvas');
    canvas.id = 'chart-canvas';
    canvas.style.cssText = 'flex:1;width:100%;display:block;';
    canvas.width = 340;
    canvas.height = 180;
    body.appendChild(canvas);

    const ro = new ResizeObserver(() => {
        const b = panel.querySelector('.panel-body') as HTMLElement;
        canvas.width = b.clientWidth;
        canvas.height = b.clientHeight - (controls.offsetHeight || 28);
    });
    ro.observe(body);

    return panel;
}

export function recordChartData() {
    const { ga } = simState;
    if (!ga || ga.generation === lastGen) return;
    lastGen = ga.generation;

    const best = ga.getBestActiveBoid();
    const alive = ga.boids.filter(b => !b.isDead).length;
    const maxFit = best ? best.fitness : 0;
    const div = ga.calculateDiversity();

    fitnessData.push(maxFit);
    aliveData.push((alive / simState.populationSize) * 100);
    diversityData.push(div);

    if (fitnessData.length > MAX_POINTS) fitnessData.shift();
    if (aliveData.length > MAX_POINTS) aliveData.shift();
    if (diversityData.length > MAX_POINTS) diversityData.shift();
}

export function updateChartPanel() {
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
