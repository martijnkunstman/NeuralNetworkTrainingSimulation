// src/panels/BrainPanel.ts
// Visualises the best boid's neural network. Hosts #network-canvas.

import { drawNetwork } from './NetworkRenderer';
import { simState } from '../SimState';

export function createBrainPanel(): HTMLElement {
    const panel = buildPanel('brain', '🧠 Brain Visualisation', 360, 420, 20, 60);

    const canvas = document.createElement('canvas');
    canvas.id = 'network-canvas';
    canvas.style.cssText = 'width:100%;height:100%;display:block;';
    panel.querySelector('.panel-body')!.appendChild(canvas);

    // Resize canvas resolution when panel resizes
    const ro = new ResizeObserver(() => {
        const body = panel.querySelector('.panel-body') as HTMLElement;
        canvas.width = body.clientWidth;
        canvas.height = body.clientHeight;
    });
    ro.observe(panel.querySelector('.panel-body') as HTMLElement);

    return panel;
}

export function updateBrainPanel() {
    const panel = document.querySelector('[data-panel-id="brain"]') as HTMLElement | null;
    if (!panel || panel.style.display === 'none' || panel.classList.contains('panel--minimized')) return;
    const canvas = document.getElementById('network-canvas') as HTMLCanvasElement;
    if (!canvas || !simState.ga) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const best = simState.ga.getBestActiveBoid();
    ctx.fillStyle = '#111318';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (best) drawNetwork(ctx, best);
}

// ── Helper: build panel shell ─────────────────────────────────────────────
export function buildPanel(
    id: string,
    title: string,
    w: number,
    h: number,
    defaultLeft: number,
    defaultTop: number,
): HTMLElement {
    const panel = document.createElement('div');
    panel.className = 'panel';
    panel.dataset.panelId = id;
    panel.style.cssText = `left:${defaultLeft}px;top:${defaultTop}px;width:${w}px;height:${h}px;`;

    panel.innerHTML = `
    <div class="panel-header">
      <span class="panel-title">${title}</span>
      <div class="panel-header-btns">
        <button class="panel-btn panel-btn-minimize" title="Minimise">−</button>
        <button class="panel-btn panel-btn-close"    title="Close">✕</button>
      </div>
    </div>
    <div class="panel-body"></div>
  `;
    return panel;
}
