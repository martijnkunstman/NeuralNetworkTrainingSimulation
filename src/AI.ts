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
    lastGenEndStats: { generation: number; survivorCount: number; bestFitness: number; diversity: number } | null = null;
    bestFitnessThisGen: number = 0;
    lastImprovementTimer: number = 0;
    bestBoidDiedAt: number = -1; // timer frame when all-time-best boid died; -1 = still alive

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
        let currentBestFitness = 0;
        let bestAliveFitness = 0;
        for (const boid of this.boids) {
            boid.update(track);
            if (!boid.isDead) {
                allDead = false;
                if (boid.fitness > bestAliveFitness) bestAliveFitness = boid.fitness;
            }
            if (boid.fitness > currentBestFitness) currentBestFitness = boid.fitness;
        }

        if (currentBestFitness > this.bestFitnessThisGen) {
            this.bestFitnessThisGen = currentBestFitness;
            this.lastImprovementTimer = this.timer;
        }

        // Detect when the all-time-best boid has died with no alive boid matching it.
        // Reset the clock if an alive boid catches up (new best emerged).
        if (this.bestFitnessThisGen > 0) {
            if (bestAliveFitness >= this.bestFitnessThisGen) {
                this.bestBoidDiedAt = -1; // a live boid is leading — no countdown
            } else if (this.bestBoidDiedAt === -1) {
                this.bestBoidDiedAt = this.timer; // best just died, start countdown
            }
        }

        const noEliteFor500 = (this.maxLifespan - this.timer) <= 500
            && (this.timer - this.lastImprovementTimer) >= 500;
        const bestDeadFor500 = this.bestBoidDiedAt !== -1
            && (this.timer - this.bestBoidDiedAt) >= 500;

        if (allDead || this.timer > this.maxLifespan || noEliteFor500 || bestDeadFor500) {
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
        // Reset per-generation improvement tracking
        this.bestFitnessThisGen = 0;
        this.lastImprovementTimer = 0;
        this.bestBoidDiedAt = -1;

        // Snapshot end-of-generation stats before any replacement
        this.lastGenEndStats = {
            generation: this.generation,
            survivorCount: this.boids.filter(b => !b.isDead).length,
            bestFitness: Math.max(...this.boids.map(b => b.fitness)),
            diversity: this.calculateDiversity(),
        };

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

