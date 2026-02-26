// src/AI.ts
import { Boid } from './Boid';
import { Track } from './Track';
import type { NeuralNetworkJSON } from './brain-js';

export class GeneticAlgorithm {
    populationSize: number = 50;
    mutationRate: number = 0.1;
    boids: Boid[] = [];
    generation: number = 1;
    timer: number = 0;
    maxLifespan: number = 2000; // frames before forcing next generation
    eliteCount: number = 1;      // Number of top performers preserved unchanged
    tournamentSize: number = 3;  // Tournament selection size
    topParentsCount: number = 5; // Number of top boids eligible for crossover

    constructor(size: number, startX: number, startY: number, startAngle: number) {
        this.populationSize = size;

        const savedBrain = localStorage.getItem('best_boid_brain');
        const savedGen = localStorage.getItem('current_generation');
        if (savedGen) this.generation = parseInt(savedGen);

        for (let i = 0; i < size; i++) {
            const boid = new Boid(startX, startY, startAngle);
            if (savedBrain && i === 0) {
                // Seed the first boid with the best saved brain
                boid.network.fromJSON(JSON.parse(savedBrain));
            } else if (savedBrain && i < size * 0.2) {
                // Seed 20% of population with slightly mutated saved brain
                const brainJSON = JSON.parse(savedBrain);
                this.mutate(brainJSON, 0.2);
                boid.network.fromJSON(brainJSON);
            }
            this.boids.push(boid);
        }
    }

    update(track: Track) {
        this.timer++;
        let allDead = true;
        for (const boid of this.boids) {
            boid.update(track);
            if (!boid.isDead) allDead = false;
        }

        if (allDead || this.timer > this.maxLifespan) {
            this.nextGeneration(track.startPoint.x, track.startPoint.y, track.startAngle);
            this.timer = 0;
        }
    }

    /**
     * Select a parent using tournament selection.
     * Picks `tournamentSize` random boids and returns the fittest.
     */
    selectParent(): Boid {
        let best: Boid | null = null;
        for (let i = 0; i < this.tournamentSize; i++) {
            const idx = Math.floor(Math.random() * this.boids.length);
            const candidate = this.boids[idx];
            if (!best || candidate.fitness > best.fitness) {
                best = candidate;
            }
        }
        return best!;
    }

    /**
     * Crossover two parent networks to create a child network.
     * Uses arithmetic crossover: childWeight = (p1Weight + p2Weight) / 2
     * Preserves the full JSON structure that brain.js expects.
     */
    crossover(parent1JSON: NeuralNetworkJSON, parent2JSON: NeuralNetworkJSON): NeuralNetworkJSON {
        // Deep clone parent1's JSON to preserve the full structure (options, etc.)
        const childJSON: NeuralNetworkJSON = JSON.parse(JSON.stringify(parent1JSON));

        for (let i = 0; i < childJSON.layers.length; i++) {
            const childLayer = childJSON.layers[i];
            const p2Layer = parent2JSON.layers[i];

            // Crossover weights
            if (childLayer.weights && p2Layer?.weights) {
                for (let j = 0; j < childLayer.weights.length; j++) {
                    for (let k = 0; k < childLayer.weights[j].length; k++) {
                        // Arithmetic crossover with random blend factor
                        const blend = Math.random();
                        childLayer.weights[j][k] = (childLayer.weights[j][k] * blend) + 
                                                    (p2Layer.weights[j][k] * (1 - blend));
                    }
                }
            }

            // Crossover biases
            if (childLayer.biases && p2Layer?.biases) {
                for (let j = 0; j < childLayer.biases.length; j++) {
                    const blend = Math.random();
                    childLayer.biases[j] = (childLayer.biases[j] * blend) + 
                                           (p2Layer.biases[j] * (1 - blend));
                }
            }
        }

        return childJSON;
    }

    nextGeneration(x: number, y: number, angle: number) {
        // Sort by fitness (descending)
        this.boids.sort((a, b) => b.fitness - a.fitness);

        const newBoids: Boid[] = [];
        const best = this.boids[0];

        // 1. Elite: Preserve top performers unchanged
        for (let i = 0; i < this.eliteCount && i < this.boids.length; i++) {
            const elite = new Boid(x, y, angle);
            elite.network.fromJSON(this.boids[i].network.toJSON());
            newBoids.push(elite);
        }

        // 2. Slightly mutated copies of elite (20% of population)
        const mutatedEliteCount = Math.floor(this.populationSize * 0.2);
        for (let i = newBoids.length; i < mutatedEliteCount; i++) {
            const child = new Boid(x, y, angle);
            const eliteJSON = best.network.toJSON() as NeuralNetworkJSON;
            this.mutate(eliteJSON, 0.2); // Higher mutation for diversity
            child.network.fromJSON(eliteJSON);
            newBoids.push(child);
        }

        // 3. Crossover children from top parents (remaining population)
        while (newBoids.length < this.populationSize) {
            const child = new Boid(x, y, angle);
            
            // Select two parents using tournament selection
            const parent1 = this.selectParent();
            const parent2 = this.selectParent();
            
            // Crossover to create child
            const parent1JSON = parent1.network.toJSON() as NeuralNetworkJSON;
            const parent2JSON = parent2.network.toJSON() as NeuralNetworkJSON;
            const childJSON = this.crossover(parent1JSON, parent2JSON);
            
            // Mutate the child
            this.mutate(childJSON, this.mutationRate);
            
            child.network.fromJSON(childJSON);
            newBoids.push(child);
        }

        this.boids = newBoids;
        this.generation++;

        // Save progress to local storage
        localStorage.setItem('best_boid_brain', JSON.stringify(best.network.toJSON()));
        localStorage.setItem('current_generation', this.generation.toString());
    }

    mutate(networkJSON: NeuralNetworkJSON, rate: number) {
        for (let i = 0; i < networkJSON.layers.length; i++) {
            const layer = networkJSON.layers[i];
            if (!layer.weights) continue;

            for (let j = 0; j < layer.weights.length; j++) {
                for (let k = 0; k < layer.weights[j].length; k++) {
                    if (Math.random() < rate) {
                        layer.weights[j][k] += (Math.random() * 2 - 1); // Mutate by adding -1 to 1
                    }
                }
            }

            if (layer.biases) {
                for (let j = 0; j < layer.biases.length; j++) {
                    if (Math.random() < rate) {
                        layer.biases[j] += (Math.random() * 2 - 1);
                    }
                }
            }
        }
    }

    getBestActiveBoid(): Boid | null {
        let best = null;
        let maxFit = -1;
        for (let b of this.boids) {
            // Select the boid with highest fitness, regardless of alive/dead status
            // This ensures the best performer is always visualized
            if (b.fitness > maxFit) {
                maxFit = b.fitness;
                best = b;
            }
        }
        return best;
    }

    /**
     * Calculate population diversity as average pairwise distance between network weights.
     * Higher values indicate more diverse population (good for evolution).
     * Returns a value typically in range [0, 10+]
     */
    calculateDiversity(): number {
        if (this.boids.length < 2) return 0;

        // Sample networks for efficiency (use up to 10 boids)
        const sampleSize = Math.min(10, this.boids.length);
        const samples: NeuralNetworkJSON[] = [];
        
        for (let i = 0; i < sampleSize; i++) {
            const idx = Math.floor(Math.random() * this.boids.length);
            samples.push(this.boids[idx].network.toJSON() as NeuralNetworkJSON);
        }

        let totalDistance = 0;
        let pairCount = 0;

        // Calculate pairwise distances
        for (let i = 0; i < samples.length; i++) {
            for (let j = i + 1; j < samples.length; j++) {
                totalDistance += this.networkDistance(samples[i], samples[j]);
                pairCount++;
            }
        }

        return pairCount > 0 ? totalDistance / pairCount : 0;
    }

    /**
     * Calculate Euclidean distance between two network weight vectors
     */
    private networkDistance(net1: NeuralNetworkJSON, net2: NeuralNetworkJSON): number {
        let sumSquares = 0;

        for (let i = 0; i < net1.layers.length; i++) {
            const layer1 = net1.layers[i];
            const layer2 = net2.layers[i];

            if (layer1.weights && layer2.weights) {
                for (let j = 0; j < layer1.weights.length; j++) {
                    for (let k = 0; k < layer1.weights[j].length; k++) {
                        const diff = (layer1.weights[j][k] || 0) - (layer2.weights[j]?.[k] || 0);
                        sumSquares += diff * diff;
                    }
                }
            }

            if (layer1.biases && layer2.biases) {
                for (let j = 0; j < layer1.biases.length; j++) {
                    const diff = (layer1.biases[j] || 0) - (layer2.biases[j] || 0);
                    sumSquares += diff * diff;
                }
            }
        }

        return Math.sqrt(sumSquares);
    }
}

/**
 * Derive the network topology (layer sizes) from the network JSON.
 * brain.js JSON structure: layers[0] is an EMPTY placeholder for input layer.
 * layers[1] is first HIDDEN layer with weights[hiddenNodeIndex][inputNodeIndex].
 */
function deriveTopology(json: NeuralNetworkJSON): number[] {
    const topology: number[] = [];
    
    // brain.js has 4 layers: [input placeholder, hidden1, hidden2, output]
    // Layer 0 is empty (input placeholder)
    // Layer 1 has weights[4][5] - so 5 inputs, 4 hidden nodes
    // Layer 2 has weights[4][4] - 4 inputs from prev, 4 hidden nodes
    // Layer 3 has weights[2][4] - 4 inputs from prev, 2 outputs
    
    // Input layer size from first hidden layer's weights (layer 1)
    if (json.layers[1]?.weights?.[0]) {
        topology.push(json.layers[1].weights[0].length);
    }
    
    // Hidden and output layer sizes from biases (skip layer 0 which is empty)
    for (let i = 1; i < json.layers.length; i++) {
        const layer = json.layers[i];
        if (layer.biases) {
            topology.push(layer.biases.length);
        }
    }
    
    return topology;
}

// Function to visualize the neural network weights and structure
export function drawNetwork(ctx: CanvasRenderingContext2D, boid: Boid) {
    const json = boid.network.toJSON();
    if (!json.layers || json.layers.length === 0) return;

    const w = ctx.canvas.width;
    const h = ctx.canvas.height;
    
    // Debug: Log the network structure
    console.log('Network JSON:', json);
    console.log('Layers count:', json.layers.length);
    json.layers.forEach((layer, i) => {
        console.log(`Layer ${i}: weights=${layer.weights?.length}x${layer.weights?.[0]?.length}, biases=${layer.biases?.length}`);
    });
    
    // Derive topology dynamically from the network structure
    const topology = deriveTopology(json);
    
    // Debug: Draw topology info
    ctx.fillStyle = '#666';
    ctx.font = '10px Arial';
    ctx.textAlign = 'left';
    ctx.fillText(`Topology: ${topology.join(' -> ')}`, 5, h - 5);
    ctx.fillText(`Layers: ${json.layers.length}`, 5, h - 18);
    
    if (topology.length === 0) return;

    const layerWidth = w / (topology.length);
    const nodeRadius = Math.min(14, (h - 100) / (Math.max(...topology) * 2.5));

    const nodePositions: { x: number, y: number }[][] = [];

    // Calculate positions
    for (let i = 0; i < topology.length; i++) {
        const numNodes = topology[i];
        const x = layerWidth * i + layerWidth / 2;
        const layerPositions = [];
        const gap = (h - 80) / (numNodes + 1);
        const startY = 50;

        for (let j = 0; j < numNodes; j++) {
            const y = startY + (j + 1) * gap;
            layerPositions.push({ x, y });
        }
        nodePositions.push(layerPositions);
    }

    // Draw layer labels
    ctx.fillStyle = '#aaa';
    ctx.font = '11px Arial';
    ctx.textAlign = 'center';
    const layerLabels = ['Input', 'Hidden 1', 'Hidden 2', 'Output'];
    for (let i = 0; i < topology.length; i++) {
        const x = layerWidth * i + layerWidth / 2;
        ctx.fillText(layerLabels[i] || '', x, 20);
        ctx.fillStyle = '#666';
        ctx.font = '9px Arial';
        ctx.fillText(`(${topology[i]} nodes)`, x, 32);
        ctx.fillStyle = '#aaa';
        ctx.font = '11px Arial';
    }

    // Draw Connections (Weights) with alpha based on weight strength
    // brain.js: layers[1] connects input to hidden1, layers[2] connects hidden1 to hidden2, etc.
    for (let i = 1; i < topology.length; i++) {
        const numNodes = topology[i];
        const prevNodes = topology[i - 1];

        // brain.js JSON structure: layers[0] is input placeholder, layers[1] is first hidden
        // weights for connection from layer i-1 to layer i are in layers[i]
        const layerData = json.layers[i];

        for (let j = 0; j < numNodes; j++) {
            const targetNode = nodePositions[i][j];
            for (let k = 0; k < prevNodes; k++) {
                const sourceNode = nodePositions[i - 1][k];

                let weight = 0;
                if (layerData && layerData.weights && layerData.weights[j]) {
                    weight = layerData.weights[j][k] || 0;
                }

                // Alpha based on weight magnitude (normalized)
                const alpha = Math.min(1, Math.abs(weight) / 3);
                
                // Only draw visible connections
                if (alpha > 0.02) {
                    ctx.beginPath();
                    ctx.lineWidth = 1 + Math.abs(weight) * 0.5;
                    
                    // Color: green for positive, red for negative, with alpha
                    if (weight > 0) {
                        ctx.strokeStyle = `rgba(50, 255, 100, ${alpha})`;
                    } else {
                        ctx.strokeStyle = `rgba(255, 80, 80, ${alpha})`;
                    }
                    ctx.moveTo(sourceNode.x, sourceNode.y);
                    ctx.lineTo(targetNode.x, targetNode.y);
                    ctx.stroke();
                }
            }
        }
    }

    // Draw Nodes as circles with activation-based coloring
    for (let i = 0; i < nodePositions.length; i++) {
        for (let j = 0; j < nodePositions[i].length; j++) {
            const pos = nodePositions[i][j];

            // Get actual activation value
            let activation = 0.5; // default
            if (i === 0 && boid.lastInputs[j] !== undefined) {
                // Input layer - use sensor values
                activation = boid.lastInputs[j];
            } else if (i === nodePositions.length - 1 && boid.lastOutputs[j] !== undefined) {
                // Output layer
                activation = boid.lastOutputs[j];
            } else if (i > 0 && i < nodePositions.length - 1) {
                // Hidden layers - use calculated activations
                const hiddenLayerIdx = i - 1;
                if (boid.lastHiddenActivations[hiddenLayerIdx] && boid.lastHiddenActivations[hiddenLayerIdx][j] !== undefined) {
                    activation = boid.lastHiddenActivations[hiddenLayerIdx][j];
                }
            }

            // Draw glow for highly active nodes
            if (activation > 0.6) {
                ctx.shadowBlur = 20;
                ctx.shadowColor = `rgba(0, 255, 200, ${activation})`;
            } else if (activation < 0.4) {
                ctx.shadowBlur = 10;
                ctx.shadowColor = `rgba(255, 100, 100, ${1 - activation})`;
            }

            // Draw node circle
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, nodeRadius, 0, Math.PI * 2);

            // Color gradient: blue (low) -> green (medium) -> yellow/orange (high)
            let r, g, b;
            if (activation < 0.5) {
                // Low activation: blue to green
                const t = activation * 2;
                r = Math.floor(50 * (1 - t) + 50 * t);
                g = Math.floor(100 * (1 - t) + 200 * t);
                b = Math.floor(200 * (1 - t) + 100 * t);
            } else {
                // High activation: green to yellow/orange
                const t = (activation - 0.5) * 2;
                r = Math.floor(50 * (1 - t) + 255 * t);
                g = Math.floor(200 * (1 - t) + 200 * t);
                b = Math.floor(100 * (1 - t) + 50 * t);
            }
            ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
            ctx.fill();

            ctx.shadowBlur = 0; // reset

            // Draw border
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.stroke();

            // Show activation value inside node
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 8px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(activation.toFixed(2), pos.x, pos.y);

            // Label below node
            ctx.fillStyle = '#888';
            ctx.font = '8px Arial';
            ctx.textBaseline = 'top';
            if (i === 0) {
                // Input layer labels
                const sensorLabels = ['L', 'FL', 'F', 'FR', 'R'];
                ctx.fillText(sensorLabels[j] || `S${j + 1}`, pos.x, pos.y + nodeRadius + 2);
            } else if (i === nodePositions.length - 1) {
                // Output layer labels
                const outputLabels = ['Thr', 'Str'];
                ctx.fillText(outputLabels[j] || `O${j + 1}`, pos.x, pos.y + nodeRadius + 2);
            }
        }
    }
}
