// src/Boid.ts
import { Vector } from './Vector';
import { getIntersection } from './utils';
import { Track } from './Track';
import type { NeuralNetwork } from './brain-js';

export class Boid {
    pos: Vector;
    vel: Vector;
    acc: Vector;

    maxSpeed: number = 5;
    maxForce: number = 0.2;
    radius: number = 8;
    heading: number; // angle in radians

    isDead: boolean = false;
    fitness: number = 0;
    distanceTraveled: number = 0; // kept for debug display only, not used in fitness
    checkpointCount: number = 0;
    frameAge: number = 0; // total frames alive, used for speed bonus
    life: number = 500; // frames to live before dying

    // Sensors config
    sensorCount: number = 5;
    sensorRays: Vector[] = [];
    sensorDistances: number[] = [];
    sensorAngles: number[] = [
        -Math.PI / 2, // Left
        -Math.PI / 4, // Front-Left
        0,            // Forward
        Math.PI / 4,  // Front-Right
        Math.PI / 2   // Right
    ];
    sensorLength: number = 100;

    network: NeuralNetwork;
    lastInputs: number[] = [0, 0, 0, 0, 0];
    lastOutputs: number[] = [0, 0];
    lastHiddenActivations: number[][] = [[0, 0, 0, 0], [0, 0, 0, 0]]; // Store activations for hidden layers

    constructor(x: number, y: number, startAngle: number) {
        this.pos = new Vector(x, y);
        this.vel = Vector.fromAngle(startAngle, 0.1);
        this.acc = new Vector(0, 0);
        this.heading = startAngle;

        // AI architecture:
        // Inputs: 5 sensor distances (normalized)
        // Hidden: 4, 4
        // Output: 2 (Throttle [0-1], Steering [-1 to 1])
        this.network = new brain.NeuralNetwork({
            hiddenLayers: [4, 4],
            activation: 'sigmoid'
        });

        // Initialize random weights to make brain.js network 'playable' right away 
        // Usually brain.js requires training data before it has structure, 
        // so we fake-train it once with dummy data to build the topology
        this.network.train([
            { input: [0, 0, 0, 0, 0], output: [0.5, 0.5] }
        ], { iterations: 1 });

        // Scramble weights for genetic evolution
        this.scrambleWeights();
    }

    scrambleWeights() {
        const json = this.network.toJSON();
        for (let i = 0; i < json.layers.length; i++) {
            const layer = json.layers[i];
            if (!layer.weights) continue;
            for (let j = 0; j < layer.weights.length; j++) {
                for (let k = 0; k < layer.weights[j].length; k++) {
                    // Random weights between -2 and 2
                    layer.weights[j][k] = (Math.random() * 4) - 2;
                }
            }
            if (layer.biases) {
                for (let j = 0; j < layer.biases.length; j++) {
                    layer.biases[j] = (Math.random() * 4) - 2;
                }
            }
        }
        this.network.fromJSON(json);
    }

    /**
     * Calculate hidden layer activations manually for visualization
     * brain.js: layers[0] is input placeholder, layers[1] is first hidden
     */
    calculateHiddenActivations(inputs: number[]): void {
        const json = this.network.toJSON();
        let currentActivations = inputs;
        
        // Skip layer 0 (input placeholder), start from layer 1
        for (let i = 1; i < json.layers.length; i++) {
            const layer = json.layers[i];
            if (!layer.weights) continue;
            
            const newActivations: number[] = [];
            for (let j = 0; j < layer.weights.length; j++) {
                let sum = layer.biases ? (layer.biases[j] || 0) : 0;
                for (let k = 0; k < currentActivations.length; k++) {
                    sum += (layer.weights[j][k] || 0) * currentActivations[k];
                }
                // Sigmoid activation
                newActivations.push(1 / (1 + Math.exp(-sum)));
            }
            currentActivations = newActivations;
            
            // Store activations for hidden layers (skip output layer which is last)
            if (i < json.layers.length - 1) {
                this.lastHiddenActivations[i - 1] = newActivations;
            }
        }
    }

    update(track: Track) {
        if (this.isDead) return;

        this.updateSensors(track);
        this.checkCollisions(track);

        if (this.isDead) return;

        // AI Decision
        // Normalize inputs into [0, 1] (0 = touching, 1 = max clearance)
        const normalizedInputs = this.sensorDistances.map(d => d / this.sensorLength);
        this.lastInputs = normalizedInputs;
        const output = this.network.run(normalizedInputs) as number[];
        this.lastOutputs = output;
        
        // Calculate hidden layer activations for visualization
        this.calculateHiddenActivations(normalizedInputs);

        // Outputs from sigmoid are 0 to 1
        const throttle = output[0];                     // 0 to 1
        const steering = (output[1] * 2) - 1;           // mapped to -1 to 1

        // Apply steering
        this.heading += steering * 0.1;

        // Apply throttle as a forward vector
        const force = Vector.fromAngle(this.heading, throttle * this.maxForce);

        this.acc.add(force);
        this.vel.add(this.acc);
        this.vel.limit(this.maxSpeed);

        // Small friction
        this.vel = this.vel.mult(0.95);

        const prevPos = new Vector(this.pos.x, this.pos.y);
        this.pos.add(this.vel);
        this.acc.mult(0); // Reset acceleration

        this.life--;
        if (this.life <= 0) {
            this.isDead = true;
            return;
        }

        this.checkCheckpoints(track, prevPos);
        this.frameAge++;
        this.distanceTraveled += this.vel.mag(); // tracked for debug only

        // Fitness: checkpoints are the primary driver (ordered — can't game by going backwards).
        // Speed bonus rewards reaching checkpoints quickly; no raw distance so spinning in place
        // or circling earns nothing.
        const speedBonus = this.checkpointCount > 0
            ? (this.checkpointCount / this.frameAge) * 10000
            : 0;
        this.fitness = (this.checkpointCount * 1000) + speedBonus;
    }

    checkCheckpoints(track: Track, prevPos: Vector) {
        // We look for the next checkpoint in the sequence
        const checkpointIdx = this.checkpointCount % track.checkpoints.length;
        const cp = track.checkpoints[checkpointIdx];

        // Check if boid path (prevPos -> current pos) crossed the checkpoint segment
        const hit = getIntersection(prevPos, this.pos, cp[0], cp[1]);
        if (hit) {
            this.checkpointCount++;
            this.life += 500; // Reward with more time to live
            if (this.life > 1000) this.life = 1000; // Cap at 1000
        }
    }

    updateSensors(track: Track) {
        this.sensorRays = [];
        this.sensorDistances = [];

        const allWalls = [...track.innerWalls, ...track.outerWalls];

        for (let i = 0; i < this.sensorCount; i++) {
            const angle = this.heading + this.sensorAngles[i];
            const dir = Vector.fromAngle(angle, this.sensorLength);
            // Non-mutating addition to get the ray end point
            const rayEnd = new Vector(this.pos.x + dir.x, this.pos.y + dir.y);

            let closestIntersect = null;
            let recordDist = this.sensorLength;

            for (const wall of allWalls) {
                const intersection = getIntersection(this.pos, rayEnd, wall[0], wall[1]);
                if (intersection) {
                    const d = this.pos.dist(new Vector(intersection.x, intersection.y));
                    if (d < recordDist) {
                        recordDist = d;
                        closestIntersect = new Vector(intersection.x, intersection.y);
                    }
                }
            }

            this.sensorDistances.push(recordDist);
            if (closestIntersect) {
                this.sensorRays.push(closestIntersect);
            } else {
                this.sensorRays.push(rayEnd);
            }
        }
    }

    checkCollisions(track: Track) {
        // Basic point-in-polygon or just simple distance checking to walls
        const allWalls = [...track.innerWalls, ...track.outerWalls];

        const nextPos = new Vector(this.pos.x + this.vel.x, this.pos.y + this.vel.y);

        for (const wall of allWalls) {
            // We do a raycast from current pos to next pos and see if it crosses a wall
            const hit = getIntersection(this.pos, nextPos, wall[0], wall[1]);
            if (hit) {
                this.isDead = true;
                return;
            }
        }

        // Also kill if it's too close to any wall
        for (let d of this.sensorDistances) {
            if (d < this.radius) {
                this.isDead = true;
                return;
            }
        }
    }

    draw(ctx: CanvasRenderingContext2D, drawSensors: boolean = false) {
        if (this.isDead) return;

        if (drawSensors) {
            ctx.lineWidth = 1;
            for (let i = 0; i < this.sensorRays.length; i++) {
                // Gradient color: Red if close, Green if far
                const ratio = this.sensorDistances[i] / this.sensorLength;
                const r = Math.floor(255 * (1 - ratio));
                const g = Math.floor(255 * ratio);
                ctx.strokeStyle = `rgba(${r}, ${g}, 0, 0.5)`;
                ctx.beginPath();
                ctx.moveTo(this.pos.x, this.pos.y);
                ctx.lineTo(this.sensorRays[i].x, this.sensorRays[i].y);
                ctx.stroke();
            }
        }

        // Draw Boid body (triangle)
        ctx.translate(this.pos.x, this.pos.y);
        ctx.rotate(this.heading);

        ctx.fillStyle = drawSensors ? '#00ff00' : 'rgba(200, 200, 200, 0.5)';
        ctx.beginPath();
        ctx.moveTo(this.radius, 0);                 // nose
        ctx.lineTo(-this.radius, -this.radius / 1.5); // left rear
        ctx.lineTo(-this.radius, this.radius / 1.5);  // right rear
        ctx.closePath();
        ctx.fill();

        ctx.rotate(-this.heading);
        ctx.translate(-this.pos.x, -this.pos.y);
    }
}
