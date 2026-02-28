// src/panels/MinimapPanel.ts
// Thumbnail of the full simulation canvas + viewport indicator.

import { simState } from '../SimState';
import { buildPanel } from './BrainPanel';

const MAP_W = 220;
const MAP_H = 220;

export function createMinimapPanel(): HTMLElement {
    const panel = buildPanel('minimap', '🗺 Minimap', 240, 265, 20, 500);
    const body = panel.querySelector('.panel-body') as HTMLElement;
    body.style.display = 'flex';
    body.style.alignItems = 'center';
    body.style.justifyContent = 'center';
    body.style.padding = '8px';

    const canvas = document.createElement('canvas');
    canvas.id = 'minimap-canvas';
    canvas.width = MAP_W;
    canvas.height = MAP_H;
    canvas.style.cssText = 'border-radius:6px;cursor:crosshair;background:#111;max-width:100%;max-height:100%;';
    body.appendChild(canvas);

    // Click on minimap → pan simulation camera
    canvas.addEventListener('click', (e) => {
        const sim = simState.simulationCanvas;
        if (!sim) return;
        const rect = canvas.getBoundingClientRect();
        const nx = (e.clientX - rect.left) / rect.width;
        const ny = (e.clientY - rect.top) / rect.height;

        const simW = sim.width;
        const simH = sim.height;
        const { scale } = simState.camera;
        // Centre camera on the clicked world point
        simState.camera.tx = window.innerWidth / 2 - nx * simW * scale;
        simState.camera.ty = window.innerHeight / 2 - ny * simH * scale;
    });

    return panel;
}

export function updateMinimapPanel() {
    const mmCanvas = document.getElementById('minimap-canvas') as HTMLCanvasElement;
    const sim = simState.simulationCanvas;
    if (!mmCanvas || !sim) return;
    const ctx = mmCanvas.getContext('2d');
    if (!ctx) return;

    // Thumbnail of simulation
    ctx.clearRect(0, 0, MAP_W, MAP_H);
    ctx.drawImage(sim, 0, 0, MAP_W, MAP_H);

    // Draw viewport rectangle
    const { tx, ty, scale } = simState.camera;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const simW = sim.width;
    const simH = sim.height;

    // Screen → world: wx = (sx - tx) / scale
    // World → minimap: mx = wx / simW * MAP_W
    const toMapX = (sx: number) => ((sx - tx) / scale) / simW * MAP_W;
    const toMapY = (sy: number) => ((sy - ty) / scale) / simH * MAP_H;

    const rx = toMapX(0);
    const ry = toMapY(0);
    const rw = toMapX(vw) - rx;
    const rh = toMapY(vh) - ry;

    ctx.strokeStyle = 'rgba(99, 179, 255, 0.85)';
    ctx.lineWidth = 2;
    ctx.strokeRect(rx, ry, rw, rh);
}
