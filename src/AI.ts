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
            if (!b.isDead && b.fitness > maxFit) {
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
 * brain.js JSON structure: layers[0] is first HIDDEN layer.
 * Input layer size is inferred from the first hidden layer's weight dimensions.
 */
function deriveTopology(json: NeuralNetworkJSON): number[] {
    const topology: number[] = [];
    
    // Input layer size from first hidden layer's weights
    // weights[hiddenNodeIndex][inputNodeIndex]
    if (json.layers[0]?.weights?.[0]) {
        topology.push(json.layers[0].weights[0].length);
    }
    
    // Hidden and output layer sizes from biases
    for (const layer of json.layers) {
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
    
    // Derive topology dynamically from the network structure
    const topology = deriveTopology(json);
    if (topology.length === 0) return;

    const layerWidth = w / (topology.length);
    const nodeRadius = 10;

    const nodePositions: { x: number, y: number }[][] = [];

    // Calculate positions
    for (let i = 0; i < topology.length; i++) {
        const numNodes = topology[i];
        const x = layerWidth * i + layerWidth / 2;
        const layerPositions = [];
        const gap = (h - 40) / (numNodes);
        const startY = 20 + gap / 2;

        for (let j = 0; j < numNodes; j++) {
            const y = startY + (j * gap);
            layerPositions.push({ x, y });
        }
        nodePositions.push(layerPositions);
    }

    // Draw Connections (Weights)
    for (let i = 1; i < topology.length; i++) {
        const numNodes = topology[i];
        const prevNodes = topology[i - 1];

        // brain.js JSON structure: layers[0] is first HIDDEN layer
        // weights[hiddenNodeIndex][inputNodeIndex]
        const layerData = json.layers[i - 1];

        for (let j = 0; j < numNodes; j++) {
            const targetNode = nodePositions[i][j];
            for (let k = 0; k < prevNodes; k++) {
                const sourceNode = nodePositions[i - 1][k];

                let weight = 0;
                if (layerData && layerData.weights && layerData.weights[j]) {
                    weight = layerData.weights[j][k] || 0;
                }

                const opacity = Math.min(1, Math.abs(weight) / 2);
                if (opacity > 0.1) {
                    ctx.beginPath();
                    ctx.lineWidth = Math.abs(weight) * 1.5;
                    ctx.strokeStyle = weight > 0 ? `rgba(0, 255, 100, ${opacity})` : `rgba(255, 50, 50, ${opacity})`;
                    ctx.moveTo(sourceNode.x, sourceNode.y);
                    ctx.lineTo(targetNode.x, targetNode.y);
                    ctx.stroke();
                }
            }
        }
    }

    // Draw Nodes and Activations
    for (let i = 0; i < nodePositions.length; i++) {
        for (let j = 0; j < nodePositions[i].length; j++) {
            const pos = nodePositions[i][j];

            // Activation visual:
            let activation = 0.5; // default
            if (i === 0 && boid.lastInputs[j] !== undefined) {
                activation = boid.lastInputs[j];
            } else if (i === nodePositions.length - 1 && boid.lastOutputs[j] !== undefined) {
                activation = boid.lastOutputs[j];
            } else {
                // Hidden layers - check biases as a proxy for "tendency" or just use neutral
                const prevLayer = json.layers[i - 1];
                if (prevLayer?.biases && prevLayer.biases[j] !== undefined) {
                    const bias = prevLayer.biases[j];
                    activation = 1 / (1 + Math.exp(-bias)); // sigmoid of bias
                }
            }

            // Glow effect for active nodes
            if (activation > 0.6) {
                ctx.shadowBlur = 10;
                ctx.shadowColor = `rgba(0, 255, 255, ${activation})`;
            }

            ctx.beginPath();
            ctx.arc(pos.x, pos.y, nodeRadius, 0, Math.PI * 2);

            // Interpolate color based on activation
            const r = Math.floor(50 + (1 - activation) * 100);
            const g = Math.floor(50 + activation * 205);
            const b = Math.floor(100 + activation * 155);
            ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
            ctx.fill();

            ctx.shadowBlur = 0; // reset
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.stroke();

            // Label
            if (i === 0 || i === nodePositions.length - 1) {
                ctx.fillStyle = '#fff';
                ctx.font = '10px Arial';
                ctx.textAlign = 'center';
                const label = i === 0 ? `S${j + 1}` : (j === 0 ? 'T' : 'S');
                ctx.fillText(label, pos.x, pos.y + 4);
            }
        }
    }
}
