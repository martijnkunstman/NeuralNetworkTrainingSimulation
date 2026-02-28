// src/main.ts
import '../style.css';
import { Track } from './Track';
import { GeneticAlgorithm } from './AI';
import { simState } from './SimState';
import { PanelManager } from './PanelManager';
import { createBrainPanel, updateBrainPanel } from './panels/BrainPanel';
import { createMinimapPanel, updateMinimapPanel } from './panels/MinimapPanel';
import { createChartPanel, updateChartPanel, recordChartData } from './panels/ChartPanel';
import { createConfigPanel, updateConfigPanel } from './panels/ConfigPanel';
import { createSaveLoadPanel } from './panels/SaveLoadPanel';
import { createDebugPanel, updateDebugPanel } from './panels/DebugPanel';

// Reference to PanelManager so reset can reach it
let panelManager: PanelManager;

// ── Constants ────────────────────────────────────────────────────────────────
const POPULATION_SIZE = 50;
const FIXED_SIZE = Track.FIXED_SIZE; // 1200
const TOOLBAR_H = 46;

// ── Canvas resize ────────────────────────────────────────────────────────────
/**
 * Keep the canvas internal resolution equal to the visible viewport so that
 * clientX/clientY mouse coordinates map directly to canvas coordinates.
 * (Previously the canvas was 1200×1200 internally but CSS-stretched, which
 * broke all zoom/pan coordinate math.)
 */
function resizeCanvas() {
  const c = simState.simulationCanvas;
  if (!c) return;
  c.width = window.innerWidth;
  c.height = window.innerHeight - TOOLBAR_H;
}

// ── Camera helpers ───────────────────────────────────────────────────────────
function applyCamera(ctx: CanvasRenderingContext2D) {
  const { tx, ty, scale } = simState.camera;
  ctx.setTransform(scale, 0, 0, scale, tx, ty);
}

function resetCameraTransform(ctx: CanvasRenderingContext2D) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

/** Fit the 1200×1200 world into the current viewport (90% fill, centred). */
function fitCameraToViewport() {
  const c = simState.simulationCanvas;
  if (!c) return;
  const vw = c.width;
  const vh = c.height;
  const fitScale = Math.min(vw, vh) / FIXED_SIZE * 0.90;
  simState.camera.scale = fitScale;
  simState.camera.tx = (vw - FIXED_SIZE * fitScale) / 2;
  simState.camera.ty = (vh - FIXED_SIZE * fitScale) / 2;
  updateZoomLabel();
}

/** Reset all panel positions to defaults (clears localStorage). */
function resetPanelLayout() {
  ['brain', 'minimap', 'chart', 'config', 'saveload', 'debug'].forEach(id => {
    localStorage.removeItem(`panel_state_${id}`);
  });
  // Re-show all panels with default positions by reloading
  location.reload();
}

// ── Init ─────────────────────────────────────────────────────────────────────
function init() {
  // Set up full-screen simulation canvas (viewport-sized so coords match)
  const simCanvas = document.getElementById('simulation-canvas') as HTMLCanvasElement;
  simState.simulationCanvas = simCanvas;
  resizeCanvas();  // canvas.width = viewport width, height = viewport height - toolbar

  // Keep canvas sized to viewport on browser resize
  window.addEventListener('resize', () => {
    resizeCanvas();
    fitCameraToViewport();
  });

  // Fit camera to show full 1200×1200 world on startup
  fitCameraToViewport();

  // Build simulation objects
  const track = new Track(FIXED_SIZE, FIXED_SIZE);
  const ga = new GeneticAlgorithm(POPULATION_SIZE, track.startPoint.x, track.startPoint.y, track.startAngle);
  simState.track = track;
  simState.ga = ga;
  simState.populationSize = POPULATION_SIZE;

  // ── Panel system ────────────────────────────────────────────────────────
  panelManager = new PanelManager();
  const panelLayer = document.getElementById('panel-layer')!;

  const panels = [
    createBrainPanel(),
    createMinimapPanel(),
    createChartPanel(),
    createConfigPanel(),
    createSaveLoadPanel(),
    createDebugPanel(),
  ];

  panels.forEach(p => {
    panelLayer.appendChild(p);
    panelManager.register(p);
  });

  // ── Toolbar buttons ─────────────────────────────────────────────────────
  document.querySelectorAll<HTMLButtonElement>('[data-toggle-panel]').forEach(btn => {
    const id = btn.dataset.togglePanel!;
    btn.addEventListener('click', () => panelManager.toggleVisible(id));
  });

  document.getElementById('btn-zoom-reset')?.addEventListener('click', fitCameraToViewport);
  document.getElementById('btn-reset-panels')?.addEventListener('click', resetPanelLayout);

  // ── Zoom (scroll wheel) ─────────────────────────────────────────────────
  simCanvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    const cx = e.clientX;
    const cy = e.clientY;
    const { tx, ty, scale } = simState.camera;
    const newScale = Math.min(8, Math.max(0.1, scale * factor));
    // Zoom toward cursor: keep world point under cursor fixed
    simState.camera.tx = cx - (cx - tx) * (newScale / scale);
    simState.camera.ty = cy - (cy - ty) * (newScale / scale);
    simState.camera.scale = newScale;
    updateZoomLabel();
  }, { passive: false });

  // ── Pan (middle-click drag or right-click drag) ─────────────────────────
  let isPanning = false;
  let panStartX = 0;
  let panStartY = 0;
  let panOriginX = 0;
  let panOriginY = 0;

  const startPan = (e: MouseEvent) => {
    isPanning = true;
    panStartX = e.clientX;
    panStartY = e.clientY;
    panOriginX = simState.camera.tx;
    panOriginY = simState.camera.ty;
    document.body.style.cursor = 'grabbing';
  };

  document.addEventListener('mousemove', (e) => {
    if (!isPanning) return;
    simState.camera.tx = panOriginX + (e.clientX - panStartX);
    simState.camera.ty = panOriginY + (e.clientY - panStartY);
  });

  document.addEventListener('mouseup', () => {
    if (!isPanning) return;
    isPanning = false;
    document.body.style.cursor = '';
  });

  simCanvas.addEventListener('mousedown', (e) => {
    if (e.button === 1 || e.button === 2) { e.preventDefault(); startPan(e); }
  });

  simCanvas.addEventListener('contextmenu', e => e.preventDefault());

  // ── Start loop ──────────────────────────────────────────────────────────
  requestAnimationFrame(loop);
}

// ── Zoom label (toolbar) ─────────────────────────────────────────────────────
function updateZoomLabel() {
  const pct = Math.round(simState.camera.scale * 100);
  const zoomEl = document.getElementById('toolbar-zoom');
  if (zoomEl) zoomEl.textContent = `${pct}%`;
}

// ── Update ────────────────────────────────────────────────────────────────────
let prevGeneration = 0;

function update() {
  const { ga, track } = simState;
  if (!ga || !track) return;
  prevGeneration = ga.generation;
  ga.update(track);

  // Auto-randomize track
  if (
    simState.autoRandomizeTrack &&
    ga.generation > prevGeneration &&
    ga.generation % simState.randomizeInterval === 0
  ) {
    track.randomize(FIXED_SIZE, FIXED_SIZE);
  }
}

// ── Draw ──────────────────────────────────────────────────────────────────────
function draw() {
  const simCanvas = simState.simulationCanvas;
  const { ga, track } = simState;
  if (!simCanvas || !ga || !track) return;

  const ctx = simCanvas.getContext('2d')!;

  // Fill full viewport (canvas.width = window.innerWidth now)
  resetCameraTransform(ctx);
  ctx.fillStyle = '#0a0c10';
  ctx.fillRect(0, 0, simCanvas.width, simCanvas.height);

  // Apply camera transform
  applyCamera(ctx);

  track.draw(ctx);

  const best = ga.getBestActiveBoid();
  for (const boid of ga.boids) {
    boid.draw(ctx, boid === best);
  }

  // Reset transform before panel updates
  resetCameraTransform(ctx);
}

// ── FPS tracking ──────────────────────────────────────────────────────────────
let lastFpsCalc = performance.now();
let fps60Frames = 0;

function trackFps(now: number) {
  fps60Frames++;
  const elapsed = now - lastFpsCalc;
  if (elapsed >= 500) {
    simState.fps = (fps60Frames / elapsed) * 1000;
    fps60Frames = 0;
    lastFpsCalc = now;
  }
}

// ── Main loop ─────────────────────────────────────────────────────────────────
function loop(now: number) {
  trackFps(now);

  if (simState.isFastTraining) {
    for (let i = 0; i < 20; i++) update();
    // Minimal draw in fast mode
    const simCanvas = simState.simulationCanvas;
    const { ga } = simState;
    if (simCanvas && ga) {
      const ctx = simCanvas.getContext('2d')!;
      resetCameraTransform(ctx);
      ctx.fillStyle = '#0a0c10';
      ctx.fillRect(0, 0, simCanvas.width, simCanvas.height);
      ctx.fillStyle = 'rgba(99,102,241,0.8)';
      ctx.font = 'bold 48px Inter,sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`⚡ FAST TRAINING — GEN ${ga.generation}`, simCanvas.width / 2, simCanvas.height / 2);
    }
  } else {
    update();
    draw();
  }

  // Record chart data once per generation
  recordChartData();

  // Update panels (lightweight — only if visible)
  updateBrainPanel();
  updateMinimapPanel();
  updateChartPanel();
  updateConfigPanel();
  updateDebugPanel();

  requestAnimationFrame(loop);
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
