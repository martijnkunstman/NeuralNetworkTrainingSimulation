// src/main.ts
import '../style.css';
import { Track } from './Track';
import { GeneticAlgorithm, drawNetwork } from './AI';

// Type definitions and initial variables
let simulationCanvas: HTMLCanvasElement;
let simulationCtx: CanvasRenderingContext2D;
let networkCanvas: HTMLCanvasElement;
let networkCtx: CanvasRenderingContext2D;

let isFastTraining = false;

let track: Track;
let ga: GeneticAlgorithm;

const POPULATION_SIZE = 50;

function init() {
  simulationCanvas = document.getElementById('simulation-canvas') as HTMLCanvasElement;
  networkCanvas = document.getElementById('network-canvas') as HTMLCanvasElement;

  // Set dimensions
  const simContainer = document.getElementById('simulation-container');
  if (simContainer) {
    simulationCanvas.width = simContainer.clientWidth - 40;
    simulationCanvas.height = simContainer.clientHeight - 40;
  }

  const netContainer = document.getElementById('network-container');
  if (netContainer) {
    networkCanvas.width = netContainer.clientWidth - 20;
    networkCanvas.height = netContainer.clientHeight - 20;
  }

  simulationCtx = simulationCanvas.getContext('2d')!;
  networkCtx = networkCanvas.getContext('2d')!;

  // Setup logic objects
  track = new Track(simulationCanvas.width, simulationCanvas.height);
  ga = new GeneticAlgorithm(POPULATION_SIZE, track.startPoint.x, track.startPoint.y, track.startAngle);

  // Setup event listeners
  const fastBtn = document.getElementById('btn-toggle-fast');
  fastBtn?.addEventListener('click', () => {
    isFastTraining = !isFastTraining;
    if (fastBtn) {
      fastBtn.innerText = isFastTraining ? "Toggle Normal Viz" : "Toggle Fast Training (No Render)";
    }
  });

  document.getElementById('btn-restart')?.addEventListener('click', () => {
    ga = new GeneticAlgorithm(POPULATION_SIZE, track.startPoint.x, track.startPoint.y, track.startAngle);
    ga.generation = 1;
  });

  document.getElementById('btn-clear-history')?.addEventListener('click', () => {
    if (confirm("Clear all training history? This will reset the brain.")) {
      localStorage.removeItem('best_boid_brain');
      localStorage.removeItem('current_generation');
      ga = new GeneticAlgorithm(POPULATION_SIZE, track.startPoint.x, track.startPoint.y, track.startAngle);
      ga.generation = 1;
    }
  });

  // Start the loop
  requestAnimationFrame(loop);
}

function update() {
  ga.update(track);
}

function updateUI() {
  const genSpan = document.getElementById('generation-count');
  const aliveSpan = document.getElementById('alive-count');
  const fitSpan = document.getElementById('best-fitness');

  if (genSpan) genSpan.innerText = ga.generation.toString();

  const aliveCount = ga.boids.filter(b => !b.isDead).length;
  if (aliveSpan) aliveSpan.innerText = `${aliveCount} / ${POPULATION_SIZE}`;

  const best = ga.getBestActiveBoid();
  if (best && fitSpan) {
    fitSpan.innerText = Math.floor(best.fitness).toString();
  }
}

function draw() {
  // Clear canvases
  simulationCtx.clearRect(0, 0, simulationCanvas.width, simulationCanvas.height);
  networkCtx.clearRect(0, 0, networkCanvas.width, networkCanvas.height);

  // Draw track
  track.draw(simulationCtx);

  // Draw boids
  const best = ga.getBestActiveBoid();

  for (const boid of ga.boids) {
    // Only draw sensors for the best boid
    const isBest = (boid === best);
    boid.draw(simulationCtx, isBest);
  }

  // Draw Neural Network for the best active boid
  if (best) {
    // Background for Network
    networkCtx.fillStyle = '#222';
    networkCtx.fillRect(0, 0, networkCanvas.width, networkCanvas.height);
    drawNetwork(networkCtx, best);
  }

  updateUI();
}

function loop() {

  if (isFastTraining) {
    // Run multiple logic updates per single frame request
    // to rapidly progress generations
    for (let i = 0; i < 20; i++) {
      update();
    }
    // minimal draw
    simulationCtx.clearRect(0, 0, simulationCanvas.width, simulationCanvas.height);
    simulationCtx.fillStyle = 'white';
    simulationCtx.fillText(`FAST TRAINING: GEN ${ga.generation}`, 20, 30);
    updateUI();
  } else {
    update();
    draw();
  }

  requestAnimationFrame(loop);
}

// Ensure DOM is loaded before init
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
