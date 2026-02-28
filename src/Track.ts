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

    // Spline-based track data
    centerLine: Vector[] = [];
    controlPoints: Vector[] = []; // raw control points — editable

    // Tuneable generation parameters
    trackWidth: number = 120;
    numControlPoints: number = 14;
    segmentsPerCurve: number = 15;
    radiusVariance: number = 0.35;  // 0 = near-circular, 0.8 = very diverse
    cornerTightness: number = 0.20; // maps to maxAngleVariation

    // Last known-good control points — used to revert editor drags that cause intersections
    private lastValidControlPoints: Vector[] = [];

    // Fixed canvas size for consistent track generation
    static readonly FIXED_SIZE = 1200;

    constructor(_canvasWidth: number, _canvasHeight: number, seed: number = 0) {
        this.seed = seed;
        // Always use fixed size for track generation
        this.generateSimpleLoopedTrack(Track.FIXED_SIZE, Track.FIXED_SIZE, seed);
    }

    /**
     * Generate control points for the track center line
     * Creates curves with variation while avoiding self-intersections
     */
    private generateControlPoints(w: number, h: number, random: () => number): Vector[] {
        const cx = w / 2;
        const cy = h / 2;

        const n = this.numControlPoints;
        const baseRadius = Math.min(w, h) * 0.35;
        const minRadius = baseRadius * Math.max(0.1, 1 - this.radiusVariance);
        const maxRadius = baseRadius * (1 + this.radiusVariance * 0.5);
        const maxAngleVariation = this.cornerTightness;

        const controlPoints: Vector[] = [];

        for (let i = 0; i < n; i++) {
            const baseAngle = (i / n) * Math.PI * 2;

            // Angle variation — probability scales with cornerTightness
            let angleOffset = 0;
            if (random() > (1 - this.cornerTightness * 1.5)) {
                const direction = random() > 0.5 ? 1 : -1;
                angleOffset = direction * random() * maxAngleVariation * (Math.PI * 2 / n);
            }
            const angle = baseAngle + angleOffset;

            const radiusRange = maxRadius - minRadius;
            const radius = minRadius + random() * radiusRange;

            controlPoints.push(new Vector(
                cx + radius * Math.cos(angle),
                cy + radius * Math.sin(angle),
            ));
        }

        this.controlPoints = controlPoints;
        return controlPoints;
    }

    /**
     * Catmull-Rom spline interpolation
     * Returns points along the spline passing through all control points
     */
    private catmullRomSpline(points: Vector[], segmentsPerCurve: number): Vector[] {
        const result: Vector[] = [];
        const n = points.length;
        
        for (let i = 0; i < n; i++) {
            // Get the four points needed for Catmull-Rom
            const p0 = points[(i - 1 + n) % n]; // Previous point (wrapped)
            const p1 = points[i];                 // Current point
            const p2 = points[(i + 1) % n];       // Next point (wrapped)
            const p3 = points[(i + 2) % n];       // Point after next (wrapped)
            
            // Generate segments between p1 and p2
            for (let t = 0; t < segmentsPerCurve; t++) {
                const s = t / segmentsPerCurve;
                const s2 = s * s;
                const s3 = s2 * s;
                
                // Catmull-Rom formula
                const x = 0.5 * (
                    (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * s3 +
                    (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * s2 +
                    (-p0.x + p2.x) * s +
                    2 * p1.x
                );
                
                const y = 0.5 * (
                    (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * s3 +
                    (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * s2 +
                    (-p0.y + p2.y) * s +
                    2 * p1.y
                );
                
                result.push(new Vector(x, y));
            }
        }
        
        return result;
    }

    /**
     * Calculate the normal (perpendicular) vector at a point on the center line
     * Uses the average of incoming and outgoing tangents for smoother normals
     */
    private calculateNormal(prev: Vector, current: Vector, next: Vector): Vector {
        // Calculate tangent as average of prev->current and current->next
        // Use manual calculations to avoid mutating original vectors
        const tangentInX = current.x - prev.x;
        const tangentInY = current.y - prev.y;
        const magIn = Math.sqrt(tangentInX * tangentInX + tangentInY * tangentInY);
        const tinX = magIn > 0 ? tangentInX / magIn : 0;
        const tinY = magIn > 0 ? tangentInY / magIn : 0;
        
        const tangentOutX = next.x - current.x;
        const tangentOutY = next.y - current.y;
        const magOut = Math.sqrt(tangentOutX * tangentOutX + tangentOutY * tangentOutY);
        const toutX = magOut > 0 ? tangentOutX / magOut : 0;
        const toutY = magOut > 0 ? tangentOutY / magOut : 0;
        
        // Average tangent
        const avgX = tinX + toutX;
        const avgY = tinY + toutY;
        const mag = Math.sqrt(avgX * avgX + avgY * avgY);
        
        // Normalized average tangent
        const tangentX = mag > 0 ? avgX / mag : 0;
        const tangentY = mag > 0 ? avgY / mag : 0;
        
        // Perpendicular (rotate 90 degrees)
        return new Vector(-tangentY, tangentX);
    }

    /**
     * Generate inner and outer walls from the center line
     * Ensures consistent normal direction to prevent gaps
     */
    private generateWallsFromCenterLine(): void {
        this.innerWalls = [];
        this.outerWalls = [];
        this.checkpoints = [];
        
        const halfWidth = this.trackWidth / 2;
        const n = this.centerLine.length;
        
        // Calculate all normals first, ensuring consistent direction
        const normals: Vector[] = [];
        let prevNormal: Vector | null = null;
        
        for (let i = 0; i < n; i++) {
            const prev = this.centerLine[(i - 1 + n) % n];
            const current = this.centerLine[i];
            const next = this.centerLine[(i + 1) % n];
            
            let normal = this.calculateNormal(prev, current, next);
            
            // Ensure consistent direction by checking against previous normal
            if (prevNormal) {
                const dot = normal.x * prevNormal.x + normal.y * prevNormal.y;
                if (dot < 0) {
                    // Flip normal if it's pointing in opposite direction
                    normal = new Vector(-normal.x, -normal.y);
                }
            }
            
            normals.push(normal);
            prevNormal = normal;
        }
        
        // Check if last normal is consistent with first normal (for closed loop)
        if (n > 1) {
            const firstNormal = normals[0];
            const lastNormal = normals[n - 1];
            const dot = firstNormal.x * lastNormal.x + firstNormal.y * lastNormal.y;
            if (dot < 0) {
                // If there's a flip at the end, we need to smooth the transition
                // For now, just ensure the first normal is consistent with the last
                normals[0] = new Vector(-firstNormal.x, -firstNormal.y);
            }
        }
        
        // Store first points for closing the loop
        let firstInner: Vector | null = null;
        let firstOuter: Vector | null = null;
        let prevInner: Vector | null = null;
        let prevOuter: Vector | null = null;
        
        for (let i = 0; i < n; i++) {
            const current = this.centerLine[i];
            const normal = normals[i];
            
            const innerPoint = new Vector(
                current.x - normal.x * halfWidth,
                current.y - normal.y * halfWidth
            );
            const outerPoint = new Vector(
                current.x + normal.x * halfWidth,
                current.y + normal.y * halfWidth
            );
            
            // Store first points
            if (i === 0) {
                firstInner = innerPoint;
                firstOuter = outerPoint;
            }
            
            // Connect to previous points
            if (prevInner && prevOuter) {
                this.innerWalls.push([prevInner, innerPoint]);
                this.outerWalls.push([prevOuter, outerPoint]);
                this.checkpoints.push([innerPoint, outerPoint]);
            }
            
            prevInner = innerPoint;
            prevOuter = outerPoint;
        }
        
        // Close the loop by connecting last points to first
        if (prevInner && prevOuter && firstInner && firstOuter) {
            this.innerWalls.push([prevInner, firstInner]);
            this.outerWalls.push([prevOuter, firstOuter]);
            this.checkpoints.push([firstInner, firstOuter]);
        }
    }

    /**
     * Find a suitable start point on the track
     * Places start at the first checkpoint (finish line)
     */
    private findStartPoint(): void {
        // Use the first checkpoint as the start/finish line
        if (this.checkpoints.length > 0) {
            const checkpoint = this.checkpoints[0];
            const inner = checkpoint[0];
            const outer = checkpoint[1];
            
            // Start point is at the center of the checkpoint
            this.startPoint = new Vector(
                (inner.x + outer.x) / 2,
                (inner.y + outer.y) / 2
            );
            
            // Calculate direction along the track (perpendicular to checkpoint line)
            const dx = outer.x - inner.x;
            const dy = outer.y - inner.y;
            // Perpendicular direction (along the track)
            this.startAngle = Math.atan2(-dx, dy);
        } else {
            // Fallback to center if no checkpoints
            this.startPoint = new Vector(Track.FIXED_SIZE / 2, Track.FIXED_SIZE / 2);
            this.startAngle = 0;
        }
    }

    /**
     * Check if two line segments intersect
     */
    private segmentsIntersect(p1: Vector, p2: Vector, p3: Vector, p4: Vector): boolean {
        const d1x = p2.x - p1.x;
        const d1y = p2.y - p1.y;
        const d2x = p4.x - p3.x;
        const d2y = p4.y - p3.y;
        
        const cross = d1x * d2y - d1y * d2x;
        
        if (Math.abs(cross) < 1e-10) return false; // Parallel lines
        
        const dx = p3.x - p1.x;
        const dy = p3.y - p1.y;
        
        const t = (dx * d2y - dy * d2x) / cross;
        const u = (dx * d1y - dy * d1x) / cross;
        
        return t > 0.01 && t < 0.99 && u > 0.01 && u < 0.99; // Exclude endpoints
    }

    /**
     * Check if the center line has self-intersections
     */
    private hasSelfIntersection(): boolean {
        const n = this.centerLine.length;
        
        // Check each pair of non-adjacent segments
        for (let i = 0; i < n; i++) {
            const p1 = this.centerLine[i];
            const p2 = this.centerLine[(i + 1) % n];
            
            // Only check segments that are not adjacent (skip 2 neighbors on each side)
            for (let j = i + 3; j < n - 1; j++) {
                const p3 = this.centerLine[j];
                const p4 = this.centerLine[(j + 1) % n];
                
                if (this.segmentsIntersect(p1, p2, p3, p4)) {
                    return true;
                }
            }
        }
        
        return false;
    }

    /**
     * Check if walls intersect each other (inner with outer)
     */
    private hasWallIntersection(): boolean {
        const n = this.innerWalls.length;
        
        // Check inner walls against outer walls
        for (let i = 0; i < n; i++) {
            const innerWall = this.innerWalls[i];
            
            // Check against non-adjacent outer walls
            for (let j = 0; j < n; j++) {
                // Skip adjacent walls (they share endpoints)
                if (Math.abs(i - j) <= 1 || Math.abs(i - j) >= n - 1) continue;
                
                const outerWall = this.outerWalls[j];
                
                if (this.segmentsIntersect(innerWall[0], innerWall[1], outerWall[0], outerWall[1])) {
                    return true;
                }
            }
        }
        
        // Also check inner walls against inner walls (and outer against outer)
        for (let i = 0; i < n; i++) {
            const inner1 = this.innerWalls[i];
            const outer1 = this.outerWalls[i];
            
            for (let j = i + 3; j < n - 1; j++) {
                const inner2 = this.innerWalls[j];
                const outer2 = this.outerWalls[j];
                
                // Check inner-inner intersection
                if (this.segmentsIntersect(inner1[0], inner1[1], inner2[0], inner2[1])) {
                    return true;
                }
                // Check outer-outer intersection
                if (this.segmentsIntersect(outer1[0], outer1[1], outer2[0], outer2[1])) {
                    return true;
                }
            }
        }
        
        return false;
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
        this.centerLine = [];
        this.seed = seed;

        // Create seeded random generator if seed provided
        const random = seed > 0 ? seededRandom(seed) : null;

        // Try to generate a valid track (no self-intersections or wall intersections)
        let attempts = 0;
        const maxAttempts = 250;
        let validFound = false;

        while (attempts < maxAttempts) {
            // Generate control points
            const controlPoints = this.generateControlPoints(w, h, random || (() => Math.random()));

            // Generate smooth center line through control points
            this.centerLine = this.catmullRomSpline(controlPoints, this.segmentsPerCurve);

            // Check for center line self-intersection
            if (this.hasSelfIntersection()) {
                attempts++;
                if (attempts < maxAttempts) this.seed = seed + attempts * 1000;
                continue;
            }

            // Generate walls from center line
            this.generateWallsFromCenterLine();

            // Check for wall intersections
            if (this.hasWallIntersection()) {
                attempts++;
                if (attempts < maxAttempts) this.seed = seed + attempts * 1000;
                continue;
            }

            // Valid track found — store as the editor's rollback baseline
            this.lastValidControlPoints = this.controlPoints.map(p => new Vector(p.x, p.y));
            validFound = true;
            break;
        }

        // Fallback: if all attempts failed, force a simple low-variance oval
        if (!validFound) {
            const savedVariance   = this.radiusVariance;
            const savedTightness  = this.cornerTightness;
            const savedN          = this.numControlPoints;
            this.radiusVariance   = 0.05;
            this.cornerTightness  = 0.05;
            this.numControlPoints = 10;
            this.generateControlPoints(w, h, seededRandom(42));
            this.centerLine = this.catmullRomSpline(this.controlPoints, this.segmentsPerCurve);
            this.generateWallsFromCenterLine();
            this.lastValidControlPoints = this.controlPoints.map(p => new Vector(p.x, p.y));
            // Restore user settings (they remain in effect for next generation attempt)
            this.radiusVariance   = savedVariance;
            this.cornerTightness  = savedTightness;
            this.numControlPoints = savedN;
        }

        // Find suitable start point
        this.findStartPoint();
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

    /**
     * Rebuild walls and checkpoints from the current controlPoints array.
     * Used by the track editor when control points are dragged.
     * Returns true if the result is intersection-free; false if it reverted
     * to the last valid state (the dragged point snaps back).
     */
    regenerateFromControlPoints(): boolean {
        if (this.controlPoints.length < 3) return false;

        // Deep-copy current positions as a rollback snapshot
        const backup = this.controlPoints.map(p => new Vector(p.x, p.y));

        this.centerLine = this.catmullRomSpline(this.controlPoints, this.segmentsPerCurve);
        this.generateWallsFromCenterLine();

        if (this.hasSelfIntersection() || this.hasWallIntersection()) {
            // Revert control points and rebuild from the last known-good state
            if (this.lastValidControlPoints.length > 0) {
                this.controlPoints = this.lastValidControlPoints.map(p => new Vector(p.x, p.y));
                this.centerLine = this.catmullRomSpline(this.controlPoints, this.segmentsPerCurve);
                this.generateWallsFromCenterLine();
            }
            this.findStartPoint();
            return false;
        }

        // Accept this configuration
        this.lastValidControlPoints = backup;
        this.findStartPoint();
        return true;
    }

    /**
     * Draw draggable control point handles for the track editor.
     * Called from main.ts draw() when isEditingTrack is true.
     */
    drawEditOverlay(ctx: CanvasRenderingContext2D, dragIndex: number) {
        // Dim overlay
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fillRect(0, 0, Track.FIXED_SIZE, Track.FIXED_SIZE);

        // Dashed lines connecting control points
        ctx.strokeStyle = 'rgba(255,255,255,0.2)';
        ctx.lineWidth = 1;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        for (let i = 0; i < this.controlPoints.length; i++) {
            const cp = this.controlPoints[i];
            i === 0 ? ctx.moveTo(cp.x, cp.y) : ctx.lineTo(cp.x, cp.y);
        }
        ctx.closePath();
        ctx.stroke();
        ctx.setLineDash([]);

        // Control point handles
        ctx.font = 'bold 10px Inter,sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (let i = 0; i < this.controlPoints.length; i++) {
            const cp = this.controlPoints[i];
            const active = i === dragIndex;
            ctx.beginPath();
            ctx.arc(cp.x, cp.y, active ? 14 : 10, 0, Math.PI * 2);
            ctx.fillStyle = active ? '#f59e0b' : '#ffffff';
            ctx.fill();
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.fillStyle = '#000';
            ctx.fillText(String(i), cp.x, cp.y);
        }

        // "EDIT MODE" banner
        ctx.fillStyle = 'rgba(245,158,11,0.9)';
        ctx.font = 'bold 18px Inter,sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText('✏️ TRACK EDIT MODE — drag the numbered dots', Track.FIXED_SIZE / 2, 18);
    }
}
