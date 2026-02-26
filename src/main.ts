// src/main.ts
import '../style.css';
import { Track } from './Track';
import { GeneticAlgorithm, drawNetwork } from './AI';
import { Vector } from './Vector';
import type { NeuralNetworkJSON } from './brain-js';

// Type definitions and initial variables
let simulationCanvas: HTMLCanvasElement;
let simulationCtx: CanvasRenderingContext2D;
let networkCanvas: HTMLCanvasElement;
let networkCtx: CanvasRenderingContext2D;

let isFastTraining = false;
let autoRandomizeTrack = false;
let randomizeInterval = 10; // generations between track randomization

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

  // Track randomization button
  document.getElementById('btn-randomize-track')?.addEventListener('click', () => {
    const newSeed = track.randomize(simulationCanvas.width, simulationCanvas.height);
    updateTrackSeedDisplay(newSeed);
    // Reset boids to new start position
    resetBoidsForNewTrack();
  });

  // Auto-randomize toggle
  const autoRandomizeCheckbox = document.getElementById('auto-randomize') as HTMLInputElement;
  autoRandomizeCheckbox?.addEventListener('change', (e) => {
    autoRandomizeTrack = (e.target as HTMLInputElement).checked;
  });

  // Export brain button
  document.getElementById('btn-export-brain')?.addEventListener('click', () => {
    exportBrain();
  });

  // Import brain button
  document.getElementById('btn-import-brain')?.addEventListener('click', () => {
    importBrain();
  });

  // Start the loop
  requestAnimationFrame(loop);
}

/**
 * Reset all boids to the new track start position
 */
function resetBoidsForNewTrack() {
  for (const boid of ga.boids) {
    boid.pos = new Vector(track.startPoint.x, track.startPoint.y);
    boid.heading = track.startAngle;
    boid.vel = Vector.fromAngle(track.startAngle, 0.1);
    boid.acc.mult(0);
    boid.isDead = false;
    boid.fitness = 0;
    boid.distanceTraveled = 0;
    boid.checkpointCount = 0;
    boid.life = 500;
  }
  ga.timer = 0;
}

/**
 * Export the best brain to a JSON file
 */
function exportBrain() {
  const best = ga.boids.reduce((best, boid) => boid.fitness > best.fitness ? boid : best, ga.boids[0]);
  if (!best) return;

  const brainJSON = best.network.toJSON() as NeuralNetworkJSON;
  const data = {
    generation: ga.generation,
    fitness: best.fitness,
    network: brainJSON,
    exportedAt: new Date().toISOString()
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `brain-gen${ga.generation}-fitness${Math.floor(best.fitness)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Import a brain from a JSON file
 */
function importBrain() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  
  input.onchange = async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);
      
      // Validate structure
      if (!data.network || !data.network.layers) {
        alert('Invalid brain file: missing network structure');
        return;
      }

      // Load into first boid and save to localStorage
      const boid = ga.boids[0];
      if (boid) {
        boid.network.fromJSON(data.network as NeuralNetworkJSON);
        localStorage.setItem('best_boid_brain', JSON.stringify(data.network));
        
        if (data.generation) {
          ga.generation = data.generation;
          localStorage.setItem('current_generation', data.generation.toString());
        }
        
        alert(`Brain imported successfully! Generation: ${data.generation || 'unknown'}, Fitness: ${Math.floor(data.fitness) || 'unknown'}`);
      }
    } catch (err) {
      alert('Failed to import brain: ' + (err as Error).message);
    }
  };

  input.click();
}

/**
 * Update the track seed display in UI
 */
function updateTrackSeedDisplay(seed: number) {
  const seedSpan = document.getElementById('track-seed');
  if (seedSpan) {
    seedSpan.innerText = seed === 0 ? 'Default' : seed.toString();
  }
}

function update() {
  const prevGeneration = ga.generation;
  ga.update(track);
  
  // Check if generation changed and auto-randomize is enabled
  if (autoRandomizeTrack && ga.generation > prevGeneration && ga.generation % randomizeInterval === 0) {
    const newSeed = track.randomize(simulationCanvas.width, simulationCanvas.height);
    updateTrackSeedDisplay(newSeed);
    // Note: We don't reset boids here to test generalization
    // The evolved brains must adapt to the new track
  }
}

function updateUI() {
  const genSpan = document.getElementById('generation-count');
  const aliveSpan = document.getElementById('alive-count');
  const fitSpan = document.getElementById('best-fitness');
  const diversitySpan = document.getElementById('diversity-score');

  if (genSpan) genSpan.innerText = ga.generation.toString();

  const aliveCount = ga.boids.filter(b => !b.isDead).length;
  if (aliveSpan) aliveSpan.innerText = `${aliveCount} / ${POPULATION_SIZE}`;

  const best = ga.getBestActiveBoid();
  if (best && fitSpan) {
    fitSpan.innerText = Math.floor(best.fitness).toString();
  }

  // Update diversity score (expensive, so only update every 10 frames)
  if (diversitySpan && ga.timer % 10 === 0) {
    const diversity = ga.calculateDiversity();
    diversitySpan.innerText = diversity.toFixed(2);
    
    // Warn if diversity is low
    if (diversity < 1.0) {
      diversitySpan.style.color = '#ff6666';
    } else if (diversity < 3.0) {
      diversitySpan.style.color = '#ffaa66';
    } else {
      diversitySpan.style.color = '#66ff66';
    }
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
