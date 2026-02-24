// src/AI.ts
import { Boid } from './Boid';

export class GeneticAlgorithm {
    populationSize: number = 50;
    mutationRate: number = 0.1;
    boids: Boid[] = [];
    generation: number = 1;
    timer: number = 0;
    maxLifespan: number = 2000; // frames before forcing next generation

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

    update(track: any) {
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

    nextGeneration(x: number, y: number, angle: number) {
        this.boids.sort((a, b) => b.fitness - a.fitness);

        // Keep the best (Elite)
        const newBoids: Boid[] = [];
        const best = this.boids[0];

        // We clone the best one directly to preserve it
        const elite = new Boid(x, y, angle);
        elite.network.fromJSON(best.network.toJSON());
        newBoids.push(elite);

        for (let i = 1; i < this.populationSize; i++) {
            const child = new Boid(x, y, angle);
            // Copy best's brain
            const bestJSON = best.network.toJSON();

            // Mutate it slightly
            this.mutate(bestJSON, this.mutationRate);
            child.network.fromJSON(bestJSON);
            newBoids.push(child);
        }

        this.boids = newBoids;
        this.generation++;

        // Save progress to local storage
        localStorage.setItem('best_boid_brain', JSON.stringify(best.network.toJSON()));
        localStorage.setItem('current_generation', this.generation.toString());
    }

    mutate(networkJSON: any, rate: number) {
        for (let i = 0; i < networkJSON.layers.length; i++) {
            if (!networkJSON.layers[i].weights) continue;

            for (let j = 0; j < networkJSON.layers[i].weights.length; j++) {
                for (let k = 0; k < networkJSON.layers[i].weights[j].length; k++) {
                    if (Math.random() < rate) {
                        networkJSON.layers[i].weights[j][k] += (Math.random() * 2 - 1); // Mutate by adding -1 to 1
                    }
                }
            }

            for (let j = 0; j < networkJSON.layers[i].biases.length; j++) {
                if (Math.random() < rate) {
                    networkJSON.layers[i].biases[j] += (Math.random() * 2 - 1);
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
}

// Function to visualize the neural network weights and structure
export function drawNetwork(ctx: CanvasRenderingContext2D, boid: Boid) {
    const json = boid.network.toJSON() as any;
    if (!json.layers) return;

    const w = ctx.canvas.width;
    const h = ctx.canvas.height;
    const topology = [5, 4, 4, 2];

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
                if (json.layers[i - 1] && json.layers[i - 1].biases) {
                    const bias = json.layers[i - 1].biases[j];
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
