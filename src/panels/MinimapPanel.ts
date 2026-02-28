// src/panels/MinimapPanel.ts
// Renders the full world at a fixed scale, independent of camera zoom.
// Overlays the current viewport as a rectangle (non-square when screen is not square).

import { simState } from '../SimState';
import { buildPanel } from './BrainPanel';
import { Track } from '../Track';

const MAP_SIZE = 220;
const WORLD = Track.FIXED_SIZE; // 1200
// Fixed scale: always maps the full 1200×1200 world to the MAP_SIZE canvas
const MM_SCALE = MAP_SIZE / WORLD;

export function createMinimapPanel(): HTMLElement {
    const panelW = MAP_SIZE + 16;
    const panelH = MAP_SIZE + 16 + 34;
    const panel = buildPanel('minimap', '🗺 Minimap', panelW, panelH, 20, 500);
    panel.style.resize = 'none';

    const body = panel.querySelector('.panel-body') as HTMLElement;
    body.style.display = 'flex';
    body.style.alignItems = 'center';
    body.style.justifyContent = 'center';
    body.style.padding = '8px';

    const canvas = document.createElement('canvas');
    canvas.id = 'minimap-canvas';
    canvas.width = MAP_SIZE;
    canvas.height = MAP_SIZE;
    canvas.style.cssText = 'border-radius:6px;background:#111;display:block;';
    body.appendChild(canvas);

    return panel;
}

export function updateMinimapPanel() {
    const panel = document.querySelector('[data-panel-id="minimap"]') as HTMLElement | null;
    if (!panel || panel.style.display === 'none' || panel.classList.contains('panel--minimized')) return;

    const mmCanvas = document.getElementById('minimap-canvas') as HTMLCanvasElement;
    const { ga, track, camera } = simState;
    if (!mmCanvas || !ga || !track) return;

    const ctx = mmCanvas.getContext('2d');
    if (!ctx) return;

    // ── Draw the world at fixed minimap scale ─────────────────────────────
    ctx.fillStyle = '#0a0c10';
    ctx.fillRect(0, 0, MAP_SIZE, MAP_SIZE);

    ctx.save();
    ctx.setTransform(MM_SCALE, 0, 0, MM_SCALE, 0, 0);
    track.draw(ctx);
    const best = ga.getBestActiveBoid();
    for (const boid of ga.boids) {
        boid.draw(ctx, boid === best);
    }
    ctx.restore();

    // ── Overlay viewport rectangle ────────────────────────────────────────
    // World coords of screen edges: wx = (screenX - camera.tx) / camera.scale
    // Minimap coords: mx = wx * MM_SCALE
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const { tx, ty, scale } = camera;

    const rx = (-tx / scale) * MM_SCALE;
    const ry = (-ty / scale) * MM_SCALE;
    const rw = (vw / scale) * MM_SCALE;
    const rh = (vh / scale) * MM_SCALE;

    ctx.strokeStyle = 'rgba(99, 179, 255, 0.9)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(rx, ry, rw, rh);
}
