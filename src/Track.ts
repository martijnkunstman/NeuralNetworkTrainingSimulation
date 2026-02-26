// src/Track.ts
import { Vector } from './Vector';

/**
 * Seeded pseudo-random number generator (Mulberry32)
 * Returns values in [0, 1)
 */
function seededRandom(seed: number): () => number {
    return function() {
        let t = seed += 0x6D2B79F5;
        t = Math.imul(t ^ t >>> 15, t | 1);
        t ^= t + Math.imul(t ^ t >>> 7, t | 61);
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

export class Track {
    innerWalls: [Vector, Vector][] = [];
    outerWalls: [Vector, Vector][] = [];
    checkpoints: [Vector, Vector][] = [];

    startPoint: Vector = new Vector(0, 0);
    startAngle: number = 0;
    seed: number = 0; // Current seed (0 = no randomization)

    constructor(canvasWidth: number, canvasHeight: number, seed: number = 0) {
        this.seed = seed;
        this.generateSimpleLoopedTrack(canvasWidth, canvasHeight, seed);
    }

    /**
     * Generate a track with optional seed for reproducible randomization.
     * seed = 0: deterministic track (original behavior)
     * seed > 0: randomized track using seeded PRNG
     */
    generateSimpleLoopedTrack(w: number, h: number, seed: number = 0) {
        // Clear existing track
        this.innerWalls = [];
        this.outerWalls = [];
        this.checkpoints = [];
        this.seed = seed;

        const cx = w / 2;
        const cy = h / 2;
        const rxOuter = w * 0.4;
        const ryOuter = h * 0.4;
        const rxInner = w * 0.25;
        const ryInner = h * 0.25;

        const numSegments = 30;

        // Create seeded random generator if seed provided
        const random = seed > 0 ? seededRandom(seed) : null;

        let prevOuter: Vector | null = null;
        let prevInner: Vector | null = null;

        for (let i = 0; i <= numSegments; i++) {
            const angle = (i / numSegments) * Math.PI * 2;

            // Base noise pattern
            let noiseOuter = 1 + (Math.sin(angle * 4) * 0.1);
            let noiseInner = 1 + (Math.sin(angle * 4) * 0.1);

            // Add seeded random variation if seed provided
            if (random) {
                noiseOuter += (random() - 0.5) * 0.15;
                noiseInner += (random() - 0.5) * 0.15;
            }

            const pOuter = new Vector(
                cx + (rxOuter * noiseOuter) * Math.cos(angle),
                cy + (ryOuter * noiseOuter) * Math.sin(angle)
            );

            const pInner = new Vector(
                cx + (rxInner * noiseInner) * Math.cos(angle),
                cy + (ryInner * noiseInner) * Math.sin(angle)
            );

            if (prevOuter && prevInner) {
                this.outerWalls.push([prevOuter, pOuter]);
                this.innerWalls.push([prevInner, pInner]);
                // A checkpoint connects inner to outer
                this.checkpoints.push([pInner, pOuter]);
            }

            if (i === 0) {
                // Find start pos right at angle 0
                this.startPoint = new Vector((pInner.x + pOuter.x) / 2, (pInner.y + pOuter.y) / 2);
                this.startAngle = Math.PI / 2; // pointing downwards originally
            }

            prevOuter = pOuter;
            prevInner = pInner;
        }
    }

    /**
     * Regenerate track with a new random seed
     */
    randomize(w: number, h: number): number {
        const newSeed = Math.floor(Math.random() * 1000000) + 1;
        this.generateSimpleLoopedTrack(w, h, newSeed);
        return newSeed;
    }

    draw(ctx: CanvasRenderingContext2D) {
        ctx.lineWidth = 4;
        ctx.strokeStyle = '#fff';

        // Outer walls
        ctx.beginPath();
        for (const border of this.outerWalls) {
            ctx.moveTo(border[0].x, border[0].y);
            ctx.lineTo(border[1].x, border[1].y);
        }
        ctx.stroke();

        // Inner walls
        ctx.beginPath();
        for (const border of this.innerWalls) {
            ctx.moveTo(border[0].x, border[0].y);
            ctx.lineTo(border[1].x, border[1].y);
        }
        ctx.stroke();

        // Draw Start line
        if (this.checkpoints.length > 0) {
            ctx.strokeStyle = 'rgba(0, 255, 0, 0.5)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(this.checkpoints[0][0].x, this.checkpoints[0][0].y);
            ctx.lineTo(this.checkpoints[0][1].x, this.checkpoints[0][1].y);
            ctx.stroke();
        }
    }
}
