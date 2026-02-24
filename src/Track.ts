// src/Track.ts
import { Vector } from './Vector';

export class Track {
    innerWalls: [Vector, Vector][] = [];
    outerWalls: [Vector, Vector][] = [];
    checkpoints: [Vector, Vector][] = [];

    startPoint: Vector = new Vector(0, 0);
    startAngle: number = 0;

    constructor(canvasWidth: number, canvasHeight: number) {
        this.generateSimpleLoopedTrack(canvasWidth, canvasHeight);
    }

    generateSimpleLoopedTrack(w: number, h: number) {
        const cx = w / 2;
        const cy = h / 2;
        const rxOuter = w * 0.4;
        const ryOuter = h * 0.4;
        const rxInner = w * 0.25;
        const ryInner = h * 0.25;

        const numSegments = 30;

        let prevOuter: Vector | null = null;
        let prevInner: Vector | null = null;

        for (let i = 0; i <= numSegments; i++) {
            const angle = (i / numSegments) * Math.PI * 2;

            // We can add some noise to the radius to make it interesting
            const noiseOuter = 1 + (Math.sin(angle * 4) * 0.1);
            const noiseInner = 1 + (Math.sin(angle * 4) * 0.1);

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
