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
import { createTrackPanel, updateTrackPanel } from './panels/TrackPanel';

// Reference to PanelManager so reset can reach it
let panelManager: PanelManager;

// ── Constants ────────────────────────────────────────────────────────────────
const POPULATION_SIZE = 50;
const FIXED_SIZE = Track.FIXED_SIZE; // 1200
const TOOLBAR_H = 46;
const ZOOM_FACTOR = 1.25;            // Step per zoom button press
const CAM_LERP = 0.07;               // Smooth-follow speed (0=frozen, 1=instant)

// ── Canvas resize ────────────────────────────────────────────────────────────
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

/** Adjust zoom centred on the screen midpoint. */
function adjustZoom(factor: number) {
  const c = simState.simulationCanvas;
  if (!c) return;
  const { tx, ty, scale } = simState.camera;
  const cx = c.width / 2;
  const cy = c.height / 2;
  const newScale = Math.min(8, Math.max(0.1, scale * factor));
  simState.camera.tx = cx - (cx - tx) * (newScale / scale);
  simState.camera.ty = cy - (cy - ty) * (newScale / scale);
  simState.camera.scale = newScale;
  updateZoomLabel();
}

/** Smooth-follow the leading boid each frame (lerp tx/ty toward target). */
function followLeader() {
  const { ga, simulationCanvas: c, camera } = simState;
  if (!ga || !c) return;
  const best = ga.getBestActiveBoid();
  if (!best) return;

  const { scale } = camera;
  const targetTx = c.width  / 2 - best.pos.x * scale;
  const targetTy = c.height / 2 - best.pos.y * scale;

  camera.tx += (targetTx - camera.tx) * CAM_LERP;
  camera.ty += (targetTy - camera.ty) * CAM_LERP;
}

/** Reset all panel positions to defaults (clears localStorage). */
function resetPanelLayout() {
  ['brain', 'minimap', 'chart', 'config', 'saveload', 'debug', 'track'].forEach(id => {
    localStorage.removeItem(`panel_state_${id}`);
  });
  location.reload();
}

// ── Init ─────────────────────────────────────────────────────────────────────
function init() {
  const simCanvas = document.getElementById('simulation-canvas') as HTMLCanvasElement;
  simState.simulationCanvas = simCanvas;
  resizeCanvas();

  window.addEventListener('resize', () => {
    resizeCanvas();
    fitCameraToViewport();
  });

  fitCameraToViewport();
  simState.fitCamera = fitCameraToViewport;

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
    createTrackPanel(),
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

  document.getElementById('btn-zoom-in')?.addEventListener('click',  () => adjustZoom(ZOOM_FACTOR));
  document.getElementById('btn-zoom-out')?.addEventListener('click', () => adjustZoom(1 / ZOOM_FACTOR));
  document.getElementById('btn-zoom-reset')?.addEventListener('click', fitCameraToViewport);
  document.getElementById('btn-reset-panels')?.addEventListener('click', resetPanelLayout);

  // ── Pause / Resume ──────────────────────────────────────────────────────
  const pauseBtn = document.getElementById('btn-pause') as HTMLButtonElement | null;
  pauseBtn?.addEventListener('click', () => {
    simState.isPaused = !simState.isPaused;
    if (pauseBtn) {
      pauseBtn.textContent = simState.isPaused ? '▶ Resume' : '⏸ Pause';
      pauseBtn.classList.toggle('toolbar-btn--active', simState.isPaused);
    }
  });

  // Prevent context menu on canvas
  simCanvas.addEventListener('contextmenu', e => e.preventDefault());

  // ── Track editor mouse handling ──────────────────────────────────────────
  const HIT_RADIUS = 18; // world-space pixels

  simCanvas.addEventListener('mousedown', (e) => {
    if (!simState.isEditingTrack || !simState.track) return;
    const rect = simCanvas.getBoundingClientRect();
    const { tx, ty, scale } = simState.camera;
    const wx = (e.clientX - rect.left - tx) / scale;
    const wy = (e.clientY - rect.top  - ty) / scale;
    const cps = simState.track.controlPoints;
    for (let i = 0; i < cps.length; i++) {
      const dx = cps[i].x - wx;
      const dy = cps[i].y - wy;
      if (Math.sqrt(dx * dx + dy * dy) < HIT_RADIUS) {
        simState.trackDragIndex = i;
        break;
      }
    }
  });

  simCanvas.addEventListener('mousemove', (e) => {
    if (!simState.isEditingTrack || simState.trackDragIndex === -1 || !simState.track) return;
    const rect = simCanvas.getBoundingClientRect();
    const { tx, ty, scale } = simState.camera;
    simState.track.controlPoints[simState.trackDragIndex].x = (e.clientX - rect.left - tx) / scale;
    simState.track.controlPoints[simState.trackDragIndex].y = (e.clientY - rect.top  - ty) / scale;
    simState.track.regenerateFromControlPoints();
  });

  simCanvas.addEventListener('mouseup', () => { simState.trackDragIndex = -1; });
  simCanvas.addEventListener('mouseleave', () => { simState.trackDragIndex = -1; });

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

  resetCameraTransform(ctx);
  ctx.fillStyle = '#0a0c10';
  ctx.fillRect(0, 0, simCanvas.width, simCanvas.height);

  applyCamera(ctx);

  track.draw(ctx);

  if (!simState.isEditingTrack) {
    const best = ga.getBestActiveBoid();
    for (const boid of ga.boids) {
      boid.draw(ctx, boid === best);
    }
  }

  if (simState.isEditingTrack) {
    track.drawEditOverlay(ctx, simState.trackDragIndex);
  }

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

  if (simState.isEditingTrack) {
    draw();
  } else if (simState.isPaused) {
    draw();
  } else if (simState.isFastTraining) {
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
    followLeader();
    update();
    draw();
  }

  // Record chart data once per generation
  recordChartData();

  // Update panels (only when visible and not minimized)
  updateBrainPanel();
  updateMinimapPanel();
  updateChartPanel();
  updateConfigPanel();
  updateTrackPanel();
  updateDebugPanel();

  requestAnimationFrame(loop);
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
